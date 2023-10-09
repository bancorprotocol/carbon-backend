import { Injectable } from '@nestjs/common';
import axios from 'axios';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class CoinGeckoService {
  constructor(private configService: ConfigService) {}

  private readonly baseURL = 'https://pro-api.coingecko.com/api/v3';

  async getLatestPrices(contractAddresses: string[], convert = 'usd'): Promise<any> {
    const apiKey = this.configService.get('COINGECKO_API_KEY');

    try {
      const response = await axios.get(`${this.baseURL}/simple/token_price/ethereum`, {
        params: {
          contract_addresses: contractAddresses.join(','),
          vs_currencies: convert,
          include_last_updated_at: true,
        },
        headers: {
          'x-cg-pro-api-key': apiKey,
        },
      });

      return response.data;
    } catch (error) {
      throw new Error(`Failed to fetch latest token prices: ${error.message}`);
    }
  }

  async getLatestEthPrice(convert = 'usd'): Promise<any> {
    const apiKey = this.configService.get('COINGECKO_API_KEY');
    const ETH = this.configService.get('ETH');

    try {
      const response = await axios.get(`${this.baseURL}/simple/price`, {
        params: {
          ids: 'ethereum',
          vs_currencies: convert,
          include_last_updated_at: true,
        },
        headers: {
          'x-cg-pro-api-key': apiKey,
        },
      });

      return {
        [ETH.toLowerCase()]: {
          usd: response.data['ethereum']['usd'],
          last_updated_at: response.data['ethereum']['last_updated_at'],
        },
      };

      response.data;
    } catch (error) {
      throw new Error(`Failed to fetch latest token prices: ${error.message}`);
    }
  }
}
