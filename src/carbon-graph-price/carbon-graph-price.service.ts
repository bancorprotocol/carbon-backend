import { Injectable, Logger } from '@nestjs/common';
import Graph from 'graphology';
import Decimal from 'decimal.js';
import { Deployment, BlockchainType } from '../deployment/deployment.service';
import { TokensTradedEventService } from '../events/tokens-traded-event/tokens-traded-event.service';
import { LastProcessedBlockService } from '../last-processed-block/last-processed-block.service';
import { HistoricQuoteService } from '../historic-quote/historic-quote.service';
import { QuoteService } from '../quote/quote.service';
import { TokensTradedEvent } from '../events/tokens-traded-event/tokens-traded-event.entity';
import { Token } from '../token/token.entity';

interface TokenNodeAttributes {
  address: string;
  price?: string;
  priceTimestamp?: Date;
  source?: 'anchors' | 'graphPrices';
  provider?: string;
  hops?: number;
}

interface TradeEdgeAttributes {
  tokenAToTokenBRate: string;
  tokenBToTokenARate: string;
  tokenA: string;
  tokenB: string;
  timestamp: Date;
  eventId: number;
}

type PriceGraph = Graph<TokenNodeAttributes, TradeEdgeAttributes>;

const MAX_HOPS = 10;
const PROVIDER_NAME = 'carbon-graph';

/**
 * Multi-hop price discovery using graph traversal of trading events.
 * Works in parallel with existing price services to discover prices
 * for tokens through trading path analysis.
 */
@Injectable()
export class CarbonGraphPriceService {
  private readonly logger = new Logger(CarbonGraphPriceService.name);

  constructor(
    private tokensTradedEventService: TokensTradedEventService,
    private lastProcessedBlockService: LastProcessedBlockService,
    private historicQuoteService: HistoricQuoteService,
    private quoteService: QuoteService,
  ) {}

  async update(endBlock: number, deployment: Deployment): Promise<any> {
    const key = `carbon-graph-price-${deployment.blockchainType}-${deployment.exchangeId}`;

    if (!deployment.graphPriceAnchors) {
      await this.lastProcessedBlockService.update(key, endBlock);
      return {
        startBlock: endBlock,
        endBlock,
        processed: 0,
        note: 'No graphPriceAnchors configured',
      };
    }

    const lastProcessedBlock = await this.lastProcessedBlockService.getOrInit(key, deployment.startBlock);
    const startBlock = lastProcessedBlock + 1;

    const BATCH_SIZE = 100;
    let currentStartBlock = startBlock;
    let totalProcessed = 0;
    let totalPricesUpdated = 0;

    this.logger.log(`Starting carbon-graph-price processing from block ${startBlock} to ${endBlock}`);

    while (currentStartBlock < endBlock) {
      const batchEndBlock = Math.min(currentStartBlock + BATCH_SIZE, endBlock);
      const tradedEvents = await this.tokensTradedEventService.get(currentStartBlock, batchEndBlock, deployment);

      this.logger.log(
        `Processing carbon-graph batch from ${currentStartBlock} to ${batchEndBlock}, found ${tradedEvents.length} events`,
      );

      const batchResults = await this.processBatch(tradedEvents, deployment);
      totalProcessed += tradedEvents.length;
      totalPricesUpdated += batchResults;

      await this.lastProcessedBlockService.update(key, batchEndBlock);
      currentStartBlock = batchEndBlock + 1;
    }

    return {
      startBlock,
      endBlock,
      processed: totalProcessed,
      pricesUpdated: totalPricesUpdated,
    };
  }

  async processBatch(tradedEvents: TokensTradedEvent[], deployment: Deployment): Promise<number> {
    if (tradedEvents.length === 0) return 0;

    const batchStartTimestamp = tradedEvents[0].timestamp;
    const batchEndTimestamp = tradedEvents[tradedEvents.length - 1].timestamp;

    const graph = new Graph<TokenNodeAttributes, TradeEdgeAttributes>({ type: 'undirected' });

    // Set historical and configured anchor prices first
    await this.setHistoricalAnchors(graph, batchStartTimestamp, deployment);
    await this.setAnchorPrices(graph, deployment, batchEndTimestamp);

    // Calculate prices incrementally as trades are processed
    const newPrices = this.calculatePricesIncremental(graph, tradedEvents, deployment);

    await this.saveNewPrices(newPrices, tradedEvents, deployment);

    return newPrices.length;
  }

