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
import { StrategyCreatedEvent } from '../../events/strategy-created-event/strategy-created-event.entity';
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
      const result = (service as any).calculateSubEpochRewards(
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
});
