import { Injectable, Logger } from '@nestjs/common';
import { Deployment, BlockchainType, LowercaseTokenMap, NATIVE_TOKEN } from '../deployment/deployment.service';
import { TokensTradedEventService } from '../events/tokens-traded-event/tokens-traded-event.service';
import { LastProcessedBlockService } from '../last-processed-block/last-processed-block.service';
import { DeploymentService } from '../deployment/deployment.service';
import { HistoricQuoteService } from '../historic-quote/historic-quote.service';
import Decimal from 'decimal.js';
import { TokensTradedEvent } from '../events/tokens-traded-event/tokens-traded-event.entity';
import { HistoricQuote } from '../historic-quote/historic-quote.entity';
import { QuoteService } from '../quote/quote.service';

type TokenAddressPair = {
  unknownTokenAddress: string;
  mappedTokenAddress: string;
  isToken0Known: boolean;
};

@Injectable()
export class CarbonPriceService {
  private readonly logger = new Logger(CarbonPriceService.name);

  constructor(
    private tokensTradedEventService: TokensTradedEventService,
    private lastProcessedBlockService: LastProcessedBlockService,
    private deploymentService: DeploymentService,
    private historicQuoteService: HistoricQuoteService,
    private quoteService: QuoteService,
  ) {}

  async update(endBlock: number, deployment: Deployment): Promise<any> {
    const key = `carbon-price-${deployment.blockchainType}-${deployment.exchangeId}`;

    // Skip processing if the deployment doesn't have mapEthereumTokens set
    if (!deployment.mapEthereumTokens || Object.keys(deployment.mapEthereumTokens).length === 0) {
      await this.lastProcessedBlockService.update(key, endBlock);
      return {
        startBlock: endBlock,
        endBlock,
        processed: 0,
      };
    }

    // Get the lastProcessedBlock
    const lastProcessedBlock = await this.lastProcessedBlockService.get(key);
    const startBlock = lastProcessedBlock ? lastProcessedBlock + 1 : 0;

    const BATCH_SIZE = 10000;
    let currentStartBlock = startBlock;
    let totalProcessed = 0;
    let totalPricesUpdated = 0;

    // Get the deployment's token map outside the batch loop
    const lowercaseTokenMap = this.deploymentService.getLowercaseTokenMap(deployment);

    // Process in batches to avoid memory issues
    while (currentStartBlock < endBlock) {
      const batchEndBlock = Math.min(currentStartBlock + BATCH_SIZE, endBlock);

      // Get events for this batch
      const tradedEvents = await this.tokensTradedEventService.get(currentStartBlock, batchEndBlock, deployment);

      this.logger.log(
        `Processing batch from ${currentStartBlock} to ${batchEndBlock}, found ${tradedEvents.length} events`,
      );

      // Process each traded event
      for (const event of tradedEvents) {
        totalProcessed++;

        const result = await this.processTradeEvent(event, lowercaseTokenMap, deployment);
        if (result) {
          totalPricesUpdated++;
        }
      }

      // Update the last processed block for this batch
      await this.lastProcessedBlockService.update(key, batchEndBlock);

      // Move to the next batch
      currentStartBlock = batchEndBlock + 1;
    }

    return {
      startBlock,
      endBlock,
      processed: totalProcessed,
      pricesUpdated: totalPricesUpdated,
    };
  }

