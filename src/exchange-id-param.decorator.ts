import { Request } from 'express';
import { ExchangeId } from './deployment/deployment.service';
import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import { ApiParam } from '@nestjs/swagger';

export function extractExchangeId(request: Request, exchangeIdParam?: string): ExchangeId {
  let exchangeId: ExchangeId;

  if (exchangeIdParam) {
    exchangeId = exchangeIdParam as ExchangeId;
  } else {
    let subdomain = request.hostname.split('.')[0];
    if (subdomain.endsWith('-api')) {
      subdomain = subdomain.slice(0, -4); // Remove '-api' suffix
    }
    if (subdomain === 'api') {
      subdomain = ExchangeId.OGEthereum;
    }

    // Default to 'ethereum' if subdomain is empty
    exchangeId = subdomain ? (subdomain as ExchangeId) : ('ethereum' as ExchangeId);
  }

  if (!Object.values(ExchangeId).includes(exchangeId)) {
    throw new Error(`Invalid ExchangeId: ${exchangeId}`);
  }

  return exchangeId;
}

export const ApiExchangeIdParam = () =>
  ApiParam({
    name: 'exchangeId',
    required: true,
    enum: ExchangeId,
  });

export const ExchangeIdParam = createParamDecorator((data: unknown, ctx: ExecutionContext) => {
  const request = ctx.switchToHttp().getRequest();
  const exchangeIdParam = ctx.switchToHttp().getRequest().params.exchangeId;
  return extractExchangeId(request, exchangeIdParam);
});
