import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ArbitrageExecutedEvent } from '../events/arbitrage-executed-event/arbitrage-executed-event.entity';
import { Telegraf } from 'telegraf';
import { QuotesByAddress } from '../quote/quote.service';
import { TokensByAddress } from '../token/token.service';
import { ethers } from 'ethers';
import { Token } from 'src/token/token.entity';
import { EventTypes } from './notification.service';

@Injectable()
export class TelegramService {
  private bot: Telegraf;

  constructor(private configService: ConfigService) {
    this.bot = new Telegraf(this.configService.get('TELEGRAM_BOT_TOKEN'));
  }

  async sendEventNotification(eventType: EventTypes, event: any, tokens: TokensByAddress, quotes: QuotesByAddress) {
    const { message, threadId } = await this.formatEventMessage(eventType, event, tokens, quotes);
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
  ) {
    let message = '';
    let threadId = 0;
    switch (eventType) {
      case EventTypes.ArbitrageExecutedEvent:
        message = await this.formatArbitrageExecutedMessage(event, tokens, quotes);
        threadId = 34;
        break;
    }

    return { message, threadId };
  }

  private async formatArbitrageExecutedMessage(
    event: ArbitrageExecutedEvent,
    tokens: TokensByAddress,
    quotes: QuotesByAddress,
  ): Promise<string> {
    const sourceTokens = event.sourceTokens;
    const numSourceTokens = sourceTokens.length;

    let tokenMessages = '';
    if (numSourceTokens === 1) {
      const token = tokens[sourceTokens[0]];
      const quote = quotes[sourceTokens[0]];

      tokenMessages = `Token: ${token.symbol}
Protocol amount: ${this.amountUSD(event.protocolAmounts[0], 6, quote.usd, token)}
Caller amount: ${this.amountUSD(event.rewardAmounts[0], 6, quote.usd, token)}`;
    } else {
      tokenMessages += 'Multiple Arb\n';

      for (let i = 0; i < numSourceTokens; i++) {
        const token = tokens[sourceTokens[i].toLowerCase()];
        const quote = quotes[sourceTokens[i].toLowerCase()];

        tokenMessages += `Token ${i + 1}: ${token.symbol}
Protocol amount: ${this.amountUSD(event.protocolAmounts[i], 6, quote.usd, token)}
Caller amount: ${this.amountUSD(event.rewardAmounts[i], 6, quote.usd, token)}`;
      }
    }

    return `**Arb Fast Lane - Ethereum**

${tokenMessages}

🗓️ ${new Date(event.timestamp).toLocaleString()}
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
