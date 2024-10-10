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
import { BlockchainType, Deployment } from '../deployment/deployment.service';
import { CodexService, SEI_NETWORK_ID } from '../codex/codex.service';

type Candlestick = {
  timestamp: number;
  open: string;
  close: string;
  high: string;
  low: string;
};

@Injectable()
export class HistoricQuoteService implements OnModuleInit {
  private isPolling = false;
  private readonly intervalDuration: number;
  private shouldPollQuotes: boolean;

  constructor(
    @InjectRepository(HistoricQuote) private repository: Repository<HistoricQuote>,
    private coinmarketcapService: CoinMarketCapService,
    private configService: ConfigService,
    private schedulerRegistry: SchedulerRegistry,
    private codexService: CodexService,
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
      await Promise.all([await this.updateCoinMarketCapQuotes(), await this.updateCodexQuotes()]);
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

  private async updateCodexQuotes(): Promise<void> {
    const latest = await this.getLatest(BlockchainType.Sei); // Pass the deployment to filter by blockchainType
    const networkId = SEI_NETWORK_ID;
    const addresses = await this.codexService.getAllTokenAddresses(networkId);
    const quotes = await this.codexService.getLatestPrices(networkId, addresses);
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
          blockchainType: BlockchainType.Sei,
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

  async seedSei(): Promise<void> {
    const start = moment().subtract(1, 'year').unix();
    const end = moment().unix();
    let i = 0;

    const networkId = SEI_NETWORK_ID; // Assuming SEI_NETWORK_ID is defined
    const addresses = await this.codexService.getAllTokenAddresses(networkId);
    const batchSize = 100;

    for (let startIndex = 0; startIndex < addresses.length; startIndex += batchSize) {
      const batchAddresses = addresses.slice(startIndex, startIndex + batchSize);

      // Fetch historical quotes for the current batch of addresses
      const quotesByAddress = await this.codexService.getHistoricalQuotes(networkId, batchAddresses, start, end);

      for (const address of batchAddresses) {
        const quotes = quotesByAddress[address];

        const newQuotes = quotes.map((q: any) =>
          this.repository.create({
            tokenAddress: address,
            usd: q.usd,
            timestamp: moment.unix(q.timestamp).utc().toISOString(),
            provider: 'codex',
            blockchainType: BlockchainType.Sei,
          }),
        );

        const batches = _.chunk(newQuotes, 1000);
        await Promise.all(batches.map((batch) => this.repository.save(batch)));
        console.log(`Sei history quote seeding, finished ${++i} of ${addresses.length}`, new Date());
      }
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
    _addresses: string[],
    start: number,
    end: number,
    bucket = '1 day',
  ): Promise<{ [key: string]: Candlestick[] }> {
    const today = moment().utc().startOf('day');
    const startQ = moment.unix(start).utc().startOf('day');
    const startPaddedQ = moment.unix(start).utc().startOf('day').subtract('1', 'day').toISOString();
    let endQ: any = moment.unix(end).utc().endOf('day');
    endQ = endQ.isAfter(today) ? today.toISOString() : endQ.toISOString();
    const addresses = _addresses.map((a) => a.toLowerCase());

    const addressesString = addresses.map((a) => `'${a}'`).join(', ');

    const query = `
      SELECT
        "tokenAddress",
        time_bucket_gapfill('${bucket}', timestamp) AS bucket,
        locf(first(usd, timestamp)) as open,
        locf(last(usd, timestamp)) as close,
        locf(max(usd::numeric)) as high,
        locf(min(usd::numeric)) as low
      FROM
        "historic-quotes"
      WHERE
        timestamp >= '${startPaddedQ}' AND timestamp <= '${endQ}'
        and "tokenAddress" IN (${addressesString})
        AND "blockchainType" = '${blockchainType}'
      GROUP BY
        "tokenAddress",  bucket
      ORDER BY
        "tokenAddress",  bucket;`;

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
        };

        if (!candlesByAddress[tokenAddress]) {
          candlesByAddress[tokenAddress] = [];
        }

        candlesByAddress[tokenAddress].push(candle);
      }
    });

