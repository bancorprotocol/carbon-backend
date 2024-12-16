import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ArbitrageExecutedEvent } from '../events/arbitrage-executed-event/arbitrage-executed-event.entity';
import { Telegraf } from 'telegraf';
import { QuotesByAddress } from '../quote/quote.service';
import { TokensByAddress } from '../token/token.service';
import { ethers } from 'ethers';
import { Token } from 'src/token/token.entity';
import { EventTypes } from './notification.service';
import { StrategyCreatedEvent } from '../events/strategy-created-event/strategy-created-event.entity';
import { QuoteService } from '../quote/quote.service';
import { Deployment } from '../deployment/deployment.service';

@Injectable()
export class TelegramService {
  private bot: Telegraf;

  constructor(private configService: ConfigService, private quoteService: QuoteService) {
    this.bot = new Telegraf(this.configService.get('TELEGRAM_BOT_TOKEN'));
  }

  private async getUsdRate(
    tokenAddress: string,
    quotes: QuotesByAddress,
    deployment: Deployment,
  ): Promise<number | null> {
    const quote = quotes[tokenAddress];
    if (quote && quote.usd) {
      return Number(quote.usd);
    }

    try {
      const latestPrice = await this.quoteService.getLatestPrice(deployment, tokenAddress, ['usd']);
      if (latestPrice && latestPrice.data && latestPrice.data.USD) {
        return Number(latestPrice.data.USD);
      }
    } catch (error) {
      return null;
    }

    return null;
  }

  private async formatAmount(amount: string, token: Token, usdRate: number | null): Promise<string> {
    if (usdRate === null) {
      return `${this.amountToken(amount, 6, token)} ${token.symbol}`;
    }
    return this.amountUSD(amount, 6, usdRate.toString(), token);
  }

  async sendEventNotification(
    eventType: EventTypes,
    event: any,
    tokens: TokensByAddress,
    quotes: QuotesByAddress,
    deployment: Deployment,
  ) {
    const { message, threadId } = await this.formatEventMessage(eventType, event, tokens, quotes, deployment);
    const chatId = this.configService.get('TELEGRAM_CHAT_ID');

    await this.bot.telegram.sendMessage(chatId, message, {
      message_thread_id: threadId,
      parse_mode: 'HTML',
    });
  }

  private async formatEventMessage(
    eventType: EventTypes,
    event: any,
    tokens: TokensByAddress,
    quotes: QuotesByAddress,
    deployment: Deployment,
  ) {
    let message = '';
    let threadId = 0;
    switch (eventType) {
      case EventTypes.ArbitrageExecutedEvent:
        message = await this.formatArbitrageExecutedMessage(event, tokens, quotes, deployment);
        threadId = 34;
        break;
      case EventTypes.StrategyCreatedEvent:
        message = await this.formatStrategyCreatedMessage(event, tokens, quotes, deployment);
        threadId = 32;
        break;
    }

    return { message, threadId };
  }

  private async formatArbitrageExecutedMessage(
    event: ArbitrageExecutedEvent,
    tokens: TokensByAddress,
    quotes: QuotesByAddress,
    deployment: Deployment,
  ): Promise<string> {
    const sourceTokens = event.sourceTokens;
    const numSourceTokens = sourceTokens.length;

    let tokenMessages = '';
    if (numSourceTokens === 1) {
      const token = tokens[sourceTokens[0]];
      const usdRate = await this.getUsdRate(sourceTokens[0], quotes, deployment);

      tokenMessages = `Token: ${token.symbol}
Protocol amount: ${await this.formatAmount(event.protocolAmounts[0], token, usdRate)}
Caller amount: ${await this.formatAmount(event.rewardAmounts[0], token, usdRate)}`;
    } else {
      tokenMessages += 'Multiple Arb\n';

      for (let i = 0; i < numSourceTokens; i++) {
        const tokenAddress = sourceTokens[i].toLowerCase();
        const token = tokens[tokenAddress];
        const usdRate = await this.getUsdRate(tokenAddress, quotes, deployment);

        tokenMessages += `Token ${i + 1}: ${token.symbol}
Protocol amount: ${await this.formatAmount(event.protocolAmounts[i], token, usdRate)}
Caller amount: ${await this.formatAmount(event.rewardAmounts[i], token, usdRate)}`;
      }
    }

    return `**Arb Fast Lane - Ethereum**

${tokenMessages}

🗓️ ${new Date(event.timestamp).toLocaleString()}
⛓️ Tx hash: <a href="https://etherscan.io/tx/${event.transactionHash}">View</a>`;
  }

  private async formatStrategyCreatedMessage(
    event: StrategyCreatedEvent,
    tokens: TokensByAddress,
    quotes: QuotesByAddress,
    deployment: Deployment,
  ): Promise<string> {
    const token0 = tokens[event.token0.address];
    const token1 = tokens[event.token1.address];
    const usdRate0 = await this.getUsdRate(event.token0.address, quotes, deployment);
    const usdRate1 = await this.getUsdRate(event.token1.address, quotes, deployment);

    const order0 = JSON.parse(event.order0);
    const order1 = JSON.parse(event.order1);

    return `**New Strategy Created - Ethereum**
    
Base token: ${token0.symbol}
Quote token: ${token1.symbol}

Buy ${token0.symbol} Budget: ${await this.formatAmount(order1.y, token1, usdRate1)}
Sell ${token0.symbol} Budget: ${await this.formatAmount(order0.y, token0, usdRate0)}

🗓️ ${new Date(event.block.timestamp).toLocaleString()}
🧳 View wallet holdings: <a href="https://app.carbondefi.xyz/explore/wallet/${event.owner}">View</a>
⛓️ Tx hash: <a href="https://etherscan.io/tx/${event.transactionHash}">View</a>`;
  }

  private amountUSD(amount: string, precision: number, usdPrice: string, token: Token) {
    const tokenAmount = Number(ethers.utils.formatUnits(amount, token.decimals));
    const usdAmount = tokenAmount * Number(usdPrice);
    return '$' + this.printNumber(usdAmount, precision);
  }

  private amountToken(amount: string, precision: number, token: Token) {
    const tokenAmount = Number(ethers.utils.formatUnits(amount, token.decimals));
    return this.printNumber(tokenAmount, precision);
  }

  private toSubscript(num: number) {
    const subscriptMap = {
      '0': '₀',
      '1': '₁',
      '2': '₂',
      '3': '₃',
      '4': '₄',
      '5': '₅',
      '6': '₆',
      '7': '₇',
      '8': '₈',
      '9': '₉',
    };
    return num
      .toString()
      .split('')
      .map((digit) => subscriptMap[digit] || digit)
      .join('');
  }

  private printNumber(num: number, precision: number) {
    // Handle zero case first
    if (num === 0) {
      return '0';
    }

    if (num < 0.01) {
      const numZeros = Math.abs(Math.floor(Math.log10(num))) - 1;
      const numStr = num.toFixed(20);
      const sigFigs = numStr.slice(2 + numZeros, 2 + numZeros + precision);

      const trailingZeros = `0.0${this.toSubscript(numZeros)}${sigFigs}`;
      // Remove trailing zeros
      return trailingZeros.replace(/\.?0+$/, '');
    } else if (num < 1000) {
      return num.toPrecision(precision);
    } else {
      // Print the number as is (no scientific notation) with 0 decimal places
      return num.toFixed();
    }
  }
}
