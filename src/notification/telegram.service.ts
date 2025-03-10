import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ArbitrageExecutedEvent } from '../events/arbitrage-executed-event/arbitrage-executed-event.entity';
import { Telegraf } from 'telegraf';
import { QuotesByAddress } from '../quote/quote.service';
import { TokensByAddress } from '../token/token.service';
import { ethers } from 'ethers';
import { Token } from 'src/token/token.entity';
import { EventTypes } from '../events/event-types';
import { StrategyCreatedEvent } from '../events/strategy-created-event/strategy-created-event.entity';
import { QuoteService } from '../quote/quote.service';
import { Deployment } from '../deployment/deployment.service';
import { TokensTradedEvent } from '../events/tokens-traded-event/tokens-traded-event.entity';
import { VortexTradingResetEvent } from '../events/vortex-trading-reset-event/vortex-trading-reset-event.entity';
import { VortexTokensTradedEvent } from '../events/vortex-tokens-traded-event/vortex-tokens-traded-event.entity';
import { ProtectionRemovedEvent } from '../events/protection-removed-event/protection-removed-event.entity';
const TransferAbi = ['event Transfer (address indexed from, address indexed to, uint256 value)'];

@Injectable()
export class TelegramService {
  constructor(private configService: ConfigService, private quoteService: QuoteService) {}

  async sendEventNotification(
    eventType: EventTypes,
    event: any,
    tokens: TokensByAddress,
    quotes: QuotesByAddress,
    deployment: Deployment,
  ) {
    const { message, threadId, botId } = await this.formatEventMessage(eventType, event, tokens, quotes, deployment);
    const bot = new Telegraf(botId);

    // Check if the event should be sent to a regular group
    const isRegularGroup = deployment.notifications?.regularGroupEvents?.includes(eventType) || false;

    // Configure message parameters based on group type
    const chatId = isRegularGroup ? threadId : this.configService.get('TELEGRAM_CHAT_ID');

    const options: any = {
      parse_mode: 'HTML',
      link_preview_options: { is_disabled: true },
    };

    // Only add message_thread_id for non-regular groups
    if (!isRegularGroup) {
      options.message_thread_id = threadId;
    }

    await bot.telegram.sendMessage(chatId, message, options);
  }

  private async formatAmount(amount: string, token: Token, usdRate: number | null): Promise<string> {
    if (usdRate === null) {
      return `${this.amountToken(amount, 6, token)} ${token.symbol}`;
    }
    return this.amountUSD(amount, 6, usdRate.toString(), token);
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
    let botId = deployment.notifications.telegram.botToken;
    switch (eventType) {
      case EventTypes.ArbitrageExecutedEvent:
        message = await this.formatArbitrageExecutedMessage(event, tokens, quotes, deployment);
        threadId = deployment.notifications.telegram.threads.fastlaneId;
        break;
      case EventTypes.StrategyCreatedEvent:
        message = await this.formatStrategyCreatedMessage(event, tokens, quotes, deployment);
        threadId = deployment.notifications.telegram.threads.carbonThreadId;
        break;
      case EventTypes.TokensTradedEvent:
        message = await this.formatTokensTradedMessage(event, tokens, quotes, deployment);
        threadId = deployment.notifications.telegram.threads.carbonThreadId;
        break;
      case EventTypes.VortexTradingResetEvent:
        message = await this.formatVortexTradingResetMessage(event, tokens, deployment);
        threadId = deployment.notifications.telegram.threads.vortexId;
        break;
      case EventTypes.VortexTokensTradedEvent:
        message = await this.formatVortexTokenTradedMessage(event, tokens, quotes, deployment);
        threadId = deployment.notifications.telegram.threads.vortexId;
        break;
      case EventTypes.ProtectionRemovedEvent:
        message = await this.formatProtectionRemovedMessage(event, tokens, quotes, deployment);
        threadId = deployment.notifications.telegram.threads.bancorProtectionId;
        botId = deployment.notifications.telegram.bancorProtectionToken;
        break;
    }

    return { message, threadId, botId };
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

    return `<b>Arb Fast Lane - ${deployment.blockchainType}</b>

${tokenMessages}

🗓️ ${new Date(event.timestamp).toLocaleString()}
⛓️ Tx hash: <a href="${deployment.notifications.explorerUrl}${event.transactionHash}">View</a>`;
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

    return `<b>New Strategy Created - ${deployment.notifications.title}</b>
    
Base token: ${token0.symbol}
Quote token: ${token1.symbol}

Buy ${token0.symbol} Budget: ${await this.formatAmount(order1.y, token1, usdRate1)}
Sell ${token0.symbol} Budget: ${await this.formatAmount(order0.y, token0, usdRate0)}

🗓️ ${new Date(event.block.timestamp).toLocaleString()}
🧳 View wallet holdings: <a href="${deployment.notifications.carbonWalletUrl}${event.owner}">View</a>
⛓️ Tx hash: <a href="${deployment.notifications.explorerUrl}${event.transactionHash}">View</a>`;
  }