  buildGraphFromTrades(events: TokensTradedEvent[], deployment: Deployment): PriceGraph {
    const graph = new Graph<TokenNodeAttributes, TradeEdgeAttributes>({ type: 'undirected' });

    for (const event of events) {
      const token0Address = this.normalizeTokenAddress(event.sourceToken.address, deployment);
      const token1Address = this.normalizeTokenAddress(event.targetToken.address, deployment);

      if (!graph.hasNode(token0Address)) {
        graph.addNode(token0Address, {
          address: token0Address,
        });
      }

      if (!graph.hasNode(token1Address)) {
        graph.addNode(token1Address, {
          address: token1Address,
        });
      }

      // Calculate exchange rates with proper decimal handling
      const sourceAmountDecimal = new Decimal(event.sourceAmount);
      const targetAmountDecimal = new Decimal(event.targetAmount);
      const sourceDecimalsDecimal = new Decimal(10).pow(event.sourceToken.decimals);
      const targetDecimalsDecimal = new Decimal(10).pow(event.targetToken.decimals);

      const normalizedSourceAmount = sourceAmountDecimal.div(sourceDecimalsDecimal);
      const normalizedTargetAmount = targetAmountDecimal.div(targetDecimalsDecimal);

      const sourceToTargetRate = normalizedTargetAmount.div(normalizedSourceAmount);
      const targetToSourceRate = normalizedSourceAmount.div(normalizedTargetAmount);

      // Use canonical ordering for consistent edge representation
      const tokenA = token0Address < token1Address ? token0Address : token1Address;
      const tokenB = token0Address < token1Address ? token1Address : token0Address;

      let tokenAToTokenBRate: Decimal;
      let tokenBToTokenARate: Decimal;

      if (token0Address === tokenA) {
        tokenAToTokenBRate = sourceToTargetRate;
        tokenBToTokenARate = targetToSourceRate;
      } else {
        tokenAToTokenBRate = targetToSourceRate;
        tokenBToTokenARate = sourceToTargetRate;
      }

      if (!graph.hasEdge(tokenA, tokenB)) {
        graph.addEdge(tokenA, tokenB, {
          tokenAToTokenBRate: tokenAToTokenBRate.toFixed(),
          tokenBToTokenARate: tokenBToTokenARate.toFixed(),
          tokenA,
          tokenB,
          timestamp: event.timestamp,
          eventId: event.id,
        });
      } else {
        // Update with most recent trade rate
        const existingEdge = graph.getEdgeAttributes(tokenA, tokenB);
        if (event.timestamp > existingEdge.timestamp) {
          graph.setEdgeAttribute(tokenA, tokenB, 'tokenAToTokenBRate', tokenAToTokenBRate.toFixed());
          graph.setEdgeAttribute(tokenA, tokenB, 'tokenBToTokenARate', tokenBToTokenARate.toFixed());
          graph.setEdgeAttribute(tokenA, tokenB, 'timestamp', event.timestamp);
          graph.setEdgeAttribute(tokenA, tokenB, 'eventId', event.id);
        }
      }
    }

    this.logger.log(`Built carbon-graph with ${graph.order} nodes and ${graph.size} edges`);
    return graph;
  }

  private normalizeTokenAddress(address: string, deployment: Deployment): string {
    const NATIVE_TOKEN_ADDRESS = '0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE'.toLowerCase();
    const normalizedAddress = address.toLowerCase();

    if (normalizedAddress === NATIVE_TOKEN_ADDRESS && deployment.nativeTokenAlias) {
      return deployment.nativeTokenAlias.toLowerCase();
    }

    return normalizedAddress;
  }

  /**
   * Sets historical anchor prices from all previously priced tokens.
   * This expands the anchor network beyond just configured anchors.
   */
  private async setHistoricalAnchors(
    graph: PriceGraph,
    batchStartTimestamp: Date,
    deployment: Deployment,
  ): Promise<void> {
    const historicalPrices = await this.historicQuoteService.getLatestPricesBeforeTimestamp(
      deployment.blockchainType,
      batchStartTimestamp,
    );

    let addedCount = 0;
    for (const quote of historicalPrices) {
      const normalizedAddress = quote.tokenAddress.toLowerCase();
      const priceDecimal = new Decimal(quote.usd);

      if (priceDecimal.greaterThan(0)) {
        if (!graph.hasNode(normalizedAddress)) {
          graph.addNode(normalizedAddress, {
            address: normalizedAddress,
          });
        }

        graph.setNodeAttribute(normalizedAddress, 'price', quote.usd);
        graph.setNodeAttribute(normalizedAddress, 'priceTimestamp', quote.timestamp);
        graph.setNodeAttribute(normalizedAddress, 'source', 'anchors');
        graph.setNodeAttribute(normalizedAddress, 'provider', quote.provider);
        graph.setNodeAttribute(normalizedAddress, 'hops', 0);
        addedCount++;
      }
    }

    this.logger.log(`Added ${addedCount} historical anchor tokens to graph`);
  }

