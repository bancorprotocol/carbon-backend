import { Injectable } from '@nestjs/common';
import axios from 'axios';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class CoinGeckoService {
  constructor(private configService: ConfigService) {}

  private readonly baseURL = 'https://pro-api.coingecko.com/api/v3';

  async getLatestPrices(contractAddresses: string[]): Promise<any> {
    const apiKey = this.configService.get('COINGECKO_API_KEY');

    try {
      const response = await axios.get(`${this.baseURL}/simple/token_price/ethereum`, {
        params: {
          contract_addresses: contractAddresses.join(','),
          vs_currencies: 'usd',
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
}
