// coinmarketcap.service.ts

import { Injectable } from '@nestjs/common';
import axios, { AxiosResponse } from 'axios';
import { ConfigService } from '@nestjs/config';
import { toTimestamp } from '../utilities';
import moment from 'moment';

export interface PriceObject {
  timestamp: number;
  price: number;
}

const MAX_RESULTS_PER_CALL = 10000;
const INTERVAL_IN_MINUTES = 1440;

@Injectable()
export class CoinMarketCapService {
  constructor(private readonly configService: ConfigService) {}

  private getApiKey(): string {
    return this.configService.get<string>('COINMARKETCAP_API_KEY');
  }

  private async getTokenIds(tokenAddresses: string[]): Promise<string[]> {
    const apiKey = this.getApiKey();
    const infoUrl = 'https://pro-api.coinmarketcap.com/v1/cryptocurrency/map';

    try {
      const response = await axios.get(infoUrl, {
        params: {
          aux: 'platform',
        },
        headers: { 'X-CMC_PRO_API_KEY': apiKey },
      });

      const data = response.data.data;
      const eth = this.configService.get('ETH');

      const tokenIds = tokenAddresses.map((address) => {
        if (address.toLowerCase() === eth.toLowerCase()) {
          return '1027'; // Ethereum ID on CoinMarketCap
        }
        const foundToken = data.find((token) => token.platform?.token_address.toLowerCase() === address.toLowerCase());
        return foundToken ? foundToken.id.toString() : null;
      });

      return tokenIds.filter((id) => id !== null);
    } catch (error) {
      throw error;
    }
  }

  private async fetchHistoricalData(params: any): Promise<AxiosResponse> {
    const apiKey = this.getApiKey();
    const url = 'https://pro-api.coinmarketcap.com/v3/cryptocurrency/quotes/historical';

    try {
      const response = await axios.get(url, { params, headers: { 'X-CMC_PRO_API_KEY': apiKey } });
      return response;
    } catch (error) {
      throw error;
    }
  }

  async getHistoricalQuotes(
    tokenAddresses: string[],
    start: number,
    end: number,
  ): Promise<{ [key: string]: PriceObject[] }> {
    try {
      const tokenIds = await this.getTokenIds(tokenAddresses);

      const totalDataPoints = Math.ceil(((end - start) / (INTERVAL_IN_MINUTES * 60)) * tokenAddresses.length);
      const batches = Math.ceil(totalDataPoints / MAX_RESULTS_PER_CALL);
      const intervalInSeconds = Math.ceil((end - start) / batches);

      const requests = [];

      for (let i = 0; i < batches; i++) {
        const intervalStart = moment.unix(start + i * intervalInSeconds).toISOString(true);
        const intervalEnd = moment.unix(Math.min(start + (i + 1) * intervalInSeconds, end)).toISOString(true);

        console.log(`Interval ${i + 1}: Start - ${intervalStart}, End - ${intervalEnd}`);

        const params = {
          id: tokenIds.join(','),
          time_start: intervalStart,
          time_end: intervalEnd,
          interval: `daily`,
        };

        requests.push(this.fetchHistoricalData(params));
      }

      const responses: AxiosResponse[] = await Promise.all(requests);

      const result = {};
      responses.forEach((response) => {
        Object.keys(response.data.data).forEach((id) => {
          const tokenAddress = tokenAddresses[tokenIds.indexOf(id)];
          const prices = response.data.data[id].quotes.map((q) => {
            const { price, timestamp } = q.quote.USD;
            return { price, timestamp: toTimestamp(timestamp) };
          });

          result[tokenAddress] = (result[tokenAddress] || []).concat(prices);
        });
      });

      return result;
    } catch (error) {
      throw error;
    }
  }
}