  /**
   * Process a single trade event and save price if applicable
   * @returns true if a price was updated, false otherwise
   */
  async processTradeEvent(
    event: TokensTradedEvent,
    lowercaseTokenMap: LowercaseTokenMap,
    deployment: Deployment,
  ): Promise<boolean> {
    // Get the token addresses and normalize them
    const token0Address = this.normalizeTokenAddress(event.sourceToken.address.toLowerCase(), deployment);
    const token1Address = this.normalizeTokenAddress(event.targetToken.address.toLowerCase(), deployment);

    // Check if either token0 or token1 is in the deployment token map
    const tokenPair = this.identifyTokenPair(token0Address, token1Address, lowercaseTokenMap);

    if (!tokenPair) {
      return false; // No relevant tokens in this trade
    }

    // Get the latest price of the known token from ethereum blockchain
    const knownTokenQuote = await this.historicQuoteService.getLast(
      BlockchainType.Ethereum,
      tokenPair.mappedTokenAddress,
    );

    if (!knownTokenQuote) {
      return false; // Skip if we don't have a price for the known token
    }

    // Calculate the price of the unknown token
    const unknownTokenPrice = this.calculateTokenPrice(knownTokenQuote, event, deployment, tokenPair);
    const tokenPrice = unknownTokenPrice.toString();

    // Check if the last price for this token is the same, to avoid duplicate entries
    const lastQuote = await this.historicQuoteService.getLast(deployment.blockchainType, tokenPair.unknownTokenAddress);

    // If the last quote exists and has the same price, skip adding a new quote
    // Use Decimal.js for precise comparison
    if (lastQuote) {
      const lastPriceDecimal = new Decimal(lastQuote.usd);

      // Check if prices are equal with a small tolerance for floating point precision
      // equals() method in Decimal.js already has precision handling
      if (unknownTokenPrice.equals(lastPriceDecimal)) {
        this.logger.log(`Skipping duplicate price for token ${tokenPair.unknownTokenAddress}: ${tokenPrice}`);
        return false;
      }
    }

    // Save the price to the historicQuote table
    await this.historicQuoteService.addQuote({
      blockchainType: deployment.blockchainType,
      tokenAddress: tokenPair.unknownTokenAddress,
      usd: tokenPrice,
      timestamp: event.timestamp,
      provider: 'carbon-defi',
    });

    // Also update the quote table
    const token = tokenPair.isToken0Known
      ? event.targetToken // If token0 is known, then token1 is the unknown token
      : event.sourceToken; // If token1 is known, then token0 is the unknown token

    await this.quoteService.addOrUpdateQuote({
      token: token,
      blockchainType: deployment.blockchainType,
      usd: tokenPrice,
      timestamp: event.timestamp,
      provider: 'carbon-defi',
    });

    // If the unknown token is a native token alias, also save price for the original NATIVE_TOKEN address
    if (deployment.nativeTokenAlias && tokenPair.unknownTokenAddress === deployment.nativeTokenAlias.toLowerCase()) {
      const nativeTokenAddress = NATIVE_TOKEN.toLowerCase();

      // Save to historicQuote table for NATIVE_TOKEN address
      await this.historicQuoteService.addQuote({
        blockchainType: deployment.blockchainType,
        tokenAddress: nativeTokenAddress,
        usd: tokenPrice,
        timestamp: event.timestamp,
        provider: 'carbon-defi',
      });

      // Create a native token object for the quote table
      const nativeToken = {
        ...token,
        address: NATIVE_TOKEN,
      };

      // Save to quote table for NATIVE_TOKEN address
      await this.quoteService.addOrUpdateQuote({
        token: nativeToken,
        blockchainType: deployment.blockchainType,
        usd: tokenPrice,
        timestamp: event.timestamp,
        provider: 'carbon-defi',
      });
    }

    return true;
  }

  /**
   * Normalize token address to handle native token aliases
   */
  normalizeTokenAddress(address: string, deployment: Deployment): string {
    const NATIVE_TOKEN_ADDRESS = NATIVE_TOKEN.toLowerCase();
    const normalizedAddress = address.toLowerCase();

    // If the address is the native token address and there's a native token alias defined
    if (normalizedAddress === NATIVE_TOKEN_ADDRESS && deployment.nativeTokenAlias) {
      return deployment.nativeTokenAlias.toLowerCase();
    }

    return normalizedAddress;
  }

  /**
   * Pure function to identify token addresses for price calculation
   */
  identifyTokenPair(
    token0Address: string,
    token1Address: string,
    lowercaseTokenMap: LowercaseTokenMap,
  ): TokenAddressPair | null {
    const isToken0Mapped = !!lowercaseTokenMap[token0Address];
    const isToken1Mapped = !!lowercaseTokenMap[token1Address];

    // Only process pairs where exactly one token is mapped and the other is not
    if (isToken0Mapped && !isToken1Mapped) {
      return {
        unknownTokenAddress: token1Address,
        mappedTokenAddress: lowercaseTokenMap[token0Address],
        isToken0Known: true,
      };
    } else if (!isToken0Mapped && isToken1Mapped) {
      return {
        unknownTokenAddress: token0Address,
        mappedTokenAddress: lowercaseTokenMap[token1Address],
        isToken0Known: false,
      };
    }
    return null;
  }

  /**
   * Pure function to calculate token price based on trade event
   */
  calculateTokenPrice(
    knownTokenQuote: HistoricQuote,
    event: TokensTradedEvent,
    deployment: Deployment,
    tokenPair: TokenAddressPair,
  ): Decimal {
    // Normalize the addresses to handle native token aliases
    const sourceTokenAddress = this.normalizeTokenAddress(event.sourceToken.address.toLowerCase(), deployment);
    const knownTokenAddress = knownTokenQuote.tokenAddress.toLowerCase();

    // Normalize amounts using the correct decimal places from their respective tokens
    const normalizedSourceAmount = new Decimal(event.sourceAmount).div(new Decimal(10).pow(event.sourceToken.decimals));
    const normalizedTargetAmount = new Decimal(event.targetAmount).div(new Decimal(10).pow(event.targetToken.decimals));

    const tradeRate = normalizedSourceAmount.div(normalizedTargetAmount);

    if (tokenPair.isToken0Known) {
      // Source token is known, target token is unknown
      return new Decimal(knownTokenQuote.usd).mul(tradeRate);
    } else {
      // Target token is known, source token is unknown
      return new Decimal(knownTokenQuote.usd).div(tradeRate);
    }
  }
}
