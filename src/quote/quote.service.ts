import { Injectable, Inject } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { ConfigService } from '@nestjs/config';
import { Quote } from './quote.entity';
import { Repository } from 'typeorm';
import Decimal from 'decimal.js';
import moment from 'moment';

import { CoinMarketCapService } from './coin-market-cap/coin-market-cap.service';
import { Interval } from '@nestjs/schedule';
import { CryptoCompareService } from './crypto-compare/crypto-compare.service';
import _ from 'lodash';

interface Interval {
  name: string;
  ms: number;
  limit: number;
  defaultSteps: number;
  roundTo: any;
  bucket: string;
}

const INTERVAL7D = {
  name: 'Hour',
  ms: 3600000,
  limit: 365,
  defaultSteps: 50,
  roundTo: 'hour',
  bucket: '1 hour',
};

@Injectable()
export class QuoteService {
  private isPolling: boolean;
  private isUpdating: boolean;
  private SYMBOLS;
  private symbols;

  constructor(
    private configService: ConfigService,
    private cmcService: CoinMarketCapService,
    private ccService: CryptoCompareService,
    @InjectRepository(Quote) private quote: Repository<Quote>,
    @Inject('REDIS') private redis: any,
  ) {
    this.SYMBOLS = JSON.parse(this.configService.get('SYMBOLS'));
    this.symbols = this.SYMBOLS.map((s) => s.symbol);
  }

  async pollForUpdates(): Promise<any> {
    try {
      if (this.isPolling || this.isUpdating) return;
      const shouldUpdate = this.configService.get('SHOULD_POLL_QUOTES');
      if (shouldUpdate !== '1') return;

      console.log('polling');
      this.isPolling = true;
      // stop here if db is emtpy of quotes
      const latestQuotes = await this.getLatestQuotes();
      if (latestQuotes.length === 0) {
        return (this.isPolling = false);
      }

      // stop here is gap is > 15 minutes.
      const earliest = latestQuotes.reduce((a, b) =>
        moment(a.timestamp).isBefore(moment(b.timestamp)) ? a : b,
      ).timestamp;
      if (moment(earliest).isBefore(moment().subtract(65, 'minutes'))) {
        return (this.isPolling = false);
      }

      // poll for new quotes
      const SYMBOLS = JSON.parse(this.configService.get('SYMBOLS'));
      // const data = await this.cmcService.fetchLatest();
      const data = await this.ccService.fetchLatest();

      const newQuotes = [];
      SYMBOLS.forEach((s) => {
        const latestQuote = latestQuotes.find((q) => q.symbol === s.symbol);
        const latestTimestamp = moment(latestQuote.timestamp);
        const timestamp = moment(data[s.symbol].timestamp);
        const price = new Decimal(data[s.symbol].price).toFixed(s.decimals);

        if (timestamp.isAfter(latestTimestamp)) {
          newQuotes.push(
            this.quote.create({
              // provider: 'CoinMarketCap',
              provider: 'CryptoCompare',
              timestamp: timestamp.toDate(),
              price,
              symbol: s.symbol,
            }),
          );
        }
      });

      // save quotes if any
      if (newQuotes.length > 0) {
        await this.quote.save(newQuotes);
      }
      this.isPolling = false;
    } catch (error) {
      console.log('error polling', error);
      this.isPolling = false;
    }
  }

  async update(firstBlockTimestamp: Date): Promise<any> {
    try {
      this.isUpdating = true;
      let latestQuotes = await this.getLatestQuotes();

      // db is empty, seed
      if (!latestQuotes[0]) {
        await this.fillHistory(firstBlockTimestamp);
        return latestQuotes;
      }

      // if for whatever reason polling has failed - fetch data from historical apis
      const from = latestQuotes.reduce((a, b) =>
        moment(a.timestamp).isBefore(moment(b.timestamp)) ? a : b,
      ).timestamp;
      if (moment(from).isBefore(moment().subtract(15, 'minutes'))) {
        await this.fillHistory(from);
        latestQuotes = await this.getLatestQuotes();
      }
      this.isUpdating = false;
      return latestQuotes;
    } catch (error) {
      console.log(error);
      this.isUpdating = false;
      throw error;
    }
  }

  async getLatestQuotes(): Promise<Quote[]> {
    const quotes = [];
    await Promise.all(
      this.symbols.map(async (s) => {
        const q = await this.quote
          .createQueryBuilder()
          .where({ symbol: s })
          .orderBy({ timestamp: 'DESC' })
          .limit(1)
          .getOne();
        quotes.push(q);
      }),
    );
    return quotes;
  }

