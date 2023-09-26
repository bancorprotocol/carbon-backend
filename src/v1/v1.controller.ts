import { Controller, Header, Get } from '@nestjs/common';
import { CacheTTL } from '@nestjs/cache-manager';
import { DuneService } from '../dune/dune.service';

const ROI_QUERY_ID = 2738515;

@Controller({ version: '1' })
export class V1Controller {
  constructor(private duneService: DuneService) {}

  @Get('roi')
  @CacheTTL(1 * 1000)
  @Header('Cache-Control', 'public, max-age=3600')
  async roi(): Promise<any> {
    return this.duneService.query(ROI_QUERY_ID);
  }
}