  private async formatTokensTradedMessage(
    event: TokensTradedEvent,
    tokens: TokensByAddress,
    quotes: QuotesByAddress,
    deployment: Deployment,
  ): Promise<string> {
    const sourceToken = tokens[event.sourceToken.address];
    const targetToken = tokens[event.targetToken.address];

    const sourceUsdRate = await this.getUsdRate(sourceToken.address, quotes, deployment);
    const targetUsdRate = await this.getUsdRate(targetToken.address, quotes, deployment);

    const sourceTokenAmount = this.amountToken(event.sourceAmount, 3, sourceToken);
    const targetTokenAmount = this.amountToken(event.targetAmount, 3, targetToken);

    const sourceUsdAmount = sourceUsdRate
      ? this.amountUSD(event.sourceAmount, 1, sourceUsdRate.toString(), sourceToken)
      : 'N/A';
    const targetUsdAmount = targetUsdRate
      ? this.amountUSD(event.targetAmount, 1, targetUsdRate.toString(), targetToken)
      : 'N/A';

    return `<b>Strategies Filled - ${deployment.notifications.title}</b>
    
From: 
${sourceTokenAmount} ${sourceToken.symbol} (≈${sourceUsdAmount})
To: 
${targetTokenAmount} ${targetToken.symbol} (≈${targetUsdAmount})

🗓️ ${new Date(event.timestamp).toLocaleString()}
⛓️ Tx hash: <a href="${deployment.notifications.explorerUrl}${event.transactionHash}">View</a>`;
  }

  private async formatVortexTradingResetMessage(
    event: VortexTradingResetEvent,
    tokens: TokensByAddress,
    deployment: Deployment,
  ): Promise<string> {
    const token = tokens[event.token];

    return `🌀 <b>Carbon Vortex 2.0</b> 🌀

Auction price was reset for: ${token.symbol}

🗓️ ${new Date(event.timestamp).toLocaleString()}
⛓️ Tx hash: <a href="${deployment.notifications.explorerUrl}${event.transactionHash}">View</a>`;
  }

