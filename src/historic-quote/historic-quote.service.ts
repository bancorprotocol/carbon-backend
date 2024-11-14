import { BadRequestException, Injectable, OnModuleInit } from '@nestjs/common';
import { CoinMarketCapService } from '../coinmarketcap/coinmarketcap.service';
import { HistoricQuote } from './historic-quote.entity';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { SchedulerRegistry } from '@nestjs/schedule';
import { ConfigService } from '@nestjs/config';
import * as _ from 'lodash';
import moment from 'moment';
import Decimal from 'decimal.js';
import { BlockchainType, Deployment, DeploymentService, NATIVE_TOKEN } from '../deployment/deployment.service';
import { CELO_NETWORK_ID, CodexService, SEI_NETWORK_ID } from '../codex/codex.service';

type Candlestick = {
  timestamp: number;
  open: string;
  close: string;
  high: string;
  low: string;
  provider: string;
};

type PriceProvider = 'coinmarketcap' | 'codex';

interface ProviderConfig {
  name: PriceProvider;
  enabled: boolean;
}

type BlockchainProviderConfig = {
  [key in BlockchainType]: ProviderConfig[];
};

@Injectable()
export class HistoricQuoteService implements OnModuleInit {
  private isPolling = false;
  private readonly intervalDuration: number;
  private shouldPollQuotes: boolean;
  private priceProviders: BlockchainProviderConfig = {
    [BlockchainType.Ethereum]: [
      { name: 'coinmarketcap', enabled: true },
      { name: 'codex', enabled: true },
    ],
    [BlockchainType.Sei]: [{ name: 'codex', enabled: true }],
    [BlockchainType.Celo]: [{ name: 'codex', enabled: true }],
    [BlockchainType.Blast]: [{ name: 'codex', enabled: true }],
  };

  constructor(
    @InjectRepository(HistoricQuote) private repository: Repository<HistoricQuote>,
    private coinmarketcapService: CoinMarketCapService,
    private configService: ConfigService,
    private schedulerRegistry: SchedulerRegistry,
    private codexService: CodexService,
    private deploymentService: DeploymentService,
  ) {
    this.intervalDuration = +this.configService.get('POLL_HISTORIC_QUOTES_INTERVAL') || 300000;
    this.shouldPollQuotes = this.configService.get('SHOULD_POLL_HISTORIC_QUOTES') === '1';
  }

  onModuleInit() {
    if (this.shouldPollQuotes) {
      const callback = () => this.pollForUpdates();
      const interval = setInterval(callback, this.intervalDuration);
      this.schedulerRegistry.addInterval('pollForUpdates', interval);
    }
  }

  async pollForUpdates(): Promise<void> {
    if (this.isPolling) return;
    this.isPolling = true;

    try {
      await Promise.all([
        await this.updateCoinMarketCapQuotes(),
        await this.updateCodexQuotes(BlockchainType.Sei, SEI_NETWORK_ID),
        await this.updateCodexQuotes(BlockchainType.Celo, CELO_NETWORK_ID),
      ]);
    } catch (error) {
      console.error('Error updating historic quotes:', error);
      this.isPolling = false;
    }

    this.isPolling = false;
    console.log('Historic quotes updated');
  }

  private async updateCoinMarketCapQuotes(): Promise<void> {
    const latest = await this.getLatest(BlockchainType.Ethereum); // Pass the deployment to filter by blockchainType
    const quotes = await this.coinmarketcapService.getLatestQuotes();
    const newQuotes = [];

    for (const q of quotes) {
      const tokenAddress = q.tokenAddress;
      const price = `${q.usd}`;

      if (latest[tokenAddress] && latest[tokenAddress].usd === price) continue;

      q.blockchainType = BlockchainType.Ethereum;
      newQuotes.push(this.repository.create(q));
    }

    const batches = _.chunk(newQuotes, 1000);
    await Promise.all(batches.map((batch) => this.repository.save(batch)));
    console.log('CoinMarketCap quotes updated');
  }

