import { Controller, Get, Header } from '@nestjs/common';
import { CacheTTL } from '@nestjs/cache-manager';
import { AnalyticsService } from './analytics.service';

@Controller({ version: '1', path: 'analytics' })
export class AnalyticsController {
  constructor(private analyticsService: AnalyticsService) {}

  @Get('tvl')
  @CacheTTL(1 * 60 * 1000)
  @Header('Cache-Control', 'public, max-age=60')
  async tvl(): Promise<any> {
    return this.analyticsService.getCachedTVL();
  }

  @Get('volume')
  @CacheTTL(1 * 60 * 1000)
  @Header('Cache-Control', 'public, max-age=60')
  async volume(): Promise<any> {
    return this.analyticsService.getCachedVolume();
  }

  @Get('generic')
  @CacheTTL(1 * 60 * 1000)
  @Header('Cache-Control', 'public, max-age=60')
  async generic(): Promise<any> {
    return this.analyticsService.getCachedGenericMetrics();
  }
}
