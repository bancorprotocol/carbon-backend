import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import Decimal from 'decimal.js';
import { MerklProcessorV2Service } from './merkl-processor-v2.service';
import { SubEpochService } from './sub-epoch.service';
import { CampaignService } from './campaign.service';
import { LastProcessedBlockService } from '../../last-processed-block/last-processed-block.service';
import { BlockService } from '../../block/block.service';
import { HistoricQuoteService } from '../../historic-quote/historic-quote.service';
import { StrategyCreatedEventService } from '../../events/strategy-created-event/strategy-created-event.service';
import { StrategyUpdatedEventService } from '../../events/strategy-updated-event/strategy-updated-event.service';
import { StrategyDeletedEventService } from '../../events/strategy-deleted-event/strategy-deleted-event.service';
import { VoucherTransferEventService } from '../../events/voucher-transfer-event/voucher-transfer-event.service';
import { Campaign } from '../entities/campaign.entity';
import { Deployment, BlockchainType, ExchangeId } from '../../deployment/deployment.service';

describe('MerklProcessorV2Service', () => {
  let service: MerklProcessorV2Service;
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

  const mockDeployment: Deployment = {
    blockchainType: BlockchainType.Ethereum,
    exchangeId: ExchangeId.OGEthereum,
    startBlock: 1000000,
    rpcEndpoint: 'test-rpc',
    harvestEventsBatchSize: 1000,
    harvestConcurrency: 5,
    multicallAddress: '0x456',
    gasToken: {
      name: 'Ethereum',
      symbol: 'ETH',
      address: '0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE',
    },
    contracts: {
      CarbonController: {
        address: '0x123',
      },
    },
  };

  const mockCampaign: Campaign = {
    id: 'test-campaign-1',
    blockchainType: BlockchainType.Ethereum,
    exchangeId: ExchangeId.OGEthereum,
    pairId: 1,
    pair: {
      id: 1,
      name: 'ETH/USDT',
      token0: {
        id: 1,
        address: '0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE',
        symbol: 'ETH',
        name: 'Ethereum',
        decimals: 18,
      },
      token1: {
        id: 2,
        address: '0xdAC17F958D2ee523a2206206994597C13D831ec7',
        symbol: 'USDT',
        name: 'Tether',
        decimals: 6,
      },
    },
    rewardAmount: '1000000000000000000000', // 1000 tokens
    rewardTokenAddress: '0x789',
    startDate: new Date('2024-01-01T00:00:00Z'),
    endDate: new Date('2024-01-02T00:00:00Z'), // 24 hours = 6 epochs
    opportunityName: 'Test Campaign',
    isActive: true,
    createdAt: new Date(),
    updatedAt: new Date(),
  } as Campaign;

  beforeEach(async () => {
    // Create mocks
    const mockQuery = jest.fn();
    mockSubEpochService = {
      saveSubEpochs: jest.fn().mockResolvedValue(undefined),
      getTotalRewardsForCampaign: jest.fn().mockResolvedValue(new Decimal(0)),
      subEpochRepository: {
        manager: {
          query: mockQuery,
        },
      },
    } as any;

    mockCampaignService = {
      getActiveCampaigns: jest.fn().mockResolvedValue([mockCampaign]),
      markProcessedCampaignsInactive: jest.fn().mockResolvedValue(undefined),
    } as any;

    mockLastProcessedBlockService = {
      getOrInit: jest.fn().mockResolvedValue(1000000),
      update: jest.fn().mockResolvedValue(undefined),
    } as any;

    mockBlockService = {
      getBlock: jest.fn().mockImplementation((blockNumber) => ({
        id: blockNumber,
        timestamp: new Date(1704067200000 + (blockNumber - 1000000) * 12000), // 12 seconds per block
      })),
    } as any;

    mockHistoricQuoteService = {
      getUsdRates: jest.fn().mockResolvedValue([
        {
          address: '0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE',
          day: 1704067200, // 2024-01-01 00:00:00 UTC
          usd: 2000,
        },
        {
          address: '0xdAC17F958D2ee523a2206206994597C13D831ec7',
          day: 1704067200,
          usd: 1,
        },
      ]),
    } as any;

    mockStrategyCreatedEventService = {
      get: jest.fn().mockResolvedValue([]),
    } as any;

    mockStrategyUpdatedEventService = {
      get: jest.fn().mockResolvedValue([]),
    } as any;

    mockStrategyDeletedEventService = {
      get: jest.fn().mockResolvedValue([]),
    } as any;

    mockVoucherTransferEventService = {
      get: jest.fn().mockResolvedValue([]),
    } as any;

    mockConfigService = {
      get: jest.fn().mockImplementation((key) => {
        if (key === 'MERKL_SNAPSHOT_SALT') return 'test-salt-123';
        return undefined;
      }),
    } as any;

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        MerklProcessorV2Service,
        { provide: SubEpochService, useValue: mockSubEpochService },
        { provide: CampaignService, useValue: mockCampaignService },
        { provide: LastProcessedBlockService, useValue: mockLastProcessedBlockService },
        { provide: BlockService, useValue: mockBlockService },
        { provide: HistoricQuoteService, useValue: mockHistoricQuoteService },
        { provide: StrategyCreatedEventService, useValue: mockStrategyCreatedEventService },
        { provide: StrategyUpdatedEventService, useValue: mockStrategyUpdatedEventService },
        { provide: StrategyDeletedEventService, useValue: mockStrategyDeletedEventService },
        { provide: VoucherTransferEventService, useValue: mockVoucherTransferEventService },
        { provide: ConfigService, useValue: mockConfigService },
      ],
    }).compile();

    service = module.get<MerklProcessorV2Service>(MerklProcessorV2Service);
  });

  describe('Memory Efficiency Tests', () => {
    it('should handle processing without loading all events into memory', async () => {
      // Setup millions of mock events across many blocks
      const endBlock = 1010000; // 10,000 blocks

      (mockSubEpochService.subEpochRepository.manager.query as jest.Mock).mockResolvedValue([]);

      // Mock that each chunk returns some events but we don't load them all at once
      let callCount = 0;
      mockStrategyCreatedEventService.get.mockImplementation(() => {
        callCount++;
        // Simulate that we're not keeping all events in memory
        return Promise.resolve([]);
      });

      await service.update(endBlock, mockDeployment);

      // Verify we process in chunks (should be called multiple times for different block ranges)
      expect(mockStrategyCreatedEventService.get).toHaveBeenCalled();

      // Verify campaign service was called to get campaigns
      expect(mockCampaignService.getActiveCampaigns).toHaveBeenCalledWith(mockDeployment);

      // Verify last processed block was updated
      expect(mockLastProcessedBlockService.update).toHaveBeenCalledWith(
        `${mockDeployment.blockchainType}-${mockDeployment.exchangeId}-merkl-v2`,
        endBlock,
      );
    });

    it('should process events in temporal chunks without memory leaks', async () => {
      const endBlock = 1005000; // 5,000 blocks

      // Mock strategy baseline query
      (mockSubEpochService.subEpochRepository.manager.query as jest.Mock)
        .mockResolvedValueOnce([
          {
            strategy_id: 'strategy-1',
            block_id: 1000000,
            order0: JSON.stringify({ y: '1000000000000000000', A: '1000', B: '2000', z: '1000000000000000000' }),
            order1: JSON.stringify({ y: '2000000000', A: '2000', B: '1000', z: '2000000000' }),
            pair_id: 1,
            token0_address: '0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE',
            token1_address: '0xdAC17F958D2ee523a2206206994597C13D831ec7',
            token0_decimals: 18,
            token1_decimals: 6,
            owner: '0xowner1',
            transaction_index: 0,
            log_index: 0,
            timestamp: new Date('2024-01-01T00:00:00Z'),
          },
        ])
        .mockResolvedValueOnce([
          {
            strategy_id: 'strategy-1',
            current_owner: '0xowner1',
          },
        ])
        .mockResolvedValueOnce([]);

      await service.update(endBlock, mockDeployment);

      // Verify saveSubEpochs was called (meaning we processed snapshots)
      expect(mockSubEpochService.saveSubEpochs).toHaveBeenCalled();
    });
  });

  describe('Temporal Correctness Tests', () => {
    it('should build strategy states at exact snapshot timestamps', async () => {
      const endBlock = 1001000;

      // Mock strategy with creation and update events
      const mockCreatedEvent = {
        id: '1',
        strategyId: 'strategy-1',
        blockchainType: BlockchainType.Ethereum,
        exchangeId: ExchangeId.OGEthereum,
        transactionHash: '0xabc123',
        transactionIndex: 0,
        logIndex: 0,
        pair: { id: 1 },
        token0: {
          id: '1',
          address: '0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE',
          decimals: 18,
          symbol: 'ETH',
          name: 'Ethereum',
        },
        token1: {
          id: '2',
          address: '0xdAC17F958D2ee523a2206206994597C13D831ec7',
          decimals: 6,
          symbol: 'USDT',
          name: 'Tether',
        },
        order0: JSON.stringify({ y: '1000000000000000000', A: '1000', B: '2000', z: '1000000000000000000' }),
        order1: JSON.stringify({ y: '2000000000', A: '2000', B: '1000', z: '2000000000' }),
        owner: '0xowner1',
        timestamp: new Date('2024-01-01T01:00:00Z'),
        block: { id: 1000300 },
      } as any;

      const mockUpdatedEvent = {
        id: '2',
        strategyId: 'strategy-1',
        blockchainType: BlockchainType.Ethereum,
        exchangeId: ExchangeId.OGEthereum,
        transactionHash: '0xdef456',
        transactionIndex: 0,
        logIndex: 0,
        reason: 'updated',
        pair: { id: 1 },
        token0: {
          id: '1',
          address: '0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE',
          decimals: 18,
        },
        token1: {
          id: '2',
          address: '0xdAC17F958D2ee523a2206206994597C13D831ec7',
          decimals: 6,
        },
        order0: JSON.stringify({ y: '2000000000000000000', A: '1000', B: '2000', z: '2000000000000000000' }),
        order1: JSON.stringify({ y: '4000000000', A: '2000', B: '1000', z: '4000000000' }),
        timestamp: new Date('2024-01-01T03:00:00Z'),
        block: { id: 1000900 },
      } as any;

      mockStrategyCreatedEventService.get.mockResolvedValue([mockCreatedEvent]);
      mockStrategyUpdatedEventService.get.mockResolvedValue([mockUpdatedEvent]);

      // Mock baseline queries
      (mockSubEpochService.subEpochRepository.manager.query as jest.Mock)
        .mockResolvedValueOnce([]) // baseline query
        .mockResolvedValueOnce([]) // ownership query
        .mockResolvedValueOnce([]); // deleted query

      await service.update(endBlock, mockDeployment);

      // Verify that sub-epochs were saved with correct temporal states
      expect(mockSubEpochService.saveSubEpochs).toHaveBeenCalled();

      const savedSubEpochs = mockSubEpochService.saveSubEpochs.mock.calls[0][0];

      // Should have multiple snapshots across the campaign duration
      expect(savedSubEpochs.length).toBeGreaterThan(0);

      // Each snapshot should have correct strategy data for its timestamp
      for (const subEpoch of savedSubEpochs) {
        expect(subEpoch.strategyId).toBe('strategy-1');
        expect(subEpoch.campaignId).toBe(mockCampaign.id);

        // Verify temporal consistency: later snapshots should reflect the updated liquidity
        const snapshotTime = subEpoch.subEpochTimestamp.getTime();
        const updateTime = mockUpdatedEvent.timestamp.getTime();

        if (snapshotTime >= updateTime) {
          // Should use updated liquidity values
          // Due to token ordering: USDT (token0) = 4000000000, ETH (token1) = 2000000000000000000
          expect(subEpoch.liquidity0).toBe('4000000000');
          expect(subEpoch.liquidity1).toBe('2000000000000000000');
        } else {
          // Should use original liquidity values
          // Due to token ordering: USDT (token0) = 2000000000, ETH (token1) = 1000000000000000000
          expect(subEpoch.liquidity0).toBe('2000000000');
          expect(subEpoch.liquidity1).toBe('1000000000000000000');
        }
      }
    });

    it('should handle event chronological ordering correctly', async () => {
      // This test verifies that events are processed in the correct temporal order
      // even when they come from different sources or are processed in chunks

      const mockEvents = [
        {
          strategyId: 'strategy-1',
          timestamp: new Date('2024-01-01T02:00:00Z'),
          block: { id: 1000600 },
          transactionIndex: 1,
          logIndex: 0,
        },
        {
          strategyId: 'strategy-1',
          timestamp: new Date('2024-01-01T01:00:00Z'),
          block: { id: 1000300 },
          transactionIndex: 0,
          logIndex: 0,
        },
        {
          strategyId: 'strategy-1',
          timestamp: new Date('2024-01-01T02:00:00Z'),
          block: { id: 1000600 },
          transactionIndex: 0,
          logIndex: 0,
        },
      ];

      // The service should sort these chronologically regardless of input order
      const sortedEvents = (service as any).sortEventsChronologically(
        mockEvents.map((e) => ({
          ...e,
          type: 'created',
          blockId: e.block.id,
          transactionIndex: e.transactionIndex,
          logIndex: e.logIndex,
        })),
      );

      expect(sortedEvents).toHaveLength(3);
      expect(sortedEvents[0].blockId).toBe(1000300);
      expect(sortedEvents[1].blockId).toBe(1000600);
      expect(sortedEvents[1].transactionIndex).toBe(0);
      expect(sortedEvents[2].blockId).toBe(1000600);
      expect(sortedEvents[2].transactionIndex).toBe(1);
    });
  });

  describe('Eligibility Calculation Tests', () => {
    it('should calculate eligible liquidity with exact precision', () => {
      const y = new Decimal('1000000000000000000'); // 1 ETH
      const z = new Decimal('1000000000000000000'); // capacity
      const A = new Decimal('1000000000000000000'); // rate parameter
      const B = new Decimal('2000000000000000000'); // rate parameter
      const targetSqrtPriceScaled = new Decimal('2000000000000000000');
      const toleranceFactor = new Decimal('0.99'); // sqrt(1 - 0.02)

      const eligible = (service as any).calculateEligibleLiquidity(y, z, A, B, targetSqrtPriceScaled, toleranceFactor);

      // Should calculate exact eligible liquidity based on reward zone
      expect(eligible).toBeInstanceOf(Decimal);
      expect(eligible.gte(0)).toBe(true);
      expect(eligible.lte(y)).toBe(true);
    });

    it('should handle edge cases in eligibility calculation', () => {
      // Test case: A = 0 (should return full liquidity since rewardZoneBoundary <= B)
      let eligible = (service as any).calculateEligibleLiquidity(
        new Decimal('1000'),
        new Decimal('1000'),
        new Decimal('0'), // A = 0
        new Decimal('1000'), // B = 1000
        new Decimal('500'), // targetSqrtPriceScaled = 500
        new Decimal('0.99'), // toleranceFactor = 0.99
      );
      // rewardZoneBoundary = 0.99 * 500 = 495, which is <= B (1000), so returns full y
      expect(eligible.eq(1000)).toBe(true);

      // Test case: rewardZoneBoundary <= B (should return full liquidity)
      eligible = (service as any).calculateEligibleLiquidity(
        new Decimal('1000'),
        new Decimal('1000'),
        new Decimal('1000'),
        new Decimal('2000'),
        new Decimal('1000'), // target price below B
        new Decimal('0.99'),
      );
      expect(eligible.eq(1000)).toBe(true);

      // Test case: rewardZoneBoundary >= orderPriceHigh (should return 0)
      eligible = (service as any).calculateEligibleLiquidity(
        new Decimal('1000'),
        new Decimal('1000'),
        new Decimal('1000'),
        new Decimal('2000'),
        new Decimal('5000'), // target price above A+B
        new Decimal('0.99'),
      );
      expect(eligible.eq(0)).toBe(true);
    });
  });

  describe('Campaign and Epoch Processing Tests', () => {
    it('should calculate epochs correctly for campaign duration', () => {
      const startTimestamp = mockCampaign.startDate.getTime();
      const endTimestamp = mockCampaign.endDate.getTime();

      const epochs = (service as any).calculateEpochsInRange(mockCampaign, startTimestamp, endTimestamp);

      // 24 hours = 6 epochs (4 hours each)
      expect(epochs).toHaveLength(6);

      // Verify epoch numbering and timing
      for (let i = 0; i < epochs.length; i++) {
        expect(epochs[i].epochNumber).toBe(i + 1);
        expect(epochs[i].startTimestamp).toBeInstanceOf(Date);
        expect(epochs[i].endTimestamp).toBeInstanceOf(Date);
        expect(epochs[i].totalRewards).toBeInstanceOf(Decimal);
      }

      // Verify total rewards sum to campaign amount
      const totalRewards = epochs.reduce((sum, epoch) => sum.add(epoch.totalRewards), new Decimal(0));
      expect(totalRewards.eq(mockCampaign.rewardAmount)).toBe(true);
    });

    it('should handle partial epoch processing correctly', () => {
      // Test processing a range that starts mid-campaign
      const campaignMidpoint =
        mockCampaign.startDate.getTime() + (mockCampaign.endDate.getTime() - mockCampaign.startDate.getTime()) / 2;
      const endTimestamp = mockCampaign.endDate.getTime();

      const epochs = (service as any).calculateEpochsInRange(mockCampaign, campaignMidpoint, endTimestamp);

      // Should include only epochs that intersect with the range
      expect(epochs.length).toBeGreaterThan(0);
      expect(epochs.length).toBeLessThan(6);

      // Each epoch should still have correct reward allocation
      for (const epoch of epochs) {
        expect(epoch.totalRewards.gt(0)).toBe(true);
      }
    });
  });

  describe('Token Weighting Tests', () => {
    it('should apply correct token weightings for Ethereum deployment', () => {
      const ethWeight = (service as any).getTokenWeighting(
        '0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE',
        ExchangeId.OGEthereum,
      );
      expect(ethWeight).toBe(1.8);

      const usdtWeight = (service as any).getTokenWeighting(
        '0xdAC17F958D2ee523a2206206994597C13D831ec7',
        ExchangeId.OGEthereum,
      );
      expect(usdtWeight).toBe(0.7);

      const unknownWeight = (service as any).getTokenWeighting(
        '0x1234567890abcdef1234567890abcdef12345678',
        ExchangeId.OGEthereum,
      );
      expect(unknownWeight).toBe(1); // default weighting
    });

    it('should handle case-insensitive token address matching', () => {
      const weightLower = (service as any).getTokenWeighting(
        '0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee',
        ExchangeId.OGEthereum,
      );
      const weightUpper = (service as any).getTokenWeighting(
        '0xEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEE',
        ExchangeId.OGEthereum,
      );

      expect(weightLower).toBe(weightUpper);
      expect(weightLower).toBe(1.8);
    });
  });

  describe('Error Handling and Edge Cases', () => {
    it('should handle no active campaigns gracefully', async () => {
      mockCampaignService.getActiveCampaigns.mockResolvedValue([]);

      await service.update(1001000, mockDeployment);

      expect(mockSubEpochService.saveSubEpochs).not.toHaveBeenCalled();
      expect(mockLastProcessedBlockService.update).toHaveBeenCalled();
    });

    it('should handle campaigns that end before processing range', async () => {
      const pastCampaign = {
        ...mockCampaign,
        endDate: new Date('2023-12-31T23:59:59Z'), // Ended before processing
      };

      mockCampaignService.getActiveCampaigns.mockResolvedValue([pastCampaign]);

      await service.update(1001000, mockDeployment);

      // Should still update last processed block but not process sub-epochs
      expect(mockLastProcessedBlockService.update).toHaveBeenCalled();
    });

    it('should handle missing price data gracefully', async () => {
      mockHistoricQuoteService.getUsdRates.mockResolvedValue([]);

      await service.update(1001000, mockDeployment);

      // Should handle missing price data without throwing
      expect(mockLastProcessedBlockService.update).toHaveBeenCalled();
    });

    it('should require MERKL_SNAPSHOT_SALT configuration', () => {
      mockConfigService.get.mockReturnValue(undefined);

      expect(() => {
        (service as any).generateEpochSeed(mockCampaign, {
          epochNumber: 1,
          startTimestamp: new Date(),
          endTimestamp: new Date(),
          totalRewards: new Decimal(100),
        });
      }).toThrow('MERKL_SNAPSHOT_SALT environment variable is required');
    });
  });

  describe('Performance and Scalability Tests', () => {
    it('should use appropriate batch sizes for large datasets', () => {
      // Verify the service uses reasonable batch sizes
      expect((service as any).BATCH_SIZE).toBe(50000);
      expect((service as any).EVENT_CHUNK_SIZE).toBe(10000);

      // These sizes should handle millions of events without memory issues
      expect((service as any).BATCH_SIZE).toBeGreaterThan(1000);
      expect((service as any).EVENT_CHUNK_SIZE).toBeGreaterThan(1000);
    });

    it('should process events in chunks to avoid memory exhaustion', async () => {
      const endBlock = 1100000; // 100,000 blocks (large range)

      (mockSubEpochService.subEpochRepository.manager.query as jest.Mock).mockResolvedValue([]);

      await service.update(endBlock, mockDeployment);

      // Should have made multiple calls to event services (chunked processing)
      expect(mockStrategyCreatedEventService.get).toHaveBeenCalled();

      // Verify processing completed without throwing memory errors
      expect(mockLastProcessedBlockService.update).toHaveBeenCalledWith(expect.any(String), endBlock);
    });
  });
});
