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
      { name: 'carbon-defi', enabled: true },
    ],
    [BlockchainType.Sei]: [{ name: 'codex', enabled: true }],
    [BlockchainType.Celo]: [{ name: 'codex', enabled: true }],
    [BlockchainType.Blast]: [{ name: 'codex', enabled: true }],
    [BlockchainType.Base]: [{ name: 'codex', enabled: true }],
    [BlockchainType.Mantle]: [{ name: 'codex', enabled: true }],
    [BlockchainType.Linea]: [{ name: 'codex', enabled: true }],
    [BlockchainType.Berachain]: [{ name: 'codex', enabled: true }],
    [BlockchainType.Coti]: [],
    [BlockchainType.Iota]: [],
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

      // First, collect all unique Ethereum token addresses from all deployments
      const allEthereumAddresses = new Set<string>();
      for (const deployment of deployments) {
        if (deployment.mapEthereumTokens && Object.keys(deployment.mapEthereumTokens).length > 0) {
          Object.values(deployment.mapEthereumTokens).forEach((addr) => {
            allEthereumAddresses.add(addr.toLowerCase());
          });
        }
      }

      // If we have Ethereum token mappings, fetch their quotes first
      if (allEthereumAddresses.size > 0) {
        const ethereumDeployment = this.deploymentService.getDeploymentByBlockchainType(BlockchainType.Ethereum);
        const ethereumAddressArray = Array.from(allEthereumAddresses);

        // Note: Ethereum token creation is now handled by TokenService.onModuleInit()
        // Since token mappings are hardcoded in deployment configs and can't change at runtime,
        // we only need to ensure tokens exist once at startup, not on every quote poll.

        const ethereumPrices = await this.coingeckoService.getLatestPrices(ethereumAddressArray, ethereumDeployment);
        const gasTokenPrice = await this.coingeckoService.getLatestGasTokenPrice(ethereumDeployment);
        const ethereumPricesWithGas = { ...ethereumPrices, ...gasTokenPrice };
        await this.updateQuotes(
          await this.tokenService.getTokensByBlockchainType(BlockchainType.Ethereum),
          ethereumPricesWithGas,
          ethereumDeployment,
        );
      }

      // Then process each deployment
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
      const allTokens = await this.tokenService.getTokensByBlockchainType(deployment.blockchainType);

      // Filter out tokens that should be ignored from pricing
      const tokens = allTokens.filter(
        (token) => !this.deploymentService.isTokenIgnoredFromPricing(deployment, token.address),
      );

      if (tokens.length === 0) {
        this.logger.log(`No tokens to price for ${deployment.blockchainType} after applying ignore list`);
        return;
      }

      const addresses = tokens.map((t) => t.address);

      let newPrices;
      if (deployment.blockchainType === BlockchainType.Ethereum) {
        newPrices = await this.coingeckoService.getLatestPrices(addresses, deployment);
        const gasTokenPrice = await this.coingeckoService.getLatestGasTokenPrice(deployment);
        newPrices = { ...newPrices, ...gasTokenPrice };
      } else {
        newPrices = await this.codexService.getLatestPrices(deployment, addresses);
      }

      if (newPrices && Object.entries(newPrices).length > 0) {
        await this.updateQuotes(tokens, newPrices, deployment);
      }
    } catch (error) {
      this.logger.error(
        `Error fetching and storing quotes for blockchain ${deployment.blockchainType}: ${error.message}`,
      );
    }
  }

  async all(): Promise<Quote[]> {
    // Get all deployments that have Ethereum token mappings
    const deployments = this.deploymentService.getDeployments();
    const deploymentsWithMappings = deployments.filter(
      (d) => d.mapEthereumTokens && Object.keys(d.mapEthereumTokens).length > 0,
    );

    // If no deployments have mappings, return all quotes as is
    if (deploymentsWithMappings.length === 0) {
      return this.quoteRepository.find();
    }

    // Get all quotes with their tokens
    const allQuotes = await this.quoteRepository.find({ relations: ['token'] });

    // Get all unique Ethereum addresses that are mapped to
    const allEthereumAddresses = new Set<string>();
    deploymentsWithMappings.forEach((deployment) => {
      const lowercaseTokenMap = this.deploymentService.getLowercaseTokenMap(deployment);
      Object.values(lowercaseTokenMap).forEach((addr) => allEthereumAddresses.add(addr.toLowerCase()));
    });

    // If we have mapped Ethereum addresses, get their quotes
    if (allEthereumAddresses.size > 0) {
      const ethereumQuotes = await this.quoteRepository
        .createQueryBuilder('quote')
        .leftJoinAndSelect('quote.token', 'token')
        .where('quote.blockchainType = :blockchainType', { blockchainType: BlockchainType.Ethereum })
        .andWhere('LOWER(token.address) IN (:...addresses)', { addresses: Array.from(allEthereumAddresses) })
        .getMany();

      // Create a map of Ethereum quotes by address
      const ethereumQuotesByAddress = {};
      ethereumQuotes.forEach((q) => {
        ethereumQuotesByAddress[q.token.address.toLowerCase()] = q;
      });

      // Process each deployment's mappings
      const finalQuotes: Quote[] = [];
      allQuotes.forEach((quote) => {
        let shouldUseEthereumQuotePrice = false;
        let ethereumQuote: Quote | null = null;

        // Check if this quote's token is mapped in any deployment
        for (const deployment of deploymentsWithMappings) {
          const lowercaseTokenMap = this.deploymentService.getLowercaseTokenMap(deployment);
          const originalAddress = quote.token.address.toLowerCase();
          const mappedAddress = lowercaseTokenMap[originalAddress];

          if (mappedAddress && ethereumQuotesByAddress[mappedAddress]) {
            shouldUseEthereumQuotePrice = true;
            ethereumQuote = ethereumQuotesByAddress[mappedAddress];
            break;
          }
        }

        if (shouldUseEthereumQuotePrice && ethereumQuote) {
          // Only use the USD price from Ethereum quote, keep everything else from original
          const mappedQuote = {
            ...quote,
            usd: ethereumQuote.usd,
            provider: ethereumQuote.provider,
          };
          finalQuotes.push(mappedQuote);
        } else {
          finalQuotes.push(quote);
        }
      });

      return finalQuotes;
    }

    return allQuotes;
  }

  async allByAddress(deployment: Deployment): Promise<QuotesByAddress> {
    // Get all quotes for this blockchain type
    const all = await this.quoteRepository.find({
      where: { blockchainType: deployment.blockchainType },
      relations: ['token'],
    });

    // If no Ethereum token mapping, return as is
    if (!deployment.mapEthereumTokens) {
      const tokensByAddress = {};
      all.forEach((q) => (tokensByAddress[q.token.address] = q));
      return tokensByAddress;
    }

    // Get Ethereum quotes for mapped tokens
    const lowercaseTokenMap = this.deploymentService.getLowercaseTokenMap(deployment);
    const mappedAddresses = Object.values(lowercaseTokenMap);

    const tokensByAddress = {};

    // Get all tokens for this blockchain type to ensure we have complete token data
    const allTokens = await this.tokenService.getTokensByBlockchainType(deployment.blockchainType);
    const tokensByAddress_lower = {};
    if (allTokens && Array.isArray(allTokens)) {
      allTokens.forEach((token) => {
        tokensByAddress_lower[token.address.toLowerCase()] = token;
      });
    }

    if (mappedAddresses.length > 0) {
      // Get Ethereum quotes using query builder to properly handle the address IN condition
      const ethereumQuotes = await this.quoteRepository
        .createQueryBuilder('quote')
        .leftJoinAndSelect('quote.token', 'token')
        .where('quote.blockchainType = :blockchainType', { blockchainType: BlockchainType.Ethereum })
        .andWhere('LOWER(token.address) IN (:...addresses)', { addresses: mappedAddresses.map((a) => a.toLowerCase()) })
        .getMany();

      // Create a map of Ethereum quotes by address
      const ethereumQuotesByAddress = {};
      ethereumQuotes.forEach((q) => {
        ethereumQuotesByAddress[q.token.address.toLowerCase()] = q;
      });

      // First, process any mapped Ethereum quotes
      Object.entries(lowercaseTokenMap).forEach(([originalAddress, mappedAddress]) => {
        const ethereumQuote = ethereumQuotesByAddress[mappedAddress.toLowerCase()];
        // Find original quote if it exists
        const originalQuote = all.find((q) => q.token.address.toLowerCase() === originalAddress.toLowerCase());

        if (ethereumQuote) {
          if (originalQuote) {
            // Use original quote but with Ethereum price
            tokensByAddress[originalAddress] = {
              ...originalQuote,
              usd: ethereumQuote.usd,
              provider: ethereumQuote.provider,
            };
          } else {
            // Get the full token information from our tokens repository
            const fullToken = tokensByAddress_lower[originalAddress.toLowerCase()];

            if (fullToken) {
              // Create a new quote with the Ethereum price but on the target blockchain with full token data
              tokensByAddress[originalAddress] = {
                usd: ethereumQuote.usd,
                provider: ethereumQuote.provider,
                token: fullToken,
                blockchainType: deployment.blockchainType,
                timestamp: ethereumQuote.timestamp,
              };
            } else {
              // Fallback if token isn't found (shouldn't happen in normal operation)
              this.logger.warn(
                `No token found for address ${originalAddress} on blockchain ${deployment.blockchainType}`,
              );
              tokensByAddress[originalAddress] = {
                usd: ethereumQuote.usd,
                provider: ethereumQuote.provider,
                token: { address: originalAddress },
                blockchainType: deployment.blockchainType,
                timestamp: ethereumQuote.timestamp,
              };
            }
          }
        }
      });
    }

    // Then add any non-mapped quotes from the original blockchain
    all.forEach((quote) => {
      const originalAddress = quote.token.address.toLowerCase();
      if (!tokensByAddress[originalAddress]) {
        tokensByAddress[originalAddress] = quote;
      }
    });

    return tokensByAddress;
  }

  /**
   * Find quotes for a given blockchain type and token addresses
   * @param blockchainType chain type
   * @param addresses addresses to find quotes for
   * @returns quotes by address
   */
  async findQuotes(blockchainType: BlockchainType, addresses: string[]): Promise<QuotesByAddress> {
    const deployment = this.deploymentService.getDeploymentByBlockchainType(blockchainType);
    const lowercaseAddresses = addresses.map((a) => a.toLowerCase());

    // Get quotes for the original addresses
    const result = await this.quoteRepository
      .createQueryBuilder('quote')
      .leftJoinAndSelect('quote.token', 'token')
      .where('quote.blockchainType = :blockchainType', { blockchainType })
      .andWhere('LOWER(token.address) IN (:...addresses)', { addresses: lowercaseAddresses })
      .getMany();

    // If no Ethereum token mapping, return as is
    if (!deployment.mapEthereumTokens) {
      const tokensByAddress = {};
      result.forEach((q) => (tokensByAddress[q.token.address.toLowerCase()] = q));
      return tokensByAddress;
    }

    // Get the mapping of tokens
    const lowercaseTokenMap = this.deploymentService.getLowercaseTokenMap(deployment);

    // Find which addresses are mapped to Ethereum
    const mappedAddresses = lowercaseAddresses.map((addr) => lowercaseTokenMap[addr]).filter((addr) => addr);

    if (mappedAddresses.length > 0) {
      // Get Ethereum quotes for mapped addresses
      const ethereumQuotes = await this.quoteRepository
        .createQueryBuilder('quote')
        .leftJoinAndSelect('quote.token', 'token')
        .where('quote.blockchainType = :blockchainType', { blockchainType: BlockchainType.Ethereum })
        .andWhere('LOWER(token.address) IN (:...addresses)', { addresses: mappedAddresses })
        .getMany();

      // Create a map of Ethereum quotes by address
      const ethereumQuotesByAddress = {};
      ethereumQuotes.forEach((q) => {
        ethereumQuotesByAddress[q.token.address.toLowerCase()] = q;
      });

      // Build the final quotes map
      const tokensByAddress = {};
      result.forEach((quote) => {
        const originalAddress = quote.token.address.toLowerCase();
        const mappedAddress = lowercaseTokenMap[originalAddress];

        if (mappedAddress && ethereumQuotesByAddress[mappedAddress]) {
          // Only use the USD price from Ethereum quote, keep everything else from original
          const ethereumQuote = ethereumQuotesByAddress[mappedAddress];
          const mappedQuote = {
            ...quote,
            usd: ethereumQuote.usd,
            provider: ethereumQuote.provider,
          };
          tokensByAddress[originalAddress] = mappedQuote;
        } else {
          tokensByAddress[originalAddress] = quote;
        }
      });

      return tokensByAddress;
    }

    // Fallback to original behavior if no mapped addresses
    const tokensByAddress = {};
    result.forEach((q) => (tokensByAddress[q.token.address.toLowerCase()] = q));
    return tokensByAddress;
  }

  private async updateQuotes(tokens: Token[], newPrices: Record<string, any>, deployment: Deployment): Promise<void> {
    try {
      const now = new Date();

      // If this is not Ethereum and we have token mappings, get Ethereum quotes
      let ethereumQuotesByAddress = {};
      if (deployment.blockchainType !== BlockchainType.Ethereum && deployment.mapEthereumTokens) {
        const lowercaseTokenMap = this.deploymentService.getLowercaseTokenMap(deployment);
        const mappedAddresses = Object.values(lowercaseTokenMap);

        if (mappedAddresses.length > 0) {
          // Note: Ethereum token creation is now handled by TokenService.onModuleInit()
          // Token mappings are hardcoded and tokens are created at application startup

          const ethereumQuotes = await this.quoteRepository
            .createQueryBuilder('quote')
            .leftJoinAndSelect('quote.token', 'token')
            .where('quote.blockchainType = :blockchainType', { blockchainType: BlockchainType.Ethereum })
            .andWhere('LOWER(token.address) IN (:...addresses)', { addresses: mappedAddresses })
            .getMany();

          ethereumQuotesByAddress = ethereumQuotes.reduce((acc, quote) => {
            acc[quote.token.address.toLowerCase()] = quote;
            return acc;
          }, {});
        }
      }

      // Get existing quotes for these tokens
      const existingQuotes =
        tokens.length > 0
          ? await this.quoteRepository
              .createQueryBuilder('quote')
              .leftJoinAndSelect('quote.token', 'token')
              .where('quote.blockchainType = :blockchainType', { blockchainType: deployment.blockchainType })
              .andWhere('token.id IN (:...tokenIds)', { tokenIds: tokens.map((t) => t.id) })
              .getMany()
          : [];

      // Create a map of existing quotes by token ID
      const existingQuotesByTokenId = existingQuotes.reduce((acc, quote) => {
        acc[quote.token.id] = quote;
        return acc;
      }, {});

      const quotesToSave = [];

      for (const token of tokens) {
        const tokenAddress = token.address.toLowerCase();

        const priceData = newPrices[tokenAddress];
        const existingQuote = existingQuotesByTokenId[token.id];

        if (!priceData) {
          // If we have a mapping to Ethereum and an Ethereum quote exists, use that
          if (deployment.mapEthereumTokens) {
            const lowercaseTokenMap = this.deploymentService.getLowercaseTokenMap(deployment);
            const mappedAddress = lowercaseTokenMap[tokenAddress];

            if (mappedAddress) {
              // The TokenService should have already ensured this token exists
              const ethereumQuote = ethereumQuotesByAddress[mappedAddress.toLowerCase()];

              if (ethereumQuote) {
                if (ethereumQuote.usd == null || ethereumQuote.usd === '' || ethereumQuote.usd === undefined) {
                  this.logger.warn(`Skipping quote update for token ${tokenAddress} - no valid USD price data`);
                  continue;
                }

                if (existingQuote) {
                  // Only update the USD price and provider from Ethereum quote
                  existingQuote.usd = ethereumQuote.usd;
                  existingQuote.timestamp = now;
                  existingQuote.provider = ethereumQuote.provider;
                  quotesToSave.push(existingQuote);
                } else {
                  // Create new quote with token from original blockchain but price from Ethereum
                  quotesToSave.push(
                    this.quoteRepository.create({
                      token,
                      usd: ethereumQuote.usd,
                      timestamp: now,
                      provider: ethereumQuote.provider,
                      blockchainType: deployment.blockchainType,
                    }),
                  );
                }
              }
            }
          }
          continue;
        }

        if (existingQuote) {
          // Update existing quote
          if (priceData.usd == null || priceData.usd === '' || priceData.usd === undefined) {
            this.logger.warn(`Skipping quote update for token ${tokenAddress} - no valid USD price data`);
            continue;
          }

          existingQuote.usd = priceData.usd?.toString();
          existingQuote.timestamp = now;
          existingQuote.provider = priceData.provider;
          quotesToSave.push(existingQuote);
        } else {
          // Create new quote
          if (priceData.usd == null || priceData.usd === '' || priceData.usd === undefined) {
            this.logger.warn(`Skipping quote update for token ${tokenAddress} - no valid USD price data`);
            continue;
          }

          quotesToSave.push(
            this.quoteRepository.create({
              token,
              usd: priceData.usd?.toString(),
              timestamp: now,
              provider: priceData.provider,
              blockchainType: deployment.blockchainType,
            }),
          );
        }
      }

      if (quotesToSave.length > 0) {
        await this.quoteRepository.save(quotesToSave);
      }
    } catch (error) {
      this.logger.error(`Error updating quotes: ${error.message}`);
      throw error;
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
      if (existingQuote.provider === 'carbon-defi') {
        return existingQuote;
      }

      const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000);
      if (new Date(existingQuote.timestamp) > fiveMinutesAgo) {
        return existingQuote;
      }
    }

    return undefined;
  }

  /**
   * Adds a new quote or updates an existing one for a token
   * One token should not have more than one quote in the quote table
   * @param quote Quote data to add or update
   * @returns The saved Quote entity
   */
  async addOrUpdateQuote(quote: Partial<Quote>): Promise<Quote> {
    try {
      if (!quote.token || !quote.blockchainType) {
        throw new Error('Token and blockchainType are required for quote');
      }

      // Check if a quote already exists for this token
      const existingQuote = await this.quoteRepository.findOne({
        where: {
          token: { id: quote.token.id },
          blockchainType: quote.blockchainType,
        },
        relations: ['token'],
      });

      // If exists, update it; otherwise create a new one
      const quoteEntity = existingQuote || new Quote();

      // Update properties
      quoteEntity.provider = quote.provider || 'manual';
      quoteEntity.token = quote.token;
      quoteEntity.blockchainType = quote.blockchainType;
      quoteEntity.timestamp = quote.timestamp || new Date();
      quoteEntity.usd = quote.usd;

      return await this.quoteRepository.save(quoteEntity);
    } catch (error) {
      this.logger.error(
        `Error adding/updating quote for token ${quote.token?.address} on ${quote.blockchainType}:`,
        error,
      );
      throw error;
    }
  }

  /**
   * Deduplicates quotes by tokenId, keeping only the first occurrence of each tokenId
   * @param quotes The quotes to deduplicate
   * @returns Deduplicated quotes
   */
  private deduplicateQuotesByTokenId(quotes: QuotesByAddress): QuotesByAddress {
    const uniqueQuotes: QuotesByAddress = {};
    const seenTokenIds = new Set<string>();

    for (const [address, quote] of Object.entries(quotes)) {
      // Skip quotes with undefined or null token IDs
      if (!quote.token || quote.token.id === undefined || quote.token.id === null) {
        this.logger.warn(`Skipping quote for address ${address} due to undefined token ID`);
        continue;
      }

      const tokenId = String(quote.token.id);
      if (!seenTokenIds.has(tokenId)) {
        seenTokenIds.add(tokenId);
        uniqueQuotes[address] = quote;
      }
    }

    return uniqueQuotes;
  }

  /**
   * Deduplicates quotes by tokenId and prepares a CTE for SQL queries
   * @param quotes The quotes to deduplicate and prepare
   * @returns Object containing the CTE SQL string and deduplicated quotes
   */
  async prepareQuotesForQuery(deployment: Deployment): Promise<string> {
    // First deduplicate the quotes
    const allQuotes = await this.allByAddress(deployment);
    const uniqueQuotes = this.deduplicateQuotesByTokenId(allQuotes);

    // Then build the CTE
    let quotesCTE = '';
    if (uniqueQuotes && Object.keys(uniqueQuotes).length > 0) {
      const totalQuotes = Object.keys(uniqueQuotes).length;
      const validEntries = Object.entries(uniqueQuotes).filter(([address, quote]) => {
        // Filter out quotes where token.id is undefined or null
        const isValid = quote.token && quote.token.id !== undefined && quote.token.id !== null;
        if (!isValid) {
          this.logger.warn(`No token found for address ${address} on blockchain ${deployment.blockchainType}`);
        }
        return isValid;
      });

      const quoteValues = validEntries
        .map(([, quote]) => {
          return `('${quote.token.id}', '${quote.usd}', '${quote.blockchainType}')`;
        })
        .join(',');

      if (validEntries.length < totalQuotes) {
        this.logger.warn(
          `Filtered out ${totalQuotes - validEntries.length} quotes with undefined token IDs for ${
            deployment.blockchainType
          }:${deployment.exchangeId}`,
        );
      }

      if (quoteValues) {
        quotesCTE = `
        quotes as (
          SELECT CAST("tokenId" AS integer) as "tokenId", CAST(usd AS double precision) as usd, "blockchainType" 
          FROM (VALUES ${quoteValues}) AS t("tokenId", usd, "blockchainType")
        ),`;
      }
    }
    return quotesCTE;
  }
}
