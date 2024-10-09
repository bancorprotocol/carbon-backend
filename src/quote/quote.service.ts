import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Quote } from './quote.entity';
import { TokenService } from '../token/token.service';
import { CoinGeckoService } from './coingecko.service';
import { SchedulerRegistry } from '@nestjs/schedule';
import { Token } from '../token/token.entity';
import { ConfigService } from '@nestjs/config';
import { DeploymentService, Deployment, BlockchainType } from '../deployment/deployment.service';
import { CodexService, SEI_NETWORK_ID } from '../codex/codex.service';

export interface QuotesByAddress {
  [address: string]: Quote;
}

@Injectable()
export class QuoteService implements OnModuleInit {
  private isPolling = false;
  private readonly logger = new Logger(QuoteService.name);
  private readonly intervalDuration: number;
  private shouldPollQuotes: boolean;

  constructor(
    @InjectRepository(Quote) private quoteRepository: Repository<Quote>,
    private tokenService: TokenService,
    private coingeckoService: CoinGeckoService,
    private configService: ConfigService,
    private schedulerRegistry: SchedulerRegistry,
    private deploymentService: DeploymentService,
    private codexService: CodexService,
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
    try {
      const tokens = await this.tokenService.getTokensByBlockchainType(deployment.blockchainType);
      const addresses = tokens.map((t) => t.address);

      let newPrices;
      if (deployment.blockchainType === BlockchainType.Sei) {
        newPrices = await this.codexService.getLatestPrices(SEI_NETWORK_ID, addresses);
      } else {
        newPrices = await this.coingeckoService.getLatestPrices(addresses, deployment);
        const gasTokenPrice = await this.coingeckoService.getLatestGasTokenPrice(deployment);
        newPrices = { ...newPrices, ...gasTokenPrice };
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

  async fetchLatestPrice(deployment: Deployment, address: string, convert = ['usd']): Promise<any> {
    try {
      let price;
      if (address.toLowerCase() === deployment.gasToken.address.toLowerCase()) {
        price = await this.coingeckoService.getLatestGasTokenPrice(deployment, convert);
      } else {
        price = await this.coingeckoService.getLatestPrices([address], deployment, convert);
      }
      return price;
    } catch (error) {
      this.logger.error(`Error fetching price: ${error.message}`);
    }
  }

  private async updateQuotes(tokens: Token[], newPrices: Record<string, any>, deployment: Deployment): Promise<void> {
    const existingQuotes = await this.quoteRepository.find();
    const quoteEntities: Quote[] = [];

    for (const token of tokens) {
      const priceWithTimestamp = newPrices[token.address.toLowerCase()];

      if (priceWithTimestamp) {
        const quote = existingQuotes.find((q) => q.token.id === token.id) || new Quote();
        quote.provider = priceWithTimestamp.provider;
        quote.token = token;
        quote.blockchainType = deployment.blockchainType; // Set the blockchain type here
        quote.timestamp = new Date(priceWithTimestamp.last_updated_at * 1000);
        quote.usd = priceWithTimestamp.usd;
        quoteEntities.push(quote);
      }
    }

    await this.quoteRepository.save(quoteEntities);
  }
}
