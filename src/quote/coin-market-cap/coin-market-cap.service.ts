import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Timeout } from '@nestjs/schedule';
import Axios from 'axios';
import moment from 'moment';
import { Quote } from '../quote.entity';
import _ from 'lodash';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import Decimal from 'decimal.js';
import { SecretManagerServiceClient } from '@google-cloud/secret-manager';

@Injectable()
export class CoinMarketCapService {
  constructor(private configService: ConfigService, @InjectRepository(Quote) private quote: Repository<Quote>) {}

  async fetchLatest(): Promise<any> {
    let key;
    if (process.env.NODE_ENV === 'production') {
      const secrets = new SecretManagerServiceClient();
      const [version] = await secrets.accessSecretVersion({
        name: this.configService.get('CMC_KEY'),
      });
      key = version.payload.data.toString();
    } else {
      key = this.configService.get('CMC_KEY');
    }

    const SYMBOLS = JSON.parse(this.configService.get('SYMBOLS'));
    const symbolsBatches = _.chunk(
      SYMBOLS.map(s => s.symbol),
      3,
    );
    const results = {};

    await Promise.all(
      symbolsBatches.map(async symbols => {
        const response = await Axios.get(
          `https://pro-api.coinmarketcap.com/v1/cryptocurrency/quotes/latest?symbol=bnt&convert=${symbols}`,
          {
            headers: { 'X-CMC_PRO_API_KEY': key },
          },
        );
        symbols.forEach(s => {
          const quote = response.data.data.BNT.quote[s.toUpperCase()];
          results[s] = {
            price: quote.price,
            timestamp: quote.last_updated,
            symobl: s,
          };
        });
      }),
    );

    return results;
  }

  async fetchHistory(): Promise<any> {
    let key;
    if (process.env.NODE_ENV === 'production') {
      const secrets = new SecretManagerServiceClient();
      const [version] = await secrets.accessSecretVersion({
        name: this.configService.get('CMC_KEY'),
      });
      key = version.payload.data.toString();
    } else {
      key = this.configService.get('CMC_KEY');
    }

    const SYMBOLS = JSON.parse(this.configService.get('SYMBOLS'));
    const symbolsBatches = _.chunk(
      SYMBOLS.map(s => s.symbol),
      3,
    );
    const results = {};
    SYMBOLS.forEach(s => (results[s.symbol] = []));
    const timeEnd = moment().subtract(6, 'minutes');

    for (const symbols of symbolsBatches) {
      let timeStart = moment()
        .subtract(3, 'months')
        .add(10, 'seconds');
      while (timeStart.isBefore(timeEnd)) {
        const response = await Axios.get(
          `https://pro-api.coinmarketcap.com/v1/cryptocurrency/quotes/historical?symbol=bnt&convert=${symbols}&interval=5m&count=10000&time_start=${timeStart.toISOString()}`,
          {
            headers: { 'X-CMC_PRO_API_KEY': key },
          },
        );

        response.data.data.quotes.forEach(q => {
          for (const [symbol, quote] of Object.entries(q.quote)) {
            results[symbol.toLowerCase()].push({
              price: quote['price'],
              timestamp: quote['timestamp'],
              symbol: symbol.toLowerCase(),
            });
          }
        });
        timeStart = moment(response.data.data.quotes[response.data.data.quotes.length - 1].timestamp);
      }
    }
    return results;
  }
}
