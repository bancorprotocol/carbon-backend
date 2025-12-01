import { Test, TestingModule } from '@nestjs/testing';
import { Repository } from 'typeorm';
import { getRepositoryToken } from '@nestjs/typeorm';
import { TokenService } from './token.service';
import { Token } from './token.entity';
import { HarvesterService } from '../harvester/harvester.service';
import { LastProcessedBlockService } from '../last-processed-block/last-processed-block.service';
import { PairCreatedEventService } from '../events/pair-created-event/pair-created-event.service';
import { VortexTokensTradedEventService } from '../events/vortex-tokens-traded-event/vortex-tokens-traded-event.service';
import { ArbitrageExecutedEventService } from '../events/arbitrage-executed-event/arbitrage-executed-event.service';
import { ArbitrageExecutedEventServiceV2 } from '../events/arbitrage-executed-event-v2/arbitrage-executed-event-v2.service';
import { VortexTradingResetEventService } from '../events/vortex-trading-reset-event/vortex-trading-reset-event.service';
import { VortexFundsWithdrawnEventService } from '../events/vortex-funds-withdrawn-event/vortex-funds-withdrawn-event.service';
import { ProtectionRemovedEventService } from '../events/protection-removed-event/protection-removed-event.service';
import { DeploymentService, BlockchainType, ExchangeId, Deployment } from '../deployment/deployment.service';
import { PairCreatedEvent } from '../events/pair-created-event/pair-created-event.entity';
import { VortexTokensTradedEvent } from '../events/vortex-tokens-traded-event/vortex-tokens-traded-event.entity';
import { ArbitrageExecutedEvent } from '../events/arbitrage-executed-event/arbitrage-executed-event.entity';
import { VortexTradingResetEvent } from '../events/vortex-trading-reset-event/vortex-trading-reset-event.entity';
import { VortexFundsWithdrawnEvent } from '../events/vortex-funds-withdrawn-event/vortex-funds-withdrawn-event.entity';
import { ProtectionRemovedEvent } from '../events/protection-removed-event/protection-removed-event.entity';
import { Block } from '../block/block.entity';

