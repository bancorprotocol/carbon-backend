import { ConfigService } from '@nestjs/config';
import { Test, TestingModule } from '@nestjs/testing';
import { CoinMarketCapService } from './coin-market-cap.service';

describe('CoinMarketCapService', () => {
  let service: CoinMarketCapService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [CoinMarketCapService, ConfigService],
    }).compile();

    service = module.get<CoinMarketCapService>(CoinMarketCapService);
  });
});

//
// while roundTo5Minoute(now) - oldest stored > 5 minutes :