  private async formatVortexTokenTradedMessage(
    event: VortexTokensTradedEvent,
    tokens: TokensByAddress,
    quotes: QuotesByAddress,
    deployment: Deployment,
  ): Promise<string> {
    const provider = new ethers.providers.JsonRpcProvider(deployment.rpcEndpoint);
    const txReceipt = await provider.getTransactionReceipt(event.transactionHash);
    const contractAddr = deployment.contracts['CarbonVortex'].address;

    let sourceTokenAddr = undefined;
    let targetTokenAddr = undefined;

    for (const log of txReceipt.logs) {
      try {
        const eventsParser = new ethers.utils.Interface(TransferAbi);
        const parsedLog = eventsParser.parseLog(log);
        const value = BigInt(parsedLog.args.value);
        const fromAddr = parsedLog.args['from'];
        const toAddr = parsedLog.args.to;

        if (value === BigInt(event.sourceAmount) && fromAddr === event.caller && toAddr === contractAddr) {
          sourceTokenAddr = log.address;
        }

        if (value === BigInt(event.targetAmount) && fromAddr === contractAddr && toAddr === event.caller) {
          targetTokenAddr = log.address;
        }
      } catch {
        continue;
      }
    }

    if (sourceTokenAddr === undefined && targetTokenAddr === undefined) {
      throw new Error("couldn't find neither source token or target token in events");
    }

    // If we haven't found one of them, then it is a native eth one
    if (sourceTokenAddr === undefined) {
      sourceTokenAddr = '0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE'; // native eth fake address
    }

    if (targetTokenAddr === undefined) {
      targetTokenAddr = '0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE';
    }

    const sourceToken = tokens[sourceTokenAddr];
    const targetToken = tokens[targetTokenAddr];

    const sourceUsdRate = await this.getUsdRate(sourceTokenAddr, quotes, deployment);
    const targetUsdRate = await this.getUsdRate(targetTokenAddr, quotes, deployment);

    const sourceTokenAmount = this.amountToken(event.sourceAmount, 5, sourceToken);
    const targetTokenAmount = this.amountToken(event.targetAmount, 6, targetToken);

    const sourceUsdAmount = sourceUsdRate
      ? Math.round(Number(ethers.utils.formatUnits(event.sourceAmount, sourceToken.decimals)) * sourceUsdRate)
      : null;
    const targetUsdAmount = targetUsdRate
      ? Math.round(Number(ethers.utils.formatUnits(event.targetAmount, targetToken.decimals)) * targetUsdRate)
      : null;

    const rate =
      Number(ethers.utils.formatUnits(event.targetAmount, targetToken.decimals)) /
      Number(ethers.utils.formatUnits(event.sourceAmount, sourceToken.decimals));

    return `🌀 <b>Carbon Vortex 2.0</b> 🌀

Tokens traded
Received: ${sourceTokenAmount} ${sourceToken.symbol} (${sourceUsdAmount ? `$${sourceUsdAmount}` : 'N/A'})
For: ${targetTokenAmount} ${targetToken.symbol} (${targetUsdAmount ? `$${targetUsdAmount}` : 'N/A'})
Average Rate: ${this.printNumber(rate, 6)} ${targetToken.symbol} per ${sourceToken.symbol}

🗓️ ${new Date(event.timestamp).toLocaleString()}
⛓️ Tx hash: <a href="${deployment.notifications.explorerUrl}${event.transactionHash}">View</a>`;
  }

  private async formatProtectionRemovedMessage(
    event: ProtectionRemovedEvent,
    tokens: TokensByAddress,
    quotes: QuotesByAddress,
    deployment: Deployment,
  ): Promise<string> {
    const reserveTokenInfo = tokens[event.reserveToken];
    const reserveAmount = event.reserveAmount;

    const usdRate = await this.getUsdRate(reserveTokenInfo.address, quotes, deployment);
    const formattedTokenAmount = this.amountToken(reserveAmount, 6, reserveTokenInfo);
    const formattedUsdAmount = this.amountUSD(reserveAmount, 4, usdRate.toString(), reserveTokenInfo);

    const message = `🚨🚨 <b>Protection Removed</b> 🚨🚨
    
🏊‍♂️ Pool: ${reserveTokenInfo.symbol}BNT
Amount: <b>${formattedTokenAmount} ${reserveTokenInfo.symbol} (${formattedUsdAmount})</b>

🗓️ ${new Date(event.timestamp).toLocaleString()}
⛓️ Tx hash: <a href="${deployment.notifications.explorerUrl}${event.transactionHash}">View</a>`;

    return message;
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
      return num.toFixed(precision);
    } else {
      // Format large numbers with the specified precision
      return num.toFixed(1);
    }
  }

  private toPascalCase(str: string): string {
    return str.toLowerCase().replace(/(^|[-_])(.)/g, (_, __, c) => c.toUpperCase());
  }
}
