import { Injectable, Logger } from '@nestjs/common';
import { Deployment, BlockchainType, LowercaseTokenMap } from '../deployment/deployment.service';
import { TokensTradedEventService } from '../events/tokens-traded-event/tokens-traded-event.service';
import { LastProcessedBlockService } from '../last-processed-block/last-processed-block.service';
import { DeploymentService } from '../deployment/deployment.service';
import { HistoricQuoteService } from '../historic-quote/historic-quote.service';
import Decimal from 'decimal.js';
import { TokensTradedEvent } from '../events/tokens-traded-event/tokens-traded-event.entity';
import { HistoricQuote } from '../historic-quote/historic-quote.entity';
import { Address } from 'web3';

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
    const token0Address = event.pair.token0.address.toLowerCase();
    const token1Address = event.pair.token1.address.toLowerCase();

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
    const unknownTokenPrice = this.calculateTokenPrice(knownTokenQuote, event);

    // Save the price to the historicQuote table
    await this.historicQuoteService.addQuote({
      blockchainType: deployment.blockchainType,
      tokenAddress: tokenPair.unknownTokenAddress,
      usd: unknownTokenPrice.toString(),
      timestamp: event.timestamp,
      provider: 'carbon-price',
    });

    return true;
  }

  /**
   * Pure function to identify token addresses for price calculation
   */
  identifyTokenPair(
    token0Address: string,
    token1Address: string,
    lowercaseTokenMap: LowercaseTokenMap,
  ): TokenAddressPair | null {
    if (lowercaseTokenMap[token0Address]) {
      return {
        unknownTokenAddress: token1Address,
        mappedTokenAddress: lowercaseTokenMap[token0Address],
        isToken0Known: true,
      };
    } else if (lowercaseTokenMap[token1Address]) {
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
  calculateTokenPrice(knownTokenQuote: HistoricQuote, event: TokensTradedEvent): Decimal {
    // Normalize amounts using the correct decimal places from their respective tokens
    const normalizedSourceAmount = new Decimal(event.sourceAmount).div(new Decimal(10).pow(event.sourceToken.decimals));
    const normalizedTargetAmount = new Decimal(event.targetAmount).div(new Decimal(10).pow(event.targetToken.decimals));

    const tradeRate = normalizedSourceAmount.div(normalizedTargetAmount);

    if (event.sourceToken.address === knownTokenQuote.tokenAddress) { 
      // Known token is token0, target token is token1
        return new Decimal(knownTokenQuote.usd).mul(tradeRate);
    } else {
      // Known token is token1, target token is token0
      return new Decimal(knownTokenQuote.usd).div(tradeRate);
    }
  }
}
