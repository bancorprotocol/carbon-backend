import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Codex } from '@codex-data/sdk';
import moment from 'moment';

const SEI_NETWORK_ID = 531;

@Injectable()
export class CodexService {
  private sdk: Codex;

  constructor(private configService: ConfigService) {
    const apiKey = this.configService.get<string>('CODEX_API_KEY');
    this.sdk = new Codex(apiKey);
  }

  async getLatestPrices(addresses: string[]): Promise<any> {
    const targetAddress = '0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee';
    const replacementAddress = '0xe30fedd158a2e3b13e9badaeabafc5516e95e8c7';

    // Check if the targetAddress is present
    const containsTargetAddress = addresses.some((address) => address.toLowerCase() === targetAddress);

    // Replace only if targetAddress is present
    if (containsTargetAddress) {
      addresses = addresses.map((address) => (address.toLowerCase() === targetAddress ? replacementAddress : address));
    }

    const result = {};
    const tokens = await this.fetchTokens(SEI_NETWORK_ID, addresses);
    tokens.forEach((t) => {
      const address = t.token.address.toLowerCase();
      result[address] = {
        address: t.token.address,
        usd: t.priceUSD,
        provider: 'codex',
        last_updated_at: moment().unix(),
      };
    });

    // Only add the custom entry for targetAddress if it was present in the original addresses
    if (containsTargetAddress) {
      const seiToken = tokens.find((t) => t.token.address.toLowerCase() === replacementAddress);
      if (seiToken) {
        result[targetAddress] = {
          address: targetAddress,
          usd: seiToken.priceUSD,
          provider: 'codex',
          last_updated_at: moment().unix(),
        };
      }
    }

    return result;
  }

  async fetchChartData(networkId: number, tokenAddress: string, from: number, to: number) {
    try {
      const data = await this.fetchTokens(networkId);

      const networks = await this.sdk.queries.bars({
        symbol: `${tokenAddress}:${networkId}`,
        from,
        to,
        resolution: '240',
      });

      return data;
    } catch (error) {
      console.error('Error fetching data:', error);
      throw error;
    }
  }

  private async fetchTokens(networkId: number, addresses?: string[]) {
    const limit = 200;
    let offset = 0;
    let allTokens = [];
    let fetched = [];

    do {
      try {
        const result = await this.sdk.queries.filterTokens({
          filters: {
            network: [networkId],
          },
          tokens: addresses || undefined, // Use addresses if provided, otherwise fetch all
          limit,
          offset,
        });

        fetched = result.filterTokens.results;
        allTokens = [...allTokens, ...fetched];
        offset += limit;
      } catch (error) {
        console.error('Error fetching tokens:', error);
        throw error;
      }
    } while (fetched.length === limit);

    return allTokens;
  }
}