  async setAnchorPrices(graph: PriceGraph, deployment: Deployment, maxTimestamp: Date): Promise<void> {
    if (!deployment.graphPriceAnchors) return;

    if (deployment.graphPriceAnchors.primary) {
      const localAddress = deployment.graphPriceAnchors.primary.localAddress.toLowerCase();
      const ethereumAddress = deployment.graphPriceAnchors.primary.ethereumAddress.toLowerCase();

      if (!graph.hasNode(localAddress)) {
        graph.addNode(localAddress, {
          address: localAddress,
        });
      }

      const primaryQuote = await this.historicQuoteService.getLatestPriceBeforeTimestamp(
        BlockchainType.Ethereum,
        ethereumAddress,
        maxTimestamp,
      );

      if (primaryQuote) {
        const priceDecimal = new Decimal(primaryQuote.usd);
        if (priceDecimal.greaterThan(0)) {
          graph.setNodeAttribute(localAddress, 'price', priceDecimal.toFixed());
          graph.setNodeAttribute(localAddress, 'priceTimestamp', primaryQuote.timestamp);
          graph.setNodeAttribute(localAddress, 'source', 'anchors');
          graph.setNodeAttribute(localAddress, 'provider', 'configured-anchor');
          graph.setNodeAttribute(localAddress, 'hops', 0);
          this.logger.log(
            `Set anchor price for ${localAddress}: $${priceDecimal.toFixed()} at ${primaryQuote.timestamp.toISOString()}`,
          );
        }
      }
    }

    if (deployment.graphPriceAnchors.secondary) {
      const localAddress = deployment.graphPriceAnchors.secondary.localAddress.toLowerCase();
      const ethereumAddress = deployment.graphPriceAnchors.secondary.ethereumAddress.toLowerCase();

      if (!graph.hasNode(localAddress)) {
        graph.addNode(localAddress, {
          address: localAddress,
        });
      }

      const secondaryQuote = await this.historicQuoteService.getLatestPriceBeforeTimestamp(
        BlockchainType.Ethereum,
        ethereumAddress,
        maxTimestamp,
      );

      if (secondaryQuote) {
        const priceDecimal = new Decimal(secondaryQuote.usd);
        if (priceDecimal.greaterThan(0)) {
          graph.setNodeAttribute(localAddress, 'price', priceDecimal.toFixed());
          graph.setNodeAttribute(localAddress, 'priceTimestamp', secondaryQuote.timestamp);
          graph.setNodeAttribute(localAddress, 'source', 'anchors');
          graph.setNodeAttribute(localAddress, 'provider', 'configured-anchor');
          graph.setNodeAttribute(localAddress, 'hops', 0);
          this.logger.log(
            `Set anchor price for ${localAddress}: $${priceDecimal.toFixed()} at ${secondaryQuote.timestamp.toISOString()}`,
          );
        }
      }
    }
  }

  /**
   * Processes trades incrementally, allowing prices to evolve as each trade is processed.
   */
  private calculatePricesIncremental(
    graph: PriceGraph,
    sortedTrades: TokensTradedEvent[],
    deployment: Deployment,
  ): Array<{ address: string; price: string; hops: number; timestamp: Date }> {
    const newPrices: Array<{ address: string; price: string; hops: number; timestamp: Date }> = [];

    for (const trade of sortedTrades) {
      const sourceAddr = this.normalizeTokenAddress(trade.sourceToken.address, deployment);
      const targetAddr = this.normalizeTokenAddress(trade.targetToken.address, deployment);

      if (!graph.hasNode(sourceAddr)) {
        graph.addNode(sourceAddr, { address: sourceAddr });
      }
      if (!graph.hasNode(targetAddr)) {
        graph.addNode(targetAddr, { address: targetAddr });
      }

      this.addTradeEdgeToGraph(graph, trade, deployment);

      // Try to price both tokens using current graph state
      for (const tokenAddr of [sourceAddr, targetAddr]) {
        const currentPrice = this.bfsWithTimestampConstraint(graph, tokenAddr, trade.timestamp);

        if (currentPrice && this.shouldUpdatePrice(graph, tokenAddr, currentPrice)) {
          this.updateGraphPrice(graph, tokenAddr, currentPrice, trade.timestamp);

          newPrices.push({
            address: tokenAddr,
            price: currentPrice.price,
            hops: currentPrice.hops,
            timestamp: trade.timestamp,
          });

          this.logger.log(
            `Incremental price update for ${tokenAddr}: $${currentPrice.price} (${
              currentPrice.hops
            } hops) at ${trade.timestamp.toISOString()}`,
          );
        }
      }
    }

    return newPrices;
  }

