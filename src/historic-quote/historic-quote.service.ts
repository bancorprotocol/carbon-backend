import { BadRequestException, Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { CoinMarketCapService } from '../coinmarketcap/coinmarketcap.service';
import { HistoricQuote } from './historic-quote.entity';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { SchedulerRegistry } from '@nestjs/schedule';
import { ConfigService } from '@nestjs/config';
import * as _ from 'lodash';
import moment from 'moment';
import Decimal from 'decimal.js';
import { BlockchainType, Deployment, DeploymentService, NATIVE_TOKEN } from '../deployment/deployment.service';
import { CodexService } from '../codex/codex.service';
import { TokensByAddress } from 'src/token/token.service';

type Candlestick = {
  timestamp: number;
  open: string;
  close: string;
  high: string;
  low: string;
  provider: string;
  mappedFrom?: string;
  mappedBaseToken?: string;
  mappedQuoteToken?: string;
};

type PriceProvider = 'coinmarketcap' | 'codex' | 'coingecko' | 'carbon-defi' | 'carbon-graph';

interface ProviderConfig {
  name: PriceProvider;
  enabled: boolean;
}

export type BlockchainProviderConfig = {
  [key in BlockchainType]: ProviderConfig[];
};

/**
 * Service responsible for managing and retrieving historical price quotes for tokens across different blockchains.
 * Handles price data from multiple providers (CoinMarketCap, Codex) and supports token mapping between blockchains.
 */
@Injectable()
export class HistoricQuoteService implements OnModuleInit {
  private readonly logger = new Logger(HistoricQuoteService.name);
  private isPolling = false;
  private readonly intervalDuration: number;
  private shouldPollQuotes: boolean;
  private priceProviders: BlockchainProviderConfig = {
    [BlockchainType.Ethereum]: [
      { name: 'coinmarketcap', enabled: true },
      { name: 'codex', enabled: true },
      { name: 'carbon-graph', enabled: true },
    ],
    [BlockchainType.Sei]: [{ name: 'codex', enabled: true }],
    [BlockchainType.Celo]: [{ name: 'codex', enabled: true }],
    [BlockchainType.Blast]: [{ name: 'codex', enabled: true }],
    [BlockchainType.Base]: [{ name: 'codex', enabled: true }],
    [BlockchainType.Fantom]: [{ name: 'codex', enabled: true }],
    [BlockchainType.Mantle]: [{ name: 'codex', enabled: true }],
    [BlockchainType.Linea]: [{ name: 'codex', enabled: true }],
    [BlockchainType.Berachain]: [{ name: 'codex', enabled: true }],
    [BlockchainType.Coti]: [
      { name: 'carbon-graph', enabled: true },
      // { name: 'carbon-defi', enabled: true },
    ],
    [BlockchainType.Iota]: [],
    [BlockchainType.Tac]: [{ name: 'carbon-defi', enabled: true }],
  };

  constructor(
    @InjectRepository(HistoricQuote) private repository: Repository<HistoricQuote>,
    private coinmarketcapService: CoinMarketCapService,
    private configService: ConfigService,
    private schedulerRegistry: SchedulerRegistry,
    private codexService: CodexService,
    private deploymentService: DeploymentService,
  ) {
    this.intervalDuration = +this.configService.get('POLL_HISTORIC_QUOTES_INTERVAL') || 300000;
    this.shouldPollQuotes = this.configService.get('SHOULD_POLL_HISTORIC_QUOTES') === '1';
  }

  /**
   * Initializes the service and sets up polling for updates if configured.
   * Called automatically when the module is initialized.
   */
  onModuleInit() {
    if (this.shouldPollQuotes) {
      const callback = () => this.pollForUpdates();
      const interval = setInterval(callback, this.intervalDuration);
      this.schedulerRegistry.addInterval('pollForUpdates', interval);
    }
  }

  /**
   * Seeds price history data for all Ethereum mapped tokens across all deployments.
   * This method is called during the polling process to ensure all mapped tokens have historical data.
   */
  private async seedAllEthereumMappedTokens() {
    try {
      const deployments = this.deploymentService.getDeployments();
      for (const deployment of deployments) {
        if (deployment.mapEthereumTokens && Object.keys(deployment.mapEthereumTokens).length > 0) {
          this.logger.log(`Seeding price history from Ethereum tokens for ${deployment.exchangeId}...`);
          await this.seedFromEthereumTokens(deployment);
        }
      }
    } catch (error) {
      this.logger.error('Error seeding price history from Ethereum tokens:', error);
    }
  }

  /**
   * Main polling method that updates historical quotes from various providers.
   * Updates CoinMarketCap quotes, Codex quotes for different blockchains, and mapped Ethereum tokens.
   * This method is called periodically based on the configured interval.
   */
  async pollForUpdates(): Promise<void> {
    if (this.isPolling) return;
    this.isPolling = true;

    try {
      // Process Ethereum token mappings for all deployments
      await this.seedAllEthereumMappedTokens();

      try {
        await Promise.all([
          await this.updateCoinMarketCapQuotes(),
          await this.updateCodexQuotes(BlockchainType.Sei),
          await this.updateCodexQuotes(BlockchainType.Celo),
          // await this.updateCodexQuotes(BlockchainType.Base, BASE_NETWORK_ID),
        ]);
      } catch (error) {
        this.logger.error('Error updating historic quotes:', error);
      }

      // Update any mapped Ethereum tokens that might not have been updated
      await this.updateMappedEthereumTokens();
    } catch (error) {
      this.logger.error('Error updating historic quotes:', error);
      this.isPolling = false;
    }

    this.isPolling = false;
    this.logger.log('Historic quotes updated');
  }

  /**
   * Updates price quotes from CoinMarketCap for Ethereum tokens.
   * Only saves new quotes if the price has changed from the latest stored value.
   */
  private async updateCoinMarketCapQuotes(): Promise<void> {
    const deployment = this.deploymentService.getDeploymentByBlockchainType(BlockchainType.Ethereum);
    const latest = await this.getLatest(BlockchainType.Ethereum); // Pass the deployment to filter by blockchainType
    const allQuotes = await this.coinmarketcapService.getLatestQuotes();

    // Filter out quotes for tokens that should be ignored from pricing
    const quotes = allQuotes.filter(
      (q) => !this.deploymentService.isTokenIgnoredFromPricing(deployment, q.tokenAddress),
    );

    if (quotes.length === 0) {
      this.logger.log(`No CoinMarketCap quotes to update after applying ignore list`);
      return;
    }

    const newQuotes = [];

    for (const q of quotes) {
      const tokenAddress = q.tokenAddress;
      const price = `${q.usd}`;

      // Use Decimal for proper numeric comparison
      if (latest[tokenAddress]?.usd) {
        const existingUsdDecimal = new Decimal(latest[tokenAddress].usd);
        const newUsdDecimal = new Decimal(price);
        if (existingUsdDecimal.equals(newUsdDecimal)) continue;
      }

      q.blockchainType = BlockchainType.Ethereum;
      newQuotes.push(this.repository.create(q));
    }

    const batches = _.chunk(newQuotes, 1000);
    await Promise.all(batches.map((batch) => this.repository.save(batch)));
    this.logger.log('CoinMarketCap quotes updated');
  }

  /**
   * Updates price quotes from Codex for a specific blockchain.
   * Handles both regular tokens and native tokens for the specified blockchain.
   * @param blockchainType - The blockchain type to update quotes for
   */
  private async updateCodexQuotes(blockchainType: BlockchainType): Promise<void> {
    const deployment = this.deploymentService.getDeploymentByBlockchainType(blockchainType);
    const latest = await this.getLatest(blockchainType);
    const allAddresses = await this.codexService.getAllTokenAddresses(deployment);

    // Filter out addresses that should be ignored from pricing
    const addresses = allAddresses.filter(
      (address) => !this.deploymentService.isTokenIgnoredFromPricing(deployment, address),
    );

    if (addresses.length === 0) {
      this.logger.log(`No addresses to update for ${blockchainType} after applying ignore list`);
      return;
    }

    const quotes = await this.codexService.getLatestPrices(deployment, addresses);
    const newQuotes = [];

    for (const address of Object.keys(quotes)) {
      const quote = quotes[address];
      const price = `${quote.usd}`;

      // Use Decimal for proper numeric comparison
      if (latest[address] && latest[address].usd) {
        const existingUsdDecimal = new Decimal(latest[address].usd);
        const newUsdDecimal = new Decimal(price);
        if (existingUsdDecimal.equals(newUsdDecimal)) continue;
      }

      newQuotes.push(
        this.repository.create({
          tokenAddress: address,
          usd: quote.usd,
          timestamp: moment.unix(quote.last_updated_at).utc().toISOString(),
          provider: 'codex',
          blockchainType: blockchainType,
        }),
      );
    }

    if (deployment.nativeTokenAlias) {
      const quote = quotes[deployment.nativeTokenAlias];
      newQuotes.push(
        this.repository.create({
          tokenAddress: NATIVE_TOKEN.toLowerCase(),
          usd: quote.usd,
          timestamp: moment.unix(quote.last_updated_at).utc().toISOString(),
          provider: 'codex',
          blockchainType: deployment.blockchainType,
        }),
      );
    }

    const batches = _.chunk(newQuotes, 1000);
    await Promise.all(batches.map((batch) => this.repository.save(batch)));
    this.logger.log('Codex quotes updated');
  }

  /**
   * Seeds historical price data for all tokens from CoinMarketCap.
   * Fetches one year of historical data for each token in batches.
   */
  async seed(): Promise<void> {
    const start = moment().subtract(1, 'year').unix();
    const end = moment().unix();
    let i = 0;

    const tokens = await this.coinmarketcapService.getAllTokens();
    const batchSize = 100; // Adjust the batch size as needed

    for (let startIndex = 0; startIndex < tokens.length; startIndex += batchSize) {
      const batchTokens = tokens.slice(startIndex, startIndex + batchSize);
      const addresses = batchTokens.map((token) => token.platform.token_address);

      // Fetch historical quotes for the current batch of tokens
      const quotesByAddress = await this.coinmarketcapService.getHistoricalQuotes(addresses, start, end);

      for (const token of batchTokens) {
        const address = token.platform.token_address;
        const quotes = quotesByAddress[address];

        const newQuotes = quotes.map((q: any) =>
          this.repository.create({
            tokenAddress: q.address,
            usd: q.price,
            timestamp: moment.unix(q.timestamp).utc().toISOString(),
            provider: 'coinmarketcap',
            blockchainType: BlockchainType.Ethereum,
          }),
        );

        const batches = _.chunk(newQuotes, 1000);
        await Promise.all(batches.map((batch) => this.repository.save(batch)));
        this.logger.log(`History quote seeding, finished ${++i} of ${tokens.length}%`, new Date());
      }
    }
  }

  /**
   * Seeds historical price data for tokens from Codex for a specific blockchain.
   * Fetches one year of historical data for each token in batches.
   * @param blockchainType - The blockchain type to seed data for
   */
  async seedCodex(blockchainType: BlockchainType): Promise<void> {
    const deployment = this.deploymentService.getDeploymentByBlockchainType(blockchainType);
    const start = moment().subtract(1, 'year').unix();
    const end = moment().unix();
    let i = 0;

    const addresses = await this.codexService.getAllTokenAddresses(deployment);
    const batchSize = 100;

    const nativeTokenAlias = deployment.nativeTokenAlias ? deployment.nativeTokenAlias : null;

    for (let startIndex = 0; startIndex < addresses.length; startIndex += batchSize) {
      const batchAddresses = addresses.slice(startIndex, startIndex + batchSize);

      // Fetch historical quotes for the current batch of addresses
      const quotesByAddress = await this.codexService.getHistoricalQuotes(deployment, batchAddresses, start, end);

      const newQuotes = [];

      for (const address of batchAddresses) {
        const quotes = quotesByAddress[address];

        quotes.forEach((q: any) => {
          if (q.usd && q.timestamp) {
            const quote = this.repository.create({
              tokenAddress: address,
              usd: q.usd,
              timestamp: moment.unix(q.timestamp).utc().toISOString(),
              provider: 'codex',
              blockchainType: blockchainType,
            });
            newQuotes.push(quote);
          }
        });

        // If this is the native token alias, also create an entry for the native token
        if (nativeTokenAlias && address.toLowerCase() === nativeTokenAlias.toLowerCase()) {
          quotes.forEach((q: any) => {
            if (q.usd && q.timestamp) {
              const nativeTokenQuote = this.repository.create({
                tokenAddress: NATIVE_TOKEN.toLowerCase(),
                usd: q.usd,
                timestamp: moment.unix(q.timestamp).utc().toISOString(),
                provider: 'codex',
                blockchainType: blockchainType,
              });
              newQuotes.push(nativeTokenQuote);
            }
          });
        }
      }

      const batches = _.chunk(newQuotes, 1000);
      await Promise.all(batches.map((batch) => this.repository.save(batch)));
      this.logger.log(`History quote seeding, finished ${++i} of ${addresses.length}`, new Date());
    }
  }

  /**
   * Seeds historical price data for tokens that are mapped to Ethereum tokens.
   * Fetches data from Codex for the mapped Ethereum tokens and stores it.
   * @param deployment - The deployment containing token mappings
   */
  async seedFromEthereumTokens(deployment: Deployment): Promise<void> {
    if (!deployment.mapEthereumTokens || Object.keys(deployment.mapEthereumTokens).length === 0) {
      this.logger.log(`No Ethereum token mappings found for ${deployment.exchangeId}, skipping.`);
      return;
    }

    const start = moment().subtract(1, 'year').unix();
    const end = moment().unix();
    let i = 0;

    // We only need unique Ethereum token addresses
    const ethereumTokenAddresses = [...new Set(Object.values(deployment.mapEthereumTokens))].map((addr) =>
      addr.toLowerCase(),
    );
    const total = ethereumTokenAddresses.length;
    this.logger.log(`Found ${total} unique Ethereum token addresses to process`);

    const ethereumDeployment = this.deploymentService.getDeploymentByBlockchainType(BlockchainType.Ethereum);

    for (const ethereumTokenAddress of ethereumTokenAddresses) {
      // Check if the Ethereum token already has data in the database
      const existingEthereumData = await this.repository.findOne({
        where: {
          blockchainType: BlockchainType.Ethereum,
          tokenAddress: ethereumTokenAddress,
          provider: 'codex',
        },
      });

      // If the Ethereum token already has data, skip seeding
      if (existingEthereumData) {
        this.logger.log(`Ethereum token ${ethereumTokenAddress} already has price data, skipping.`);
        continue;
      }

      // If no Ethereum data exists, seed it from Codex
      this.logger.log(`No Ethereum data found for ${ethereumTokenAddress}, seeding from Codex...`);
      try {
        // Get historical data from Codex for this token
        const codexData = await this.codexService.getHistoricalQuotes(
          ethereumDeployment,
          [ethereumTokenAddress],
          start,
          end,
        );

        if (!codexData[ethereumTokenAddress] || codexData[ethereumTokenAddress].length === 0) {
          this.logger.log(`No Codex data available for Ethereum token ${ethereumTokenAddress}, skipping.`);
          continue;
        }

        // Create new quotes with blockchainType: Ethereum
        const newQuotes = [];
        codexData[ethereumTokenAddress].forEach((q) => {
          if (q.usd && q.timestamp) {
            newQuotes.push(
              this.repository.create({
                tokenAddress: ethereumTokenAddress,
                usd: q.usd,
                timestamp: moment.unix(q.timestamp).utc().toISOString(),
                provider: 'codex',
                blockchainType: BlockchainType.Ethereum, // Store as Ethereum data
              }),
            );
          }
        });

        if (newQuotes.length > 0) {
          const batches = _.chunk(newQuotes, 1000);
          await Promise.all(batches.map((batch) => this.repository.save(batch)));
          this.logger.log(
            `Token ${++i} of ${total}: Seeded ${
              newQuotes.length
            } price points for Ethereum token ${ethereumTokenAddress} from Codex`,
          );
        }
      } catch (error) {
        this.logger.error(`Error seeding Ethereum token ${ethereumTokenAddress} from Codex:`, error);
      }
    }

    this.logger.log(`Completed seeding Ethereum token price history for ${deployment.exchangeId}`);
  }

  /**
   * Retrieves the latest price quote for each token in a specific blockchain.
   * Handles both direct blockchain quotes and mapped Ethereum token quotes.
   * @param blockchainType - The blockchain type to get latest quotes for
   * @returns Object mapping token addresses to their latest quotes
   */
  async getLatest(blockchainType: BlockchainType): Promise<{ [key: string]: HistoricQuote }> {
    // Get information about Ethereum tokens potentially mapped from this blockchain type
    const deployment = this.deploymentService.getDeployments().find((d) => d.blockchainType === blockchainType);
    const tokenMap = deployment?.mapEthereumTokens ? this.deploymentService.getLowercaseTokenMap(deployment) : {};

    // Check if we have any token mappings
    const hasMappings = Object.keys(tokenMap).length > 0;

    // Original query to get latest quotes for the provided blockchain type
    const latestQuotes = await this.repository.query(`
      SELECT 
          "tokenAddress",
          "blockchainType",
          last(usd, "timestamp") AS usd,
          last("timestamp", "timestamp") AS timestamp
      FROM "historic-quotes"
      WHERE "blockchainType" = '${blockchainType}'
      GROUP BY "tokenAddress", "blockchainType";
    `);

    // If we have mapped Ethereum tokens, get them separately
    const mappedAddresses = hasMappings ? Object.keys(tokenMap) : [];
    let mappedQuotes = [];

    if (mappedAddresses.length > 0) {
      // Get Ethereum quotes for all mapped tokens
      const ethereumQuotes = await this.repository.query(`
        SELECT 
            "tokenAddress",
            "blockchainType",
            last(usd, "timestamp") AS usd,
            last("timestamp", "timestamp") AS timestamp
        FROM "historic-quotes"
        WHERE "blockchainType" = '${BlockchainType.Ethereum}'
        AND "tokenAddress" IN (${Object.values(tokenMap)
          .map((addr) => `'${addr.toLowerCase()}'`)
          .join(',')})
        GROUP BY "tokenAddress", "blockchainType";
      `);

      // Create a map of Ethereum quotes by address for easier lookup
      const ethereumQuotesByAddress = {};
      ethereumQuotes.forEach((quote) => {
        ethereumQuotesByAddress[quote.tokenAddress] = quote;
      });

      // Create mapped quotes using the original address as key but Ethereum quote data
      mappedQuotes = Object.entries(tokenMap)
        .map(([originalAddr, ethereumAddr]) => {
          const ethereumQuote = ethereumQuotesByAddress[ethereumAddr.toLowerCase()];
          if (ethereumQuote) {
            return {
              tokenAddress: originalAddr.toLowerCase(), // Use original address as key
              blockchainType: BlockchainType.Ethereum, // But mark as Ethereum blockchain type
              usd: ethereumQuote.usd,
              timestamp: ethereumQuote.timestamp,
              mappedFrom: ethereumQuote.tokenAddress, // Include source token
            };
          }
          return null;
        })
        .filter((q) => q !== null);
    }

    const result: { [key: string]: HistoricQuote } = {};

    // Add regular quotes to result
    latestQuotes.forEach((quote) => {
      // Only add if not going to be overridden by a mapped token
      if (!hasMappings || !tokenMap[quote.tokenAddress]) {
        result[quote.tokenAddress] = quote;
      }
    });

    // Add mapped Ethereum quotes, replacing any original blockchain quotes
    mappedQuotes.forEach((quote) => {
      result[quote.tokenAddress] = quote;
    });

    return result;
  }

  /**
   * Retrieves historical price quotes for multiple tokens within a time range.
   * @param addresses - Array of token addresses to fetch quotes for
   * @param start - Start timestamp (Unix timestamp)
   * @param end - End timestamp (Unix timestamp)
   * @returns Object mapping token addresses to arrays of historical quotes
   */
  async getHistoryQuotes(addresses: string[], start: number, end: number): Promise<{ [key: string]: HistoricQuote[] }> {
    try {
      const quotesByAddress: { [key: string]: HistoricQuote[] } = {};

      await Promise.all(
        addresses.map(async (tokenAddress) => {
          const quotes = await this.repository
            .createQueryBuilder('hq')
            .where('hq.tokenAddress = :tokenAddress', { tokenAddress })
            .andWhere('hq.timestamp BETWEEN TO_TIMESTAMP(:start) AND TO_TIMESTAMP(:end)', { start, end })
            .orderBy('hq.timestamp', 'ASC')
            .getMany();

          quotesByAddress[tokenAddress] = quotes;
        }),
      );

      return quotesByAddress;
    } catch (error) {
      this.logger.error(`Error fetching historical quotes for addresses between ${start} and ${end}:`, error);
      throw new Error(`Error fetching historical quotes for addresses`);
    }
  }

  /**
   * Fetches historical price data in time buckets for multiple tokens.
   * Handles both direct blockchain quotes and mapped Ethereum token quotes.
   * @param blockchainType - The blockchain type to fetch data for
   * @param addresses - Array of token addresses to fetch data for
   * @param startPaddedQ - Start time in ISO format
   * @param endQ - End time in ISO format
   * @param bucket - Time bucket size (e.g., '1 day')
   * @returns Array of price data points in the specified time buckets
   */
  private async fetchHistoryQuotesBucketsData(
    blockchainType: BlockchainType,
    addresses: string[],
    startPaddedQ: string,
    endQ: string,
    bucket: string,
  ): Promise<any[]> {
    if (addresses.length === 0) {
      return [];
    }

    const enabledProviders = this.priceProviders[blockchainType]
      .filter((p) => p.enabled)
      .map((p) => `'${p.name}'`)
      .join(',');

    const query = `WITH raw_counts AS (
      SELECT 
        "tokenAddress",
        provider,
        COUNT(*) AS data_points
      FROM "historic-quotes"
      WHERE
        timestamp >= '${startPaddedQ}'
        AND timestamp <= '${endQ}'
        AND "tokenAddress" IN (${addresses.map((a) => `'${a}'`).join(',')})
        AND "blockchainType" = '${blockchainType}'
        AND provider = ANY (ARRAY[${enabledProviders}]::text[])
      GROUP BY "tokenAddress", provider
    ),

    token_stats AS (
      SELECT
        "tokenAddress",
        MAX(data_points) AS max_points,
        MIN(NULLIF(data_points, 0)) AS min_nonzero_points
      FROM raw_counts
      GROUP BY "tokenAddress"
    ),

    token_providers AS (
      SELECT 
        rc."tokenAddress",
        rc.provider,
        rc.data_points,
        ROW_NUMBER() OVER (
          PARTITION BY rc."tokenAddress"
          ORDER BY 
            CASE WHEN rc.data_points > 0 THEN 1 ELSE 0 END DESC,
            CASE 
              WHEN ts.max_points > 5 * COALESCE(ts.min_nonzero_points, 0) 
                   AND ts.max_points = rc.data_points
              THEN 0
              ELSE array_position(ARRAY[${enabledProviders}]::text[], rc.provider)
            END
        ) AS provider_rank
      FROM raw_counts rc
      JOIN token_stats ts ON rc."tokenAddress" = ts."tokenAddress"
    ),

    top_providers AS (
      SELECT "tokenAddress", provider
      FROM token_providers
      WHERE provider_rank = 1
    )

    SELECT 
      hq."tokenAddress",
      time_bucket_gapfill('${bucket}', hq.timestamp, '${startPaddedQ}', '${endQ}') AS bucket,
      locf(first(hq.usd::numeric, hq.timestamp)) AS open,
      locf(last(hq.usd::numeric, hq.timestamp)) AS close,
      locf(max(hq.usd::numeric)) AS high,
      locf(min(hq.usd::numeric)) AS low,
      tp.provider AS selected_provider
    FROM "historic-quotes" hq
    JOIN top_providers tp 
      ON hq."tokenAddress" = tp."tokenAddress" AND hq.provider = tp.provider
    WHERE
      hq.timestamp >= '${startPaddedQ}'
      AND hq.timestamp <= '${endQ}'
      AND hq."blockchainType" = '${blockchainType}'
    GROUP BY hq."tokenAddress", bucket, tp.provider
    ORDER BY "tokenAddress", bucket;`;

    return await this.repository.query(query);
  }

  /**
   * Retrieves historical price data in time buckets for multiple tokens.
   * Handles both direct blockchain quotes and mapped Ethereum token quotes.
   * @param blockchainType - The blockchain type to fetch data for
   * @param addresses - Array of token addresses to fetch data for
   * @param start - Start timestamp (Unix timestamp)
   * @param end - End timestamp (Unix timestamp)
   * @param bucket - Time bucket size (e.g., '1 day')
   * @returns Object mapping token addresses to arrays of candlestick data
   */
  async getHistoryQuotesBuckets(
    blockchainType: BlockchainType,
    addresses: string[],
    start: number,
    end: number,
    bucket = '1 day',
  ): Promise<{ [key: string]: Candlestick[] }> {
    // Get information about Ethereum tokens potentially mapped from this blockchain type
    const deployment = this.deploymentService.getDeployments().find((d) => d.blockchainType === blockchainType);
    const tokenMap = deployment?.mapEthereumTokens ? this.deploymentService.getLowercaseTokenMap(deployment) : {};

    // Check if any of our requested addresses are mapped to Ethereum tokens
    const lowercaseAddresses = addresses.map((addr) => addr.toLowerCase());
    const mappedAddresses = lowercaseAddresses.filter((addr) => tokenMap[addr]);
    const unmappedAddresses = lowercaseAddresses.filter((addr) => !tokenMap[addr]);

    // Format time values
    const today = moment().utc().startOf('day');
    const startQ = moment.unix(start).utc().startOf('day');
    const startPaddedQ = moment.unix(start).utc().startOf('day').subtract('1', 'day').toISOString();
    let endQ: any = moment.unix(end).utc().endOf('day');
    endQ = endQ.isAfter(today) ? today.toISOString() : endQ.toISOString();

    // Store results
    const candlesByAddress: { [key: string]: Candlestick[] } = {};

    // If we have addresses that need to be fetched from their original blockchain
    if (unmappedAddresses.length > 0) {
      const result = await this.fetchHistoryQuotesBucketsData(
        blockchainType,
        unmappedAddresses,
        startPaddedQ,
        endQ,
        bucket,
      );

      // Process regular blockchain quotes
      result.forEach((row: any) => {
        if (!row.open) {
          return;
        }

        const timestamp = moment(row.bucket).utc();

        if (timestamp.isSameOrAfter(startQ)) {
          const tokenAddress = row.tokenAddress;
          const candle = {
            timestamp: timestamp.unix(),
            open: row.open,
            close: row.close,
            high: row.high,
            low: row.low,
            provider: row.selected_provider,
          };

          if (!candlesByAddress[tokenAddress]) {
            candlesByAddress[tokenAddress] = [];
          }

          candlesByAddress[tokenAddress].push(candle);
        }
      });
    }

    // If we have addresses that should be fetched from Ethereum
    if (mappedAddresses.length > 0) {
      // Create a mapping from Ethereum address to original address for later reconstruction
      const ethereumToOriginalMap = {};
      const ethereumAddresses = mappedAddresses.map((addr) => {
        const ethereumAddr = tokenMap[addr].toLowerCase();
        ethereumToOriginalMap[ethereumAddr] = addr;
        return ethereumAddr;
      });

      const ethereumResult = await this.fetchHistoryQuotesBucketsData(
        BlockchainType.Ethereum,
        ethereumAddresses,
        startPaddedQ,
        endQ,
        bucket,
      );

      // Process Ethereum quotes but map them back to original token addresses
      ethereumResult.forEach((row: any) => {
        if (!row.open) {
          return;
        }

        const timestamp = moment(row.bucket).utc();

        if (timestamp.isSameOrAfter(startQ)) {
          // Map Ethereum address back to original deployment address
          const ethereumAddr = row.tokenAddress.toLowerCase();
          const originalAddr = ethereumToOriginalMap[ethereumAddr];

          if (originalAddr) {
            const candle = {
              timestamp: timestamp.unix(),
              open: row.open,
              close: row.close,
              high: row.high,
              low: row.low,
              provider: row.selected_provider,
              mappedFrom: ethereumAddr, // Mark that this is mapped from Ethereum
            };

            if (!candlesByAddress[originalAddr]) {
              candlesByAddress[originalAddr] = [];
            }

            candlesByAddress[originalAddr].push(candle);
          }
        }
      });
    }

    // Check if tokens exist at all in candlesByAddress
    // This check may need to be relaxed if pagination can result in empty token results
    const nonExistentTokens = addresses.filter((address) => !candlesByAddress[address.toLowerCase()]);
    if (nonExistentTokens.length > 0) {
      throw new BadRequestException({
        message: [
          `No price data available for token${nonExistentTokens.length > 1 ? 's' : ''}: ${nonExistentTokens.join(
            ', ',
          )}`,
        ],
        error: 'Bad Request',
        statusCode: 400,
      });
    }

    return candlesByAddress;
  }

  /**
   * Calculates USD price buckets for a pair of tokens.
   * Handles tokens from different blockchains and mapped Ethereum tokens.
   * @param baseTokenBlockchainType - Blockchain type of the base token
   * @param quoteTokenBlockchainType - Blockchain type of the quote token
   * @param tokenA - Address of the base token
   * @param tokenB - Address of the quote token
   * @param start - Start timestamp (Unix timestamp)
   * @param end - End timestamp (Unix timestamp)
   * @returns Array of candlestick data representing the price ratio between tokens
   */
  async getUsdBuckets(
    baseTokenBlockchainType: BlockchainType,
    quoteTokenBlockchainType: BlockchainType,
    tokenA: string,
    tokenB: string,
    start: number,
    end: number,
  ): Promise<Candlestick[]> {
    let tokenAData: { [key: string]: Candlestick[] };
    let tokenBData: { [key: string]: Candlestick[] };

    // If both blockchain types are the same, make a single call
    if (baseTokenBlockchainType === quoteTokenBlockchainType) {
      const data = await this.getHistoryQuotesBuckets(baseTokenBlockchainType, [tokenA, tokenB], start, end, '1 day');
      tokenAData = { [tokenA]: data[tokenA] };
      tokenBData = { [tokenB]: data[tokenB] };
    } else {
      // Run both queries in parallel for better performance
      [tokenAData, tokenBData] = await Promise.all([
        this.getHistoryQuotesBuckets(baseTokenBlockchainType, [tokenA], start, end, '1 day'),
        this.getHistoryQuotesBuckets(quoteTokenBlockchainType, [tokenB], start, end, '1 day'),
      ]);
    }

    const prices = [];
    // Create map of timestamps to candles for each token
    const tokenAByTimestamp = new Map(tokenAData[tokenA].map((candle) => [candle.timestamp, candle]));
    const tokenBByTimestamp = new Map(tokenBData[tokenB].map((candle) => [candle.timestamp, candle]));

    // Get all timestamps where both tokens have data
    const allTimestamps = [...new Set([...tokenAByTimestamp.keys(), ...tokenBByTimestamp.keys()])].sort();

    // Keep track of mapping information
    let mappedBaseToken = null;
    let mappedQuoteToken = null;

    // Check if we have mapping information in any of the candlesticks
    for (const candle of tokenAData[tokenA]) {
      if (candle.mappedFrom) {
        mappedBaseToken = candle.mappedFrom;
        break;
      }
    }

    for (const candle of tokenBData[tokenB]) {
      if (candle.mappedFrom) {
        mappedQuoteToken = candle.mappedFrom;
        break;
      }
    }

    // Iterate through all timestamps
    for (const timestamp of allTimestamps) {
      const base = tokenAByTimestamp.get(timestamp);
      const quote = tokenBByTimestamp.get(timestamp);

      // Skip if either token doesn't have data for this timestamp or close price is null
      if (!base || !quote || base.close === null || quote.close === null) {
        continue;
      }

      const priceItem = {
        timestamp,
        usd: new Decimal(base.close).div(quote.close),
        provider: base.provider === quote.provider ? base.provider : `${base.provider}/${quote.provider}`,
        // Add mappedBaseToken and mappedQuoteToken to each price point
        // so we can access it in the controller
        mappedBaseToken,
        mappedQuoteToken,
      };

      prices.push(priceItem);
    }

    return this.createDailyCandlestick(prices);
  }

  /**
   * Creates daily candlestick data from an array of price points.
   * Handles null values and maintains price continuity.
   * @param prices - Array of price points with timestamp and USD value
   * @returns Array of daily candlestick data
   */
  createDailyCandlestick(prices) {
    const candlesticks = [];
    let dailyData = null;
    let currentDay = null;
    let lastValidClose = null;

    // Extract mapping information from the first price point (they all have the same values)
    const mappedBaseToken = prices.length > 0 ? prices[0].mappedBaseToken : null;
    const mappedQuoteToken = prices.length > 0 ? prices[0].mappedQuoteToken : null;

    prices.forEach((price) => {
      const day = moment.unix(price.timestamp).startOf('day').unix();

      if (currentDay === null) {
        currentDay = day;
        dailyData = {
          open: price.usd !== null ? new Decimal(price.usd) : null,
          high: price.usd !== null ? new Decimal(price.usd) : null,
          low: price.usd !== null ? new Decimal(price.usd) : null,
          close: price.usd !== null ? new Decimal(price.usd) : null,
          provider: price.provider,
          mappedBaseToken,
          mappedQuoteToken,
        };
        if (price.usd !== null) {
          lastValidClose = new Decimal(price.usd);
        }
      } else if (day !== currentDay) {
        if (dailyData !== null) {
          const candlestick = {
            timestamp: currentDay,
            open: dailyData.open,
            high: dailyData.high,
            low: dailyData.low,
            close: dailyData.close,
            provider: dailyData.provider,
            mappedBaseToken,
            mappedQuoteToken,
          };

          candlesticks.push(candlestick);

          // Update lastValidClose only if the current close is not null
          if (dailyData.close !== null) {
            lastValidClose = dailyData.close;
          }
        }

        currentDay = day;
        dailyData = {
          // Always use lastValidClose for continuity, fall back to first price if needed
          open: lastValidClose !== null ? lastValidClose : price.usd !== null ? new Decimal(price.usd) : null,
          high:
            price.usd !== null && lastValidClose !== null
              ? Decimal.max(new Decimal(price.usd), lastValidClose)
              : price.usd !== null
              ? new Decimal(price.usd)
              : lastValidClose,
          low:
            price.usd !== null && lastValidClose !== null
              ? Decimal.min(new Decimal(price.usd), lastValidClose)
              : price.usd !== null
              ? new Decimal(price.usd)
              : lastValidClose,
          close: price.usd !== null ? new Decimal(price.usd) : null,
          provider: price.provider,
          mappedBaseToken,
          mappedQuoteToken,
        };
      } else {
        if (price.usd !== null) {
          const priceDecimal = new Decimal(price.usd);

          if (dailyData.high === null || priceDecimal.greaterThan(dailyData.high)) {
            dailyData.high = priceDecimal;
          }
          if (dailyData.low === null || priceDecimal.lessThan(dailyData.low)) {
            dailyData.low = priceDecimal;
          }
          dailyData.close = priceDecimal;
          lastValidClose = priceDecimal;
        } else {
          dailyData.close = null;
        }
      }
    });

    if (dailyData !== null) {
      const candlestick = {
        timestamp: currentDay,
        open: dailyData.open,
        high: dailyData.high,
        low: dailyData.low,
        close: dailyData.close,
        provider: dailyData.provider,
        mappedBaseToken,
        mappedQuoteToken,
      };

      candlesticks.push(candlestick);
    }

    return candlesticks;
  }

  /**
   * Fetches USD rates data for multiple tokens within a time range.
   * @param blockchainType - The blockchain type to fetch data for
   * @param addresses - Array of token addresses to fetch data for
   * @param paddedStart - Start time in ISO format
   * @param paddedEnd - End time in ISO format
   * @returns Array of USD rate data points
   */
  private async fetchUsdRatesData(
    blockchainType: BlockchainType,
    addresses: string[],
    paddedStart: string,
    paddedEnd: string,
  ): Promise<any[]> {
    if (addresses.length === 0) {
      return [];
    }

    const query = `
      WITH TokenProviders AS (
        SELECT 
          "tokenAddress",
          provider,
          COUNT(*) as data_points,
          ROW_NUMBER() OVER (
            PARTITION BY "tokenAddress"
            ORDER BY COUNT(*) DESC
          ) as provider_rank
        FROM "historic-quotes"
        WHERE
          timestamp >= '${paddedStart}'
          AND timestamp <= '${paddedEnd}'
          AND "tokenAddress" IN (${addresses.map((a) => `'${a}'`).join(',')})
          AND "blockchainType" = '${blockchainType}'
        GROUP BY "tokenAddress", provider
      ),
      gapfilled_quotes as (
        SELECT
          time_bucket_gapfill('1 day', hq.timestamp, '${paddedStart}', '${paddedEnd}') AS day,
          hq."tokenAddress" AS address,
          locf(avg(hq."usd"::numeric)) AS usd,
          tp.provider
        FROM "historic-quotes" hq
        JOIN TokenProviders tp ON 
          hq."tokenAddress" = tp."tokenAddress" 
          AND hq.provider = tp.provider
          AND tp.provider_rank = 1
        WHERE
          hq."blockchainType" = '${blockchainType}'
          AND hq."tokenAddress" IN (${addresses.map((address) => `'${address}'`).join(',')})
        GROUP BY hq."tokenAddress", day, tp.provider
      ) SELECT * FROM gapfilled_quotes WHERE day >= '${paddedStart}';
    `;

    return await this.repository.query(query);
  }

  /**
   * Retrieves USD rates for multiple tokens within a time range.
   * Handles both direct blockchain quotes and mapped Ethereum token quotes.
   * @param deployment - The deployment containing token information
   * @param addresses - Array of token addresses to fetch rates for
   * @param start - Start time in ISO format
   * @param end - End time in ISO format
   * @returns Array of USD rate data points
   */
  async getUsdRates(deployment: Deployment, addresses: string[], start: string, end: string): Promise<any[]> {
    const paddedStart = moment.utc(start).subtract(1, 'day').format('YYYY-MM-DD');
    const paddedEnd = moment.utc(end).add(1, 'day').format('YYYY-MM-DD');

    // Filter out addresses that should be ignored from pricing
    const filteredAddresses = addresses.filter(
      (address) => !this.deploymentService.isTokenIgnoredFromPricing(deployment, address),
    );

    if (filteredAddresses.length === 0) {
      this.logger.log(`No addresses to fetch USD rates for after applying ignore list`);
      return [];
    }

    // Check for Ethereum token mappings
    const tokenMap = deployment.mapEthereumTokens ? this.deploymentService.getLowercaseTokenMap(deployment) : {};

    // Split addresses into mapped and unmapped based on tokenMap
    const lowercaseAddresses = filteredAddresses.map((addr) => addr.toLowerCase());
    const mappedAddresses = lowercaseAddresses.filter((addr) => tokenMap[addr]);
    const unmappedAddresses = lowercaseAddresses.filter((addr) => !tokenMap[addr]);

    let result = [];

    // 1. Fetch rates for unmapped addresses from original blockchain if any exist
    if (unmappedAddresses.length > 0) {
      const unmappedResults = await this.fetchUsdRatesData(
        deployment.blockchainType,
        unmappedAddresses,
        paddedStart,
        paddedEnd,
      );

      result = result.concat(
        unmappedResults.map((row) => ({
          day: moment.utc(row.day).unix(),
          address: row.address.toLowerCase(),
          usd: parseFloat(row.usd),
          provider: row.provider,
        })),
      );
    }

    // 2. Fetch rates for mapped addresses from Ethereum blockchain if any exist
    if (mappedAddresses.length > 0) {
      // Create a mapping from Ethereum address to array of original addresses
      const ethereumToOriginalMap: { [key: string]: string[] } = {};
      const uniqueEthereumAddresses = new Set<string>();

      mappedAddresses.forEach((addr) => {
        const ethereumAddr = tokenMap[addr].toLowerCase();
        if (!ethereumToOriginalMap[ethereumAddr]) {
          ethereumToOriginalMap[ethereumAddr] = [];
        }
        ethereumToOriginalMap[ethereumAddr].push(addr);
        uniqueEthereumAddresses.add(ethereumAddr);
      });

      const mappedResults = await this.fetchUsdRatesData(
        BlockchainType.Ethereum,
        Array.from(uniqueEthereumAddresses),
        paddedStart,
        paddedEnd,
      );

      // Map results back to original addresses - create entry for each original address
      const mappedProcessedResults = [];
      mappedResults.forEach((row) => {
        const ethereumAddr = row.address.toLowerCase();
        const originalAddresses = ethereumToOriginalMap[ethereumAddr];

        // Create an entry for each original address that maps to this Ethereum address
        originalAddresses.forEach((originalAddr) => {
          mappedProcessedResults.push({
            day: moment.utc(row.day).unix(),
            address: originalAddr, // Use original address
            usd: parseFloat(row.usd),
            provider: row.provider,
            mappedFrom: ethereumAddr, // Mark that this is mapped from Ethereum
          });
        });
      });

      result = result.concat(mappedProcessedResults);
    }

    return result;
  }

  /**
   * Updates price data for tokens that are mapped to Ethereum tokens.
   * Fetches latest data from Codex for mapped Ethereum tokens.
   */
  private async updateMappedEthereumTokens(): Promise<void> {
    const deployments = this.deploymentService.getDeployments();
    const latestEthereumQuotes = await this.getLatest(BlockchainType.Ethereum);
    const ethereumDeployment = this.deploymentService.getDeploymentByBlockchainType(BlockchainType.Ethereum);

    // Collect all unique Ethereum token addresses from all deployments
    const allEthereumAddresses = new Set<string>();

    for (const deployment of deployments) {
      if (!deployment.mapEthereumTokens || Object.keys(deployment.mapEthereumTokens).length === 0) {
        continue;
      }

      Object.values(deployment.mapEthereumTokens).forEach((addr) => {
        allEthereumAddresses.add(addr.toLowerCase());
      });
    }

    if (allEthereumAddresses.size === 0) {
      return;
    }

    this.logger.log(`Processing ${allEthereumAddresses.size} unique Ethereum token addresses for updates`);
    const newQuotes = [];

    for (const ethereumAddress of allEthereumAddresses) {
      try {
        // Get latest data from Codex for this Ethereum token
        const codexData = await this.codexService.getLatestPrices(ethereumDeployment, [ethereumAddress]);

        if (codexData && codexData[ethereumAddress] && codexData[ethereumAddress].usd) {
          const newUsdValue = codexData[ethereumAddress].usd;
          const newTimestamp = moment.unix(codexData[ethereumAddress].last_updated_at).utc().toISOString();

          // Check if we have an existing quote and if the USD value is different
          const existingQuote = latestEthereumQuotes[ethereumAddress];
          let shouldUpdate = !existingQuote;

          // Use Decimal for proper numeric comparison
          if (existingQuote && existingQuote.usd) {
            const existingUsdDecimal = new Decimal(existingQuote.usd);
            const newUsdDecimal = new Decimal(newUsdValue);
            shouldUpdate = !existingUsdDecimal.equals(newUsdDecimal);
          }

          if (shouldUpdate) {
            // Create a new quote for the Ethereum token
            newQuotes.push(
              this.repository.create({
                tokenAddress: ethereumAddress,
                usd: newUsdValue,
                timestamp: newTimestamp,
                provider: 'codex',
                blockchainType: BlockchainType.Ethereum, // Store as Ethereum data
              }),
            );
            this.logger.log(`Added new Ethereum price data for ${ethereumAddress} from Codex`);
          } else {
            this.logger.log(`Skipping update for ${ethereumAddress} - USD value hasn't changed`);
          }
        }
      } catch (error) {
        this.logger.error(`Error fetching Ethereum token ${ethereumAddress} data from Codex:`, error);
      }
    }

    if (newQuotes.length > 0) {
      const batches = _.chunk(newQuotes, 1000);
      await Promise.all(batches.map((batch) => this.repository.save(batch)));
      this.logger.log(`Updated ${newQuotes.length} Ethereum token prices`);
    }
  }

  /**
   * Retrieves the most recent price quote for a specific token.
   * @param blockchainType - The blockchain type of the token
   * @param tokenAddress - The address of the token
   * @returns The most recent quote or null if none exists
   */
  async getLast(blockchainType: BlockchainType, tokenAddress: string): Promise<HistoricQuote | null> {
    try {
      return await this.repository
        .createQueryBuilder('hq')
        .where('hq.tokenAddress = :tokenAddress', { tokenAddress: tokenAddress.toLowerCase() })
        .andWhere('hq.blockchainType = :blockchainType', { blockchainType })
        .orderBy('hq.timestamp', 'DESC')
        .getOne();
    } catch (error) {
      this.logger.error(`Error fetching last historical quote for address ${tokenAddress}:`, error);
      return null;
    }
  }

  /**
   * Retrieves the latest price quotes for all tokens before a specified timestamp.
   * Uses TimescaleDB optimizations and provider priority logic with 24-hour freshness rule.
   * Optimized for TimescaleDB with proper indexing and 7-day window for performance.
   * @param blockchainType - The blockchain type to query
   * @param cutoffTimestamp - Only return quotes with timestamp <= this value
   * @param limit - Maximum number of results to return (safety limit)
   * @param tokenAddresses - Optional array of token addresses to filter by
   * @returns Array of latest quotes per token before the cutoff with provider priority
   */
  async getLatestPricesBeforeTimestamp(
    blockchainType: BlockchainType,
    cutoffTimestamp: Date,
    limit = 500000,
    tokenAddresses?: string[],
  ): Promise<HistoricQuote[]> {
    try {
      // Get enabled providers in priority order
      const enabledProviders = this.priceProviders[blockchainType].filter((p) => p.enabled).map((p) => p.name);

      if (enabledProviders.length === 0) {
        this.logger.warn(`No enabled providers for ${blockchainType}`);
        return [];
      }

      // Calculate 7 days before cutoff for performance optimization
      const startWindow = moment(cutoffTimestamp).subtract(7, 'days').toISOString();
      const cutoffIso = moment(cutoffTimestamp).toISOString();

      // Normalize token addresses to lowercase if provided
      const normalizedTokenAddresses = tokenAddresses?.map((addr) => addr.toLowerCase());

      // Fast TimescaleDB query using last() function
      const allLatestQuotes = await this.repository.query(
        `
        WITH token_provider_latest AS (
          SELECT 
            "tokenAddress",
            provider,
            last(usd, timestamp) AS usd,
            last(timestamp, timestamp) AS timestamp,
            last(id, timestamp) AS id
          FROM "historic-quotes"
          WHERE "blockchainType" = $1
            AND timestamp <= $2
            AND timestamp >= $3
            AND provider = ANY($4::text[])
            AND ($6::text[] IS NULL OR "tokenAddress" = ANY($6::text[]))
          GROUP BY "tokenAddress", provider
        )
        SELECT 
          id, 
          "tokenAddress", 
          usd, 
          timestamp, 
          provider, 
          $1 as "blockchainType"
        FROM token_provider_latest
        ORDER BY "tokenAddress", provider
        LIMIT $5
        `,
        [blockchainType, cutoffIso, startWindow, enabledProviders, limit, normalizedTokenAddresses],
      );

      // Group by token and apply priority logic
      const tokenGroups = _.groupBy(allLatestQuotes, 'tokenAddress');
      const results = [];

      for (const [tokenAddress, quotes] of Object.entries(tokenGroups)) {
        const selectedQuote = this.selectBestQuoteWithPriority(quotes as HistoricQuote[], enabledProviders);
        if (selectedQuote) {
          results.push(selectedQuote);
        }
      }

      return results;
    } catch (error) {
      this.logger.error(`Error fetching latest prices before timestamp for ${blockchainType}:`, error);
      return [];
    }
  }

  /**
   * Selects the best quote from multiple provider quotes based on priority and 24-hour freshness rule.
   * Uses provider priority order, but prefers a lower priority provider if its data is more than 24 hours newer.
   * @param quotes - Array of quotes for the same token from different providers
   * @param providerPriorities - Array of provider names in priority order
   * @returns The best quote based on priority + freshness logic
   */
  private selectBestQuoteWithPriority(quotes: HistoricQuote[], providerPriorities: string[]): HistoricQuote | null {
    if (quotes.length === 0) return null;
    if (quotes.length === 1) return quotes[0];

    // Filter out providers not in the priority list
    const validQuotes = quotes.filter((quote) => providerPriorities.includes(quote.provider));

    if (validQuotes.length === 0) return quotes[0]; // Fallback to first quote if no valid providers
    if (validQuotes.length === 1) return validQuotes[0];

    // Sort quotes by provider priority
    const sortedQuotes = validQuotes.sort((a, b) => {
      const priorityA = providerPriorities.indexOf(a.provider);
      const priorityB = providerPriorities.indexOf(b.provider);
      return priorityA - priorityB;
    });

    let bestQuote = sortedQuotes[0]; // Start with highest priority

    // Check if any lower priority provider has data more than 24h newer
    for (let i = 1; i < sortedQuotes.length; i++) {
      const currentQuote = sortedQuotes[i];
      const timeDiffHours = moment(currentQuote.timestamp).diff(moment(bestQuote.timestamp), 'hours');

      if (timeDiffHours > 24) {
        bestQuote = currentQuote;
        break; // Once we find a significantly newer quote, use it
      }
    }

    return bestQuote;
  }

  /**
   * Retrieves the latest price quote for a specific token before a specified timestamp.
   * Uses the optimized multi-token method with provider priority logic internally.
   * @param blockchainType - The blockchain type of the token
   * @param tokenAddress - The address of the token
   * @param cutoffTimestamp - Only return quotes with timestamp <= this value
   * @returns The most recent quote before the cutoff or null if none exists
   */
  async getLatestPriceBeforeTimestamp(
    blockchainType: BlockchainType,
    tokenAddress: string,
    cutoffTimestamp: Date,
  ): Promise<HistoricQuote | null> {
    try {
      const results = await this.getLatestPricesBeforeTimestamp(blockchainType, cutoffTimestamp, 1, [tokenAddress]);
      return results[0] || null;
    } catch (error) {
      this.logger.error(
        `Error fetching latest price before timestamp for ${tokenAddress} at ${cutoffTimestamp.toISOString()}:`,
        error,
      );
      return null;
    }
  }

  /**
   * Adds a new price quote to the database.
   * Skips adding if the quote is a duplicate of the most recent one.
   * @param quote - The quote data to add
   * @returns The newly created quote, or null if the token is ignored from pricing
   */
  async addQuote(quote: Partial<HistoricQuote>): Promise<HistoricQuote | null> {
    try {
      // Check if the token should be ignored from pricing
      if (quote.tokenAddress && quote.blockchainType) {
        const deployment = this.deploymentService.getDeploymentByBlockchainType(quote.blockchainType);
        if (this.deploymentService.isTokenIgnoredFromPricing(deployment, quote.tokenAddress)) {
          this.logger.log(`Skipping quote for ignored token ${quote.tokenAddress}`);
          return null; // Return null to indicate the quote was skipped
        }

        const lastQuote = await this.getLast(quote.blockchainType, quote.tokenAddress);

        // If the last quote exists and has the same USD value, return it instead of creating a new one
        if (lastQuote && quote.usd) {
          const lastQuoteDecimal = new Decimal(lastQuote.usd);
          const newQuoteDecimal = new Decimal(quote.usd);

          if (lastQuoteDecimal.equals(newQuoteDecimal)) {
            this.logger.log(`Skipping duplicate quote for ${quote.tokenAddress} with USD value ${quote.usd}`);
            return lastQuote;
          }

          // Check if the price jump is too extreme (1000x smaller or bigger)
          if (lastQuoteDecimal.greaterThan(0) && newQuoteDecimal.greaterThan(0)) {
            const ratio = newQuoteDecimal.dividedBy(lastQuoteDecimal);
            const thousandDecimal = new Decimal(1000);
            const thousandthDecimal = new Decimal(0.001);

            if (ratio.greaterThanOrEqualTo(thousandDecimal) || ratio.lessThanOrEqualTo(thousandthDecimal)) {
              this.logger.warn(
                `Skipping extreme price jump for ${quote.tokenAddress}: ${lastQuote.usd} -> ${
                  quote.usd
                } (ratio: ${ratio.toFixed(2)}x)`,
              );
              return lastQuote;
            }
          }
        }
      }

      const newQuote = this.repository.create({
        ...quote,
        timestamp: quote.timestamp || new Date(),
        tokenAddress: quote.tokenAddress?.toLowerCase(),
        provider: quote.provider || 'carbon-price',
      });

      return await this.repository.save(newQuote);
    } catch (error) {
      this.logger.error(`Error adding historical quote for address ${quote.tokenAddress}:`, error);
      throw error;
    }
  }

  async prepareHistoricQuotesForQuery(deployment: Deployment, tokens: TokensByAddress): Promise<string> {
    // Calculate timestamps for 5 years ago and now
    const end = Math.floor(Date.now() / 1000);
    const start = end - 5 * 365.25 * 24 * 60 * 60; // 5 years in seconds
    const lowercaseTokens = Object.keys(tokens).map((token) => token.toLowerCase());

    // Get the latest quotes for each token
    const buckets = await this.fetchHistoryQuotesBucketsData(
      deployment.blockchainType,
      lowercaseTokens,
      moment.unix(start).format('YYYY-MM-DD'),
      moment.unix(end).format('YYYY-MM-DD'),
      '1 day',
    );

    // Build the CTE
    let historicQuotesCTE = '';
    if (buckets && buckets.length > 0) {
      const validBuckets = buckets.filter((bucket) => {
        // Only include buckets with valid close prices and defined token addresses
        return bucket.high && bucket.tokenAddress && bucket.tokenAddress !== 'undefined';
      });

      const quoteValues = validBuckets
        .map(
          (bucket) =>
            `('${bucket.tokenAddress}', '${bucket.close}', '${deployment.blockchainType}', '${moment
              .utc(bucket.bucket)
              .format('YYYY-MM-DD')}')`,
        )
        .join(',');

      if (validBuckets.length < buckets.length) {
        this.logger.warn(
          `Filtered out ${buckets.length - validBuckets.length} historic quotes with invalid data for ${
            deployment.blockchainType
          }:${deployment.exchangeId}`,
        );
      }

      if (quoteValues) {
        historicQuotesCTE = `
        historic_quotes as (
          SELECT 
            CAST("tokenAddress" AS text) as "tokenAddress", 
            CAST(usd AS double precision) as max_usd, 
            "blockchainType", 
            timestamp_day
          FROM (VALUES ${quoteValues}) AS t("tokenAddress", usd, "blockchainType", timestamp_day)
        ),`;
      }
    }
    return historicQuotesCTE;
  }
}
