import { Injectable, Logger, OnModuleInit, Inject } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Quote } from './quote.entity';
import { TokenService } from '../token/token.service';
import { CoinGeckoService } from './coingecko.service';
import { SchedulerRegistry } from '@nestjs/schedule';
import { Token } from '../token/token.entity';
import { ConfigService } from '@nestjs/config';
import { DeploymentService, Deployment, BlockchainType } from '../deployment/deployment.service';
import { CodexService } from '../codex/codex.service';

export interface QuotesByAddress {
  [address: string]: Quote;
}

interface PriceProvider {
  name: string;
  enabled: boolean;
}

interface BlockchainProviderConfig {
  [key: string]: PriceProvider[];
}

@Injectable()
export class QuoteService implements OnModuleInit {
  private isPolling = false;
  private readonly logger = new Logger(QuoteService.name);
  private readonly intervalDuration: number;
  private readonly SKIP_TIMEOUT = 24 * 60 * 60; // 24 hours in seconds
  private shouldPollQuotes: boolean;
  private readonly priceProviders: BlockchainProviderConfig = {
    [BlockchainType.Ethereum]: [
      { name: 'coingecko', enabled: true },
      { name: 'codex', enabled: true },
    ],
    [BlockchainType.Sei]: [{ name: 'codex', enabled: true }],
    [BlockchainType.Celo]: [{ name: 'codex', enabled: true }],
    [BlockchainType.Blast]: [{ name: 'codex', enabled: true }],
    [BlockchainType.Base]: [{ name: 'codex', enabled: true }],
    [BlockchainType.Mantle]: [{ name: 'codex', enabled: true }],
    [BlockchainType.Linea]: [{ name: 'codex', enabled: true }],
    [BlockchainType.Berachain]: [{ name: 'codex', enabled: true }],
    [BlockchainType.Coti]: [],
  };

  constructor(
    @InjectRepository(Quote) private quoteRepository: Repository<Quote>,
    private tokenService: TokenService,
    private coingeckoService: CoinGeckoService,
    private configService: ConfigService,
    private schedulerRegistry: SchedulerRegistry,
    private deploymentService: DeploymentService,
    private codexService: CodexService,
    @Inject('REDIS') private redis: any,
  ) {
    this.intervalDuration = +this.configService.get('POLL_QUOTES_INTERVAL') || 60000;
    this.shouldPollQuotes = this.configService.get('SHOULD_POLL_QUOTES') === '1';
  }

  async onModuleInit() {
    if (this.shouldPollQuotes) {
      const callback = () => this.pollForLatest();
      const interval = setInterval(callback, this.intervalDuration);
      this.schedulerRegistry.addInterval('pollForLatest', interval);
    }
  }

  async pollForLatest(): Promise<void> {
    if (this.isPolling) {
      this.logger.warn('Polling is already in progress.');
      return;
    }

    this.isPolling = true;

    try {
      const deployments = await this.deploymentService.getDeployments();

      await Promise.all(deployments.map((deployment) => this.pollForDeployment(deployment)));
    } catch (error) {
      this.logger.error(`Error fetching and storing quotes: ${error.message}`);
    } finally {
      console.log('QUOTES SERVICE - Finished updating quotes');
      this.isPolling = false; // Reset the flag regardless of success or failure
    }
  }

  async pollForDeployment(deployment: Deployment): Promise<void> {
    if (deployment.blockchainType === BlockchainType.Coti) {
      return;
    }

    try {
      const tokens = await this.tokenService.getTokensByBlockchainType(deployment.blockchainType);
      const addresses = tokens.map((t) => t.address);

      let newPrices;
      if (deployment.blockchainType === BlockchainType.Ethereum) {
        newPrices = await this.coingeckoService.getLatestPrices(addresses, deployment);
        const gasTokenPrice = await this.coingeckoService.getLatestGasTokenPrice(deployment);
        newPrices = { ...newPrices, ...gasTokenPrice };
      } else {
        newPrices = await this.codexService.getLatestPrices(deployment, addresses);
      }

      await this.updateQuotes(tokens, newPrices, deployment);
    } catch (error) {
      this.logger.error(
        `Error fetching and storing quotes for blockchain ${deployment.blockchainType}: ${error.message}`,
      );
    }
  }

  async all(): Promise<Quote[]> {
    return this.quoteRepository.find();
  }

  async allByAddress(deployment: Deployment): Promise<QuotesByAddress> {
    const all = await this.quoteRepository.find({ where: { blockchainType: deployment.blockchainType } });
    const tokensByAddress = {};
    all.forEach((q) => (tokensByAddress[q.token.address] = q));
    return tokensByAddress;
  }

  /**
   * Find quotes for a given blockchain type and token addresses
   * @param blockchainType chain type
   * @param addresses addresses to find quotes for
   * @returns quotes by address
   */
  async findQuotes(blockchainType: BlockchainType, addresses: string[]): Promise<QuotesByAddress> {
    const result = await this.quoteRepository
      .createQueryBuilder('quote')
      .leftJoinAndSelect('quote.token', 'token')
      .where('quote.blockchainType = :blockchainType', { blockchainType })
      .andWhere('LOWER(token.address) IN (:...addresses)', { addresses: addresses.map((a) => a.toLowerCase()) })
      .getMany();
    const tokensByAddress = {};
    result.forEach((q) => (tokensByAddress[q.token.address] = q));
    return tokensByAddress;
  }

