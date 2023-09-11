import { Controller } from '@nestjs/common';

@Controller({ version: '1', path: 'roi' })
export class RoiController {
  async roi(): Promise<any> {
    return 2;
  }
}