  async saveBatchOfQuotes(
    quoteObjects: unknown,
    provider: string,
  ): Promise<any> {
    const SYMBOLS = JSON.parse(this.configService.get('SYMBOLS'));
    const quotes = [];
    SYMBOLS.forEach((s) => {
      quoteObjects[s.symbol].forEach((q) =>
        quotes.push(
          this.quote.create({
            price: new Decimal(q.price).toFixed(s.decimals),
            timestamp: moment(q.timestamp).toDate(),
            provider,
            symbol: s.symbol,
          }),
        ),
      );
    });
    const chunks = _.chunk(quotes, 10000);
    await Promise.all(chunks.map((c) => this.quote.save(c)));
  }

  async fillHistory(from: Date): Promise<any> {
    // let quotes;
    const threeMonthsAgo = moment()
      .subtract(3, 'months')
      .add(10, 'seconds')
      .toDate();

    // take everything up until 3 months ago from crypto compare
    let quotes = await this.ccService.fetch(from, threeMonthsAgo);
    await this.saveBatchOfQuotes(quotes, 'CryptoCompare');

    // take last 3 months from coin market cap
    quotes = await this.cmcService.fetchHistory();
    await this.saveBatchOfQuotes(quotes, 'CoinMarketCap');
    return;
  }

  findQuotesForTimestamp(
    quotes: unknown,
    timestamp: number,
    symbols?: any[],
  ): any {
    const roundedMinute = moment(timestamp).startOf('minute').format('X');

    const result = {};
    const _symbols = symbols ? symbols : this.SYMBOLS;

    _symbols.forEach((s) => {
      if (!quotes[s.symbol][roundedMinute]) {
        console.log('issue?');
        console.log(s.symbol, quotes, timestamp);
      }
      result[s.symbol] = new Decimal(quotes[s.symbol][roundedMinute]);
    });
    return result;
  }

  async getQuotesObject(
    fromTimestamp: number,
    toTimestamp?: number,
  ): Promise<any> {
    let query;
    const from = moment(fromTimestamp)
      .subtract(15, 'minutes')
      .format('YYYY-MM-DD HH:mm:ss');

    const dataFrom = moment(fromTimestamp)
      .subtract(1, 'day')
      .format('YYYY-MM-DD HH:mm:ss');

    if (toTimestamp) {
      const to = moment(toTimestamp)
        .add(15, 'minutes')
        .format('YYYY-MM-DD HH:mm:ss');

      const dataTo = moment(toTimestamp)
        .add(1, 'day')
        .format('YYYY-MM-DD HH:mm:ss');

      query = `
        SELECT "symbol", 
          time_bucket_gapfill(INTERVAL '1 minute', timestamp, '${from}', '${to}') AS bucket,
          locf(last(price, timestamp)) AS price
        FROM quote
        WHERE timestamp >= '${dataFrom}' and timestamp <= '${dataTo}'
        AND symbol != 'eos'
        GROUP BY "symbol", bucket`;
    } else {
      const to = moment(toTimestamp)
        .add(1, 'day')
        .format('YYYY-MM-DD HH:mm:ss');
      query = `
        SELECT "symbol", 
          time_bucket_gapfill(INTERVAL '1 minute', timestamp, '${from}', '${to}') AS bucket,
          locf(last(price, timestamp)) AS price
        FROM quote
        WHERE timestamp >= '${dataFrom}'
        AND symbol != 'eos'
        GROUP BY "symbol", bucket`;
    }

    const quotesRaw = await this.quote.query(query);
    const quotes = { usd: {}, eth: {}, eur: {} };
    for (const q of quotesRaw) {
      const t = q.bucket.getTime() / 1000;
      if (!quotes[q.symbol]) {
        console.log('');
      }
      quotes[q.symbol][t] = q.price;
    }
    return quotes;
  }

