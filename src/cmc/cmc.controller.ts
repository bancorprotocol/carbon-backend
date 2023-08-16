import { CacheTTL } from '@nestjs/cache-manager';
import { Controller, Get } from '@nestjs/common';

@Controller('cmc')
export class CmcController {
  @Get('historical_trades')
  @CacheTTL(3000)
  foo(): any {
    return Math.random();
  }
}
