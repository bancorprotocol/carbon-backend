import { BadRequestException, Controller, Get, Header, Query } from '@nestjs/common';
import { SimulatorDto } from './simulator.dto';
import { CacheTTL } from '@nestjs/cache-manager';
import { SimulatorService } from './simulator.service';
import moment from 'moment';

@Controller({ version: '1', path: 'simulator' })
export class SimulatorController {
  constructor(private readonly simulatorService: SimulatorService) {}

  @Get()
  @CacheTTL(10 * 60 * 1000) // Cache response for 1 second
  @Header('Cache-Control', 'public, max-age=60') // Set Cache-Control header
  async simulator(@Query() params: SimulatorDto) {
    if (!isValidStart(params.start)) {
      throw new BadRequestException({
        message: ['start must be within the last 12 months'],
        error: 'Bad Request',
        statusCode: 400,
      });
    }

    if (params.end < params.start) {
      throw new BadRequestException({
        message: ['End date must be after the start date'],
        error: 'Bad Request',
        statusCode: 400,
      });
    }

    const data = await this.simulatorService.generateSimulation(params);
    return data;
  }
}

const isValidStart = async (start: number): Promise<boolean> => {
  const twelveMonthsAgo = moment().subtract(12, 'months').startOf('day').unix();
  return start >= twelveMonthsAgo;
};