  private addTradeEdgeToGraph(graph: PriceGraph, trade: TokensTradedEvent, deployment: Deployment): void {
    const sourceAddr = this.normalizeTokenAddress(trade.sourceToken.address, deployment);
    const targetAddr = this.normalizeTokenAddress(trade.targetToken.address, deployment);

    const tokenA = sourceAddr < targetAddr ? sourceAddr : targetAddr;
    const tokenB = sourceAddr < targetAddr ? targetAddr : sourceAddr;

    // Calculate exchange rates for this trade
    const sourceAmountDecimal = new Decimal(trade.sourceAmount);
    const targetAmountDecimal = new Decimal(trade.targetAmount);
    const sourceDecimalsDecimal = new Decimal(10).pow(trade.sourceToken.decimals);
    const targetDecimalsDecimal = new Decimal(10).pow(trade.targetToken.decimals);

    const normalizedSourceAmount = sourceAmountDecimal.div(sourceDecimalsDecimal);
    const normalizedTargetAmount = targetAmountDecimal.div(targetDecimalsDecimal);

    const sourceToTargetRate = normalizedTargetAmount.div(normalizedSourceAmount);
    const targetToSourceRate = normalizedSourceAmount.div(normalizedTargetAmount);

    let tokenAToTokenBRate: Decimal;
    let tokenBToTokenARate: Decimal;

    if (sourceAddr === tokenA) {
      tokenAToTokenBRate = sourceToTargetRate;
      tokenBToTokenARate = targetToSourceRate;
    } else {
      tokenAToTokenBRate = targetToSourceRate;
      tokenBToTokenARate = sourceToTargetRate;
    }

    if (!graph.hasEdge(tokenA, tokenB)) {
      graph.addEdge(tokenA, tokenB, {
        tokenAToTokenBRate: tokenAToTokenBRate.toFixed(),
        tokenBToTokenARate: tokenBToTokenARate.toFixed(),
        tokenA,
        tokenB,
        timestamp: trade.timestamp,
        eventId: trade.id,
      });
    } else {
      const existingTimestamp = graph.getEdgeAttribute(tokenA, tokenB, 'timestamp');

      if (trade.timestamp > existingTimestamp) {
        graph.setEdgeAttribute(tokenA, tokenB, 'tokenAToTokenBRate', tokenAToTokenBRate.toFixed());
        graph.setEdgeAttribute(tokenA, tokenB, 'tokenBToTokenARate', tokenBToTokenARate.toFixed());
        graph.setEdgeAttribute(tokenA, tokenB, 'timestamp', trade.timestamp);
        graph.setEdgeAttribute(tokenA, tokenB, 'eventId', trade.id);
      }
    }
  }

  private shouldUpdatePrice(graph: PriceGraph, tokenAddr: string, newPrice: { price: string; hops: number }): boolean {
    const nodeAttrs = graph.getNodeAttributes(tokenAddr);

    if (!nodeAttrs.price) return true;
    if (nodeAttrs.price !== newPrice.price) return true;

    return nodeAttrs.source !== 'anchors';
  }

  private updateGraphPrice(
    graph: PriceGraph,
    tokenAddr: string,
    priceResult: { price: string; hops: number },
    timestamp: Date,
  ): void {
    const nodeAttrs = graph.getNodeAttributes(tokenAddr);

    graph.setNodeAttribute(tokenAddr, 'price', priceResult.price);
    graph.setNodeAttribute(tokenAddr, 'priceTimestamp', timestamp);
    graph.setNodeAttribute(tokenAddr, 'hops', priceResult.hops);

    if (!nodeAttrs.source) {
      graph.setNodeAttribute(tokenAddr, 'source', 'graphPrices');
      graph.setNodeAttribute(tokenAddr, 'provider', 'carbon-graph');
    } else {
      const originalProvider = nodeAttrs.provider || 'unknown';
      graph.setNodeAttribute(tokenAddr, 'provider', `${originalProvider} → carbon-graph`);
    }
  }

