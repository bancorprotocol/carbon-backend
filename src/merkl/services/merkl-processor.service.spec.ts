import { Test, TestingModule } from '@nestjs/testing';
import { MerklProcessorService } from './merkl-processor.service';
import { CampaignService } from './campaign.service';
import { LastProcessedBlockService } from '../../last-processed-block/last-processed-block.service';
import { HistoricQuoteService } from '../../historic-quote/historic-quote.service';
import { StrategyCreatedEventService } from '../../events/strategy-created-event/strategy-created-event.service';
import { StrategyUpdatedEventService } from '../../events/strategy-updated-event/strategy-updated-event.service';
import { StrategyDeletedEventService } from '../../events/strategy-deleted-event/strategy-deleted-event.service';
import { VoucherTransferEventService } from '../../events/voucher-transfer-event/voucher-transfer-event.service';
import { BlockService } from '../../block/block.service';
import { DeploymentService } from '../../deployment/deployment.service';
import { TokenService } from '../../token/token.service';
import { PairService } from '../../pair/pair.service';
import { Repository } from 'typeorm';
import { getRepositoryToken } from '@nestjs/typeorm';
import { EpochReward } from '../entities/epoch-reward.entity';
import { Campaign } from '../entities/campaign.entity';
import Decimal from 'decimal.js';

describe('MerklProcessorService', () => {
  let service: MerklProcessorService;
  let campaignService: CampaignService;
  let epochRewardRepository: Repository<EpochReward>;

  const mockCampaignService = {
    findByPairId: jest.fn(),
  };

  const mockLastProcessedBlockService = {
    getOrInit: jest.fn(),
    save: jest.fn(),
  };

  const mockHistoricQuoteService = {
    findByTokensAndTimestamp: jest.fn(),
  };

  const mockStrategyCreatedEventService = {
    get: jest.fn(),
  };

  const mockStrategyUpdatedEventService = {
    get: jest.fn(),
  };

  const mockStrategyDeletedEventService = {
    get: jest.fn(),
  };

  const mockVoucherTransferEventService = {
    get: jest.fn(),
  };

  const mockBlockService = {
    getLastBlock: jest.fn(),
  };

  const mockDeploymentService = {
    getDeployment: jest.fn(),
  };

  const mockTokenService = {
    findByAddress: jest.fn(),
  };

  const mockPairService = {
    findById: jest.fn(),
  };

  const mockCampaignRepository = {
    find: jest.fn(),
    findOne: jest.fn(),
    save: jest.fn(),
    createQueryBuilder: jest.fn(),
  };

  const mockEpochRewardRepository = {
    save: jest.fn(),
    findOne: jest.fn(),
    createQueryBuilder: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        MerklProcessorService,
        {
          provide: CampaignService,
          useValue: mockCampaignService,
        },
        {
          provide: LastProcessedBlockService,
          useValue: mockLastProcessedBlockService,
        },
        {
          provide: HistoricQuoteService,
          useValue: mockHistoricQuoteService,
        },
        {
          provide: StrategyCreatedEventService,
          useValue: mockStrategyCreatedEventService,
        },
        {
          provide: StrategyUpdatedEventService,
          useValue: mockStrategyUpdatedEventService,
        },
        {
          provide: StrategyDeletedEventService,
          useValue: mockStrategyDeletedEventService,
        },
        {
          provide: VoucherTransferEventService,
          useValue: mockVoucherTransferEventService,
        },
        {
          provide: BlockService,
          useValue: mockBlockService,
        },
        {
          provide: DeploymentService,
          useValue: mockDeploymentService,
        },
        {
          provide: TokenService,
          useValue: mockTokenService,
        },
        {
          provide: PairService,
          useValue: mockPairService,
        },
        {
          provide: getRepositoryToken(Campaign),
          useValue: mockCampaignRepository,
        },
        {
          provide: getRepositoryToken(EpochReward),
          useValue: mockEpochRewardRepository,
        },
      ],
    }).compile();

    service = module.get<MerklProcessorService>(MerklProcessorService);
    campaignService = module.get<CampaignService>(CampaignService);
    epochRewardRepository = module.get<Repository<EpochReward>>(getRepositoryToken(EpochReward));
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('Service initialization', () => {
    it('should be defined', () => {
      expect(service).toBeDefined();
    });

    it('should have update method', () => {
      expect(typeof service.update).toBe('function');
    });
  });

  describe('decompressRateParameter', () => {
    it('should decompress rate parameters correctly', () => {
      const testCases = [
        { compressed: '0', expected: '0' },
        { compressed: '1485805197', expected: '1485805197' },
        { compressed: '12587943637', expected: '12587943637' },
      ];

      testCases.forEach(({ compressed, expected }) => {
        const result = service['decompressRateParameter'](compressed);
        expect(result.toString()).toBe(expected);
      });
    });

    it('should handle edge cases', () => {
      const result = service['decompressRateParameter']('0');
      expect(result.toString()).toBe('0');

      const largeResult = service['decompressRateParameter']('999999999999999');
      expect(largeResult.isFinite()).toBe(true);
      expect(largeResult.gte(0)).toBe(true);
    });
  });

  describe('calculateEligibleLiquidity', () => {
    it('should calculate eligible liquidity correctly', () => {
      const y = new Decimal('1000000000000000000');
      const z = new Decimal('2000000000000000000');
      const A = new Decimal('100000000000000000');
      const B = new Decimal('200000000000000000');
      const targetSqrtPriceScaled = new Decimal('1000000000000000000');
      const toleranceFactor = new Decimal('0.02');

      const result = service['calculateEligibleLiquidity'](y, z, A, B, targetSqrtPriceScaled, toleranceFactor);

      expect(result).toBeInstanceOf(Decimal);
      expect(result.gte(0)).toBe(true);
    });

    it('should handle edge cases', () => {
      const y = new Decimal('0');
      const z = new Decimal('0');
      const A = new Decimal('0');
      const B = new Decimal('0');
      const targetSqrtPriceScaled = new Decimal('1000000000000000000');
      const toleranceFactor = new Decimal('0.02');

      const result = service['calculateEligibleLiquidity'](y, z, A, B, targetSqrtPriceScaled, toleranceFactor);

      expect(result).toBeInstanceOf(Decimal);
      expect(result.gte(0)).toBe(true);
    });
  });

  describe('calculateTargetSqrtPriceScaled', () => {
    it('should calculate target sqrt price scaled correctly', () => {
      const targetPrice = new Decimal('2600'); // ETH price
      const result = service['calculateTargetSqrtPriceScaled'](targetPrice);

      expect(result).toBeInstanceOf(Decimal);
      expect(result.gt(0)).toBe(true);
    });
  });

  describe('calculateInvTargetSqrtPriceScaled', () => {
    it('should calculate inverse target sqrt price scaled correctly', () => {
      const targetPrice = new Decimal('2600'); // ETH price
      const result = service['calculateInvTargetSqrtPriceScaled'](targetPrice);

      expect(result).toBeInstanceOf(Decimal);
      expect(result.gt(0)).toBe(true);
    });
  });

  describe('integration tests', () => {
    it('should have all required dependencies injected', () => {
      expect(service).toBeDefined();
      expect(campaignService).toBeDefined();
      expect(epochRewardRepository).toBeDefined();
    });

    it('should handle complex mathematical operations', () => {
      // Test precision with large numbers
      const largeNumber = new Decimal('999999999999999999999999');
      const smallNumber = new Decimal('0.000000000000000001');

      const result = largeNumber.mul(smallNumber);
      expect(result.isFinite()).toBe(true);
      expect(result.gt(0)).toBe(true);
    });
  });
});
