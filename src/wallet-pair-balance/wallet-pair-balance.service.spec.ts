import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { WalletPairBalanceService } from './wallet-pair-balance.service';
import { Strategy } from '../strategy/strategy.entity';
import { BlockchainType, ExchangeId, Deployment } from '../deployment/deployment.service';

describe('WalletPairBalanceService', () => {
  let service: WalletPairBalanceService;

  const mockStrategyRepository = {
    query: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        WalletPairBalanceService,
        {
          provide: getRepositoryToken(Strategy),
          useValue: mockStrategyRepository,
        },
      ],
    }).compile();

    service = module.get<WalletPairBalanceService>(WalletPairBalanceService);
    strategyRepository = module.get<Repository<Strategy>>(getRepositoryToken(Strategy));
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('getLatestBalances', () => {
    const mockDeployment = {
      blockchainType: BlockchainType.Ethereum,
      exchangeId: ExchangeId.OGEthereum,
    } as Deployment;

    it('should return empty object when no results', async () => {
      mockStrategyRepository.query.mockResolvedValue([]);

      const result = await service.getLatestBalances(mockDeployment);

      expect(result).toEqual({});
      expect(mockStrategyRepository.query).toHaveBeenCalledWith(expect.stringContaining('WITH latest_owners AS'), [
        BlockchainType.Ethereum,
        ExchangeId.OGEthereum,
      ]);
    });

    it('should handle single wallet with single pair (tokens in lexicographic order)', async () => {
      const mockQueryResult = [
        {
          pairId: 1,
          walletAddress: '0x1234567890123456789012345678901234567890',
          token0Address: '0x1111111111111111111111111111111111111111', // smaller
          token0Symbol: 'TOKEN0',
          token0Decimals: 18,
          token1Address: '0x2222222222222222222222222222222222222222', // larger
          token1Symbol: 'TOKEN1',
          token1Decimals: 6,
          liquidity0Sum: '1000000000000000000', // 1 TOKEN0 in wei
          liquidity1Sum: '500000', // 0.5 TOKEN1 in wei
        },
      ];

      mockStrategyRepository.query.mockResolvedValue(mockQueryResult);

      const result = await service.getLatestBalances(mockDeployment);

      expect(result).toEqual({
        '0x1111111111111111111111111111111111111111_0x2222222222222222222222222222222222222222': {
          token0Address: '0x1111111111111111111111111111111111111111',
          token0Symbol: 'TOKEN0',
          token0Decimals: 18,
          token1Address: '0x2222222222222222222222222222222222222222',
          token1Symbol: 'TOKEN1',
          token1Decimals: 6,
          wallets: {
            '0x1234567890123456789012345678901234567890': {
              token0Balance: '1',
              token1Balance: '0.5',
            },
          },
        },
      });
    });

    it('should handle tokens in reverse lexicographic order (strategy token0 > token1)', async () => {
      const mockQueryResult = [
        {
          pairId: 1,
          walletAddress: '0x1234567890123456789012345678901234567890',
          token0Address: '0x2222222222222222222222222222222222222222', // larger (strategy token0)
          token0Symbol: 'TOKEN0',
          token0Decimals: 6,
          token1Address: '0x1111111111111111111111111111111111111111', // smaller (strategy token1)
          token1Symbol: 'TOKEN1',
          token1Decimals: 18,
          liquidity0Sum: '500000', // 0.5 TOKEN0 in wei (strategy liquidity0)
          liquidity1Sum: '1000000000000000000', // 1 TOKEN1 in wei (strategy liquidity1)
        },
      ];

      mockStrategyRepository.query.mockResolvedValue(mockQueryResult);

      const result = await service.getLatestBalances(mockDeployment);

      // Should create pairKey with lexicographic order (smaller_larger)
      // Should map strategy liquidity1 to canonical token0, liquidity0 to canonical token1
      expect(result).toEqual({
        '0x1111111111111111111111111111111111111111_0x2222222222222222222222222222222222222222': {
          token0Address: '0x1111111111111111111111111111111111111111', // canonical token0 (smaller)
          token0Symbol: 'TOKEN1', // from strategy token1
          token0Decimals: 18,
          token1Address: '0x2222222222222222222222222222222222222222', // canonical token1 (larger)
          token1Symbol: 'TOKEN0', // from strategy token0
          token1Decimals: 6,
          wallets: {
            '0x1234567890123456789012345678901234567890': {
              token0Balance: '1', // from strategy liquidity1
              token1Balance: '0.5', // from strategy liquidity0
            },
          },
        },
      });
    });

    it('should aggregate multiple wallets for the same pair', async () => {
      const mockQueryResult = [
        {
          pairId: 1,
          walletAddress: '0x1111111111111111111111111111111111111111',
          token0Address: '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
          token0Symbol: 'TOKENA',
          token0Decimals: 18,
          token1Address: '0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
          token1Symbol: 'TOKENB',
          token1Decimals: 18,
          liquidity0Sum: '1000000000000000000',
          liquidity1Sum: '2000000000000000000',
        },
        {
          pairId: 1,
          walletAddress: '0x2222222222222222222222222222222222222222',
          token0Address: '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
          token0Symbol: 'TOKENA',
          token0Decimals: 18,
          token1Address: '0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
          token1Symbol: 'TOKENB',
          token1Decimals: 18,
          liquidity0Sum: '500000000000000000',
          liquidity1Sum: '1500000000000000000',
        },
      ];

      mockStrategyRepository.query.mockResolvedValue(mockQueryResult);

      const result = await service.getLatestBalances(mockDeployment);

      expect(result).toEqual({
        '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa_0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb': {
          token0Address: '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
          token0Symbol: 'TOKENA',
          token0Decimals: 18,
          token1Address: '0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
          token1Symbol: 'TOKENB',
          token1Decimals: 18,
          wallets: {
            '0x1111111111111111111111111111111111111111': {
              token0Balance: '1',
              token1Balance: '2',
            },
            '0x2222222222222222222222222222222222222222': {
              token0Balance: '0.5',
              token1Balance: '1.5',
            },
          },
        },
      });
    });

    it('should handle multiple pairs', async () => {
      const mockQueryResult = [
        {
          pairId: 1,
          walletAddress: '0x1111111111111111111111111111111111111111',
          token0Address: '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
          token0Symbol: 'TOKENA',
          token0Decimals: 18,
          token1Address: '0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
          token1Symbol: 'TOKENB',
          token1Decimals: 18,
          liquidity0Sum: '1000000000000000000',
          liquidity1Sum: '2000000000000000000',
        },
        {
          pairId: 2,
          walletAddress: '0x2222222222222222222222222222222222222222',
          token0Address: '0xcccccccccccccccccccccccccccccccccccccccc',
          token0Symbol: 'TOKENC',
          token0Decimals: 6,
          token1Address: '0xdddddddddddddddddddddddddddddddddddddddd',
          token1Symbol: 'TOKEND',
          token1Decimals: 8,
          liquidity0Sum: '1000000',
          liquidity1Sum: '50000000',
        },
      ];

      mockStrategyRepository.query.mockResolvedValue(mockQueryResult);

      const result = await service.getLatestBalances(mockDeployment);

      expect(Object.keys(result)).toHaveLength(2);
      expect(result).toHaveProperty(
        '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa_0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
      );
      expect(result).toHaveProperty(
        '0xcccccccccccccccccccccccccccccccccccccccc_0xdddddddddddddddddddddddddddddddddddddddd',
      );
    });

    it('should handle zero balances correctly', async () => {
      const mockQueryResult = [
        {
          pairId: 1,
          walletAddress: '0x1234567890123456789012345678901234567890',
          token0Address: '0x1111111111111111111111111111111111111111',
          token0Symbol: 'TOKEN0',
          token0Decimals: 18,
          token1Address: '0x2222222222222222222222222222222222222222',
          token1Symbol: 'TOKEN1',
          token1Decimals: 6,
          liquidity0Sum: '0',
          liquidity1Sum: '500000',
        },
      ];

      mockStrategyRepository.query.mockResolvedValue(mockQueryResult);

      const result = await service.getLatestBalances(mockDeployment);

      expect(result).toEqual({
        '0x1111111111111111111111111111111111111111_0x2222222222222222222222222222222222222222': {
          token0Address: '0x1111111111111111111111111111111111111111',
          token0Symbol: 'TOKEN0',
          token0Decimals: 18,
          token1Address: '0x2222222222222222222222222222222222222222',
          token1Symbol: 'TOKEN1',
          token1Decimals: 6,
          wallets: {
            '0x1234567890123456789012345678901234567890': {
              token0Balance: '0',
              token1Balance: '0.5',
            },
          },
        },
      });
    });

    it('should handle null/undefined balances', async () => {
      const mockQueryResult = [
        {
          pairId: 1,
          walletAddress: '0x1234567890123456789012345678901234567890',
          token0Address: '0x1111111111111111111111111111111111111111',
          token0Symbol: 'TOKEN0',
          token0Decimals: 18,
          token1Address: '0x2222222222222222222222222222222222222222',
          token1Symbol: 'TOKEN1',
          token1Decimals: 6,
          liquidity0Sum: null,
          liquidity1Sum: undefined,
        },
      ];

      mockStrategyRepository.query.mockResolvedValue(mockQueryResult);

      const result = await service.getLatestBalances(mockDeployment);

      expect(result).toEqual({
        '0x1111111111111111111111111111111111111111_0x2222222222222222222222222222222222222222': {
          token0Address: '0x1111111111111111111111111111111111111111',
          token0Symbol: 'TOKEN0',
          token0Decimals: 18,
          token1Address: '0x2222222222222222222222222222222222222222',
          token1Symbol: 'TOKEN1',
          token1Decimals: 6,
          wallets: {
            '0x1234567890123456789012345678901234567890': {
              token0Balance: '0',
              token1Balance: '0',
            },
          },
        },
      });
    });

    it('should handle different token decimals correctly', async () => {
      const mockQueryResult = [
        {
          pairId: 1,
          walletAddress: '0x1234567890123456789012345678901234567890',
          token0Address: '0x1111111111111111111111111111111111111111',
          token0Symbol: 'WETH',
          token0Decimals: 18, // 18 decimals
          token1Address: '0x2222222222222222222222222222222222222222',
          token1Symbol: 'USDC',
          token1Decimals: 6, // 6 decimals
          liquidity0Sum: '1500000000000000000', // 1.5 WETH
          liquidity1Sum: '2500000000', // 2500 USDC
        },
      ];

      mockStrategyRepository.query.mockResolvedValue(mockQueryResult);

      const result = await service.getLatestBalances(mockDeployment);

      expect(result).toEqual({
        '0x1111111111111111111111111111111111111111_0x2222222222222222222222222222222222222222': {
          token0Address: '0x1111111111111111111111111111111111111111',
          token0Symbol: 'WETH',
          token0Decimals: 18,
          token1Address: '0x2222222222222222222222222222222222222222',
          token1Symbol: 'USDC',
          token1Decimals: 6,
          wallets: {
            '0x1234567890123456789012345678901234567890': {
              token0Balance: '1.5',
              token1Balance: '2500',
            },
          },
        },
      });
    });

    it('should normalize addresses to lowercase', async () => {
      const mockQueryResult = [
        {
          pairId: 1,
          walletAddress: '0x1234567890123456789012345678901234567890'.toUpperCase(),
          token0Address: '0x1111111111111111111111111111111111111111'.toUpperCase(),
          token0Symbol: 'TOKEN0',
          token0Decimals: 18,
          token1Address: '0x2222222222222222222222222222222222222222'.toUpperCase(),
          token1Symbol: 'TOKEN1',
          token1Decimals: 18,
          liquidity0Sum: '1000000000000000000',
          liquidity1Sum: '2000000000000000000',
        },
      ];

      mockStrategyRepository.query.mockResolvedValue(mockQueryResult);

      const result = await service.getLatestBalances(mockDeployment);

      const expectedPairKey = '0x1111111111111111111111111111111111111111_0x2222222222222222222222222222222222222222';
      expect(result).toHaveProperty(expectedPairKey);
      expect(result[expectedPairKey].token0Address).toBe('0x1111111111111111111111111111111111111111');
      expect(result[expectedPairKey].token1Address).toBe('0x2222222222222222222222222222222222222222');
      expect(result[expectedPairKey].wallets).toHaveProperty('0x1234567890123456789012345678901234567890');
    });

    it('should call repository query with correct parameters', async () => {
      mockStrategyRepository.query.mockResolvedValue([]);

      await service.getLatestBalances(mockDeployment);

      expect(mockStrategyRepository.query).toHaveBeenCalledTimes(1);
      expect(mockStrategyRepository.query).toHaveBeenCalledWith(expect.stringContaining('WITH latest_owners AS'), [
        BlockchainType.Ethereum,
        ExchangeId.OGEthereum,
      ]);

      const [query] = mockStrategyRepository.query.mock.calls[0];

      // Verify key parts of the query
      expect(query).toContain('latest_owners');
      expect(query).toContain('voucher-transfer-events');
      expect(query).toContain('strategies');
      expect(query).toContain('GROUP BY');
      expect(query).toContain('s."deleted" = false');
      expect(query).toContain('vte."to" != \'0x0000000000000000000000000000000000000000\'');
    });

    it('should handle different blockchain types and exchange IDs', async () => {
      const seiDeployment = {
        blockchainType: BlockchainType.Sei,
        exchangeId: ExchangeId.OGSei,
      } as Deployment;

      mockStrategyRepository.query.mockResolvedValue([]);

      await service.getLatestBalances(seiDeployment);

      expect(mockStrategyRepository.query).toHaveBeenCalledWith(expect.stringContaining('WITH latest_owners AS'), [
        BlockchainType.Sei,
        ExchangeId.OGSei,
      ]);
    });
  });
});