  /**
   * BFS traversal to find price path, respecting timestamp constraints.
   */
  private bfsWithTimestampConstraint(
    graph: PriceGraph,
    startToken: string,
    maxTimestamp: Date,
  ): { price: string; hops: number } | null {
    const queue: Array<{ node: string; hops: number }> = [{ node: startToken, hops: 0 }];
    const visited = new Set<string>([startToken]);

    while (queue.length > 0) {
      const current = queue.shift();
      if (!current) continue;
      const { node: currentNode, hops: currentHops } = current;

      if (currentHops >= MAX_HOPS) continue;

      const neighbors = graph.neighbors(currentNode);

      for (const neighbor of neighbors) {
        if (visited.has(neighbor)) continue;

        const neighborAttrs = graph.getNodeAttributes(neighbor);

        // Check if neighbor has valid price before maxTimestamp
        if (neighborAttrs.price && neighborAttrs.priceTimestamp && neighborAttrs.priceTimestamp <= maxTimestamp) {
          const tokenA = currentNode < neighbor ? currentNode : neighbor;
          const tokenB = currentNode < neighbor ? neighbor : currentNode;

          if (!graph.hasEdge(tokenA, tokenB)) {
            this.logger.error(`Edge not found between ${tokenA} and ${tokenB}`);
            continue;
          }

          const edgeAttrs = graph.getEdgeAttributes(tokenA, tokenB);
          const neighborPrice = new Decimal(neighborAttrs.price);

          // Calculate exchange rate based on canonical ordering
          let exchangeRate: Decimal;

          if (neighbor === tokenA && currentNode === tokenB) {
            exchangeRate = new Decimal(1).div(new Decimal(edgeAttrs.tokenAToTokenBRate));
          } else if (neighbor === tokenB && currentNode === tokenA) {
            exchangeRate = new Decimal(1).div(new Decimal(edgeAttrs.tokenBToTokenARate));
          } else {
            this.logger.error(`Canonical ordering violation: ${neighbor} <-> ${currentNode}`);
            continue;
          }

          const calculatedPrice = neighborPrice.mul(exchangeRate);

          if (calculatedPrice.greaterThan(0) && calculatedPrice.isFinite()) {
            return {
              price: calculatedPrice.toFixed(),
              hops: currentHops + 1,
            };
          }
        }

        queue.push({ node: neighbor, hops: currentHops + 1 });
        visited.add(neighbor);
      }
    }

    return null;
  }

  async saveNewPrices(
    newPrices: Array<{ address: string; price: string; hops: number; timestamp: Date }>,
    tradedEvents: TokensTradedEvent[],
    deployment: Deployment,
  ): Promise<void> {
    const tokenMap = new Map<string, Token>();
    for (const event of tradedEvents) {
      const sourceAddr = this.normalizeTokenAddress(event.sourceToken.address, deployment);
      const targetAddr = this.normalizeTokenAddress(event.targetToken.address, deployment);
      tokenMap.set(sourceAddr, event.sourceToken);
      tokenMap.set(targetAddr, event.targetToken);
    }

    for (const { address, price, hops, timestamp } of newPrices) {
      const token = tokenMap.get(address);
      if (!token) {
        this.logger.warn(`Token not found for address ${address}`);
        continue;
      }

      const priceDecimal = new Decimal(price);
      if (!priceDecimal.greaterThan(0) || !priceDecimal.isFinite()) {
        this.logger.warn(`Invalid price for ${address}: ${price}`);
        continue;
      }

      try {
        await this.historicQuoteService.addQuote({
          blockchainType: deployment.blockchainType,
          tokenAddress: address,
          usd: price,
          timestamp,
          provider: PROVIDER_NAME,
        });

        await this.quoteService.addOrUpdateQuote({
          token,
          blockchainType: deployment.blockchainType,
          usd: price,
          timestamp,
          provider: PROVIDER_NAME,
        });

        this.logger.log(`Saved carbon-graph price for ${token.symbol} (${address}): $${price} (${hops} hops)`);
      } catch (error) {
        this.logger.error(`Failed to save price for ${address}:`, error);
      }
    }
  }
}
