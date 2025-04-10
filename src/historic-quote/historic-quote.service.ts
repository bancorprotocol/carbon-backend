import { BadRequestException, Injectable, Logger, OnModuleInit } from '@nestjs/common';
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
import { CodexService } from '../codex/codex.service';

type Candlestick = {
  timestamp: number;
  open: string;
  close: string;
  high: string;
  low: string;
  provider: string;
};

type PriceProvider = 'coinmarketcap' | 'codex' | 'coingecko' | 'carbon-defi';

interface ProviderConfig {
  name: PriceProvider;
  enabled: boolean;
}

export type BlockchainProviderConfig = {
  [key in BlockchainType]: ProviderConfig[];
};

@Injectable()
export class HistoricQuoteService implements OnModuleInit {
  private readonly logger = new Logger(HistoricQuoteService.name);
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
    [BlockchainType.Base]: [{ name: 'codex', enabled: true }],
    [BlockchainType.Fantom]: [{ name: 'codex', enabled: true }],
    [BlockchainType.Mantle]: [{ name: 'codex', enabled: true }],
    [BlockchainType.Linea]: [{ name: 'codex', enabled: true }],
    [BlockchainType.Berachain]: [{ name: 'codex', enabled: true }],
    [BlockchainType.Coti]: [{ name: 'carbon-defi', enabled: true }],
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

  private async seedAllEthereumMappedTokens() {
    try {
      const deployments = this.deploymentService.getDeployments();
      for (const deployment of deployments) {
        if (deployment.mapEthereumTokens && Object.keys(deployment.mapEthereumTokens).length > 0) {
          this.logger.log(`Seeding price history from Ethereum tokens for ${deployment.exchangeId}...`);
          await this.seedFromEthereumTokens(deployment);
        }
      }
    } catch (error) {
      this.logger.error('Error seeding price history from Ethereum tokens:', error);
    }
  }

  async pollForUpdates(): Promise<void> {
    if (this.isPolling) return;
    this.isPolling = true;

    try {
      // Process Ethereum token mappings for all deployments
      await this.seedAllEthereumMappedTokens();

      await Promise.all([
        await this.updateCoinMarketCapQuotes(),
        await this.updateCodexQuotes(BlockchainType.Sei),
        await this.updateCodexQuotes(BlockchainType.Celo),
        // await this.updateCodexQuotes(BlockchainType.Base, BASE_NETWORK_ID),
      ]);

      // Update any mapped Ethereum tokens that might not have been updated
      await this.updateMappedEthereumTokens();
    } catch (error) {
      this.logger.error('Error updating historic quotes:', error);
      this.isPolling = false;
    }

    this.isPolling = false;
    this.logger.log('Historic quotes updated');
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
    this.logger.log('CoinMarketCap quotes updated');
  }