  private async updateCodexQuotes(blockchainType: BlockchainType, networkId: number): Promise<void> {
    const deployment = this.deploymentService.getDeploymentByBlockchainType(blockchainType);
    const latest = await this.getLatest(blockchainType);
    const addresses = await this.codexService.getAllTokenAddresses(networkId);
    const quotes = await this.codexService.getLatestPrices(deployment, networkId, addresses);
    const newQuotes = [];

    for (const address of Object.keys(quotes)) {
      const quote = quotes[address];
      const price = `${quote.usd}`;

      if (latest[address] && latest[address].usd === price) continue;

      newQuotes.push(
        this.repository.create({
          tokenAddress: address,
          usd: quote.usd,
          timestamp: moment.unix(quote.last_updated_at).utc().toISOString(),
          provider: 'codex',
          blockchainType: blockchainType,
        }),
      );
    }

    if (deployment.nativeTokenAlias) {
      const quote = quotes[deployment.nativeTokenAlias];
      newQuotes.push(
        this.repository.create({
          tokenAddress: NATIVE_TOKEN.toLowerCase(),
          usd: quote.usd,
          timestamp: moment.unix(quote.last_updated_at).utc().toISOString(),
          provider: 'codex',
          blockchainType: deployment.blockchainType,
        }),
      );
    }

    const batches = _.chunk(newQuotes, 1000);
    await Promise.all(batches.map((batch) => this.repository.save(batch)));
    console.log('Codex quotes updated');
  }

  async seed(): Promise<void> {
    const start = moment().subtract(1, 'year').unix();
    const end = moment().unix();
    let i = 0;

    const tokens = await this.coinmarketcapService.getAllTokens();
    const batchSize = 100; // Adjust the batch size as needed

    for (let startIndex = 0; startIndex < tokens.length; startIndex += batchSize) {
      const batchTokens = tokens.slice(startIndex, startIndex + batchSize);
      const addresses = batchTokens.map((token) => token.platform.token_address);

      // Fetch historical quotes for the current batch of tokens
      const quotesByAddress = await this.coinmarketcapService.getHistoricalQuotes(addresses, start, end);

      for (const token of batchTokens) {
        const address = token.platform.token_address;
        const quotes = quotesByAddress[address];

        const newQuotes = quotes.map((q: any) =>
          this.repository.create({
            tokenAddress: q.address,
            usd: q.price,
            timestamp: moment.unix(q.timestamp).utc().toISOString(),
            provider: 'coinmarketcap',
            blockchainType: BlockchainType.Ethereum,
          }),
        );

        const batches = _.chunk(newQuotes, 1000);
        await Promise.all(batches.map((batch) => this.repository.save(batch)));
        console.log(`History quote seeding, finished ${++i} of ${tokens.length}%`, new Date());
      }
    }
  }