  private async updateQuotes(tokens: Token[], newPrices: Record<string, any>, deployment: Deployment): Promise<void> {
    try {
      // Create a map of token IDs to their associated quotes for quick lookup
      const existingQuotesMap = new Map<number, Quote>();

      // Get all existing quotes for this blockchain type
      const existingQuotes = await this.quoteRepository.find({
        where: { blockchainType: deployment.blockchainType },
        relations: ['token'],
      });

      // Populate the map with token ID as key and quote entity as value
      existingQuotes.forEach((quote) => {
        if (quote.token && quote.token.id) {
          existingQuotesMap.set(quote.token.id, quote);
        }
      });

      this.logger.log(`Found ${existingQuotes.length} existing quotes for ${deployment.blockchainType}`);

      const quoteEntities: Quote[] = [];

      for (const token of tokens) {
        const priceWithTimestamp = newPrices[token.address.toLowerCase()];

        if (priceWithTimestamp) {
          // Look up existing quote by token ID
          let quote = existingQuotesMap.get(token.id);

          if (!quote) {
            // Only create a new Quote if one doesn't exist
            quote = new Quote();
          }

          // Update the quote properties
          quote.provider = priceWithTimestamp.provider;
          quote.token = token;
          quote.blockchainType = deployment.blockchainType;
          quote.timestamp = new Date(priceWithTimestamp.last_updated_at * 1000);
          quote.usd = priceWithTimestamp.usd;
          quoteEntities.push(quote);
        }
      }

      if (quoteEntities.length > 0) {
        this.logger.log(`Saving ${quoteEntities.length} quotes for ${deployment.blockchainType}`);
        await this.quoteRepository.save(quoteEntities);
      } else {
        this.logger.log(`No quotes to update for ${deployment.blockchainType}`);
      }
    } catch (error) {
      this.logger.error(`Error in updateQuotes for ${deployment.blockchainType}: ${error.message}`);
      throw error; // Re-throw to be caught by the calling function
    }
  }

  async getLatestPrice(deployment: Deployment, address: string, currencies: string[]): Promise<any> {
    const enabledProviders = this.priceProviders[deployment.blockchainType].filter((p) => p.enabled);
    const addressLower = address.toLowerCase();

    let data = null;
    let usedProvider = null;

    for (const provider of enabledProviders) {
      const shouldSkip = await this.shouldSkipProvider(deployment.blockchainType, address, provider.name);
      if (shouldSkip) {
        this.logger.log(`Skipping ${provider.name} due to previous failure for ${address}`);
        continue;
      }

      try {
        data = await this.fetchPriceFromProvider(provider.name, deployment, address, currencies);

        const hasValidPriceData = data[addressLower]
          ? Object.keys(data[addressLower]).some((key) => key !== 'provider' && key !== 'last_updated_at')
          : false;

        if (data && Object.keys(data).length > 0 && data[addressLower] && hasValidPriceData) {
          usedProvider = provider.name;
          break;
        }
      } catch (error) {
        this.logger.error(`Error fetching price from ${provider.name}:`, error);
        await this.setProviderSkipFlag(deployment.blockchainType, address, provider.name);
      }
      data = null;
    }

    if (!data || Object.keys(data).length === 0) {
      throw new Error(`No price data available for token: ${address}`);
    }

    const result = {
      data: {},
      provider: usedProvider,
    };

    currencies.forEach((c) => {
      if (data[addressLower] && data[addressLower][c.toLowerCase()]) {
        result.data[c.toUpperCase()] = data[addressLower][c.toLowerCase()];
      }
    });

    return result;
  }

  private async fetchPriceFromProvider(
    provider: string,
    deployment: Deployment,
    address: string,
    currencies: string[],
  ): Promise<any> {
    switch (provider) {
      case 'codex':
        return this.codexService.getLatestPrices(deployment, [address]);
      case 'coingecko':
        return this.coingeckoService.fetchLatestPrice(deployment, address, currencies);
      default:
        return null;
    }
  }

  private async shouldSkipProvider(blockchainType: string, address: string, provider: string): Promise<boolean> {
    const key = `skip:${blockchainType}:${address}:${provider}`;
    return (await this.redis.client.get(key)) === '1';
  }

  private async setProviderSkipFlag(blockchainType: string, address: string, provider: string): Promise<void> {
    const key = `skip:${blockchainType}:${address}:${provider}`;
    await this.redis.client.setex(key, this.SKIP_TIMEOUT, '1');
  }

  /**
   * Get recent quotes for a given blockchain type and token address
   * Returns a quote if it exists and was updated in the last 5 minutes
   * @param blockchainType chain type
   * @param address address to find quotes for
   * @returns quote
   */
  async getRecentQuotesForAddress(blockchainType: BlockchainType, address: string): Promise<Quote | undefined> {
    const existingQuotes = await this.findQuotes(blockchainType, [address]);
    const existingQuote = existingQuotes[address] || existingQuotes[address.toLowerCase()];
    if (existingQuote) {
      const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000);
      if (new Date(existingQuote.timestamp) > fiveMinutesAgo) {
        return existingQuote;
      }
    }

    return undefined;
  }
}
