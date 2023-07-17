import { Test, TestingModule } from '@nestjs/testing';
import { CryptoCompareService } from './crypto-compare.service';

describe('CryptoCompareService', () => {
  let service: CryptoCompareService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [CryptoCompareService],
    }).compile();

    service = module.get<CryptoCompareService>(CryptoCompareService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