  async seedCodex(blockchainType: BlockchainType, networkId: number): Promise<void> {
    const start = moment().subtract(1, 'year').unix();
    const end = moment().unix();
    let i = 0;

    const addresses = await this.codexService.getAllTokenAddresses(networkId);
    const batchSize = 100;

    const deployment = this.deploymentService.getDeploymentByBlockchainType(blockchainType);
    const nativeTokenAlias = deployment.nativeTokenAlias ? deployment.nativeTokenAlias : null;

    for (let startIndex = 0; startIndex < addresses.length; startIndex += batchSize) {
      const batchAddresses = addresses.slice(startIndex, startIndex + batchSize);

      // Fetch historical quotes for the current batch of addresses
      const quotesByAddress = await this.codexService.getHistoricalQuotes(networkId, batchAddresses, start, end);

      const newQuotes = [];

      for (const address of batchAddresses) {
        const quotes = quotesByAddress[address];

        quotes.forEach((q: any) => {
          if (q.usd && q.timestamp) {
            const quote = this.repository.create({
              tokenAddress: address,
              usd: q.usd,
              timestamp: moment.unix(q.timestamp).utc().toISOString(),
              provider: 'codex',
              blockchainType: blockchainType,
            });
            newQuotes.push(quote);
          }
        });

        // If this is the native token alias, also create an entry for the native token
        if (nativeTokenAlias && address.toLowerCase() === nativeTokenAlias.toLowerCase()) {
          quotes.forEach((q: any) => {
            if (q.usd && q.timestamp) {
              const nativeTokenQuote = this.repository.create({
                tokenAddress: NATIVE_TOKEN.toLowerCase(),
                usd: q.usd,
                timestamp: moment.unix(q.timestamp).utc().toISOString(),
                provider: 'codex',
                blockchainType: blockchainType,
              });
              newQuotes.push(nativeTokenQuote);
            }
          });
        }
      }

      const batches = _.chunk(newQuotes, 1000);
      await Promise.all(batches.map((batch) => this.repository.save(batch)));
      console.log(`History quote seeding, finished ${++i} of ${addresses.length}`, new Date());
    }
  }

  async getLatest(blockchainType: BlockchainType): Promise<{ [key: string]: HistoricQuote }> {
    const latestQuotes = await this.repository.query(`
      SELECT 
          "tokenAddress",
          "blockchainType",
          last(usd, "timestamp") AS usd,
          last("timestamp", "timestamp") AS timestamp
      FROM "historic-quotes"
      WHERE "blockchainType" = '${blockchainType}'
      GROUP BY "tokenAddress", "blockchainType";
    `);

    const result: { [key: string]: HistoricQuote } = {};
    latestQuotes.forEach((quote) => {
      result[quote.tokenAddress] = quote;
    });

    return result;
  }

  async getHistoryQuotes(addresses: string[], start: number, end: number): Promise<{ [key: string]: HistoricQuote[] }> {
    try {
      const quotesByAddress: { [key: string]: HistoricQuote[] } = {};

      await Promise.all(
        addresses.map(async (tokenAddress) => {
          const quotes = await this.repository
            .createQueryBuilder('hq')
            .where('hq.tokenAddress = :tokenAddress', { tokenAddress })
            .andWhere('hq.timestamp BETWEEN TO_TIMESTAMP(:start) AND TO_TIMESTAMP(:end)', { start, end })
            .orderBy('hq.timestamp', 'ASC')
            .getMany();

          quotesByAddress[tokenAddress] = quotes;
        }),
      );

      return quotesByAddress;
    } catch (error) {
      console.error(`Error fetching historical quotes for addresses between ${start} and ${end}:`, error);
      throw new Error(`Error fetching historical quotes for addresses`);
    }
  }

