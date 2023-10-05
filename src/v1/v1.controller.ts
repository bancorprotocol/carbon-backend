import { Controller } from '@nestjs/common';

import { DuneService } from '../dune/dune.service';

@Controller({ version: '1' })
export class V1Controller {
  constructor(private duneService: DuneService) {}
}