    if (!candlesByAddress[addresses[0]]) {
      throw new BadRequestException({
        message: ['The provided Base token is currently not supported in this API'],
        error: 'Bad Request',
        statusCode: 400,
      });
    }

    if (!candlesByAddress[addresses[1]]) {
      throw new BadRequestException({
        message: ['The provided Quote token is currently not supported in this API'],
        error: 'Bad Request',
        statusCode: 400,
      });
    }

    let maxNonNullOpenIndex = -1;

    Object.values(candlesByAddress).forEach((candles: Candlestick[]) => {
      const firstNonNullOpenIndex = this.findFirstNonNullOpenIndex(candles);
      if (firstNonNullOpenIndex > maxNonNullOpenIndex) {
        maxNonNullOpenIndex = firstNonNullOpenIndex;
      }
    });

    if (maxNonNullOpenIndex === -1) {
      throw new BadRequestException({
        message: ['No data available for the specified token addresses. Try a more recent date range'],
        error: 'Bad Request',
        statusCode: 400,
      });
    }

    // Filter out candlesticks before the maxNonNullOpenIndex
    Object.keys(candlesByAddress).forEach((address) => {
      candlesByAddress[address] = candlesByAddress[address].slice(maxNonNullOpenIndex);
    });

    return candlesByAddress;
  }

  async getUsdBuckets(
    blockchainType: BlockchainType,
    tokenA: string,
    tokenB: string,
    start: number,
    end: number,
  ): Promise<Candlestick[]> {
    let _tokenA = tokenA;
    let _tokenB = tokenB;
    const seiToken = '0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee';
    const wrappedSeiToken = '0xe30fedd158a2e3b13e9badaeabafc5516e95e8c7';
    if (blockchainType === BlockchainType.Sei) {
      _tokenA = tokenA.toLowerCase() === seiToken ? wrappedSeiToken : tokenA;
      _tokenB = tokenB.toLowerCase() === seiToken ? wrappedSeiToken : tokenB;
    }

    const data = await this.getHistoryQuotesBuckets(blockchainType, [_tokenA, _tokenB], start, end, '1 hour');

    const prices = [];
    data[_tokenA].forEach((_, i) => {
      const base = data[_tokenA][i];
      const quote = data[_tokenB][i];
      prices.push({
        timestamp: base.timestamp,
        usd: new Decimal(base.close).div(quote.close),
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
        };
      } else if (day !== currentDay) {
        if (dailyData !== null) {
          candlesticks.push({
            timestamp: currentDay,
            open: dailyData.open,
            high: dailyData.high,
            low: dailyData.low,
            close: dailyData.close,
          });
        }

        currentDay = day;
        dailyData = {
          open: price.usd !== null ? new Decimal(price.usd) : null,
          high: price.usd !== null ? new Decimal(price.usd) : null,
          low: price.usd !== null ? new Decimal(price.usd) : null,
          close: price.usd !== null ? new Decimal(price.usd) : null,
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
      WITH gapfilled_quotes as (
      SELECT
        time_bucket_gapfill('1 day', timestamp, '${paddedStart}', '${paddedEnd}') AS day,
        "tokenAddress" AS address,
        locf(avg("usd"::numeric)) AS usd  
      FROM "historic-quotes"
      WHERE
        "blockchainType" = '${deployment.blockchainType}'
        AND "tokenAddress" IN (${addresses.map((address) => `'${address.toLowerCase()}'`).join(',')})
      GROUP BY "tokenAddress", day
     ) SELECT * FROM gapfilled_quotes WHERE day >= '${paddedStart}';
    `;

    const result = await this.repository.query(query);

    return result.map((row) => ({
      day: moment.utc(row.day).unix(),
      address: row.address.toLowerCase(),
      usd: parseFloat(row.usd),
    }));
  }
}
