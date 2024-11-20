import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Codex } from '@codex-data/sdk';
import moment from 'moment';
import { Deployment, NATIVE_TOKEN } from '../deployment/deployment.service';

export const SEI_NETWORK_ID = 531;
export const CELO_NETWORK_ID = 42220;
export const ETHEREUM_NETWORK_ID = 1;

@Injectable()
export class CodexService {
  private sdk: Codex;

  constructor(private configService: ConfigService) {
    const apiKey = this.configService.get<string>('CODEX_API_KEY');
    this.sdk = new Codex(apiKey);
  }

  async getLatestPrices(deployment: Deployment, addresses: string[]): Promise<any> {
    const networkId = this.getNetworkId(deployment.blockchainType);
    if (!networkId) return null;

    const originalAddresses = [...addresses];
    let nativeTokenAliasUsed = false;

    // Replace only if targetAddress (NATIVE_TOKEN) is present in addresses
    if (deployment.nativeTokenAlias) {
      addresses = addresses.map((address) => {
        if (address.toLowerCase() === NATIVE_TOKEN.toLowerCase()) {
          nativeTokenAliasUsed = true;
          return deployment.nativeTokenAlias;
        }
        return address;
      });
    }

    const result = {};
    const tokens = await this.fetchTokens(networkId, addresses);

    tokens.forEach((t) => {
      const address = t.token.address.toLowerCase();
      const originalAddress = originalAddresses.find(
        (addr) =>
          addr.toLowerCase() === address || (nativeTokenAliasUsed && addr.toLowerCase() === NATIVE_TOKEN.toLowerCase()),
      );

      if (originalAddress) {
        result[originalAddress.toLowerCase()] = {
          address: originalAddress.toLowerCase(),
          usd: Number(t.priceUSD),
          provider: 'codex',
          last_updated_at: moment().unix(),
        };
      }
    });

    return result;
  }

  async getHistoricalQuotes(networkId: number, tokenAddresses: string[], from: number, to: number) {
    const MAX_TIME_RANGE = 10000 * 240 * 60; // 10k points * 240 minutes * 60 seconds

    // Adjust 'from' if time range exceeds limit
    const adjustedFrom = Math.max(from, to - MAX_TIME_RANGE);
    if (adjustedFrom > from) {
      console.warn(
        `Time range exceeded maximum of ${MAX_TIME_RANGE} seconds. Adjusting start time from ${from} to ${adjustedFrom}`,
      );
    }

    const limit = (await import('p-limit')).default;
    const concurrencyLimit = limit(1);
    const maxPoints = 1499;
    const resolution = 240;
    const resolutionSeconds = resolution * 60;
    const maxBatchDuration = maxPoints * resolutionSeconds;

    const fetchWithRetry = async (tokenAddress: string, batchFrom: number, batchTo: number): Promise<any> => {
      try {
        const bars = await this.sdk.queries.bars({
          symbol: `${tokenAddress}:${networkId}`,
          from: batchFrom,
          to: batchTo,
          resolution: `${resolution}`, // Use resolution variable
          removeLeadingNullValues: true,
        });
        return { ...bars.getBars, address: tokenAddress };
      } catch (error) {
        console.error(`Error fetching data for ${tokenAddress}, retrying...`, error);
        return fetchWithRetry(tokenAddress, batchFrom, batchTo);
      }
    };

    const fetchAllBatches = async (tokenAddress: string): Promise<any> => {
      const batchedResults = [];
      for (let start = adjustedFrom; start < to; start += maxBatchDuration) {
        const end = Math.min(start + maxBatchDuration, to);
        batchedResults.push(await fetchWithRetry(tokenAddress, start, end));
      }
      return batchedResults.flatMap((result) => result);
    };

    try {
      const results = await Promise.all(
        tokenAddresses.map((tokenAddress) => concurrencyLimit(() => fetchAllBatches(tokenAddress))),
      );

      const quotesByAddress = {};
      results.forEach((batchedResult, index) => {
        const tokenAddress = tokenAddresses[index];
        quotesByAddress[tokenAddress] = batchedResult.flatMap((result) =>
          result.t.map((timestamp: number, i: number) => ({
            timestamp,
            usd: result.c[i],
          })),
        );
      });

      return quotesByAddress;
    } catch (error) {
      console.error('Unexpected error:', error);
      throw error;
    }
  }

  async getAllTokenAddresses(networkId: number): Promise<string[]> {
    const tokens = await this.fetchTokens(networkId);
    const uniqueAddresses = Array.from(new Set(tokens.map((t) => t.token.address.toLowerCase())));
    return uniqueAddresses;
  }

  private async fetchTokens(networkId: number, addresses?: string[]) {
    // If addresses are provided, use them directly without pagination
    if (addresses && addresses.length > 0) {
      try {
        const result = await this.sdk.queries.filterTokens({
          filters: {
            network: [networkId],
          },
          tokens: addresses,
          limit: addresses.length,
          offset: 0,
        });
        return result.filterTokens.results;
      } catch (error) {
        console.error('Error fetching specific tokens:', error);
        throw error;
      }
    }

    // For fetching all tokens, use pagination with a max limit
    const limit = 200;
    let offset = 0;
    let allTokens = [];
    let fetched = [];
    const MAX_TOKENS = 10000;

    do {
      try {
        const result = await this.sdk.queries.filterTokens({
          filters: {
            network: [networkId],
            priceUSD: {
              gt: 0,
            },
          },
          limit,
          offset,
        });

        fetched = result.filterTokens.results;
        allTokens = [...allTokens, ...fetched];
        offset += limit;

        // Break if we hit the maximum token limit
        // if (allTokens.length >= MAX_TOKENS) {
        //   console.warn(`Reached maximum token limit of ${MAX_TOKENS}. Some tokens may be omitted.`);
        //   break;
        // }
      } catch (error) {
        console.error('Error fetching tokens:', error);
        throw error;
      }
    } while (fetched.length === limit);

    console.log('allTokens', allTokens.length);
    return allTokens;
  }

  private getNetworkId(blockchainType: string): number {
    switch (blockchainType) {
      case 'sei':
        return SEI_NETWORK_ID;
      case 'celo':
        return CELO_NETWORK_ID;
      case 'ethereum':
        return ETHEREUM_NETWORK_ID;
      default:
        return null;
    }
  }
}
