import { Injectable } from '@nestjs/common';
import axios from 'axios';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class CoinGeckoService {
  constructor(private configService: ConfigService) {}

  private readonly baseURL = 'https://pro-api.coingecko.com/api/v3';

  async getLatestPrices(contractAddresses: string[], convert = ['usd']): Promise<any> {
    const apiKey = this.configService.get('COINGECKO_API_KEY');
    const batchSize = 150;

    try {
      const batches: string[][] = [];
      for (let i = 0; i < contractAddresses.length; i += batchSize) {
        const batch = contractAddresses.slice(i, i + batchSize);
        batches.push(batch);
      }

      const requests = batches.map(async (batch) => {
        return axios.get(`${this.baseURL}/simple/token_price/ethereum`, {
          params: {
            contract_addresses: batch.join(','),
            vs_currencies: convert.join(','),
            include_last_updated_at: true,
          },
          headers: {
            'x-cg-pro-api-key': apiKey,
          },
        });
      });

      const responses = await Promise.all(requests);
      let result = {};
      responses.forEach((r) => {
        result = { ...result, ...r.data };
      });

      return result;
    } catch (error) {
      throw new Error(`Failed to fetch latest token prices: ${error.message}`);
    }
  }

  async getLatestEthPrice(convert = ['usd']): Promise<any> {
    const apiKey = this.configService.get('COINGECKO_API_KEY');
    const ETH = this.configService.get('ETH');

    try {
      const response = await axios.get(`${this.baseURL}/simple/price`, {
        params: {
          ids: 'ethereum',
          vs_currencies: convert.join(','),
          include_last_updated_at: true,
        },
        headers: {
          'x-cg-pro-api-key': apiKey,
        },
      });

      const result = {
        [ETH.toLowerCase()]: {
          last_updated_at: response.data['ethereum']['last_updated_at'],
        },
      };
      convert.forEach((c) => {
        result[ETH.toLowerCase()][c.toLowerCase()] = response.data['ethereum'][c.toLowerCase()];
      });
      return result;
    } catch (error) {
      throw new Error(`Failed to fetch latest token prices: ${error.message}`);
    }
  }

  async getCoinPrices(contractAddresses: string[], convert = ['usd']): Promise<any> {
    const apiKey = this.configService.get('COINGECKO_API_KEY');
    const batchSize = 150;

    try {
      const batches: string[][] = [];
      for (let i = 0; i < contractAddresses.length; i += batchSize) {
        const batch = contractAddresses.slice(i, i + batchSize);
        batches.push(batch);
      }

      const requests = batches.map(async (batch) => {
        return axios.get(`${this.baseURL}/simple/price`, {
          params: {
            ids: batch.join(','),
            vs_currencies: convert.join(','),
            include_last_updated_at: true,
          },
          headers: {
            'x-cg-pro-api-key': apiKey,
          },
        });
      });

      const responses = await Promise.all(requests);
      let result = {};
      responses.forEach((r) => {
        result = { ...result, ...r.data };
      });

      return result;
    } catch (error) {
      throw new Error(`Failed to fetch latest coin prices: ${error.message}`);
    }
  }
}
