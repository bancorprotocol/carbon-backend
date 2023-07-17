import { Injectable, Inject } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { ConfigService } from '@nestjs/config';
import { Quote } from '../quote.entity';
import { Repository } from 'typeorm';
import Axios from 'axios';
import Decimal from 'decimal.js';
import moment from 'moment';
import Redis from 'ioredis';

@Injectable()
export class CryptoCompareService {
  constructor(
    private configService: ConfigService,
    @InjectRepository(Quote) private quote: Repository<Quote>,
    @Inject('REDIS') private redis: any,
  ) {}

  async fetch(from: Date, to: Date): Promise<any> {
    const newQuotes = {};
    const SYMBOLS = JSON.parse(this.configService.get('SYMBOLS'));
    SYMBOLS.forEach((s) => (newQuotes[s.symbol] = []));
    for (const s of SYMBOLS) {
      let interval: any = getInterval(to.getTime() / 1000, s.symbol);
      let toTs = parseInt(moment(to).startOf(interval).format('X'));

      const oldestStored = await this.quote
        .createQueryBuilder()
        .where({ symbol: s.symbol })
        .orderBy({ timestamp: 'ASC' })
        .limit(1)
        .getOne();

      const oldestStoredTimestamp = oldestStored ? Math.ceil(oldestStored.timestamp.getTime() / 1000) : 0;
      const latestStored = await this.quote
        .createQueryBuilder()
        .where({ symbol: s.symbol })
        .orderBy({ timestamp: 'DESC' })
        .limit(1)
        .getOne();
      const latestStoredTimestamp = latestStored ? Math.floor(latestStored.timestamp.getTime() / 1000) : 0;
      const stopCondition = oldestStored ? oldestStored.timestamp.getTime() / 1000 : Math.floor(from.getTime() / 1000);
      while (toTs > stopCondition) {
        interval = getInterval(toTs, s.symbol);
        try {
          if (!(toTs > latestStoredTimestamp || toTs < oldestStoredTimestamp)) {
            toTs = parseInt(
              moment(oldestStoredTimestamp * 1000)
                .startOf(interval)
                .format('X'),
            );
            continue;
          }

          const result = await Axios.get(
            `https://min-api.cryptocompare.com/data/v2/histo${interval}?fsym=BNT&tsym=${s.symbol}&limit=2000&toTs=${toTs}&api_key=bcd9191ea62bdd4952dbca37eb21b4fc29d4f7469a49765aef9ecd6ebeaa6d19`,
          );

          result.data.Data.Data.forEach((q) => {
            const timestamp = parseInt(q.time);
            if (timestamp > latestStoredTimestamp || timestamp < oldestStoredTimestamp) {
              newQuotes[s.symbol].push({
                provider: 'CryptoCompare',
                symbol: s.symbol,
                timestamp: new Date(timestamp * 1000),
                price: new Decimal(q.high).add(new Decimal(q.low)).div(2).toFixed(s.decimals),
              });
            }
          });
          toTs = parseInt(result.data.Data.TimeFrom);
        } catch (error) {
          console.log(error);
        }
      }
    }
    return newQuotes;
  }

  async fetchLatest(): Promise<any> {
    const result = await Axios.get(
      // `https://min-api.cryptocompare.com/data/v2/histo${interval}?fsym=BNT&tsym=${s.symbol}&limit=2000&toTs=${toTs}&api_key=bcd9191ea62bdd4952dbca37eb21b4fc29d4f7469a49765aef9ecd6ebeaa6d19`,
      `https://min-api.cryptocompare.com/data/pricemulti?fsyms=BNT&tsyms=USD,EUR,ETH,EOS&api_key=bcd9191ea62bdd4952dbca37eb21b4fc29d4f7469a49765aef9ecd6ebeaa6d19`,
    );

    return {
      usd: { price: result.data['BNT']['USD'], timestamp: new Date() },
      eth: { price: result.data['BNT']['ETH'], timestamp: new Date() },
      eos: { price: result.data['BNT']['EOS'], timestamp: new Date() },
      eur: { price: result.data['BNT']['EUR'], timestamp: new Date() },
    };
  }
}

function getInterval(timestamp: number, symbol): string {
  if (symbol !== 'usd') return 'hour';
  const now = Date.now() / 1000;
  const diff = now - timestamp;
  if (diff > 7 * 23 * 60 * 60) {
    return 'hour';
  }
  return 'minute';
}