describe('TokenService', () => {
  let service: TokenService;
  let tokenRepository: Repository<Token>;
  let harvesterService: HarvesterService;
  let lastProcessedBlockService: LastProcessedBlockService;
  let pairCreatedEventService: PairCreatedEventService;
  let vortexTokensTradedEventService: VortexTokensTradedEventService;
  let arbitrageExecutedEventService: ArbitrageExecutedEventService;
  let arbitrageExecutedEventServiceV2: ArbitrageExecutedEventServiceV2;
  let vortexTradingResetEventService: VortexTradingResetEventService;
  let vortexFundsWithdrawnEventService: VortexFundsWithdrawnEventService;
  let protectionRemovedEventService: ProtectionRemovedEventService;
  let deploymentService: DeploymentService;

  const mockDeployment: Deployment = {
    exchangeId: ExchangeId.OGEthereum,
    blockchainType: BlockchainType.Ethereum,
    rpcEndpoint: 'https://eth.example.com',
    harvestEventsBatchSize: 10000,
    harvestConcurrency: 10,
    multicallAddress: '0x1234567890123456789012345678901234567890',
    startBlock: 10000000,
    gasToken: {
      name: 'Ethereum',
      symbol: 'ETH',
      address: '0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE',
    },
    contracts: {
      CarbonController: {
        address: '0x1234567890123456789012345678901234567890',
      },
    },
  };

  const mockDeploymentWithEthMapping: Deployment = {
    ...mockDeployment,
    blockchainType: BlockchainType.Sei,
    exchangeId: ExchangeId.OGSei,
    mapEthereumTokens: {
      '0xSourceToken1': '0xEthToken1',
      '0xSourceToken2': '0xEthToken2',
    },
  };

  const mockTokenEntity = {
    id: 1,
    blockchainType: BlockchainType.Ethereum,
    exchangeId: ExchangeId.OGEthereum,
    address: '0xabc123',
    symbol: 'TEST',
    name: 'Test Token',
    decimals: 18,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  const mockBlock: Partial<Block> = {
    id: 1010,
    blockchainType: BlockchainType.Ethereum,
    timestamp: new Date(),
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TokenService,
        {
          provide: getRepositoryToken(Token),
          useClass: Repository,
        },
        {
          provide: HarvesterService,
          useValue: {
            stringsWithMulticall: jest.fn(),
            integersWithMulticall: jest.fn(),
          },
        },
        {
          provide: LastProcessedBlockService,
          useValue: {
            getOrInit: jest.fn(),
            update: jest.fn(),
          },
        },
        {
          provide: PairCreatedEventService,
          useValue: {
            get: jest.fn(),
          },
        },
        {
          provide: VortexTokensTradedEventService,
          useValue: {
            get: jest.fn(),
          },
        },
        {
          provide: ArbitrageExecutedEventService,
          useValue: {
            get: jest.fn(),
          },
        },
        {
          provide: ArbitrageExecutedEventServiceV2,
          useValue: {
            get: jest.fn(),
          },
        },
        {
          provide: VortexTradingResetEventService,
          useValue: {
            get: jest.fn(),
          },
        },
        {
          provide: VortexFundsWithdrawnEventService,
          useValue: {
            get: jest.fn(),
          },
        },
        {
          provide: ProtectionRemovedEventService,
          useValue: {
            get: jest.fn(),
          },
        },
        {
          provide: DeploymentService,
          useValue: {
            getDeploymentByBlockchainType: jest.fn(),
            getDeployments: jest.fn(),
          },
        },
      ],
    }).compile();

    service = module.get<TokenService>(TokenService);
    tokenRepository = module.get<Repository<Token>>(getRepositoryToken(Token));
    harvesterService = module.get<HarvesterService>(HarvesterService);
    lastProcessedBlockService = module.get<LastProcessedBlockService>(LastProcessedBlockService);
    pairCreatedEventService = module.get<PairCreatedEventService>(PairCreatedEventService);
    vortexTokensTradedEventService = module.get<VortexTokensTradedEventService>(VortexTokensTradedEventService);
    arbitrageExecutedEventService = module.get<ArbitrageExecutedEventService>(ArbitrageExecutedEventService);
    arbitrageExecutedEventServiceV2 = module.get<ArbitrageExecutedEventServiceV2>(ArbitrageExecutedEventServiceV2);
    vortexTradingResetEventService = module.get<VortexTradingResetEventService>(VortexTradingResetEventService);
    vortexFundsWithdrawnEventService = module.get<VortexFundsWithdrawnEventService>(VortexFundsWithdrawnEventService);
    protectionRemovedEventService = module.get<ProtectionRemovedEventService>(ProtectionRemovedEventService);
    deploymentService = module.get<DeploymentService>(DeploymentService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('onModuleInit', () => {
    it('should call ensureAllEthereumMappedTokensExist', async () => {
      const ensureAllEthereumMappedTokensExistSpy = jest
        .spyOn(service, 'ensureAllEthereumMappedTokensExist')
        .mockResolvedValue();

      await service.onModuleInit();

      expect(ensureAllEthereumMappedTokensExistSpy).toHaveBeenCalledTimes(1);
    });
  });

  describe('ensureAllEthereumMappedTokensExist', () => {
    it('should process all deployments with Ethereum mappings', async () => {
      const mockDeployments = [
        mockDeployment, // No Ethereum mappings
        mockDeploymentWithEthMapping, // Has Ethereum mappings
      ];

      jest.spyOn(deploymentService, 'getDeployments').mockReturnValue(mockDeployments);
      const ensureEthereumMappedTokensExistSpy = jest
        .spyOn(service, 'ensureEthereumMappedTokensExist')
        .mockResolvedValue([]);

      await service.ensureAllEthereumMappedTokensExist();

      expect(deploymentService.getDeployments).toHaveBeenCalledTimes(1);
      expect(ensureEthereumMappedTokensExistSpy).toHaveBeenCalledTimes(1);
      expect(ensureEthereumMappedTokensExistSpy).toHaveBeenCalledWith(mockDeploymentWithEthMapping);
    });

    it('should not process deployments without Ethereum mappings', async () => {
      const mockDeployments = [
        mockDeployment, // No Ethereum mappings
        { ...mockDeployment, mapEthereumTokens: {} }, // Empty mappings
      ];

      jest.spyOn(deploymentService, 'getDeployments').mockReturnValue(mockDeployments);
      const ensureEthereumMappedTokensExistSpy = jest
        .spyOn(service, 'ensureEthereumMappedTokensExist')
        .mockResolvedValue([]);

      await service.ensureAllEthereumMappedTokensExist();

      expect(deploymentService.getDeployments).toHaveBeenCalledTimes(1);
      expect(ensureEthereumMappedTokensExistSpy).not.toHaveBeenCalled();
    });
  });

  describe('update', () => {
    it('should process token data in batches', async () => {
      // Mock getOrInit to return a starting block
      jest.spyOn(lastProcessedBlockService, 'getOrInit').mockResolvedValue(1000);

      // Mock update to do nothing
      jest.spyOn(lastProcessedBlockService, 'update').mockResolvedValue(undefined);

      // Create block instances with different IDs
      const block1 = { ...mockBlock, id: 1010 };
      const block2 = { ...mockBlock, id: 1020 };
      const block3 = { ...mockBlock, id: 1030 };
      const block4 = { ...mockBlock, id: 1040 };
      const block5 = { ...mockBlock, id: 1050 };
      const block6 = { ...mockBlock, id: 1060 };

      // Mock the event services to return test data
      const mockPairEvent: Partial<PairCreatedEvent> = {
        token0: '0xabc123',
        token1: '0xdef456',
        block: block1 as Block,
      };
      jest.spyOn(pairCreatedEventService, 'get').mockResolvedValue([mockPairEvent as PairCreatedEvent]);

      const mockVortexTradeEvent: Partial<VortexTokensTradedEvent> = {
        token: '0xghi789',
        block: block2 as Block,
      };
      jest
        .spyOn(vortexTokensTradedEventService, 'get')
        .mockResolvedValue([mockVortexTradeEvent as VortexTokensTradedEvent]);

      const mockArbitrageEvent: Partial<ArbitrageExecutedEvent> = {
        sourceTokens: ['0xjkl012'],
        tokenPath: ['0xmno345'],
        block: block3 as Block,
      };
      jest
        .spyOn(arbitrageExecutedEventService, 'get')
        .mockResolvedValue([mockArbitrageEvent as ArbitrageExecutedEvent]);

      // Mock arbitrage executed events v2
      jest.spyOn(arbitrageExecutedEventServiceV2, 'get').mockResolvedValue([]);

      const mockResetEvent: Partial<VortexTradingResetEvent> = {
        token: '0xpqr678',
        block: block4 as Block,
      };
      jest.spyOn(vortexTradingResetEventService, 'get').mockResolvedValue([mockResetEvent as VortexTradingResetEvent]);

      const mockWithdrawnEvent: Partial<VortexFundsWithdrawnEvent> = {
        tokens: ['0xstu901'],
        block: block5 as Block,
      };
      jest
        .spyOn(vortexFundsWithdrawnEventService, 'get')
        .mockResolvedValue([mockWithdrawnEvent as VortexFundsWithdrawnEvent]);

      const mockProtectionEvent: Partial<ProtectionRemovedEvent> = {
        poolToken: '0xvwx234',
        reserveToken: '0xyzA567',
        block: block6 as Block,
      };
      jest
        .spyOn(protectionRemovedEventService, 'get')
        .mockResolvedValue([mockProtectionEvent as ProtectionRemovedEvent]);

      // Mock token repository
      jest.spyOn(tokenRepository, 'find').mockResolvedValue([]);
      jest.spyOn(tokenRepository, 'create').mockImplementation((entity) => entity as Token);
      jest.spyOn(tokenRepository, 'save').mockResolvedValue(undefined);

      // Mock harvester service methods
      jest.spyOn(harvesterService, 'stringsWithMulticall').mockImplementation(async (addresses, abi, method) => {
        if (method === 'symbol') {
          return addresses.map(() => 'TEST');
        } else {
          return addresses.map(() => 'Test Token');
        }
      });

      jest
        .spyOn(harvesterService, 'integersWithMulticall')
        .mockImplementation(async () => [18, 18, 18, 18, 18, 18, 18, 18]);

      // Call the update method
      await service.update(1100, mockDeployment);

      // Verify lastProcessedBlockService.update was called with the right parameters
      expect(lastProcessedBlockService.update).toHaveBeenCalledWith('ethereum-ethereum-tokens', 1100);

      // Verify createFromAddresses was called
      expect(tokenRepository.save).toHaveBeenCalled();
    });
  });

  describe('allByAddress', () => {
    it('should return tokens indexed by address', async () => {
      const mockTokens = [
        { ...mockTokenEntity, address: '0xtoken1' },
        { ...mockTokenEntity, address: '0xtoken2', symbol: 'TEST2' },
      ];

      jest.spyOn(tokenRepository, 'find').mockResolvedValue(mockTokens as Token[]);

      const result = await service.allByAddress(mockDeployment);

      expect(result).toEqual({
        '0xtoken1': mockTokens[0],
        '0xtoken2': mockTokens[1],
      });

      expect(tokenRepository.find).toHaveBeenCalledWith({
        where: {
          blockchainType: mockDeployment.blockchainType,
          exchangeId: mockDeployment.exchangeId,
        },
      });
    });
  });

  describe('all', () => {
    it('should return all tokens for a deployment', async () => {
      const mockTokens = [
        { ...mockTokenEntity, address: '0xtoken1' },
        { ...mockTokenEntity, address: '0xtoken2', symbol: 'TEST2' },
      ];

      jest.spyOn(tokenRepository, 'find').mockResolvedValue(mockTokens as Token[]);

      const result = await service.all(mockDeployment);

      expect(result).toEqual(mockTokens);

      expect(tokenRepository.find).toHaveBeenCalledWith({
        where: {
          blockchainType: mockDeployment.blockchainType,
          exchangeId: mockDeployment.exchangeId,
        },
      });
    });
  });

  describe('getTokensByBlockchainType', () => {
    it('should return tokens by blockchain type', async () => {
      const mockTokens = [
        { ...mockTokenEntity, address: '0xtoken1' },
        { ...mockTokenEntity, address: '0xtoken2', symbol: 'TEST2' },
      ];

      jest.spyOn(tokenRepository, 'find').mockResolvedValue(mockTokens as Token[]);

      const result = await service.getTokensByBlockchainType(BlockchainType.Ethereum);

      expect(result).toEqual(mockTokens);

      expect(tokenRepository.find).toHaveBeenCalledWith({
        where: { blockchainType: BlockchainType.Ethereum },
      });
    });

    it('should add native token alias when native token exists but alias does not', async () => {
      const nativeTokenAddress = '0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE';
      const nativeTokenAlias = '0xNativeTokenAlias';
      const mockDeploymentWithAlias = {
        ...mockDeployment,
        nativeTokenAlias,
      };

      const mockTokens = [
        {
          ...mockTokenEntity,
          address: nativeTokenAddress.toLowerCase(),
          symbol: 'ETH',
          name: 'Ethereum',
          decimals: 18,
        },
        { ...mockTokenEntity, address: '0xtoken2', symbol: 'TEST2' },
      ];

      jest.spyOn(deploymentService, 'getDeploymentByBlockchainType').mockReturnValue(mockDeploymentWithAlias);
      jest.spyOn(tokenRepository, 'find').mockResolvedValue(mockTokens as Token[]);
      jest.spyOn(tokenRepository, 'create').mockImplementation((entity) => entity as Token);

      const result = await service.getTokensByBlockchainType(BlockchainType.Ethereum);

      // Should have one additional token (the alias)
      expect(result.length).toBe(3);

      // Find the alias token in the results
      const aliasToken = result.find((token) => token.address.toLowerCase() === nativeTokenAlias.toLowerCase());
      expect(aliasToken).toBeDefined();
      expect(aliasToken.symbol).toBe('ETH');
      expect(aliasToken.name).toBe('Ethereum');
      expect(aliasToken.decimals).toBe(18);
    });

    it('should not add native token alias if it already exists', async () => {
      const nativeTokenAddress = '0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE';
      const nativeTokenAlias = '0xNativeTokenAlias';
      const mockDeploymentWithAlias = {
        ...mockDeployment,
        nativeTokenAlias,
      };

      const mockTokens = [
        {
          ...mockTokenEntity,
          address: nativeTokenAddress.toLowerCase(),
          symbol: 'ETH',
          name: 'Ethereum',
          decimals: 18,
        },
        {
          ...mockTokenEntity,
          address: nativeTokenAlias.toLowerCase(),
          symbol: 'WETH',
          name: 'Wrapped Ethereum',
          decimals: 18,
        },
      ];

      jest.spyOn(deploymentService, 'getDeploymentByBlockchainType').mockReturnValue(mockDeploymentWithAlias);
      jest.spyOn(tokenRepository, 'find').mockResolvedValue(mockTokens as Token[]);
      jest.spyOn(tokenRepository, 'create').mockImplementation((entity) => entity as Token);

      const result = await service.getTokensByBlockchainType(BlockchainType.Ethereum);

      // Should have same number of tokens (no alias added)
      expect(result.length).toBe(2);

      // Both original tokens should be present
      expect(result.find((token) => token.address.toLowerCase() === nativeTokenAddress.toLowerCase())).toBeDefined();
      expect(result.find((token) => token.address.toLowerCase() === nativeTokenAlias.toLowerCase())).toBeDefined();
    });

    it('should not add native token alias if native token does not exist', async () => {
      const nativeTokenAlias = '0xNativeTokenAlias';
      const mockDeploymentWithAlias = {
        ...mockDeployment,
        nativeTokenAlias,
      };

      const mockTokens = [
        { ...mockTokenEntity, address: '0xtoken1', symbol: 'TEST1' },
        { ...mockTokenEntity, address: '0xtoken2', symbol: 'TEST2' },
      ];

      jest.spyOn(deploymentService, 'getDeploymentByBlockchainType').mockReturnValue(mockDeploymentWithAlias);
      jest.spyOn(tokenRepository, 'find').mockResolvedValue(mockTokens as Token[]);
      jest.spyOn(tokenRepository, 'create').mockImplementation((entity) => entity as Token);

      const result = await service.getTokensByBlockchainType(BlockchainType.Ethereum);

      // Should have same number of tokens (no alias added)
      expect(result.length).toBe(2);
      expect(result).toEqual(mockTokens);
    });

    it('should handle case-insensitive address matching', async () => {
      const nativeTokenAddress = '0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE';
      const nativeTokenAlias = '0xNaTiVeToKeNaLiAs';
      const mockDeploymentWithAlias = {
        ...mockDeployment,
        nativeTokenAlias,
      };

      const mockTokens = [
        {
          ...mockTokenEntity,
          address: nativeTokenAddress.toUpperCase(),
          symbol: 'ETH',
          name: 'Ethereum',
          decimals: 18,
        },
      ];

      jest.spyOn(deploymentService, 'getDeploymentByBlockchainType').mockReturnValue(mockDeploymentWithAlias);
      jest.spyOn(tokenRepository, 'find').mockResolvedValue(mockTokens as Token[]);
      jest.spyOn(tokenRepository, 'create').mockImplementation((entity) => entity as Token);

      const result = await service.getTokensByBlockchainType(BlockchainType.Ethereum);

      // Should have one additional token (the alias)
      expect(result.length).toBe(2);

      // Find the alias token in the results - should be lowercase
      const aliasToken = result.find((token) => token.address.toLowerCase() === nativeTokenAlias.toLowerCase());
      expect(aliasToken).toBeDefined();
      expect(aliasToken.address).toBe(nativeTokenAlias.toLowerCase());
    });
  });

  describe('ensureEthereumMappedTokensExist', () => {
    it('should create tokens for Ethereum mappings', async () => {
      const deployment = {
        ...mockDeployment,
        mapEthereumTokens: {
          '0xSourceToken1': '0xEthToken1',
          '0xSourceToken2': '0xEthToken2',
        },
      };

      const ethereumDeployment = { ...mockDeployment, blockchainType: BlockchainType.Ethereum };

      jest.spyOn(deploymentService, 'getDeploymentByBlockchainType').mockReturnValue(ethereumDeployment);

      // Mock token creation
      const mockToken1 = { ...mockTokenEntity, address: '0xethtoken1' };
      const mockToken2 = { ...mockTokenEntity, address: '0xethtoken2' };

      jest
        .spyOn(service, 'getOrCreateTokenByAddress')
        .mockResolvedValueOnce(mockToken1 as Token)
        .mockResolvedValueOnce(mockToken2 as Token);

      const result = await service.ensureEthereumMappedTokensExist(deployment);

      expect(result).toEqual([mockToken1, mockToken2]);
      expect(deploymentService.getDeploymentByBlockchainType).toHaveBeenCalledWith(BlockchainType.Ethereum);
      expect(service.getOrCreateTokenByAddress).toHaveBeenCalledTimes(2);
    });

    it('should return empty array when no mappings exist', async () => {
      const deployment = { ...mockDeployment, mapEthereumTokens: {} };

      const result = await service.ensureEthereumMappedTokensExist(deployment);

      expect(result).toEqual([]);
      expect(deploymentService.getDeploymentByBlockchainType).not.toHaveBeenCalled();
    });
  });

  describe('createFromAddresses - handling invalid ERC20 tokens', () => {
    it('should skip tokens with invalid decimals (NaN)', async () => {
      const addresses = ['0xValidToken', '0xInvalidToken', '0xAnotherValidToken'];

      // Mock repository to return no existing tokens
      jest.spyOn(tokenRepository, 'find').mockResolvedValue([]);
      jest.spyOn(tokenRepository, 'create').mockImplementation((entity) => entity as Token);
      jest.spyOn(tokenRepository, 'save').mockResolvedValue(undefined);

      // Mock multicall responses - invalid token returns NaN for decimals
      jest.spyOn(harvesterService, 'integersWithMulticall').mockImplementation(async (addresses) => {
        return addresses.map((addr) => {
          if (addr === '0xInvalidToken') return NaN;
          if (addr === '0xValidToken') return 18;
          if (addr === '0xAnotherValidToken') return 6;
          return 18;
        });
      });

      jest.spyOn(harvesterService, 'stringsWithMulticall').mockImplementation(async (addresses, abi, method) => {
        if (method === 'symbol') {
          return addresses.map((addr) =>
            addr === '0xInvalidToken' ? '' : addr === '0xValidToken' ? 'VALID' : 'VALID2',
          );
        } else {
          return addresses.map((addr) =>
            addr === '0xInvalidToken' ? '' : addr === '0xValidToken' ? 'Valid Token' : 'Another Valid Token',
          );
        }
      });

      // Call the private method via update
      jest.spyOn(lastProcessedBlockService, 'getOrInit').mockResolvedValue(1000);
      jest.spyOn(lastProcessedBlockService, 'update').mockResolvedValue(undefined);
      jest.spyOn(pairCreatedEventService, 'get').mockResolvedValue([
        {
          token0: addresses[0],
          token1: addresses[1],
          block: mockBlock as Block,
        } as any,
        {
          token0: addresses[2],
          token1: addresses[0],
          block: mockBlock as Block,
        } as any,
      ]);
      jest.spyOn(vortexTokensTradedEventService, 'get').mockResolvedValue([]);
      jest.spyOn(arbitrageExecutedEventService, 'get').mockResolvedValue([]);
      jest.spyOn(arbitrageExecutedEventServiceV2, 'get').mockResolvedValue([]);
      jest.spyOn(vortexTradingResetEventService, 'get').mockResolvedValue([]);
      jest.spyOn(vortexFundsWithdrawnEventService, 'get').mockResolvedValue([]);
      jest.spyOn(protectionRemovedEventService, 'get').mockResolvedValue([]);

      await service.update(1100, mockDeployment);

      // Should only create 2 tokens (skipping the one with NaN decimals)
      const saveCall = (tokenRepository.save as jest.Mock).mock.calls[0][0];
      expect(saveCall.length).toBe(2);

      // Check that the two valid tokens were created
      const addresses_created = saveCall.map((t) => t.address);
      expect(addresses_created).toContain('0xValidToken');
      expect(addresses_created).toContain('0xAnotherValidToken');
      expect(addresses_created).not.toContain('0xInvalidToken');

      // Verify decimals
      const validToken = saveCall.find((t) => t.address === '0xValidToken');
      const anotherValidToken = saveCall.find((t) => t.address === '0xAnotherValidToken');
      expect(validToken.decimals).toBe(18);
      expect(anotherValidToken.decimals).toBe(6);
    });

    it('should create tokens with zero decimals (valid edge case)', async () => {
      const addresses = ['0xValidToken', '0xZeroDecimalToken'];

      jest.spyOn(tokenRepository, 'find').mockResolvedValue([]);
      jest.spyOn(tokenRepository, 'create').mockImplementation((entity) => entity as Token);
      jest.spyOn(tokenRepository, 'save').mockResolvedValue(undefined);

      // Zero decimals should now be allowed
      jest.spyOn(harvesterService, 'integersWithMulticall').mockImplementation(async (addrs) => {
        return addrs.map((addr) => (addr === '0xZeroDecimalToken' ? 0 : 18));
      });
      jest.spyOn(harvesterService, 'stringsWithMulticall').mockImplementation(async (addrs, abi, method) => {
        if (method === 'symbol') {
          return addrs.map((addr) => (addr === '0xZeroDecimalToken' ? 'ZERO' : 'VALID'));
        } else {
          return addrs.map((addr) => (addr === '0xZeroDecimalToken' ? 'Zero Decimal Token' : 'Valid Token'));
        }
      });

      jest.spyOn(lastProcessedBlockService, 'getOrInit').mockResolvedValue(1000);
      jest.spyOn(lastProcessedBlockService, 'update').mockResolvedValue(undefined);
      jest.spyOn(pairCreatedEventService, 'get').mockResolvedValue([
        {
          token0: addresses[0],
          token1: addresses[1],
          block: mockBlock as Block,
        } as any,
      ]);
      jest.spyOn(vortexTokensTradedEventService, 'get').mockResolvedValue([]);
      jest.spyOn(arbitrageExecutedEventService, 'get').mockResolvedValue([]);
      jest.spyOn(arbitrageExecutedEventServiceV2, 'get').mockResolvedValue([]);
      jest.spyOn(vortexTradingResetEventService, 'get').mockResolvedValue([]);
      jest.spyOn(vortexFundsWithdrawnEventService, 'get').mockResolvedValue([]);
      jest.spyOn(protectionRemovedEventService, 'get').mockResolvedValue([]);

      await service.update(1100, mockDeployment);

      // Should create both tokens (including zero decimals)
      const saveCall = (tokenRepository.save as jest.Mock).mock.calls[0][0];
      expect(saveCall.length).toBe(2);

      const addresses_created = saveCall.map((t) => t.address);
      expect(addresses_created).toContain('0xValidToken');
      expect(addresses_created).toContain('0xZeroDecimalToken');

      const zeroDecimalToken = saveCall.find((t) => t.address === '0xZeroDecimalToken');
      expect(zeroDecimalToken.decimals).toBe(0);
    });

    it('should skip tokens with undefined decimals', async () => {
      const addresses = ['0xValidToken', '0xUndefinedDecimalToken'];

      jest.spyOn(tokenRepository, 'find').mockResolvedValue([]);
      jest.spyOn(tokenRepository, 'create').mockImplementation((entity) => entity as Token);
      jest.spyOn(tokenRepository, 'save').mockResolvedValue(undefined);

      // Undefined decimals should be skipped
      jest.spyOn(harvesterService, 'integersWithMulticall').mockImplementation(async (addrs) => {
        return addrs.map((addr) => (addr === '0xUndefinedDecimalToken' ? undefined : 18)) as number[];
      });
      jest.spyOn(harvesterService, 'stringsWithMulticall').mockImplementation(async (addrs, abi, method) => {
        if (method === 'symbol') {
          return addrs.map((addr) => (addr === '0xUndefinedDecimalToken' ? '' : 'VALID'));
        } else {
          return addrs.map((addr) => (addr === '0xUndefinedDecimalToken' ? '' : 'Valid Token'));
        }
      });

      jest.spyOn(lastProcessedBlockService, 'getOrInit').mockResolvedValue(1000);
      jest.spyOn(lastProcessedBlockService, 'update').mockResolvedValue(undefined);
      jest.spyOn(pairCreatedEventService, 'get').mockResolvedValue([
        {
          token0: addresses[0],
          token1: addresses[1],
          block: mockBlock as Block,
        } as any,
      ]);
      jest.spyOn(vortexTokensTradedEventService, 'get').mockResolvedValue([]);
      jest.spyOn(arbitrageExecutedEventService, 'get').mockResolvedValue([]);
      jest.spyOn(arbitrageExecutedEventServiceV2, 'get').mockResolvedValue([]);
      jest.spyOn(vortexTradingResetEventService, 'get').mockResolvedValue([]);
      jest.spyOn(vortexFundsWithdrawnEventService, 'get').mockResolvedValue([]);
      jest.spyOn(protectionRemovedEventService, 'get').mockResolvedValue([]);

      await service.update(1100, mockDeployment);

      // Should only create 1 token
      const saveCall = (tokenRepository.save as jest.Mock).mock.calls[0][0];
      expect(saveCall.length).toBe(1);
      expect(saveCall[0]).toMatchObject({ address: '0xValidToken', decimals: 18 });
    });

    it('should skip tokens with negative decimals', async () => {
      const addresses = ['0xValidToken', '0xNegativeDecimalToken'];

      jest.spyOn(tokenRepository, 'find').mockResolvedValue([]);
      jest.spyOn(tokenRepository, 'create').mockImplementation((entity) => entity as Token);
      jest.spyOn(tokenRepository, 'save').mockResolvedValue(undefined);

      // Negative decimals should be skipped
      jest.spyOn(harvesterService, 'integersWithMulticall').mockImplementation(async (addrs) => {
        return addrs.map((addr) => (addr === '0xNegativeDecimalToken' ? -1 : 18));
      });
      jest.spyOn(harvesterService, 'stringsWithMulticall').mockImplementation(async (addrs, abi, method) => {
        if (method === 'symbol') {
          return addrs.map((addr) => (addr === '0xNegativeDecimalToken' ? 'NEG' : 'VALID'));
        } else {
          return addrs.map((addr) => (addr === '0xNegativeDecimalToken' ? 'Negative Token' : 'Valid Token'));
        }
      });

      jest.spyOn(lastProcessedBlockService, 'getOrInit').mockResolvedValue(1000);
      jest.spyOn(lastProcessedBlockService, 'update').mockResolvedValue(undefined);
      jest.spyOn(pairCreatedEventService, 'get').mockResolvedValue([
        {
          token0: addresses[0],
          token1: addresses[1],
          block: mockBlock as Block,
        } as any,
      ]);
      jest.spyOn(vortexTokensTradedEventService, 'get').mockResolvedValue([]);
      jest.spyOn(arbitrageExecutedEventService, 'get').mockResolvedValue([]);
      jest.spyOn(arbitrageExecutedEventServiceV2, 'get').mockResolvedValue([]);
      jest.spyOn(vortexTradingResetEventService, 'get').mockResolvedValue([]);
      jest.spyOn(vortexFundsWithdrawnEventService, 'get').mockResolvedValue([]);
      jest.spyOn(protectionRemovedEventService, 'get').mockResolvedValue([]);

      await service.update(1100, mockDeployment);

      // Should only create 1 token
      const saveCall = (tokenRepository.save as jest.Mock).mock.calls[0][0];
      expect(saveCall.length).toBe(1);
      expect(saveCall[0]).toMatchObject({ address: '0xValidToken', decimals: 18 });
    });

    it('should skip tokens with null decimals', async () => {
      const addresses = ['0xValidToken', '0xNullDecimalToken'];

      jest.spyOn(tokenRepository, 'find').mockResolvedValue([]);
      jest.spyOn(tokenRepository, 'create').mockImplementation((entity) => entity as Token);
      jest.spyOn(tokenRepository, 'save').mockResolvedValue(undefined);

      // Null decimals should be skipped
      jest.spyOn(harvesterService, 'integersWithMulticall').mockImplementation(async (addrs) => {
        return addrs.map((addr) => (addr === '0xNullDecimalToken' ? null : 18)) as number[];
      });
      jest.spyOn(harvesterService, 'stringsWithMulticall').mockImplementation(async (addrs, abi, method) => {
        if (method === 'symbol') {
          return addrs.map((addr) => (addr === '0xNullDecimalToken' ? '' : 'VALID'));
        } else {
          return addrs.map((addr) => (addr === '0xNullDecimalToken' ? '' : 'Valid Token'));
        }
      });

      jest.spyOn(lastProcessedBlockService, 'getOrInit').mockResolvedValue(1000);
      jest.spyOn(lastProcessedBlockService, 'update').mockResolvedValue(undefined);
      jest.spyOn(pairCreatedEventService, 'get').mockResolvedValue([
        {
          token0: addresses[0],
          token1: addresses[1],
          block: mockBlock as Block,
        } as any,
      ]);
      jest.spyOn(vortexTokensTradedEventService, 'get').mockResolvedValue([]);
      jest.spyOn(arbitrageExecutedEventService, 'get').mockResolvedValue([]);
      jest.spyOn(arbitrageExecutedEventServiceV2, 'get').mockResolvedValue([]);
      jest.spyOn(vortexTradingResetEventService, 'get').mockResolvedValue([]);
      jest.spyOn(vortexFundsWithdrawnEventService, 'get').mockResolvedValue([]);
      jest.spyOn(protectionRemovedEventService, 'get').mockResolvedValue([]);

      await service.update(1100, mockDeployment);

      // Should only create 1 token (null is skipped)
      const saveCall = (tokenRepository.save as jest.Mock).mock.calls[0][0];
      expect(saveCall.length).toBe(1);
      expect(saveCall[0]).toMatchObject({ address: '0xValidToken', decimals: 18 });
    });

    it('should skip tokens with Infinity decimals', async () => {
      const addresses = ['0xValidToken', '0xInfinityDecimalToken'];

      jest.spyOn(tokenRepository, 'find').mockResolvedValue([]);
      jest.spyOn(tokenRepository, 'create').mockImplementation((entity) => entity as Token);
      jest.spyOn(tokenRepository, 'save').mockResolvedValue(undefined);

      // Infinity decimals should be skipped
      jest.spyOn(harvesterService, 'integersWithMulticall').mockImplementation(async (addrs) => {
        return addrs.map((addr) => (addr === '0xInfinityDecimalToken' ? Infinity : 18));
      });
      jest.spyOn(harvesterService, 'stringsWithMulticall').mockImplementation(async (addrs, abi, method) => {
        if (method === 'symbol') {
          return addrs.map((addr) => (addr === '0xInfinityDecimalToken' ? '' : 'VALID'));
        } else {
          return addrs.map((addr) => (addr === '0xInfinityDecimalToken' ? '' : 'Valid Token'));
        }
      });

      jest.spyOn(lastProcessedBlockService, 'getOrInit').mockResolvedValue(1000);
      jest.spyOn(lastProcessedBlockService, 'update').mockResolvedValue(undefined);
      jest.spyOn(pairCreatedEventService, 'get').mockResolvedValue([
        {
          token0: addresses[0],
          token1: addresses[1],
          block: mockBlock as Block,
        } as any,
      ]);
      jest.spyOn(vortexTokensTradedEventService, 'get').mockResolvedValue([]);
      jest.spyOn(arbitrageExecutedEventService, 'get').mockResolvedValue([]);
      jest.spyOn(arbitrageExecutedEventServiceV2, 'get').mockResolvedValue([]);
      jest.spyOn(vortexTradingResetEventService, 'get').mockResolvedValue([]);
      jest.spyOn(vortexFundsWithdrawnEventService, 'get').mockResolvedValue([]);
      jest.spyOn(protectionRemovedEventService, 'get').mockResolvedValue([]);

      await service.update(1100, mockDeployment);

      // Should only create 1 token (Infinity is skipped)
      const saveCall = (tokenRepository.save as jest.Mock).mock.calls[0][0];
      expect(saveCall.length).toBe(1);
      expect(saveCall[0]).toMatchObject({ address: '0xValidToken', decimals: 18 });
    });

    it('should create all tokens when all have valid decimals', async () => {
      const addresses = ['0xToken1', '0xToken2', '0xToken3'];

      jest.spyOn(tokenRepository, 'find').mockResolvedValue([]);
      jest.spyOn(tokenRepository, 'create').mockImplementation((entity) => entity as Token);
      jest.spyOn(tokenRepository, 'save').mockResolvedValue(undefined);

      // All valid decimals
      jest.spyOn(harvesterService, 'integersWithMulticall').mockImplementation(async (addrs) => {
        return addrs.map((addr) => {
          if (addr === '0xToken1') return 18;
          if (addr === '0xToken2') return 6;
          if (addr === '0xToken3') return 8;
          return 18;
        });
      });
      jest.spyOn(harvesterService, 'stringsWithMulticall').mockImplementation(async (addrs, abi, method) => {
        if (method === 'symbol') {
          return addrs.map((addr) => {
            if (addr === '0xToken1') return 'TKN1';
            if (addr === '0xToken2') return 'TKN2';
            if (addr === '0xToken3') return 'TKN3';
            return 'TKN';
          });
        } else {
          return addrs.map((addr) => {
            if (addr === '0xToken1') return 'Token 1';
            if (addr === '0xToken2') return 'Token 2';
            if (addr === '0xToken3') return 'Token 3';
            return 'Token';
          });
        }
      });

      jest.spyOn(lastProcessedBlockService, 'getOrInit').mockResolvedValue(1000);
      jest.spyOn(lastProcessedBlockService, 'update').mockResolvedValue(undefined);
      jest.spyOn(pairCreatedEventService, 'get').mockResolvedValue([
        {
          token0: addresses[0],
          token1: addresses[1],
          block: mockBlock as Block,
        } as any,
        {
          token0: addresses[2],
          token1: addresses[0],
          block: mockBlock as Block,
        } as any,
      ]);
      jest.spyOn(vortexTokensTradedEventService, 'get').mockResolvedValue([]);
      jest.spyOn(arbitrageExecutedEventService, 'get').mockResolvedValue([]);
      jest.spyOn(arbitrageExecutedEventServiceV2, 'get').mockResolvedValue([]);
      jest.spyOn(vortexTradingResetEventService, 'get').mockResolvedValue([]);
      jest.spyOn(vortexFundsWithdrawnEventService, 'get').mockResolvedValue([]);
      jest.spyOn(protectionRemovedEventService, 'get').mockResolvedValue([]);

      await service.update(1100, mockDeployment);

      // Should create all 3 tokens
      const saveCall = (tokenRepository.save as jest.Mock).mock.calls[0][0];
      expect(saveCall.length).toBe(3);
    });
  });

  describe('getOrCreateTokenByAddress', () => {
    it('should return existing token if found', async () => {
      const mockToken = { ...mockTokenEntity, address: '0xexisting' };
      const mockTokens = [mockToken];

      jest.spyOn(tokenRepository, 'find').mockResolvedValue(mockTokens as Token[]);

      const result = await service.getOrCreateTokenByAddress('0xExisting', mockDeployment);

      expect(result).toEqual(mockToken);
      expect(tokenRepository.find).toHaveBeenCalledWith({
        where: {
          blockchainType: mockDeployment.blockchainType,
          exchangeId: mockDeployment.exchangeId,
        },
      });

      // Verify no creation happens
      expect(harvesterService.stringsWithMulticall).not.toHaveBeenCalled();
    });

    it('should find existing token with case-insensitive matching', async () => {
      // Test the fix for the TypeORM Raw query issue
      const originalToken = {
        ...mockTokenEntity,
        address: '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2', // Mixed case (checksum format)
        symbol: 'WETH',
        name: 'Wrapped Ether',
      };
      const mockTokens = [originalToken];

      jest.spyOn(tokenRepository, 'find').mockResolvedValue(mockTokens as Token[]);

      // Spy on repository methods to verify they're not called for creation
      const createSpy = jest.spyOn(tokenRepository, 'create');
      const saveSpy = jest.spyOn(tokenRepository, 'save');

      // Request with lowercase address should find the existing mixed-case token
      const result = await service.getOrCreateTokenByAddress(
        '0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2',
        mockDeployment,
      );

      expect(result).toEqual(originalToken);
      expect(tokenRepository.find).toHaveBeenCalledWith({
        where: {
          blockchainType: mockDeployment.blockchainType,
          exchangeId: mockDeployment.exchangeId,
        },
      });

      // Verify no creation happens since existing token was found
      expect(harvesterService.stringsWithMulticall).not.toHaveBeenCalled();
      expect(createSpy).not.toHaveBeenCalled();
      expect(saveSpy).not.toHaveBeenCalled();
    });

    it('should find existing token regardless of address case variations', async () => {
      const lowercaseToken = {
        ...mockTokenEntity,
        address: '0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2', // Lowercase
        symbol: 'WETH',
        name: 'Wrapped Ether',
      };
      const mockTokens = [lowercaseToken];

      jest.spyOn(tokenRepository, 'find').mockResolvedValue(mockTokens as Token[]);

      // Spy on repository methods to verify they're not called for creation
      const createSpy = jest.spyOn(tokenRepository, 'create');
      const saveSpy = jest.spyOn(tokenRepository, 'save');

      // Request with mixed case should find the existing lowercase token
      const result = await service.getOrCreateTokenByAddress(
        '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2',
        mockDeployment,
      );

      expect(result).toEqual(lowercaseToken);
      expect(tokenRepository.find).toHaveBeenCalledWith({
        where: {
          blockchainType: mockDeployment.blockchainType,
          exchangeId: mockDeployment.exchangeId,
        },
      });

      // Verify no creation happens
      expect(harvesterService.stringsWithMulticall).not.toHaveBeenCalled();
      expect(createSpy).not.toHaveBeenCalled();
      expect(saveSpy).not.toHaveBeenCalled();
    });

    it('should create new token if not found', async () => {
      jest.spyOn(tokenRepository, 'find').mockResolvedValue([]); // No existing tokens

      // Mock token creation
      jest.spyOn(tokenRepository, 'create').mockImplementation((entity) => entity as Token);
      jest.spyOn(tokenRepository, 'save').mockImplementation(async (entity) => entity as any);

      // Mock token metadata fetching
      jest.spyOn(harvesterService, 'integersWithMulticall').mockResolvedValue([18]);
      jest
        .spyOn(harvesterService, 'stringsWithMulticall')
        .mockImplementationOnce(async () => ['NEW']) // symbol
        .mockImplementationOnce(async () => ['New Token']); // name

      const result = await service.getOrCreateTokenByAddress('0xnew', mockDeployment);

      expect(result).toEqual({
        address: '0xnew',
        symbol: 'NEW',
        decimals: 18,
        name: 'New Token',
        blockchainType: mockDeployment.blockchainType,
        exchangeId: mockDeployment.exchangeId,
      });

      expect(tokenRepository.create).toHaveBeenCalled();
      expect(tokenRepository.save).toHaveBeenCalled();
    });
  });
});
