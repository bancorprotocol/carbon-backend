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
import { getRepositoryToken } from '@nestjs/typeorm';
import { EpochReward } from '../entities/epoch-reward.entity';
import { Campaign } from '../entities/campaign.entity';
import { ExchangeId, BlockchainType } from '../../deployment/deployment.service';
import Decimal from 'decimal.js';

describe('MerklProcessorService - Comprehensive Coverage', () => {
  let service: MerklProcessorService;

  // Test constants
  const ETH_ADDRESS = '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2';
  const USDT_ADDRESS = '0xdAC17F958D2ee523a2206206994597C13D831ec7';

  const mockDeployment = {
    blockchainType: BlockchainType.Ethereum,
    exchangeId: ExchangeId.OGEthereum,
    startBlock: 1000,
    rpcEndpoint: 'http://localhost:8545',
    harvestEventsBatchSize: 10000,
    harvestConcurrency: 5,
    multicallAddress: '0x1F98431c8aD98523631AE4a59f267346ea31F984',
    gasToken: { symbol: 'ETH', address: ETH_ADDRESS },
    contracts: {
      carbonController: { address: '0x1234567890123456789012345678901234567890' },
      carbonVortex: { address: '0x2345678901234567890123456789012345678901' },
      bancorArbitrage: { address: '0x3456789012345678901234567890123456789012' },
      voucher: { address: '0x4567890123456789012345678901234567890123' },
      carbonPOL: { address: '0x5678901234567890123456789012345678901234' },
    },
  };

  const mockCampaign = {
    id: '1',
    blockchainType: BlockchainType.Ethereum,
    exchangeId: ExchangeId.OGEthereum,
    pairId: 1,
    pair: {
      id: 1,
      token0: { address: ETH_ADDRESS, decimals: 18 },
      token1: { address: USDT_ADDRESS, decimals: 6 },
    },
    rewardAmount: '1000000000000000000000',
    rewardTokenAddress: '0x1f9840a85d5aF5bf1D1762F925BDADdC4201F984',
    startDate: new Date('2022-01-01T00:00:00.000Z'),
    endDate: new Date('2022-01-02T00:00:00.000Z'),
    opportunityName: 'Test Campaign',
    isActive: true,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  const mockBlock = {
    id: 1000,
    timestamp: new Date('2022-01-01T00:00:00.000Z'),
    blockchainType: BlockchainType.Ethereum,
  };

  // Mock all dependencies
  const mockCampaignService = {
    getActiveCampaigns: jest.fn(),
    markProcessedCampaignsInactive: jest.fn(),
  };

  const mockLastProcessedBlockService = {
    getOrInit: jest.fn(),
    update: jest.fn(),
  };

  const mockHistoricQuoteService = {
    getUsdRates: jest.fn(),
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
    getBlock: jest.fn(),
    getBlocksDictionary: jest.fn(),
  };

  const mockEpochRewardRepository = {
    save: jest.fn(),
    findOne: jest.fn(),
    createQueryBuilder: jest.fn(),
    manager: {
      transaction: jest.fn(),
      query: jest.fn(),
    },
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
          provide: getRepositoryToken(EpochReward),
          useValue: mockEpochRewardRepository,
        },
      ],
    }).compile();

    service = module.get<MerklProcessorService>(MerklProcessorService);
  });

  describe('Service Initialization', () => {
    it('should be defined', () => {
      expect(service).toBeDefined();
    });

    it('should have correct constants', () => {
      expect(service['SCALING_CONSTANT'].toString()).toBe(new Decimal(2).pow(48).toString());
    });
  });

  describe('update() - Main Processing Method', () => {
    beforeEach(() => {
      mockCampaignService.getActiveCampaigns.mockResolvedValue([]);
      mockCampaignService.markProcessedCampaignsInactive.mockResolvedValue(undefined);
      mockLastProcessedBlockService.getOrInit.mockResolvedValue(1000);
      mockLastProcessedBlockService.update.mockResolvedValue(undefined);
      mockBlockService.getBlock.mockResolvedValue(mockBlock);
      mockBlockService.getBlocksDictionary.mockResolvedValue({});
    });

    it('should handle empty campaigns gracefully', async () => {
      await service.update(1100, mockDeployment as any);

      expect(mockLastProcessedBlockService.getOrInit).toHaveBeenCalledWith('ethereum-ethereum-merkl-global', 1000);
      expect(mockLastProcessedBlockService.update).toHaveBeenCalledWith('ethereum-ethereum-merkl-global', 1100);
      expect(mockCampaignService.getActiveCampaigns).toHaveBeenCalledWith(mockDeployment);
    });
  });

  describe('Token Weighting Logic', () => {
    it('should return specific token weight when configured', () => {
      const weighting = service['getTokenWeighting'](
        '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2',
        mockDeployment as any,
      );
      expect(typeof weighting).toBe('number');
    });

    it('should handle case insensitive token addresses', () => {
      const upperCase = service['getTokenWeighting'](
        '0XC02AAA39B223FE8D0A0E5C4F27EAD9083C756CC2',
        mockDeployment as any,
      );
      const lowerCase = service['getTokenWeighting'](
        '0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2',
        mockDeployment as any,
      );
      expect(upperCase).toBe(lowerCase);
    });
  });

  describe('Rate Parameter Decompression', () => {
    it('should decompress rate parameters correctly', () => {
      const scalingConstant = new Decimal(2).pow(48);

      // Test with mantissa = 123, exponent = 5
      const mantissa = new Decimal(123);
      const exponent = new Decimal(5);
      const compressedValue = exponent.mul(scalingConstant).add(mantissa);

      const decompressed = service['decompressRateParameter'](compressedValue.toString());
      const expected = mantissa.mul(new Decimal(2).pow(exponent));

      expect(decompressed.toString()).toBe(expected.toString());
    });

    it('should handle zero values', () => {
      const result = service['decompressRateParameter']('0');
      expect(result.toString()).toBe('0');
    });
  });

  describe('Deep Cloning', () => {
    it('should deep clone strategy state correctly', () => {
      const original = {
        strategyId: 'strategy1',
        pairId: 1,
        token0Address: ETH_ADDRESS,
        token1Address: USDT_ADDRESS,
        token0Decimals: 18,
        token1Decimals: 6,
        liquidity0: new Decimal('5000'),
        liquidity1: new Decimal('6000'),
        order0_A: new Decimal('100'),
        order0_B: new Decimal('200'),
        order0_z: new Decimal('2000'),
        order1_A: new Decimal('300'),
        order1_B: new Decimal('400'),
        order1_z: new Decimal('4000'),
      };

      const cloned = service['deepCloneStrategyState'](original as any);

      // Verify it's a deep clone with the core properties
      expect(cloned).not.toBe(original);
      expect(cloned.strategyId).toBe(original.strategyId);
      expect(cloned.pairId).toBe(original.pairId);
      expect(cloned.order0_A.toString()).toBe(original.order0_A.toString());
      expect(cloned.order0_A).not.toBe(original.order0_A); // Different Decimal instances
    });
  });

  describe('Epoch Calculation', () => {
    it('should calculate epochs in range correctly', () => {
      const campaign = {
        ...mockCampaign,
        startDate: new Date('2022-01-01T00:00:00.000Z'),
        endDate: new Date('2022-01-01T12:00:00.000Z'), // 12 hours = 3 epochs
        rewardAmount: '3000000000000000000000',
      };

      const startTimestamp = Math.floor(campaign.startDate.getTime() / 1000);
      const endTimestamp = Math.floor(campaign.endDate.getTime() / 1000);

      const epochs = service['calculateEpochsInRange'](campaign as any, startTimestamp, endTimestamp);

      expect(epochs).toHaveLength(3);
      expect(epochs[0].epochNumber).toBe(1);

      // Each epoch should get equal rewards (1000 tokens each)
      epochs.forEach((epoch) => {
        expect(epoch.totalRewards.toFixed()).toBe('1000000000000000000000');
      });
    });
  });

  describe('Validation Methods', () => {
    it('should validate epoch integrity correctly', () => {
      const validEpochs = [
        {
          epochStartTimestamp: new Date('2022-01-01T00:00:00.000Z'),
          epochEndTimestamp: new Date('2022-01-01T04:00:00.000Z'),
        },
        {
          epochStartTimestamp: new Date('2022-01-01T04:00:00.000Z'),
          epochEndTimestamp: new Date('2022-01-01T08:00:00.000Z'),
        },
      ];

      expect(() => service['validateEpochIntegrity'](mockCampaign as any, validEpochs as any)).not.toThrow();
    });
  });

  describe('Target Price Calculations', () => {
    it('should calculate target sqrt price scaled correctly', () => {
      const targetPrice = new Decimal('3000'); // 1 ETH = 3000 USDT
      const baseDecimals = 18; // ETH
      const quoteDecimals = 6; // USDT

      const targetSqrtPriceScaled = service['calculateTargetSqrtPriceScaled'](targetPrice, baseDecimals, quoteDecimals);

      // Verify the calculation: adjusted_price * sqrt() * SCALING_CONSTANT
      const adjustedPrice = targetPrice.mul(new Decimal(10).pow(quoteDecimals)).div(new Decimal(10).pow(baseDecimals));
      const expected = adjustedPrice.sqrt().mul(service['SCALING_CONSTANT']);

      expect(targetSqrtPriceScaled.toString()).toBe(expected.toString());
    });
  });
});