  // history
  async updateHistoryCache(intervals: Array<Interval>): Promise<any> {
    const t = Date.now();

    for (const interval of intervals) {
      const t = Date.now();
      const lastStoredBucket = await this.getLastBucket(interval);

      // get stored data
      let lastCachedBucket = await this.getLastCachedBucket(interval);
      if (!lastCachedBucket) {
        const obj = await this.getFirstBucket(interval);
        lastCachedBucket = obj.bucket.getTime();
      }
      let currentBucket = lastCachedBucket;

      // stop here if this interval is already fully synced
      if (currentBucket >= lastStoredBucket.bucket.getTime()) continue;

      while (currentBucket < lastStoredBucket.bucket.getTime()) {
        const t = Date.now();
        const batchEndTimestamp = moment(currentBucket).add(2, 'weeks');

        const query = `
          SELECT symbol, time_bucket(INTERVAL '${
            interval.bucket
          }', timestamp) AS bucket,
          symbol,
          first(price, timestamp) AS first,
          last(price, timestamp) AS last,
          max(price::decimal) AS high,
          min(price::decimal) AS low
          FROM quote
          where timestamp > '${moment(currentBucket).format(
            'YYYY-MM-DD HH:mm:ss',
          )}'
          and timestamp < '${batchEndTimestamp.format('YYYY-MM-DD HH:mm:ss')}'
          GROUP BY symbol, bucket
          ORDER BY bucket asc
        `;
        const rows = await this.quote.query(query);

        // save to cache
        const rowsBatches = _.chunk(rows, 10000);
        for (const rowsBatch of rowsBatches) {
          const t = Date.now();
          const pipe = this.redis.client.pipeline();
          rowsBatch.forEach((row) => {
            const timestamp = row.bucket.getTime();
            const data = JSON.stringify({
              first: row[`first`],
              last: row[`last`],
              high: row[`high`],
              low: row[`low`],
            });
            pipe.zremrangebyscore(
              `rate:bnt:${interval.name}:${row['symbol']}`,
              timestamp,
              timestamp,
            );
            pipe.zadd(
              `rate:bnt:${interval.name}:${row['symbol']}`,
              timestamp,
              data,
            );
          });

          await pipe.exec();
          console.log('finished a redis batch', Date.now() - t);
        }

        if (rows.length > 0) {
          currentBucket = rows[rows.length - 1].bucket.getTime();
          await this.setLastCachedBucket(interval, currentBucket);
        } else {
          currentBucket = lastStoredBucket.bucket.getTime() + 1;
        }

        console.log(
          'finished quote history batch for',
          interval.name,
          // 'id: ',
          // lastCached,
          // 'out of:',
          // last.id,
          'in:',
          Date.now() - t,
          currentBucket,
          lastStoredBucket.bucket.getTime(),
        );
      }
      console.log(
        'finished quote history',
        'interval:',
        interval.name,
        'took:',
        Date.now() - t,
      );
    }

    await this.cacheLast7d();
    console.log('finished quote history', Date.now() - t);
  }

  async cacheLast7d(): Promise<any> {
    const start = moment().subtract(7, 'day').valueOf();
    const end = moment().valueOf();
    const history = await this.getHistory(INTERVAL7D, start, end, 'usd');

    await this.redis.client.set(
      'rates:bnt:last7d',
      JSON.stringify(history.data),
    );
    console.log('cached bnt last 7 days');
  }

  async getLastBucket(interval: Interval): Promise<any> {
    const startAt = moment().subtract(2, 'weeks').format('YYYY-MM-DD HH:mm:ss');
    const query = `
      SELECT time_bucket(INTERVAL '${interval.bucket}', timestamp) AS bucket,
      max(id) as id
      FROM quote
      where timestamp > '${startAt}'
      GROUP BY bucket
      ORDER BY bucket desc
      limit 1
  `;
    const rows = await this.quote.query(query);
    return rows[0];
  }

  async getFirstBucket(interval: Interval): Promise<any> {
    const first = await this.getFirst();
    const endAt = moment(first.timestamp)
      .add(2, 'weeks')
      .format('YYYY-MM-DD HH:mm:ss');
    const query = `
      SELECT time_bucket(INTERVAL '${interval.bucket}', timestamp) AS bucket,
      max(id) as id
      FROM quote
      where timestamp < '${endAt}'
      GROUP BY bucket
      ORDER BY bucket asc
      limit 1
  `;
    const rows = await this.quote.query(query);
    return rows[0];
  }

  async getLastCachedBucket(interval: Interval): Promise<number> {
    const result = await this.redis.client.get(
      `quote:${interval.name}:last_cached_bucket`,
    );
    return parseInt(result);
  }

  async setLastCachedBucket(
    interval: Interval,
    timestamp: number,
  ): Promise<void> {
    await this.redis.client.set(
      `quote:${interval.name}:last_cached_bucket`,
      timestamp,
    );
  }

  async getFirst(): Promise<Quote> {
    return await this.quote
      .createQueryBuilder()
      .orderBy({ timestamp: 'ASC' })
      .limit(1)
      .getOne();
  }

