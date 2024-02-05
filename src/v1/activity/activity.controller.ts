import { Controller, Get, Header, Query } from '@nestjs/common';
import { CacheTTL } from '@nestjs/cache-manager';
import { ActivityService } from './activity.service';
import { ActivityDto } from './activity.dto';

@Controller({ version: '1', path: 'activity' })
export class ActivityController {
  constructor(private activityService: ActivityService) {}

  @Get()
  @CacheTTL(1 * 60 * 1000)
  @Header('Cache-Control', 'public, max-age=60')
  async activity(@Query() params: ActivityDto): Promise<any> {
    let data = await this.activityService.getCachedActivity();

    if (params.ownerId) {
      data = data.filter((d) => [d.actionOwner, d.creationWallet, d.currentOwner].includes(params.ownerId));
    }
    if (params.strategyId) {
      data = data.filter((d) => d.id === params.strategyId);
    }

    return data;
  }
}