  async getHistoryQuotesBuckets(
    blockchainType: BlockchainType,
    addresses: string[],
    start: number,
    end: number,
    bucket = '1 day',
  ): Promise<{ [key: string]: Candlestick[] }> {
    const today = moment().utc().startOf('day');
    const startQ = moment.unix(start).utc().startOf('day');
    const startPaddedQ = moment.unix(start).utc().startOf('day').subtract('1', 'day').toISOString();
    let endQ: any = moment.unix(end).utc().endOf('day');
    endQ = endQ.isAfter(today) ? today.toISOString() : endQ.toISOString();

    const enabledProviders = this.priceProviders[blockchainType]
      .filter((p) => p.enabled)
      .map((p) => `'${p.name}'`)
      .join(',');

    const query = `
      WITH TokenProviders AS (
        SELECT 
          "tokenAddress",
          provider,
          CASE WHEN COUNT(*) > 0 THEN 1 ELSE 0 END as has_data,
          ROW_NUMBER() OVER (
            PARTITION BY "tokenAddress"
            ORDER BY 
              CASE WHEN COUNT(*) > 0 THEN 1 ELSE 0 END DESC,
              array_position(ARRAY[${enabledProviders}]::text[], provider)
          ) as provider_rank
        FROM "historic-quotes"
        WHERE
          timestamp >= '${startPaddedQ}'
          AND timestamp <= '${endQ}'
          AND "tokenAddress" IN (${addresses.map((a) => `'${a.toLowerCase()}'`).join(',')})
          AND "blockchainType" = '${blockchainType}'
          AND provider = ANY(ARRAY[${enabledProviders}]::text[])
        GROUP BY "tokenAddress", provider
      ),
      BestProviderQuotes AS (
        SELECT hq.*
        FROM "historic-quotes" hq
        JOIN TokenProviders tp ON 
          hq."tokenAddress" = tp."tokenAddress" 
          AND hq.provider = tp.provider
          AND tp.provider_rank = 1
        WHERE
          hq.timestamp >= '${startPaddedQ}'
          AND hq.timestamp <= '${endQ}'
          AND hq."blockchainType" = '${blockchainType}'
      )
      SELECT
        bpq."tokenAddress",
        time_bucket_gapfill('${bucket}', timestamp) AS bucket,
        locf(first(usd, timestamp)) as open,
        locf(last(usd, timestamp)) as close,
        locf(max(usd::numeric)) as high,
        locf(min(usd::numeric)) as low,
        sp.provider as selected_provider
      FROM BestProviderQuotes bpq
      JOIN TokenProviders sp ON 
        bpq."tokenAddress" = sp."tokenAddress" 
        AND sp.provider_rank = 1
      GROUP BY bpq."tokenAddress", bucket, sp.provider
      ORDER BY bpq."tokenAddress", bucket;`;

    const result = await this.repository.query(query);

    const candlesByAddress: { [key: string]: Candlestick[] } = {};

    result.forEach((row: any) => {
      const timestamp = moment(row.bucket).utc();

      if (timestamp.isSameOrAfter(startQ)) {
        const tokenAddress = row.tokenAddress;
        const candle = {
          timestamp: timestamp.unix(),
          open: row.open,
          close: row.close,
          high: row.high,
          low: row.low,
          provider: row.selected_provider,
        };

        if (!candlesByAddress[tokenAddress]) {
          candlesByAddress[tokenAddress] = [];
        }

        candlesByAddress[tokenAddress].push(candle);
      }
    });

    // Check if tokens exist at all in candlesByAddress
    const nonExistentTokens = addresses.filter((address) => !candlesByAddress[address]);
    if (nonExistentTokens.length > 0) {
      throw new BadRequestException({
        message: [
          `No price data available for token${nonExistentTokens.length > 1 ? 's' : ''}: ${nonExistentTokens.join(
            ', ',
          )}`,
        ],
        error: 'Bad Request',
        statusCode: 400,
      });
    }

    return candlesByAddress;
  }

  async getUsdBuckets(
    blockchainType: BlockchainType,
    tokenA: string,
    tokenB: string,
    start: number,
    end: number,
  ): Promise<Candlestick[]> {
    const data = await this.getHistoryQuotesBuckets(blockchainType, [tokenA, tokenB], start, end, '1 hour');

    const prices = [];
    data[tokenA].forEach((_, i) => {
      const base = data[tokenA][i];
      const quote = data[tokenB][i];
      prices.push({
        timestamp: base.timestamp,
        usd: new Decimal(base.close).div(quote.close),
        provider: base.provider === quote.provider ? base.provider : `${base.provider}/${quote.provider}`,
      });
    });

    return this.createDailyCandlestick(prices);
  }

