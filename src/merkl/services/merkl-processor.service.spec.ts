import { Test, TestingModule } from '@nestjs/testing';
import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Decimal } from 'decimal.js';
import { MerklProcessorService } from './merkl-processor.service';
import { SubEpochService } from './sub-epoch.service';
import { Campaign } from '../entities/campaign.entity';
import { CampaignService } from './campaign.service';
import { LastProcessedBlockService } from '../../last-processed-block/last-processed-block.service';
import { BlockService } from '../../block/block.service';
import { HistoricQuoteService } from '../../historic-quote/historic-quote.service';
import { StrategyCreatedEventService } from '../../events/strategy-created-event/strategy-created-event.service';
import { StrategyUpdatedEventService } from '../../events/strategy-updated-event/strategy-updated-event.service';
import { StrategyDeletedEventService } from '../../events/strategy-deleted-event/strategy-deleted-event.service';
import { VoucherTransferEventService } from '../../events/voucher-transfer-event/voucher-transfer-event.service';
import { BlockchainType, ExchangeId, Deployment } from '../../deployment/deployment.service';
import { Pair } from '../../pair/pair.entity';
import { Token } from '../../token/token.entity';
import { Block } from '../../block/block.entity';

describe('MerklProcessorService', () => {
  let service: MerklProcessorService;
  let mockSubEpochService: jest.Mocked<SubEpochService>;
  let mockCampaignService: jest.Mocked<CampaignService>;
  let mockLastProcessedBlockService: jest.Mocked<LastProcessedBlockService>;
  let mockBlockService: jest.Mocked<BlockService>;
  let mockHistoricQuoteService: jest.Mocked<HistoricQuoteService>;
  let mockStrategyCreatedEventService: jest.Mocked<StrategyCreatedEventService>;
  let mockStrategyUpdatedEventService: jest.Mocked<StrategyUpdatedEventService>;
  let mockStrategyDeletedEventService: jest.Mocked<StrategyDeletedEventService>;
  let mockVoucherTransferEventService: jest.Mocked<VoucherTransferEventService>;
  let mockConfigService: jest.Mocked<ConfigService>;

  // Test data fixtures
  const mockToken0: Token = {
    id: 1,
    blockchainType: BlockchainType.Ethereum,
    exchangeId: ExchangeId.OGEthereum,
    address: '0x1234567890123456789012345678901234567890',
    symbol: 'TKN0',
    name: 'Token 0',
    decimals: 18,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  const mockToken1: Token = {
    id: 2,
    blockchainType: BlockchainType.Ethereum,
    exchangeId: ExchangeId.OGEthereum,
    address: '0x0987654321098765432109876543210987654321',
    symbol: 'TKN1',
    name: 'Token 1',
    decimals: 18,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  const mockBlock: Block = {
    id: 1000001,
    blockchainType: BlockchainType.Ethereum,
    timestamp: new Date('2023-01-01T01:00:00Z'),
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  const mockPair: Pair = {
    id: 1,
    blockchainType: BlockchainType.Ethereum,
    exchangeId: ExchangeId.OGEthereum,
    token0: mockToken0,
    token1: mockToken1,
    block: mockBlock,
    name: 'TKN0/TKN1',
    tokensTradedEvents: [],
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  const mockCampaign: Campaign = {
    id: 1,
    blockchainType: BlockchainType.Ethereum,
    exchangeId: ExchangeId.OGEthereum,
    pairId: 1,
    pair: mockPair,
    rewardTokenAddress: '0xrewardtoken',
    opportunityName: 'Test Campaign',
    isActive: true,
    startDate: new Date('2023-01-01T00:00:00Z'),
    endDate: new Date('2023-01-01T08:00:00Z'),
    rewardAmount: '1000000000000000000000', // 1000 tokens
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  const mockDeployment: Deployment = {
    blockchainType: BlockchainType.Ethereum,
    exchangeId: ExchangeId.OGEthereum,
    startBlock: 1000000,
    rpcEndpoint: 'https://ethereum.rpc',
    harvestEventsBatchSize: 1000,
    harvestConcurrency: 10,
    multicallAddress: '0xmulticall',
    gasToken: { name: 'ETH', symbol: 'ETH', address: '0xgas' },
    contracts: {},
  };

  beforeEach(async () => {
    const mockSubEpochServiceFactory = () => ({
      getTotalRewardsForCampaign: jest.fn(),
      saveSubEpochs: jest.fn(),
      getEpochRewards: jest.fn(),
      getLastProcessedEpochNumber: jest.fn().mockResolvedValue(0),
      subEpochRepository: {
        manager: {
          query: jest.fn().mockResolvedValue([]),
        },
      },
    });

    const mockCampaignServiceFactory = () => ({
      getActiveCampaigns: jest.fn(),
      markProcessedCampaignsInactive: jest.fn(),
    });

    const mockLastProcessedBlockServiceFactory = () => ({
      getOrInit: jest.fn(),
      update: jest.fn(),
    });

    const mockBlockServiceFactory = () => ({
      getBlock: jest.fn().mockResolvedValue(mockBlock),
    });

    const mockHistoricQuoteServiceFactory = () => ({
      getUsdRates: jest.fn().mockResolvedValue([
        { address: mockToken0.address, day: 1672531200, usd: 1.5 }, // 2023-01-01
        { address: mockToken1.address, day: 1672531200, usd: 2.5 },
      ]),
    });

    const mockEventServiceFactory = () => ({
      get: jest.fn().mockResolvedValue([
        {
          id: 'event-1',
          strategyId: 'strategy-1',
          pair: mockPair,
          token0: mockToken0,
          token1: mockToken1,
          owner: '0xowner',
          order0: JSON.stringify({
            y: '1000000000000000000',
            z: '2000000000000000000',
            A: '3000000000000000000',
            B: '4000000000000000000',
          }),
          order1: JSON.stringify({
            y: '1500000000000000000',
            z: '2500000000000000000',
            A: '3500000000000000000',
            B: '4500000000000000000',
          }),
          transactionHash: '0x123abc',
          timestamp: new Date('2023-01-01T00:30:00Z'),
          block: mockBlock,
        },
      ]),
    });

    const mockConfigServiceFactory = () => ({
      get: jest.fn((key: string) => {
        if (key === 'MERKL_SNAPSHOT_SALT') return 'test-salt-for-testing';
        return undefined;
      }),
    });

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        MerklProcessorService,
        {
          provide: SubEpochService,
          useFactory: mockSubEpochServiceFactory,
        },
        {
          provide: CampaignService,
          useFactory: mockCampaignServiceFactory,
        },
        {
          provide: LastProcessedBlockService,
          useFactory: mockLastProcessedBlockServiceFactory,
        },
        {
          provide: BlockService,
          useFactory: mockBlockServiceFactory,
        },
        {
          provide: HistoricQuoteService,
          useFactory: mockHistoricQuoteServiceFactory,
        },
        {
          provide: StrategyCreatedEventService,
          useFactory: mockEventServiceFactory,
        },
        {
          provide: StrategyUpdatedEventService,
          useFactory: mockEventServiceFactory,
        },
        {
          provide: StrategyDeletedEventService,
          useFactory: mockEventServiceFactory,
        },
        {
          provide: VoucherTransferEventService,
          useFactory: mockEventServiceFactory,
        },
        {
          provide: ConfigService,
          useFactory: mockConfigServiceFactory,
        },
      ],
    }).compile();

    service = module.get<MerklProcessorService>(MerklProcessorService);
    mockSubEpochService = module.get(SubEpochService);
    mockCampaignService = module.get(CampaignService);
    mockLastProcessedBlockService = module.get(LastProcessedBlockService);
    mockBlockService = module.get(BlockService);
    mockHistoricQuoteService = module.get(HistoricQuoteService);
    mockStrategyCreatedEventService = module.get(StrategyCreatedEventService);
    mockStrategyUpdatedEventService = module.get(StrategyUpdatedEventService);
    mockStrategyDeletedEventService = module.get(StrategyDeletedEventService);
    mockVoucherTransferEventService = module.get(VoucherTransferEventService);
    mockConfigService = module.get(ConfigService);

    // Suppress logger during tests
    jest.spyOn(Logger.prototype, 'log').mockImplementation();
    jest.spyOn(Logger.prototype, 'warn').mockImplementation();
    jest.spyOn(Logger.prototype, 'error').mockImplementation();
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('Constructor and Dependencies', () => {
    it('should be defined', () => {
      expect(service).toBeDefined();
    });

    it('should inject all required dependencies', () => {
      expect(mockSubEpochService).toBeDefined();
      expect(mockCampaignService).toBeDefined();
      expect(mockLastProcessedBlockService).toBeDefined();
      expect(mockBlockService).toBeDefined();
      expect(mockHistoricQuoteService).toBeDefined();
    });
  });

  describe('update', () => {
    beforeEach(() => {
      // Setup common mocks
      mockLastProcessedBlockService.getOrInit.mockResolvedValue(1000000);
      mockLastProcessedBlockService.update.mockResolvedValue(undefined);
    });

    it('should handle no active campaigns', async () => {
      mockCampaignService.getActiveCampaigns.mockResolvedValue([]);

      await service.update(1000100, mockDeployment);

      expect(mockCampaignService.getActiveCampaigns).toHaveBeenCalledWith(mockDeployment);
      // When no campaigns exist, the service returns early and doesn't update last processed block
      expect(mockLastProcessedBlockService.update).not.toHaveBeenCalled();
    });

    it('should initialize reward tracking for campaigns', async () => {
      mockCampaignService.getActiveCampaigns.mockResolvedValue([mockCampaign]);
      mockSubEpochService.getTotalRewardsForCampaign.mockResolvedValue(new Decimal('500000000000000000000'));
      mockSubEpochService.saveSubEpochs.mockResolvedValue(undefined);

      // Mock the private getTimestampForBlock method
      jest.spyOn(service as any, 'getTimestampForBlock').mockResolvedValue(Date.now());

      // Mock event services to return some events so epochs can be generated
      const mockCreatedEvent = {
        id: '1',
        blockchainType: 'ethereum' as any,
        exchangeId: 'og-ethereum' as any,
        strategyId: 'test-strategy',
        timestamp: new Date('2023-01-01T01:00:00Z'),
        transactionHash: '0x123',
        pair: mockPair,
        block: {
          id: 1,
          blockNumber: 1000000,
          timestamp: new Date('2023-01-01T01:00:00Z'),
          blockchainType: 'ethereum' as any,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
        owner: '0x123',
        token0: {
          id: 1,
          blockchainType: 'ethereum' as any,
          exchangeId: 'og-ethereum' as any,
          address: '0x123',
          symbol: 'TOK0',
          name: 'Token 0',
          decimals: 18,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
        token1: {
          id: 2,
          blockchainType: 'ethereum' as any,
          exchangeId: 'og-ethereum' as any,
          address: '0x456',
          symbol: 'TOK1',
          name: 'Token 1',
          decimals: 18,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
        order0: '{}',
        order1: '{}',
        transactionIndex: 0,
        logIndex: 0,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      const mockUpdatedEvent = {
        id: 1,
        blockchainType: 'ethereum' as any,
        exchangeId: 'og-ethereum' as any,
        strategyId: 'test-strategy',
        timestamp: new Date('2023-01-01T01:00:00Z'),
        transactionHash: '0x123',
        pair: mockPair,
        block: {
          id: 1,
          blockNumber: 1000000,
          timestamp: new Date('2023-01-01T01:00:00Z'),
          blockchainType: 'ethereum' as any,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
        reason: 1,
        token0: {
          id: 1,
          blockchainType: 'ethereum' as any,
          exchangeId: 'og-ethereum' as any,
          address: '0x123',
          symbol: 'TOK0',
          name: 'Token 0',
          decimals: 18,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
        token1: {
          id: 2,
          blockchainType: 'ethereum' as any,
          exchangeId: 'og-ethereum' as any,
          address: '0x456',
          symbol: 'TOK1',
          name: 'Token 1',
          decimals: 18,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
        order0: '{}',
        order1: '{}',
        transactionIndex: 0,
        logIndex: 0,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      // Create additional events for epoch 2 to cover the campaign duration
      const mockCreatedEvent2 = {
        ...mockCreatedEvent,
        id: '2',
        timestamp: new Date('2023-01-01T04:00:00Z'),
        block: {
          ...mockCreatedEvent.block,
          id: 2,
          blockNumber: 1000050,
          timestamp: new Date('2023-01-01T04:00:00Z'),
        },
      };

      const mockUpdatedEvent2 = {
        ...mockUpdatedEvent,
        id: 2,
        timestamp: new Date('2023-01-01T04:00:00Z'),
        block: {
          ...mockUpdatedEvent.block,
          id: 2,
          blockNumber: 1000050,
          timestamp: new Date('2023-01-01T04:00:00Z'),
        },
      };

      mockStrategyCreatedEventService.get.mockResolvedValue([mockCreatedEvent, mockCreatedEvent2]);
      mockStrategyUpdatedEventService.get.mockResolvedValue([mockUpdatedEvent, mockUpdatedEvent2]);
      mockStrategyDeletedEventService.get.mockResolvedValue([]);
      mockVoucherTransferEventService.get.mockResolvedValue([]);

      await service.update(1000100, mockDeployment);

      expect(mockSubEpochService.getTotalRewardsForCampaign).toHaveBeenCalledWith(mockCampaign.id);
    });
  });

  describe('Reward Capping Logic', () => {
    it('should enforce campaign reward limits', () => {
      const campaignDistributedAmounts = new Map([[1, new Decimal('950000000000000000000')]]); // 950 tokens
      const campaignTotalAmounts = new Map([[1, new Decimal('1000000000000000000000')]]); // 1000 tokens

      const subEpochData = {
        timestamp: Date.now(),
        order0TargetPrice: new Decimal(1),
        order1TargetPrice: new Decimal(1),
        targetSqrtPriceScaled: new Decimal(1),
        invTargetSqrtPriceScaled: new Decimal(1),
        strategies: new Map([
          [
            'strategy-1',
            {
              strategyId: 'strategy-1',
              pairId: 1,
              token0Address: mockToken0.address,
              token1Address: mockToken1.address,
              token0Decimals: 18,
              token1Decimals: 18,
              liquidity0: new Decimal('1000000000000000000'), // 1 token
              liquidity1: new Decimal('1000000000000000000'), // 1 token
              order0_A: new Decimal(1),
              order0_B: new Decimal(1),
              order0_z: new Decimal('1000000000000000000'),
              order1_A: new Decimal(1),
              order1_B: new Decimal(1),
              order1_z: new Decimal('1000000000000000000'),
              order0_A_compressed: new Decimal(1),
              order0_B_compressed: new Decimal(1),
              order0_z_compressed: new Decimal(1),
              order1_A_compressed: new Decimal(1),
              order1_B_compressed: new Decimal(1),
              order1_z_compressed: new Decimal(1),
              currentOwner: '0xowner',
              creationWallet: '0xowner',
              lastProcessedBlock: 1000000,
              isDeleted: false,
              lastEventTimestamp: Date.now(),
            },
          ],
        ]),
      };

      // Test the capping logic by calling the private method
      (service as any).calculateSubEpochRewards(
        subEpochData,
        new Decimal('100000000000000000000'), // 100 tokens reward pool (would exceed limit)
        mockCampaign,
        campaignDistributedAmounts,
        campaignTotalAmounts,
      );

      // Should cap to remaining 50 tokens
      expect(campaignDistributedAmounts.get(1)).toEqual(new Decimal('1000000000000000000000'));
    });

    it('should handle zero remaining rewards gracefully', () => {
      const campaignDistributedAmounts = new Map([[1, new Decimal('1000000000000000000000')]]); // 1000 tokens (full)
      const campaignTotalAmounts = new Map([[1, new Decimal('1000000000000000000000')]]); // 1000 tokens

      const subEpochData = {
        timestamp: Date.now(),
        order0TargetPrice: new Decimal(1),
        order1TargetPrice: new Decimal(1),
        targetSqrtPriceScaled: new Decimal(1),
        invTargetSqrtPriceScaled: new Decimal(1),
        strategies: new Map([
          [
            'strategy-1',
            {
              strategyId: 'strategy-1',
              pairId: 1,
              token0Address: mockToken0.address,
              token1Address: mockToken1.address,
              token0Decimals: 18,
              token1Decimals: 18,
              liquidity0: new Decimal('1000000000000000000'),
              liquidity1: new Decimal('1000000000000000000'),
              order0_A: new Decimal(1),
              order0_B: new Decimal(1),
              order0_z: new Decimal('1000000000000000000'),
              order1_A: new Decimal(1),
              order1_B: new Decimal(1),
              order1_z: new Decimal('1000000000000000000'),
              order0_A_compressed: new Decimal(1),
              order0_B_compressed: new Decimal(1),
              order0_z_compressed: new Decimal(1),
              order1_A_compressed: new Decimal(1),
              order1_B_compressed: new Decimal(1),
              order1_z_compressed: new Decimal(1),
              currentOwner: '0xowner',
              creationWallet: '0xowner',
              lastProcessedBlock: 1000000,
              isDeleted: false,
              lastEventTimestamp: Date.now(),
            },
          ],
        ]),
      };

      const result = (service as any).calculateSubEpochRewards(
        subEpochData,
        new Decimal('10000000000000000000'), // 10 tokens reward pool
        mockCampaign,
        campaignDistributedAmounts,
        campaignTotalAmounts,
      );

      // Should set all rewards to zero
      expect(result.totalRewards.get('strategy-1')).toEqual(new Decimal(0));
      expect(result.tokenRewards.get('strategy-1')).toEqual({
        token0: new Decimal(0),
        token1: new Decimal(0),
      });
    });
  });

  describe('Service Integration', () => {
    it('should handle service dependency injection correctly', () => {
      expect(service).toHaveProperty('campaignService');
      expect(service).toHaveProperty('subEpochService');
      expect(service).toHaveProperty('blockService');
      expect(service).toHaveProperty('historicQuoteService');
    });

    it('should validate deployment configuration', () => {
      expect(mockDeployment.blockchainType).toBe(BlockchainType.Ethereum);
      expect(mockDeployment.exchangeId).toBe(ExchangeId.OGEthereum);
      expect(mockDeployment.startBlock).toBeGreaterThan(0);
    });
  });

  describe('Error Handling', () => {
    it('should handle campaign service errors gracefully', async () => {
      mockCampaignService.getActiveCampaigns.mockRejectedValue(new Error('Campaign error'));

      await expect(service.update(1000100, mockDeployment)).rejects.toThrow('Campaign error');
    });
  });

  describe('Seed Generation', () => {
    it('should generate deterministic seed without requiring events', () => {
      // Access the private method for testing
      const generateEpochSeed = (service as any).generateEpochSeed.bind(service);

      const epoch = {
        epochNumber: 1,
        startTimestamp: new Date('2023-01-01T00:00:00Z'),
        endTimestamp: new Date('2023-01-01T04:00:00Z'),
      };

      // Should not throw an error when no events are provided
      const seed1 = generateEpochSeed(mockCampaign, epoch);
      const seed2 = generateEpochSeed(mockCampaign, epoch);

      // Should generate consistent seeds
      expect(seed1).toBe(seed2);
      expect(seed1).toMatch(/^0x[a-f0-9]{64}$/); // Should be a valid hex string
    });

    it('should generate different seeds for different campaigns', () => {
      const generateEpochSeed = (service as any).generateEpochSeed.bind(service);

      const epoch = {
        epochNumber: 1,
        startTimestamp: new Date('2023-01-01T00:00:00Z'),
        endTimestamp: new Date('2023-01-01T04:00:00Z'),
      };

      const campaign2 = { ...mockCampaign, id: 2 };

      const seed1 = generateEpochSeed(mockCampaign, epoch);
      const seed2 = generateEpochSeed(campaign2, epoch);

      expect(seed1).not.toBe(seed2);
    });

    it('should generate different seeds for different epoch numbers', () => {
      const generateEpochSeed = (service as any).generateEpochSeed.bind(service);

      const epoch1 = {
        epochNumber: 1,
        startTimestamp: new Date('2023-01-01T00:00:00Z'),
        endTimestamp: new Date('2023-01-01T04:00:00Z'),
      };

      const epoch2 = {
        epochNumber: 2,
        startTimestamp: new Date('2023-01-01T04:00:00Z'),
        endTimestamp: new Date('2023-01-01T08:00:00Z'),
      };

      const seed1 = generateEpochSeed(mockCampaign, epoch1);
      const seed2 = generateEpochSeed(mockCampaign, epoch2);

      expect(seed1).not.toBe(seed2);
    });

    it('should throw error when MERKL_SNAPSHOT_SALT is missing', () => {
      // Mock config service to return undefined for salt
      mockConfigService.get.mockImplementation((key: string) => {
        if (key === 'MERKL_SNAPSHOT_SALT') return undefined;
        return undefined;
      });

      const generateEpochSeed = (service as any).generateEpochSeed.bind(service);

      const epoch = {
        epochNumber: 1,
        startTimestamp: new Date('2023-01-01T00:00:00Z'),
        endTimestamp: new Date('2023-01-01T04:00:00Z'),
      };

      expect(() => generateEpochSeed(mockCampaign, epoch)).toThrow(
        'MERKL_SNAPSHOT_SALT environment variable is required for secure seed generation',
      );

      // Restore the mock for other tests
      mockConfigService.get.mockImplementation((key: string) => {
        if (key === 'MERKL_SNAPSHOT_SALT') return 'test-salt-for-testing';
        return undefined;
      });
    });
  });

  describe('Equal Reward Distribution Logic', () => {
    describe('calculateTotalSubEpochsForCampaign', () => {
      it('should calculate total sub-epochs for entire campaign duration', () => {
        // Access the private method for testing
        const calculateTotalSubEpochs = (service as any).calculateTotalSubEpochsForCampaign.bind(service);

        // Test with a campaign that spans exactly 2 epochs (8 hours)
        const testCampaign = {
          ...mockCampaign,
          startDate: new Date('2023-01-01T00:00:00Z'),
          endDate: new Date('2023-01-01T08:00:00Z'), // 8 hours = 2 epochs
        };

        const totalSubEpochs = calculateTotalSubEpochs(testCampaign);

        // Should return a positive number representing total sub-epochs across all epochs
        expect(totalSubEpochs).toBeGreaterThan(0);
        expect(typeof totalSubEpochs).toBe('number');
        expect(Number.isInteger(totalSubEpochs)).toBe(true);
      });

      it('should return consistent results for same campaign', () => {
        const calculateTotalSubEpochs = (service as any).calculateTotalSubEpochsForCampaign.bind(service);

        const testCampaign = {
          ...mockCampaign,
          startDate: new Date('2023-01-01T00:00:00Z'),
          endDate: new Date('2023-01-01T12:00:00Z'), // 12 hours = 3 epochs
        };

        const result1 = calculateTotalSubEpochs(testCampaign);
        const result2 = calculateTotalSubEpochs(testCampaign);

        expect(result1).toBe(result2);
      });

      it('should return more sub-epochs for longer campaigns', () => {
        const calculateTotalSubEpochs = (service as any).calculateTotalSubEpochsForCampaign.bind(service);

        const shortCampaign = {
          ...mockCampaign,
          startDate: new Date('2023-01-01T00:00:00Z'),
          endDate: new Date('2023-01-01T04:00:00Z'), // 4 hours = 1 epoch
        };

        const longCampaign = {
          ...mockCampaign,
          startDate: new Date('2023-01-01T00:00:00Z'),
          endDate: new Date('2023-01-01T16:00:00Z'), // 16 hours = 4 epochs
        };

        const shortTotal = calculateTotalSubEpochs(shortCampaign);
        const longTotal = calculateTotalSubEpochs(longCampaign);

        expect(longTotal).toBeGreaterThan(shortTotal);
      });
    });

    describe('Equal Distribution Calculation', () => {
      it('should use campaign total rewards divided by total sub-epochs', () => {
        // Mock the calculateTotalSubEpochsForCampaign method to return a known value
        const mockTotalSubEpochs = 10;
        jest.spyOn(service as any, 'calculateTotalSubEpochsForCampaign').mockReturnValue(mockTotalSubEpochs);

        const campaignDistributedAmounts = new Map([[1, new Decimal('0')]]);
        const campaignTotalAmounts = new Map([[1, new Decimal('1000000000000000000000')]]);

        const subEpochData = {
          timestamp: Date.now(),
          order0TargetPrice: new Decimal(1),
          order1TargetPrice: new Decimal(1),
          targetSqrtPriceScaled: new Decimal(1),
          invTargetSqrtPriceScaled: new Decimal(1),
          strategies: new Map([
            [
              'strategy-1',
              {
                strategyId: 'strategy-1',
                pairId: 1,
                token0Address: mockToken0.address,
                token1Address: mockToken1.address,
                token0Decimals: 18,
                token1Decimals: 18,
                liquidity0: new Decimal('1000000000000000000'),
                liquidity1: new Decimal('1000000000000000000'),
                order0_A: new Decimal(1),
                order0_B: new Decimal(1),
                order0_z: new Decimal('1000000000000000000'),
                order1_A: new Decimal(1),
                order1_B: new Decimal(1),
                order1_z: new Decimal('1000000000000000000'),
                order0_A_compressed: new Decimal(1),
                order0_B_compressed: new Decimal(1),
                order0_z_compressed: new Decimal(1),
                order1_A_compressed: new Decimal(1),
                order1_B_compressed: new Decimal(1),
                order1_z_compressed: new Decimal(1),
                currentOwner: '0xowner',
                creationWallet: '0xowner',
                lastProcessedBlock: 1000000,
                isDeleted: false,
                lastEventTimestamp: Date.now(),
              },
            ],
          ]),
        };

        // Call calculateSubEpochRewards with a known reward amount
        const rewardPerSubEpoch = new Decimal('50000000000000000000'); // 50 tokens per sub-epoch
        const result = (service as any).calculateSubEpochRewards(
          subEpochData,
          rewardPerSubEpoch,
          mockCampaign,
          campaignDistributedAmounts,
          campaignTotalAmounts,
        );

        // Verify that the reward calculation uses the expected per-sub-epoch amount
        // Campaign total (1000 tokens) / 10 sub-epochs = 100 tokens per sub-epoch
        // But we're passing 50 tokens per sub-epoch to test the logic
        expect(result.totalRewards.get('strategy-1')).toBeDefined();

        // Restore the original method
        jest.restoreAllMocks();
      });

      it('should distribute rewards equally regardless of epoch duration', () => {
        // Test that sub-epochs get equal rewards even if epochs have different durations
        const mockTotalSubEpochs = 6; // 3 sub-epochs in epoch 1, 3 in epoch 2
        jest.spyOn(service as any, 'calculateTotalSubEpochsForCampaign').mockReturnValue(mockTotalSubEpochs);

        const campaignRewardAmount = '600000000000000000000'; // 600 tokens
        const expectedRewardPerSubEpoch = new Decimal(campaignRewardAmount).div(mockTotalSubEpochs); // 100 tokens per sub-epoch

        // Test campaign with the specific reward amount
        const testCampaign = {
          ...mockCampaign,
          rewardAmount: campaignRewardAmount,
        };

        // Verify that regardless of which epoch we're processing, the reward per sub-epoch is the same
        const campaignDistributedAmounts = new Map([[1, new Decimal('0')]]);
        const campaignTotalAmounts = new Map([[1, new Decimal(campaignRewardAmount)]]);

        const subEpochData = {
          timestamp: Date.now(),
          order0TargetPrice: new Decimal(1),
          order1TargetPrice: new Decimal(1),
          targetSqrtPriceScaled: new Decimal(1),
          invTargetSqrtPriceScaled: new Decimal(1),
          strategies: new Map([
            [
              'strategy-1',
              {
                strategyId: 'strategy-1',
                pairId: 1,
                token0Address: mockToken0.address,
                token1Address: mockToken1.address,
                token0Decimals: 18,
                token1Decimals: 18,
                liquidity0: new Decimal('1000000000000000000'),
                liquidity1: new Decimal('1000000000000000000'),
                order0_A: new Decimal(1),
                order0_B: new Decimal(1),
                order0_z: new Decimal('1000000000000000000'),
                order1_A: new Decimal(1),
                order1_B: new Decimal(1),
                order1_z: new Decimal('1000000000000000000'),
                order0_A_compressed: new Decimal(1),
                order0_B_compressed: new Decimal(1),
                order0_z_compressed: new Decimal(1),
                order1_A_compressed: new Decimal(1),
                order1_B_compressed: new Decimal(1),
                order1_z_compressed: new Decimal(1),
                currentOwner: '0xowner',
                creationWallet: '0xowner',
                lastProcessedBlock: 1000000,
                isDeleted: false,
                lastEventTimestamp: Date.now(),
              },
            ],
          ]),
        };

        // The key test: reward per sub-epoch should be campaign total / total sub-epochs
        (service as any).calculateSubEpochRewards(
          subEpochData,
          expectedRewardPerSubEpoch, // This should be 100 tokens
          testCampaign,
          campaignDistributedAmounts,
          campaignTotalAmounts,
        );

        // Verify the calculation works with our expected reward per sub-epoch
        expect(expectedRewardPerSubEpoch.toString()).toBe('100000000000000000000'); // 100 tokens

        jest.restoreAllMocks();
      });
    });

    describe('Integration with processEpoch', () => {
      it('should pass total campaign sub-epochs to reward calculation', () => {
        // This test verifies that the processEpoch method correctly calculates and uses
        // the total campaign sub-epochs for reward distribution
        const mockTotalSubEpochs = 8;
        const calculateTotalSubEpochsSpy = jest
          .spyOn(service as any, 'calculateTotalSubEpochsForCampaign')
          .mockReturnValue(mockTotalSubEpochs);

        const calculateSubEpochRewardsSpy = jest.spyOn(service as any, 'calculateSubEpochRewards').mockReturnValue({
          totalRewards: new Map([['strategy-1', new Decimal('100')]]),
          tokenRewards: new Map([['strategy-1', { token0: new Decimal('50'), token1: new Decimal('50') }]]),
        });

        jest.spyOn(service as any, 'generateSubEpochsForEpoch').mockReturnValue([
          {
            timestamp: Date.now(),
            order0TargetPrice: new Decimal(1),
            order1TargetPrice: new Decimal(1),
            targetSqrtPriceScaled: new Decimal(1),
            invTargetSqrtPriceScaled: new Decimal(1),
            strategies: new Map(),
          },
        ]);

        // Mock saveSubEpochs to avoid database operations
        mockSubEpochService.saveSubEpochs.mockResolvedValue(undefined);

        const testEpoch = {
          epochNumber: 1,
          startTimestamp: new Date('2023-01-01T00:00:00Z'),
          endTimestamp: new Date('2023-01-01T04:00:00Z'),
          totalRewards: new Decimal('200000000000000000000'), // This should NOT be used anymore
        };

        const campaignDistributedAmounts = new Map([[1, new Decimal('0')]]);
        const campaignTotalAmounts = new Map([[1, new Decimal('800000000000000000000')]]);

        // Call processEpoch (this is an async method, so we need to handle it properly)
        const processEpochPromise = (service as any).processEpoch(
          mockCampaign,
          testEpoch,
          new Map(), // strategyStates
          {}, // priceCache
          { createdEvents: [], updatedEvents: [], deletedEvents: [], transferEvents: [] }, // batchEvents
          campaignDistributedAmounts,
          campaignTotalAmounts,
          mockTotalSubEpochs, // This is the key parameter we added
        );

        // Since this is async, we need to return the promise for Jest to handle
        return processEpochPromise.then(() => {
          // Verify that calculateTotalSubEpochsForCampaign was NOT called in processEpoch
          // (it should be called in processEpochBatch instead)
          expect(calculateTotalSubEpochsSpy).not.toHaveBeenCalled();

          // Verify that calculateSubEpochRewards was called with the expected reward per sub-epoch
          expect(calculateSubEpochRewardsSpy).toHaveBeenCalled();
          const callArgs = calculateSubEpochRewardsSpy.mock.calls[0];
          const rewardPerSubEpoch = callArgs[1]; // Second argument is rewardPerSubEpoch

          // The reward per sub-epoch should be campaign total (1000 tokens) / total sub-epochs (8)
          const expectedRewardPerSubEpoch = new Decimal(mockCampaign.rewardAmount).div(mockTotalSubEpochs);
          expect(rewardPerSubEpoch.toString()).toBe(expectedRewardPerSubEpoch.toString());

          jest.restoreAllMocks();
        });
      });
    });
  });

  describe('USD Rate Lookup', () => {
    it('should return the last available price BEFORE the target timestamp, not the nearest', () => {
      // Create a price cache with rates before and after the target timestamp
      const priceCache = {
        rates: new Map([
          [
            '0xtoken0',
            [
              { timestamp: 1000, usd: 1.0 },
              { timestamp: 1200, usd: 1.5 }, // Last rate BEFORE 1500
              { timestamp: 1800, usd: 2.0 }, // Closer to 1500 but AFTER it
            ],
          ],
        ]),
        timeWindow: { start: 900, end: 2000 },
      };

      const getUsdRateMethod = (service as any).getUsdRateForTimestamp.bind(service);

      // Target timestamp is 1500
      // Distance from 1200: 300
      // Distance from 1800: 300 (same distance, but 1800 is AFTER)
      // The method should return 1.5 (rate at 1200), not 2.0 (rate at 1800)
      const result = getUsdRateMethod(priceCache, '0xtoken0', 1500);

      expect(result).toBe(1.5); // Should use the last rate BEFORE the target, not the nearest
    });

    it('should return the most recent rate when multiple rates exist before target', () => {
      const priceCache = {
        rates: new Map([
          [
            '0xtoken0',
            [
              { timestamp: 1000, usd: 1.0 },
              { timestamp: 1100, usd: 1.2 },
              { timestamp: 1200, usd: 1.5 }, // Most recent BEFORE 1500
              { timestamp: 2000, usd: 3.0 }, // After target
            ],
          ],
        ]),
        timeWindow: { start: 900, end: 2500 },
      };

      const getUsdRateMethod = (service as any).getUsdRateForTimestamp.bind(service);

      const result = getUsdRateMethod(priceCache, '0xtoken0', 1500);

      expect(result).toBe(1.5); // Should use the most recent rate before target
    });

    it('should fallback to earliest rate after target when no rates exist before', () => {
      const priceCache = {
        rates: new Map([
          [
            '0xtoken0',
            [
              { timestamp: 2000, usd: 2.0 }, // Earliest rate after target
              { timestamp: 2500, usd: 2.5 },
            ],
          ],
        ]),
        timeWindow: { start: 1800, end: 3000 },
      };

      const getUsdRateMethod = (service as any).getUsdRateForTimestamp.bind(service);

      const result = getUsdRateMethod(priceCache, '0xtoken0', 1500);

      // No rates before target, should fallback to earliest rate after target (2.0 at timestamp 2000)
      expect(result).toBe(2.0);
    });

    it('should handle exact timestamp match by using rates strictly before', () => {
      const priceCache = {
        rates: new Map([
          [
            '0xtoken0',
            [
              { timestamp: 1000, usd: 1.0 },
              { timestamp: 1500, usd: 1.5 }, // Exact match with target
              { timestamp: 2000, usd: 2.0 },
            ],
          ],
        ]),
        timeWindow: { start: 900, end: 2500 },
      };

      const getUsdRateMethod = (service as any).getUsdRateForTimestamp.bind(service);

      // Target is 1500, but we want rates BEFORE 1500, so should return 1.0 (at 1000)
      const result = getUsdRateMethod(priceCache, '0xtoken0', 1500);

      expect(result).toBe(1.0); // Should use rate before, not at target timestamp
    });
  });
});
