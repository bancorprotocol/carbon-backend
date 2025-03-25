import { CacheTTL } from '@nestjs/cache-manager';
import { BadRequestException, Controller, Get, Header, Query } from '@nestjs/common';
import { HistoricQuoteDto } from './historic-quote.dto';
import { HistoricQuoteService } from './historic-quote.service';
import { Deployment, DeploymentService, ExchangeId, BlockchainType } from '../deployment/deployment.service';
import { ApiExchangeIdParam, ExchangeIdParam } from '../exchange-id-param.decorator';

@Controller({ version: '1', path: ':exchangeId?/history/prices' })
export class HistoricQuoteController {
  constructor(private historicQuoteService: HistoricQuoteService, private deploymentService: DeploymentService) {}

  @Get()
  @CacheTTL(1 * 60 * 60 * 1000)
  @Header('Cache-Control', 'public, max-age=60') // Set Cache-Control header
  @ApiExchangeIdParam()
  async prices(@ExchangeIdParam() exchangeId: ExchangeId, @Query() params: HistoricQuoteDto) {
    const deployment: Deployment = await this.deploymentService.getDeploymentByExchangeId(exchangeId);

    if (params.end <= params.start) {
      throw new BadRequestException({
        message: ['End date must be after the start date'],
        error: 'Bad Request',
        statusCode: 400,
      });
    }

    // Convert tokens to lowercase once
    const baseTokenAddress = params.baseToken.toLowerCase();
    const quoteTokenAddress = params.quoteToken.toLowerCase();

    // Initialize variables for the tokens and blockchain to use
    let usedBaseToken = baseTokenAddress;
    let usedQuoteToken = quoteTokenAddress;
    let blockchainType = deployment.blockchainType;
    let mappedBaseToken = null;
    let mappedQuoteToken = null;

    // Check if tokens are mapped to Ethereum tokens
    if (deployment.mapEthereumTokens) {
      // Convert mapEthereumTokens keys to lowercase for case-insensitive matching
      const lowercaseTokenMap = Object.entries(deployment.mapEthereumTokens).reduce((acc, [key, value]) => {
        acc[key.toLowerCase()] = value;
        return acc;
      }, {});

      // Check if base token is mapped
      if (lowercaseTokenMap[baseTokenAddress]) {
        mappedBaseToken = lowercaseTokenMap[baseTokenAddress].toLowerCase();
        usedBaseToken = mappedBaseToken;
        blockchainType = BlockchainType.Ethereum;
      }

      // Check if quote token is mapped
      if (lowercaseTokenMap[quoteTokenAddress]) {
        mappedQuoteToken = lowercaseTokenMap[quoteTokenAddress].toLowerCase();
        usedQuoteToken = mappedQuoteToken;
        blockchainType = BlockchainType.Ethereum;
      }
    }

    // Get the price data
    const data = await this.historicQuoteService.getUsdBuckets(
      blockchainType,
      usedBaseToken,
      usedQuoteToken,
      params.start,
      params.end,
    );

    // Format the result
    const result = [];
    if (data && data.length > 0) {
      data.forEach((p) => {
        const entry = {
          timestamp: p.timestamp,
          low: p.low.toString(),
          high: p.high.toString(),
          open: p.open.toString(),
          close: p.close.toString(),
          provider: p.provider,
        };

        // Add mapping information if applicable
        if (mappedBaseToken) {
          entry['mappedBaseToken'] = mappedBaseToken;
        }
        if (mappedQuoteToken) {
          entry['mappedQuoteToken'] = mappedQuoteToken;
        }

        result.push(entry);
      });
    }

    return result;
  }
}
