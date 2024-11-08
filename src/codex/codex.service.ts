import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Codex } from '@codex-data/sdk';
import moment from 'moment';
import { Deployment, NATIVE_TOKEN, DeploymentService, BlockchainType } from '../deployment/deployment.service';

export const SEI_NETWORK_ID = 531;
export const CELO_NETWORK_ID = 42220;

@Injectable()
export class CodexService {
  private sdk: Codex;

  constructor(private configService: ConfigService, private deploymentService: DeploymentService) {
    const apiKey = this.configService.get<string>('CODEX_API_KEY');
    if (apiKey) {
      this.sdk = new Codex(apiKey);
    } else {
      const deployments = deploymentService.getDeployments();
      const nonEthereumDeployments = deployments.find((d) => d.blockchainType !== BlockchainType.Ethereum);
      if (nonEthereumDeployments) {
        throw new Error('CODEX_API_KEY required as there is a non-Ethereum deployment');
      }
    }
  }

  async getLatestPrices(deployment: Deployment, networkId: number, addresses: string[]): Promise<any> {
    const originalAddresses = [...addresses]; // Keep a copy of the original addresses to return correct keys
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
    const limit = (await import('p-limit')).default;
    const concurrencyLimit = limit(1);
    const maxPoints = 1499;
    const resolution = 240; // Resolution in minutes (adjustable here)
    const resolutionSeconds = resolution * 60; // Convert resolution to seconds
    const maxBatchDuration = maxPoints * resolutionSeconds; // Max batch duration in seconds

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
      for (let start = from; start < to; start += maxBatchDuration) {
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