  async createDailyCandlestick(prices) {
    const candlesticks = [];
    let dailyData = null;
    let currentDay = null;

    prices.forEach((price) => {
      const day = moment.unix(price.timestamp).startOf('day').unix();

      if (currentDay === null) {
        currentDay = day;
        dailyData = {
          open: price.usd !== null ? new Decimal(price.usd) : null,
          high: price.usd !== null ? new Decimal(price.usd) : null,
          low: price.usd !== null ? new Decimal(price.usd) : null,
          close: price.usd !== null ? new Decimal(price.usd) : null,
          provider: price.provider,
        };
      } else if (day !== currentDay) {
        if (dailyData !== null) {
          candlesticks.push({
            timestamp: currentDay,
            open: dailyData.open,
            high: dailyData.high,
            low: dailyData.low,
            close: dailyData.close,
            provider: dailyData.provider,
          });
        }

        currentDay = day;
        dailyData = {
          open: price.usd !== null ? new Decimal(price.usd) : null,
          high: price.usd !== null ? new Decimal(price.usd) : null,
          low: price.usd !== null ? new Decimal(price.usd) : null,
          close: price.usd !== null ? new Decimal(price.usd) : null,
          provider: price.provider,
        };
      } else {
        if (price.usd !== null) {
          if (dailyData.high === null || price.usd > dailyData.high) {
            dailyData.high = new Decimal(price.usd);
          }
          if (dailyData.low === null || price.usd < dailyData.low) {
            dailyData.low = new Decimal(price.usd);
          }
          dailyData.close = new Decimal(price.usd);
        }
      }
    });

    if (dailyData !== null) {
      candlesticks.push({
        timestamp: currentDay,
        open: dailyData.open,
        high: dailyData.high,
        low: dailyData.low,
        close: dailyData.close,
        provider: dailyData.provider,
      });
    }

    return candlesticks;
  }

  private findFirstNonNullOpenIndex(candles: Candlestick[]): number {
    for (let i = 0; i < candles.length; i++) {
      if (candles[i].open !== null) {
        return i;
      }
    }
    return -1; // If no non-null open value found
  }

  async getUsdRates(deployment: Deployment, addresses: string[], start: string, end: string): Promise<any[]> {
    const paddedStart = moment.utc(start).subtract(1, 'day').format('YYYY-MM-DD');
    const paddedEnd = moment.utc(end).add(1, 'day').format('YYYY-MM-DD');

    const query = `
      WITH TokenProviders AS (
        SELECT 
          "tokenAddress",
          provider,
          COUNT(*) as data_points,
          ROW_NUMBER() OVER (
            PARTITION BY "tokenAddress"
            ORDER BY COUNT(*) DESC
          ) as provider_rank
        FROM "historic-quotes"
        WHERE
          timestamp >= '${paddedStart}'
          AND timestamp <= '${paddedEnd}'
          AND "tokenAddress" IN (${addresses.map((a) => `'${a.toLowerCase()}'`).join(',')})
          AND "blockchainType" = '${deployment.blockchainType}'
        GROUP BY "tokenAddress", provider
      ),
      gapfilled_quotes as (
        SELECT
          time_bucket_gapfill('1 day', hq.timestamp, '${paddedStart}', '${paddedEnd}') AS day,
          hq."tokenAddress" AS address,
          locf(avg(hq."usd"::numeric)) AS usd,
          tp.provider
        FROM "historic-quotes" hq
        JOIN TokenProviders tp ON 
          hq."tokenAddress" = tp."tokenAddress" 
          AND hq.provider = tp.provider
          AND tp.provider_rank = 1
        WHERE
          hq."blockchainType" = '${deployment.blockchainType}'
          AND hq."tokenAddress" IN (${addresses.map((address) => `'${address.toLowerCase()}'`).join(',')})
        GROUP BY hq."tokenAddress", day, tp.provider
      ) SELECT * FROM gapfilled_quotes WHERE day >= '${paddedStart}';
    `;

    const result = await this.repository.query(query);

    return result.map((row) => ({
      day: moment.utc(row.day).unix(),
      address: row.address.toLowerCase(),
      usd: parseFloat(row.usd),
      provider: row.provider,
    }));
  }
}
