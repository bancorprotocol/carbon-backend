import { CacheTTL } from '@nestjs/cache-manager';
import { BadRequestException, Controller, Get, Header, Query } from '@nestjs/common';
import { HistoricQuoteDto } from './historic-quote.dto';
import moment from 'moment';
import { HistoricQuoteService } from './historic-quote.service';

@Controller({ version: '1', path: 'history/prices' })
export class HistoricQuoteController {
  constructor(private historicQuoteService: HistoricQuoteService) {}

  @Get()
  @CacheTTL(12 * 60 * 60 * 1000) // Cache response for 1 second
  @Header('Cache-Control', 'public, max-age=60') // Set Cache-Control header
  async simulator(@Query() params: HistoricQuoteDto) {
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

    const data = await this.historicQuoteService.getHistoryQuotesBuckets([params.token], params.start, params.end);
    return data;
  }
}

const isValidStart = async (start: number): Promise<boolean> => {
  const twelveMonthsAgo = moment().subtract(12, 'months').startOf('day').unix();
  return start >= twelveMonthsAgo;
};
