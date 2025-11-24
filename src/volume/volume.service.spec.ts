import { Test, TestingModule } from '@nestjs/testing';
import { VolumeService } from './volume.service';
import { DataSource } from 'typeorm';
import { LastProcessedBlockService } from '../last-processed-block/last-processed-block.service';
import { HistoricQuoteService } from '../historic-quote/historic-quote.service';
import { Deployment, BlockchainType, ExchangeId } from '../deployment/deployment.service';
import { TokensByAddress } from '../token/token.service';
import { PairsDictionary } from '../pair/pair.service';

describe('VolumeService', () => {
  let service: VolumeService;
  let dataSource: jest.Mocked<DataSource>;
  let lastProcessedBlockService: LastProcessedBlockService;
  let historicQuoteService: jest.Mocked<HistoricQuoteService>;

  const mockDeployment: Deployment = {
    blockchainType: BlockchainType.Ethereum,
    exchangeId: ExchangeId.OGEthereum,
    rpcEndpoint: 'https://eth-mainnet.example.com',
    startBlock: 1000,
    harvestConcurrency: 5,
    harvestEventsBatchSize: 1000,
    harvestSleep: 0,
    multicallAddress: '0xMulticallAddress',
    gasToken: {
      name: 'Ethereum',
      symbol: 'ETH',
      address: '0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE',
    },
    contracts: {},
  };

  const mockTokens: TokensByAddress = {
    '0xToken1': {
      id: 1,
      address: '0xToken1',
      name: 'Token One',
      symbol: 'TKN1',
      decimals: 18,
    } as any,
    '0xToken2': {
      id: 2,
      address: '0xToken2',
      name: 'Token Two',
      symbol: 'TKN2',
      decimals: 18,
    } as any,
  };

  const mockPairs: PairsDictionary = {
    '0xToken1': {
      '0xToken2': {
        id: 1,
        token0: '0xToken1',
        token1: '0xToken2',
      } as any,
    },
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        VolumeService,
        {
          provide: DataSource,
          useValue: {
            query: jest.fn(),
          },
        },
        {
          provide: LastProcessedBlockService,
          useValue: {},
        },
        {
          provide: HistoricQuoteService,
          useValue: {
            getUsdRates: jest.fn(),
          },
        },
      ],
    }).compile();

    service = module.get<VolumeService>(VolumeService);
    dataSource = module.get(DataSource);
    lastProcessedBlockService = module.get(LastProcessedBlockService);
    historicQuoteService = module.get(HistoricQuoteService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('getVolume', () => {
    it('should get volume by tokens with addresses', async () => {
      const mockQueryResult = [
        {
          timestam: '2024-01-01 00:00:00',
          volume: '100',
          fees: '1',
          feeAddress: '0xToken1',
          feeSymbol: 'TKN1',
          targetAddress: '0xToken1',
          targetSymbol: 'TKN1',
        },
      ];

      const mockUsdRates = [
        { address: '0xToken1', usd: 1.5 },
        { address: '0xToken2', usd: 2.0 },
      ];

      dataSource.query.mockResolvedValue(mockQueryResult);
      historicQuoteService.getUsdRates.mockResolvedValue(mockUsdRates as any);

      const result = await service.getVolume(
        mockDeployment,
        {
          addresses: ['0xToken1'],
          start: 1704067200,
          end: 1704153600,
        },
        mockTokens,
      );

      expect(result).toBeDefined();
      expect(Array.isArray(result)).toBe(true);
      expect(dataSource.query).toHaveBeenCalled();
      expect(historicQuoteService.getUsdRates).toHaveBeenCalled();
    });

    it('should get volume by pairs', async () => {
      const mockQueryResult = [
        {
          timestam: '2024-01-01 00:00:00',
          volume: '100',
          fees: '1',
          feeAddress: '0xToken1',
          targetAddress: '0xToken2',
          pairId: 1,
        },
      ];

      const mockUsdRates = [
        { address: '0xToken1', usd: 1.5 },
        { address: '0xToken2', usd: 2.0 },
      ];

      dataSource.query.mockResolvedValue(mockQueryResult);
      historicQuoteService.getUsdRates.mockResolvedValue(mockUsdRates as any);

      const result = await service.getVolume(
        mockDeployment,
        {
          pairs: [{ token0: '0xToken1', token1: '0xToken2' }],
          start: 1704067200,
          end: 1704153600,
        },
        mockTokens,
        mockPairs,
      );

      expect(result).toBeDefined();
      expect(Array.isArray(result)).toBe(true);
    });

    it('should get total volume without addresses or pairs', async () => {
      const mockQueryResult = [
        {
          timestam: '2024-01-01 00:00:00',
          volume: '100',
          fees: '1',
          feeAddress: '0xToken1',
          feeSymbol: 'TKN1',
          targetAddress: '0xToken1',
          targetSymbol: 'TKN1',
        },
      ];

      const mockUsdRates = [{ address: '0xToken1', usd: 1.5 }];

      dataSource.query.mockResolvedValue(mockQueryResult);
      historicQuoteService.getUsdRates.mockResolvedValue(mockUsdRates as any);

      const result = await service.getVolume(
        mockDeployment,
        {
          start: 1704067200,
          end: 1704153600,
        },
        mockTokens,
      );

      expect(result).toBeDefined();
      expect(Array.isArray(result)).toBe(true);
    });

    it('should use default values when start/end/offset/limit not provided', async () => {
      const mockQueryResult = [];
      const mockUsdRates = [];

      dataSource.query.mockResolvedValue(mockQueryResult);
      historicQuoteService.getUsdRates.mockResolvedValue(mockUsdRates as any);

      const result = await service.getVolume(mockDeployment, { addresses: ['0xToken1'] }, mockTokens);

      expect(result).toBeDefined();
      expect(dataSource.query).toHaveBeenCalled();
    });

    it('should apply pagination with offset and limit', async () => {
      const mockQueryResult = Array.from({ length: 20 }, (_, i) => ({
        timestam: '2024-01-01 00:00:00',
        volume: `${100 + i}`,
        fees: '1',
        feeAddress: '0xToken1',
        feeSymbol: 'TKN1',
        targetAddress: '0xToken1',
        targetSymbol: 'TKN1',
      }));

      const mockUsdRates = [{ address: '0xToken1', usd: 1.5 }];

      dataSource.query.mockResolvedValue(mockQueryResult);
      historicQuoteService.getUsdRates.mockResolvedValue(mockUsdRates as any);

      const result = await service.getVolume(
        mockDeployment,
        {
          addresses: ['0xToken1'],
          start: 1704067200,
          end: 1704153600,
          offset: 5,
          limit: 10,
        },
        mockTokens,
      );

      expect(result.length).toBeLessThanOrEqual(10);
    });

    it('should handle ownerId filter for tokens', async () => {
      const mockQueryResult = [];
      const mockUsdRates = [];

      dataSource.query.mockResolvedValue(mockQueryResult);
      historicQuoteService.getUsdRates.mockResolvedValue(mockUsdRates as any);

      await service.getVolume(
        mockDeployment,
        {
          addresses: ['0xToken1'],
          start: 1704067200,
          end: 1704153600,
          ownerId: '0xOwner',
        },
        mockTokens,
      );

      const queryCall = dataSource.query.mock.calls[0][0];
      expect(queryCall).toContain('0xOwner');
    });

    it('should handle ownerId filter for pairs', async () => {
      const mockQueryResult = [];
      const mockUsdRates = [];

      dataSource.query.mockResolvedValue(mockQueryResult);
      historicQuoteService.getUsdRates.mockResolvedValue(mockUsdRates as any);

      await service.getVolume(
        mockDeployment,
        {
          pairs: [{ token0: '0xToken1', token1: '0xToken2' }],
          start: 1704067200,
          end: 1704153600,
          ownerId: '0xOwner',
        },
        mockTokens,
        mockPairs,
      );

      const queryCall = dataSource.query.mock.calls[0][0];
      expect(queryCall).toContain('0xOwner');
    });
  });

  describe('USD rate calculations', () => {
    it('should calculate USD values correctly', async () => {
      const mockQueryResult = [
        {
          timestam: '2024-01-01 00:00:00',
          volume: '100',
          fees: '5',
          feeAddress: '0xToken1',
          feeSymbol: 'TKN1',
          targetAddress: '0xToken2',
          targetSymbol: 'TKN2',
        },
      ];

      const mockUsdRates = [
        { address: '0xToken1', usd: 2.0 },
        { address: '0xToken2', usd: 3.0 },
      ];

      dataSource.query.mockResolvedValue(mockQueryResult);
      historicQuoteService.getUsdRates.mockResolvedValue(mockUsdRates as any);

      const result = await service.getVolume(
        mockDeployment,
        {
          addresses: ['0xToken2'],
          start: 1704067200,
          end: 1704153600,
        },
        mockTokens,
      );

      expect(result[0]).toHaveProperty('volumeUsd');
      expect(result[0]).toHaveProperty('feesUsd');
      expect(result[0].volumeUsd).toBe(300); // 100 * 3.0
      expect(result[0].feesUsd).toBe(10); // 5 * 2.0
    });

    it('should handle missing USD rates gracefully', async () => {
      const mockQueryResult = [
        {
          timestam: '2024-01-01 00:00:00',
          volume: '100',
          fees: '5',
          feeAddress: '0xToken1',
          feeSymbol: 'TKN1',
          targetAddress: '0xToken2',
          targetSymbol: 'TKN2',
        },
      ];

      const mockUsdRates = [];

      dataSource.query.mockResolvedValue(mockQueryResult);
      historicQuoteService.getUsdRates.mockResolvedValue(mockUsdRates as any);

      const result = await service.getVolume(
        mockDeployment,
        {
          addresses: ['0xToken2'],
          start: 1704067200,
          end: 1704153600,
        },
        mockTokens,
      );

      expect(result[0].volumeUsd).toBe(0);
      expect(result[0].feesUsd).toBe(0);
    });
  });

  describe('accumulation logic', () => {
    it('should accumulate volume by same address and timestamp', async () => {
      const mockQueryResult = [
        {
          timestam: '2024-01-01 00:00:00',
          volume: '100',
          fees: '1',
          feeAddress: '0xToken1',
          feeSymbol: 'TKN1',
          targetAddress: '0xToken1',
          targetSymbol: 'TKN1',
        },
        {
          timestam: '2024-01-01 00:00:00',
          volume: '50',
          fees: '0.5',
          feeAddress: '0xToken1',
          feeSymbol: 'TKN1',
          targetAddress: '0xToken1',
          targetSymbol: 'TKN1',
        },
      ];

      const mockUsdRates = [{ address: '0xToken1', usd: 1.0 }];

      dataSource.query.mockResolvedValue(mockQueryResult);
      historicQuoteService.getUsdRates.mockResolvedValue(mockUsdRates as any);

      const result = await service.getVolume(
        mockDeployment,
        {
          addresses: ['0xToken1'],
          start: 1704067200,
          end: 1704153600,
        },
        mockTokens,
      );

      expect(result.length).toBe(1);
      expect(result[0].volumeUsd).toBe(150);
      expect(result[0].feesUsd).toBe(1.5);
    });

    it('should accumulate total volume across all tokens', async () => {
      const mockQueryResult = [
        {
          timestam: '2024-01-01 00:00:00',
          volume: '100',
          fees: '1',
          feeAddress: '0xToken1',
          feeSymbol: 'TKN1',
          targetAddress: '0xToken1',
          targetSymbol: 'TKN1',
        },
        {
          timestam: '2024-01-01 00:00:00',
          volume: '200',
          fees: '2',
          feeAddress: '0xToken2',
          feeSymbol: 'TKN2',
          targetAddress: '0xToken2',
          targetSymbol: 'TKN2',
        },
      ];

      const mockUsdRates = [
        { address: '0xToken1', usd: 1.0 },
        { address: '0xToken2', usd: 1.0 },
      ];

      dataSource.query.mockResolvedValue(mockQueryResult);
      historicQuoteService.getUsdRates.mockResolvedValue(mockUsdRates as any);

      const result = await service.getVolume(
        mockDeployment,
        {
          start: 1704067200,
          end: 1704153600,
        },
        mockTokens,
      );

      expect(result.length).toBe(1);
      expect(result[0].volumeUsd).toBe(300);
      expect(result[0].feesUsd).toBe(3);
    });

    it('should accumulate volume by pair', async () => {
      const mockQueryResult = [
        {
          timestam: '2024-01-01 00:00:00',
          volume: '100',
          fees: '1',
          feeAddress: '0xToken1',
          targetAddress: '0xToken2',
          pairId: 1,
        },
        {
          timestam: '2024-01-01 00:00:00',
          volume: '50',
          fees: '0.5',
          feeAddress: '0xToken1',
          targetAddress: '0xToken2',
          pairId: 1,
        },
      ];

      const mockUsdRates = [
        { address: '0xToken1', usd: 1.0 },
        { address: '0xToken2', usd: 1.0 },
      ];

      dataSource.query.mockResolvedValue(mockQueryResult);
      historicQuoteService.getUsdRates.mockResolvedValue(mockUsdRates as any);

      const result = await service.getVolume(
        mockDeployment,
        {
          pairs: [{ token0: '0xToken1', token1: '0xToken2' }],
          start: 1704067200,
          end: 1704153600,
        },
        mockTokens,
        mockPairs,
      );

      expect(result.length).toBe(1);
      expect(result[0]).toHaveProperty('pairId', 1);
      expect(result[0].volumeUsd).toBe(150);
      expect(result[0].feesUsd).toBe(1.5);
    });
  });

  describe('pair handling', () => {
    it('should handle missing pair gracefully with console.warn', async () => {
      const consoleSpy = jest.spyOn(console, 'warn').mockImplementation();

      const mockQueryResult = [];
      const mockUsdRates = [];

      dataSource.query.mockResolvedValue(mockQueryResult);
      historicQuoteService.getUsdRates.mockResolvedValue(mockUsdRates as any);

      await service.getVolume(
        mockDeployment,
        {
          pairs: [{ token0: '0xNonExistent', token1: '0xAlsoNonExistent' }],
          start: 1704067200,
          end: 1704153600,
        },
        mockTokens,
        mockPairs,
      );

      expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('Pair not found for tokens'));

      consoleSpy.mockRestore();
    });

    it('should process multiple valid pairs', async () => {
      const extendedPairs: PairsDictionary = {
        '0xToken1': {
          '0xToken2': { id: 1 } as any,
        },
        '0xToken2': {
          '0xToken1': { id: 2 } as any,
        },
      };

      const mockQueryResult = [
        {
          timestam: '2024-01-01 00:00:00',
          volume: '100',
          fees: '1',
          feeAddress: '0xToken1',
          targetAddress: '0xToken2',
          pairId: 1,
        },
        {
          timestam: '2024-01-01 00:00:00',
          volume: '50',
          fees: '0.5',
          feeAddress: '0xToken2',
          targetAddress: '0xToken1',
          pairId: 2,
        },
      ];

      const mockUsdRates = [
        { address: '0xToken1', usd: 1.0 },
        { address: '0xToken2', usd: 1.0 },
      ];

      dataSource.query.mockResolvedValue(mockQueryResult);
      historicQuoteService.getUsdRates.mockResolvedValue(mockUsdRates as any);

      const result = await service.getVolume(
        mockDeployment,
        {
          pairs: [
            { token0: '0xToken1', token1: '0xToken2' },
            { token0: '0xToken2', token1: '0xToken1' },
          ],
          start: 1704067200,
          end: 1704153600,
        },
        mockTokens,
        extendedPairs,
      );

      expect(result.length).toBeGreaterThanOrEqual(1);
    });
  });

  describe('all tokens handling', () => {
    it('should use all tokens when addresses not specified', async () => {
      const mockQueryResult = [];
      const mockUsdRates = [];

      dataSource.query.mockResolvedValue(mockQueryResult);
      historicQuoteService.getUsdRates.mockResolvedValue(mockUsdRates as any);

      await service.getVolume(
        mockDeployment,
        {
          start: 1704067200,
          end: 1704153600,
        },
        mockTokens,
      );

      const queryCall = dataSource.query.mock.calls[0][0];
      expect(queryCall).toContain('1, 2'); // Both token IDs
    });
  });
});
