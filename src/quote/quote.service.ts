import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Quote } from './quote.entity';
import { TokenService } from '../token/token.service';
import { CoinGeckoService } from './coingecko.service';
import { Interval } from '@nestjs/schedule';
import { Token } from '../token/token.entity';
import { ConfigService } from '@nestjs/config';

export interface QuotesByAddress {
  [address: string]: Quote;
}

@Injectable()
export class QuoteService {
  private isPolling = false;
  private readonly logger = new Logger(QuoteService.name);

  constructor(
    @InjectRepository(Quote) private quoteRepository: Repository<Quote>,
    private tokenService: TokenService,
    private coingeckoService: CoinGeckoService,
    private configService: ConfigService,
  ) {}

  @Interval(1 * 60 * 1000)
  async pollForLatest(): Promise<void> {
    const shouldPollQuotes = this.configService.get('SHOULD_POLL_QUOTES');
    if (shouldPollQuotes !== '1') return;

    if (this.isPolling) {
      this.logger.warn('Polling is already in progress.');
      return;
    }

    this.isPolling = true;

    try {
      const tokens = await this.tokenService.all();
      const addresses = tokens.map((t) => t.address);
      const newPrices = await this.coingeckoService.getLatestPrices(addresses);
      const ethPrice = await this.coingeckoService.getLatestEthPrice();
      const ethAddress = this.configService.get('ETH');
      newPrices[ethAddress.toLowerCase()] = ethPrice['ethereum'];

      await this.updateQuotes(tokens, newPrices);
    } catch (error) {
      this.logger.error(`Error fetching and storing quotes: ${error.message}`);
    } finally {
      this.isPolling = false; // Reset the flag regardless of success or failure
    }
  }

  async all(): Promise<Quote[]> {
    return this.quoteRepository.find();
  }

  async allByAddress(): Promise<QuotesByAddress> {
    const all = await this.all();
    const tokensByAddress = {};
    all.forEach((q) => (tokensByAddress[q.token.address] = q));
    return tokensByAddress;
  }

  async fetchLatestPrice(address: string, convert = 'usd'): Promise<any> {
    try {
      const price = await this.coingeckoService.getLatestPrices([address], convert);
      return price;
    } catch (error) {
      this.logger.error(`Error fetching price: ${error.message}`);
    }
  }

  private async updateQuotes(tokens: Token[], newPrices: Record<string, any>): Promise<void> {
    const existingQuotes = await this.quoteRepository.find();
    const quoteEntities: Quote[] = [];

    for (const token of tokens) {
      const priceWithTimestamp = newPrices[token.address.toLowerCase()];

      if (priceWithTimestamp) {
        const existingQuote = existingQuotes.find((q) => q.token.id === token.id);

        if (existingQuote) {
          // Update the existing quote
          existingQuote.usd = priceWithTimestamp.usd;
        } else {
          // Create a new quote
          const newQuote = new Quote();
          newQuote.provider = 'CoinGecko';
          newQuote.token = token;
          newQuote.timestamp = new Date(priceWithTimestamp.last_updated_at * 1000);
          newQuote.usd = priceWithTimestamp.usd;
          quoteEntities.push(newQuote);
        }
      }
    }

    // Save all the changes to the database in one call
    if (quoteEntities.length > 0) {
      await this.quoteRepository.save(quoteEntities);
    }
  }
}