  private async updateCodexQuotes(blockchainType: BlockchainType): Promise<void> {
    const deployment = this.deploymentService.getDeploymentByBlockchainType(blockchainType);
    const latest = await this.getLatest(blockchainType);
    const addresses = await this.codexService.getAllTokenAddresses(deployment);
    const quotes = await this.codexService.getLatestPrices(deployment, addresses);
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
    this.logger.log('Codex quotes updated');
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
        this.logger.log(`History quote seeding, finished ${++i} of ${tokens.length}%`, new Date());
      }
    }
  }

  async seedCodex(blockchainType: BlockchainType): Promise<void> {
    const deployment = this.deploymentService.getDeploymentByBlockchainType(blockchainType);
    const start = moment().subtract(1, 'year').unix();
    const end = moment().unix();
    let i = 0;

    const addresses = await this.codexService.getAllTokenAddresses(deployment);
    const batchSize = 100;

    const nativeTokenAlias = deployment.nativeTokenAlias ? deployment.nativeTokenAlias : null;

    for (let startIndex = 0; startIndex < addresses.length; startIndex += batchSize) {
      const batchAddresses = addresses.slice(startIndex, startIndex + batchSize);

      // Fetch historical quotes for the current batch of addresses
      const quotesByAddress = await this.codexService.getHistoricalQuotes(deployment, batchAddresses, start, end);

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
      this.logger.log(`History quote seeding, finished ${++i} of ${addresses.length}`, new Date());
    }
  }

  async seedFromEthereumTokens(deployment: Deployment): Promise<void> {
    if (!deployment.mapEthereumTokens || Object.keys(deployment.mapEthereumTokens).length === 0) {
      this.logger.log(`No Ethereum token mappings found for ${deployment.exchangeId}, skipping.`);
      return;
    }

    const start = moment().subtract(1, 'year').unix();
    const end = moment().unix();
    let i = 0;

    // We only need unique Ethereum token addresses
    const ethereumTokenAddresses = [...new Set(Object.values(deployment.mapEthereumTokens))].map((addr) =>
      addr.toLowerCase(),
    );
    const total = ethereumTokenAddresses.length;
    this.logger.log(`Found ${total} unique Ethereum token addresses to process`);

    const ethereumDeployment = this.deploymentService.getDeploymentByBlockchainType(BlockchainType.Ethereum);

    for (const ethereumTokenAddress of ethereumTokenAddresses) {
      // Check if the Ethereum token already has data in the database
      const existingEthereumData = await this.repository.findOne({
        where: {
          blockchainType: BlockchainType.Ethereum,
          tokenAddress: ethereumTokenAddress,
          provider: 'codex',
        },
      });

      // If the Ethereum token already has data, skip seeding
      if (existingEthereumData) {
        this.logger.log(`Ethereum token ${ethereumTokenAddress} already has price data, skipping.`);
        continue;
      }

      // If no Ethereum data exists, seed it from Codex
      this.logger.log(`No Ethereum data found for ${ethereumTokenAddress}, seeding from Codex...`);
      try {
        // Get historical data from Codex for this token
        const codexData = await this.codexService.getHistoricalQuotes(
          ethereumDeployment,
          [ethereumTokenAddress],
          start,
          end,
        );

        if (!codexData[ethereumTokenAddress] || codexData[ethereumTokenAddress].length === 0) {
          this.logger.log(`No Codex data available for Ethereum token ${ethereumTokenAddress}, skipping.`);
          continue;
        }

        // Create new quotes with blockchainType: Ethereum
        const newQuotes = [];
        codexData[ethereumTokenAddress].forEach((q) => {
          if (q.usd && q.timestamp) {
            newQuotes.push(
              this.repository.create({
                tokenAddress: ethereumTokenAddress,
                usd: q.usd,
                timestamp: moment.unix(q.timestamp).utc().toISOString(),
                provider: 'codex',
                blockchainType: BlockchainType.Ethereum, // Store as Ethereum data
              }),
            );
          }
        });

        if (newQuotes.length > 0) {
          const batches = _.chunk(newQuotes, 1000);
          await Promise.all(batches.map((batch) => this.repository.save(batch)));
          this.logger.log(
            `Token ${++i} of ${total}: Seeded ${
              newQuotes.length
            } price points for Ethereum token ${ethereumTokenAddress} from Codex`,
          );
        }
      } catch (error) {
        this.logger.error(`Error seeding Ethereum token ${ethereumTokenAddress} from Codex:`, error);
      }
    }

    this.logger.log(`Completed seeding Ethereum token price history for ${deployment.exchangeId}`);
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
      this.logger.error(`Error fetching historical quotes for addresses between ${start} and ${end}:`, error);
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
      WITH RawCounts AS (
        SELECT 
          "tokenAddress",
          provider,
          COUNT(*) as data_points
        FROM "historic-quotes"
        WHERE
          timestamp >= '${startPaddedQ}'
          AND timestamp <= '${endQ}'
          AND "tokenAddress" IN (${addresses.map((a) => `'${a.toLowerCase()}'`).join(',')})
          AND "blockchainType" = '${blockchainType}'
          AND provider = ANY(ARRAY[${enabledProviders}]::text[])
        GROUP BY "tokenAddress", provider
      ),
      TokenStats AS (
        SELECT
          "tokenAddress",
          MAX(data_points) as max_points,
          MIN(CASE WHEN data_points > 0 THEN data_points ELSE NULL END) as min_nonzero_points
        FROM RawCounts
        GROUP BY "tokenAddress"
      ),
      TokenProviders AS (
        SELECT 
          rc."tokenAddress",
          rc.provider,
          rc.data_points,
          ROW_NUMBER() OVER (
            PARTITION BY rc."tokenAddress"
            ORDER BY 
              CASE WHEN rc.data_points > 0 THEN 1 ELSE 0 END DESC,
              -- If one provider has significantly more data (>5x), prioritize it
              -- Otherwise use the configured provider order
              CASE 
                WHEN ts.max_points > 5 * COALESCE(ts.min_nonzero_points, 0) AND ts.max_points = rc.data_points
                THEN 0  -- Provider with most data comes first when significant difference exists
                ELSE array_position(ARRAY[${enabledProviders}]::text[], rc.provider)
              END
          ) as provider_rank
        FROM RawCounts rc
        JOIN TokenStats ts ON rc."tokenAddress" = ts."tokenAddress"
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
      ORDER BY bpq."tokenAddress"`;

    const result = await this.repository.query(query);

    const candlesByAddress: { [key: string]: Candlestick[] } = {};

    result.forEach((row: any) => {
      if (!row.open) {
        return;
      }

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
    // This check may need to be relaxed if pagination can result in empty token results
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
    baseTokenBlockchainType: BlockchainType,
    quoteTokenBlockchainType: BlockchainType,
    tokenA: string,
    tokenB: string,
    start: number,
    end: number,
  ): Promise<Candlestick[]> {
    let tokenAData: { [key: string]: Candlestick[] };
    let tokenBData: { [key: string]: Candlestick[] };

    // If both blockchain types are the same, make a single call
    if (baseTokenBlockchainType === quoteTokenBlockchainType) {
      const data = await this.getHistoryQuotesBuckets(baseTokenBlockchainType, [tokenA, tokenB], start, end, '1 hour');
      tokenAData = { [tokenA]: data[tokenA] };
      tokenBData = { [tokenB]: data[tokenB] };
    } else {
      // Run both queries in parallel for better performance
      [tokenAData, tokenBData] = await Promise.all([
        this.getHistoryQuotesBuckets(baseTokenBlockchainType, [tokenA], start, end, '1 hour'),
        this.getHistoryQuotesBuckets(quoteTokenBlockchainType, [tokenB], start, end, '1 hour'),
      ]);
    }

    const prices = [];
    // Create map of timestamps to candles for each token
    const tokenAByTimestamp = new Map(tokenAData[tokenA].map((candle) => [candle.timestamp, candle]));
    const tokenBByTimestamp = new Map(tokenBData[tokenB].map((candle) => [candle.timestamp, candle]));

    // Get all timestamps where both tokens have data
    const allTimestamps = [...new Set([...tokenAByTimestamp.keys(), ...tokenBByTimestamp.keys()])].sort();

    // Iterate through all timestamps
    for (const timestamp of allTimestamps) {
      const base = tokenAByTimestamp.get(timestamp);
      const quote = tokenBByTimestamp.get(timestamp);

      // Skip if either token doesn't have data for this timestamp or close price is null
      if (!base || !quote || base.close === null || quote.close === null) {
        continue;
      }

      prices.push({
        timestamp,
        usd: new Decimal(base.close).div(quote.close),
        provider: base.provider === quote.provider ? base.provider : `${base.provider}/${quote.provider}`,
      });
    }

    return this.createDailyCandlestick(prices);
  }

  createDailyCandlestick(prices) {
    const candlesticks = [];
    let dailyData = null;
    let currentDay = null;
    let lastValidClose = null;

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
        if (price.usd !== null) {
          lastValidClose = new Decimal(price.usd);
        }
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

          // Update lastValidClose only if the current close is not null
          if (dailyData.close !== null) {
            lastValidClose = dailyData.close;
          }
        }

        currentDay = day;
        dailyData = {
          // Always use lastValidClose for continuity, fall back to first price if needed
          open: lastValidClose !== null ? lastValidClose : price.usd !== null ? new Decimal(price.usd) : null,
          high: price.usd !== null ? new Decimal(price.usd) : null,
          low: price.usd !== null ? new Decimal(price.usd) : null,
          close: price.usd !== null ? new Decimal(price.usd) : null,
          provider: price.provider,
        };
      } else {
        if (price.usd !== null) {
          const priceDecimal = new Decimal(price.usd);

          if (dailyData.high === null || priceDecimal.greaterThan(dailyData.high)) {
            dailyData.high = priceDecimal;
          }
          if (dailyData.low === null || priceDecimal.lessThan(dailyData.low)) {
            dailyData.low = priceDecimal;
          }
          dailyData.close = priceDecimal;
          lastValidClose = priceDecimal;
        } else {
          dailyData.close = null;
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

  private async updateMappedEthereumTokens(): Promise<void> {
    const deployments = this.deploymentService.getDeployments();
    const latestEthereumQuotes = await this.getLatest(BlockchainType.Ethereum);
    const ethereumDeployment = this.deploymentService.getDeploymentByBlockchainType(BlockchainType.Ethereum);

    // Collect all unique Ethereum token addresses from all deployments
    const allEthereumAddresses = new Set<string>();

    for (const deployment of deployments) {
      if (!deployment.mapEthereumTokens || Object.keys(deployment.mapEthereumTokens).length === 0) {
        continue;
      }

      Object.values(deployment.mapEthereumTokens).forEach((addr) => {
        allEthereumAddresses.add(addr.toLowerCase());
      });
    }

    if (allEthereumAddresses.size === 0) {
      return;
    }

    this.logger.log(`Processing ${allEthereumAddresses.size} unique Ethereum token addresses for updates`);
    const newQuotes = [];

    for (const ethereumAddress of allEthereumAddresses) {
      try {
        // Get latest data from Codex for this Ethereum token
        const codexData = await this.codexService.getLatestPrices(ethereumDeployment, [ethereumAddress]);

        if (codexData && codexData[ethereumAddress] && codexData[ethereumAddress].usd) {
          const newUsdValue = codexData[ethereumAddress].usd;
          const newTimestamp = moment.unix(codexData[ethereumAddress].last_updated_at).utc().toISOString();

          // Check if we have an existing quote and if the values are different
          const existingQuote = latestEthereumQuotes[ethereumAddress];
          const shouldUpdate =
            !existingQuote ||
            (existingQuote.usd !== newUsdValue && new Date(newTimestamp) > new Date(existingQuote.timestamp));

          if (shouldUpdate) {
            // Create a new quote for the Ethereum token
            newQuotes.push(
              this.repository.create({
                tokenAddress: ethereumAddress,
                usd: newUsdValue,
                timestamp: newTimestamp,
                provider: 'codex',
                blockchainType: BlockchainType.Ethereum, // Store as Ethereum data
              }),
            );
            this.logger.log(`Added new Ethereum price data for ${ethereumAddress} from Codex`);
          } else {
            this.logger.log(`Skipping update for ${ethereumAddress} - values haven't changed`);
          }
        }
      } catch (error) {
        this.logger.error(`Error fetching Ethereum token ${ethereumAddress} data from Codex:`, error);
      }
    }

    if (newQuotes.length > 0) {
      const batches = _.chunk(newQuotes, 1000);
      await Promise.all(batches.map((batch) => this.repository.save(batch)));
      this.logger.log(`Updated ${newQuotes.length} Ethereum token prices`);
    }
  }

  async getLast(blockchainType: BlockchainType, tokenAddress: string): Promise<HistoricQuote | null> {
    try {
      return await this.repository
        .createQueryBuilder('hq')
        .where('hq.tokenAddress = :tokenAddress', { tokenAddress: tokenAddress.toLowerCase() })
        .andWhere('hq.blockchainType = :blockchainType', { blockchainType })
        .orderBy('hq.timestamp', 'DESC')
        .getOne();
    } catch (error) {
      this.logger.error(`Error fetching last historical quote for address ${tokenAddress}:`, error);
      return null;
    }
  }

  async addQuote(quote: Partial<HistoricQuote>): Promise<HistoricQuote> {
    try {
      const newQuote = this.repository.create({
        ...quote,
        timestamp: quote.timestamp || new Date(),
        tokenAddress: quote.tokenAddress?.toLowerCase(),
        provider: quote.provider || 'carbon-price',
      });

      return await this.repository.save(newQuote);
    } catch (error) {
      this.logger.error(`Error adding historical quote for address ${quote.tokenAddress}:`, error);
      throw new Error(`Error adding historical quote for address ${quote.tokenAddress}`);
    }
  }
}
