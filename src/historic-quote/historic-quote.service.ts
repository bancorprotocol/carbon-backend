import { Injectable } from '@nestjs/common';
import { CoinMarketCapService } from '../coinmarketcap/coinmarketcap.service';
import { HistoricQuote } from './historic-quote.entity';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Interval } from '@nestjs/schedule';
import { ConfigService } from '@nestjs/config';
import * as _ from 'lodash';
import moment from 'moment';

type CandlestickData = {
  timestamp: number;
  open: string;
  close: string;
  high: string;
  low: string;
  mid: string;
};

@Injectable()
export class HistoricQuoteService {
  private isPolling = false;

  constructor(
    @InjectRepository(HistoricQuote) private repository: Repository<HistoricQuote>,
    private coinmarketcapService: CoinMarketCapService,
    private configService: ConfigService,
  ) {}

  // @Interval(5 * 60 * 1000)
  async pollForUpdates(): Promise<void> {
    const shouldPollQuotes = this.configService.get('SHOULD_POLL_HISTORIC_QUOTES');
    if (shouldPollQuotes !== '1' || this.isPolling) return;
    this.isPolling = true;

    try {
      const latest = await this.getLatest();
      const quotes = await this.coinmarketcapService.getLatestQuotes();
      const newQuotes = [];
      for (const q of quotes) {
        const tokenAddress = q.tokenAddress;
        const price = `${q.usd}`;

        if (latest[tokenAddress] && latest[tokenAddress].usd === price) {
          continue;
        }

        newQuotes.push(this.repository.create(q));
      }

      const batches = _.chunk(newQuotes, 1000);
      await Promise.all(batches.map((batch) => this.repository.save(batch)));
    } catch (error) {
      console.log(error);
    }

    this.isPolling = false;
    console.log('Historic quotes updated');
  }

  async seed(): Promise<void> {
    const start = moment().subtract(1, 'year').unix();
    const end = moment().unix();
    let i = 0;

    const tokens = await this.coinmarketcapService.getAllTokens();
    const batchSize = 1000; // Adjust the batch size as needed

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
          }),
        );

        const batches = _.chunk(newQuotes, 1000);
        await Promise.all(batches.map((batch) => this.repository.save(batch)));
        console.log(`History quote seeding, finished ${++i} of ${tokens.length}%`, new Date());
      }
    }
  }

  async getLatest(): Promise<{ [key: string]: HistoricQuote }> {
    const latestQuotes = await this.repository
      .createQueryBuilder('hq')
      .distinctOn(['hq.tokenAddress'])
      .orderBy({ 'hq.tokenAddress': 'ASC', 'hq.timestamp': 'DESC' })
      .getMany();

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
    _addresses: string[],
    start: number,
    end: number,
  ): Promise<{ [key: string]: CandlestickData[] }> {
    const today = moment().utc().startOf('day');
    const startQ = moment.unix(start).utc().startOf('day').toISOString();
    let endQ: any = moment.unix(end).utc().startOf('day');
    endQ = endQ.isAfter(today) ? today.toISOString() : endQ.toISOString();
    const addresses = _addresses.map((a) => a.toLowerCase());

    const addressesString = addresses.map((a) => `'${a}'`).join(', ');

    const query = `
      SELECT
        "tokenAddress",
        time_bucket_gapfill('6 hours', timestamp) AS bucket,
        locf(last(usd, timestamp)) as price,
        locf(first(usd, timestamp)) as open,
        locf(last(usd, timestamp)) as close,
        locf(max(usd)) as high,
        locf(min(usd)) as low
      FROM
        "historic-quotes"
      WHERE
        timestamp >= '${startQ}' AND timestamp <= '${endQ}'
        and "tokenAddress" IN (${addressesString})
      GROUP BY
        "tokenAddress",  bucket
      ORDER BY
        "tokenAddress",  bucket;`;

    const result = await this.repository.query(query);

    const candlesByAddress: { [key: string]: CandlestickData[] } = {};

    result.forEach((row: any) => {
      const tokenAddress = row.tokenAddress;
      const candle = {
        timestamp: moment(row.bucket).unix(),
        open: row.open,
        close: row.close,
        high: row.high,
        low: row.low,
        mid: row.price,
      };

      if (!candlesByAddress[tokenAddress]) {
        candlesByAddress[tokenAddress] = [];
      }

      candlesByAddress[tokenAddress].push(candle);
    });

    return candlesByAddress;
  }
}
