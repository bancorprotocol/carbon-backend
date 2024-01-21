import { Controller, Get, Header } from '@nestjs/common';
import { CacheTTL } from '@nestjs/cache-manager';
import { ActivityService } from './activity.service';

@Controller({ version: '1', path: 'activity' })
export class RoiController {
  constructor(private activityService: ActivityService) {}

  @Get()
  @CacheTTL(1 * 60 * 1000)
  @Header('Cache-Control', 'public, max-age=60')
  async activity(): Promise<any> {
    return this.activityService.getCachedActivity();
  }
}