  // get history
  async getHistory(
    interval: Interval,
    startDate: number,
    endDate: number,
    symbol: string,
  ): Promise<any> {
    if (endDate <= startDate) {
      return {
        error: {
          status: 400,
          messages: ['end_date must be later than start_date'],
        },
      };
    }

    // get first possible values
    const first = await this.getFirstWithTimestampLowerThan(
      startDate,
      interval,
      symbol,
    );
    // get all values up to endDate
    const rest = await this.getAllWithTimestampHigherThan(
      startDate,
      endDate,
      interval,
      symbol,
    );

    // figure out the the foratted start and end dates
    const { defaultSteps, roundTo, limit, ms } = interval;
    const startRounded = moment(startDate).startOf(roundTo);
    const roundedEnd =
      endDate > 0
        ? moment(endDate).startOf(roundTo)
        : moment(startRounded).add(defaultSteps, roundTo);
    const maxEnd = moment(startRounded).add(limit, roundTo);
    const nowRounded = moment().startOf(roundTo);
    const end = Math.min(
      roundedEnd.valueOf(),
      maxEnd.valueOf(),
      nowRounded.valueOf(),
    );

    if (startRounded.valueOf() > end) {
      return {
        error: {
          status: 400,
          messages: [
            "We couldn't find any data within given dates, try setting a less recent start_date",
          ],
        },
      };
    }

    if (!first && end < rest[0].timestamp) {
      return {
        error: {
          status: 400,
          messages: [
            "We couldn't find any data within given dates, try setting a more recent start_date",
          ],
        },
      };
    }

    let currentTime = startRounded.valueOf();
    const results = [];
    if (first) {
      results.push({ ...first, timestamp: currentTime });
      currentTime += ms;
      if (rest[0]) {
        while (currentTime < rest[0].timestamp) {
          results.push({ ...first, timestamp: currentTime });
          currentTime += ms;
        }
      }
    }

    let index = 0;
    while (currentTime <= end) {
      if (rest[index] && rest[index].timestamp >= currentTime) {
        results.push({ ...rest[index], timestamp: currentTime });
      } else {
        results.push({
          ...results[results.length - 1],
          timestamp: currentTime,
        });
      }
      currentTime += ms;
      if (rest[index + 1] && currentTime >= rest[index + 1].timestamp)
        index += 1;
    }

    return { data: results };
  }

  async getFirstWithTimestampLowerThan(
    timestamp: number,
    interval: Interval,
    symbol: string,
  ): Promise<any> {
    const key = `rate:bnt:${interval.name}:${symbol}`;
    const data = await this.redis.client.zrevrangebyscore(
      key,
      timestamp,
      '-inf',
      'withscores',
      'limit',
      0,
      1,
    );
    if (data.length > 0) {
      // const results = { timestamp: parseInt(data[1][1]), ...JSON.parse(data[1][0]) };
      const results = { timestamp: parseInt(data[1]) };
      results[symbol] = { ...JSON.parse(data[0]) };
      return results;
    } else {
      return null;
    }
  }

  async getAllWithTimestampHigherThan(
    startDate: number,
    endDate: number,
    interval: Interval,
    symbol: string,
  ): Promise<any> {
    const key = `rate:bnt:${interval.name}:${symbol}`;
    const data = await this.redis.client.zrangebyscore(
      key,
      startDate + 1,
      endDate || '+inf',
      'withscores',
      'limit',
      0,
      interval['limit'],
    );

    const results = [];
    let index = 0;
    for (let i = 0; i < data.length / 2; i++) {
      if (!results[i]) results.push({});
      results[i][symbol] = JSON.parse(data[index++]);
      results[i]['timestamp'] = parseInt(data[index++]);
    }
    return results;
  }

  async updateV3Cache(): Promise<void> {
    const now = moment().utc().startOf('minute').valueOf();
    const dayAgo = moment(now).subtract(24, 'hours').valueOf();

    const quotes = await this.getQuotesObject(dayAgo, now);
    const bntRate24hAgo = quotes['usd'][(dayAgo / 1000).toFixed(0)];
    const bntRateNow = quotes['usd'][(now / 1000).toFixed(0)];

    const pipe = await this.redis.client.pipeline();
    pipe.set('v3:bnt:rate:usd', bntRateNow);
    pipe.set('v3:bnt:rate:24hago:usd', bntRate24hAgo);
    return pipe.exec();
  }
}
