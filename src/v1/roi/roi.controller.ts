import { Controller, Get, Header } from '@nestjs/common';
import { CacheTTL } from '@nestjs/cache-manager';
import { RoiService } from './roi.service';

@Controller({ version: '1', path: 'roi' })
export class RoiController {
  constructor(private roiService: RoiService) {}

  @Get()
  @CacheTTL(60 * 1000)
  @Header('Cache-Control', 'public, max-age=60')
  async roi(): Promise<any> {
    return await this.roiService.getROI();
  }
}
