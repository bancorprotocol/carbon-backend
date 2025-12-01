import { Test, TestingModule } from '@nestjs/testing';
import { Repository } from 'typeorm';
import { getRepositoryToken } from '@nestjs/typeorm';
import { PairService } from './pair.service';
import { Pair } from './pair.entity';
import { HarvesterService } from '../harvester/harvester.service';
import { LastProcessedBlockService } from '../last-processed-block/last-processed-block.service';
import { PairCreatedEventService } from '../events/pair-created-event/pair-created-event.service';
import { PairTradingFeePpmUpdatedEventService } from '../events/pair-trading-fee-ppm-updated-event/pair-trading-fee-ppm-updated-event.service';
import { TradingFeePpmUpdatedEventService } from '../events/trading-fee-ppm-updated-event/trading-fee-ppm-updated-event.service';
import { BlockchainType, ExchangeId, Deployment } from '../deployment/deployment.service';
import { PairCreatedEvent } from '../events/pair-created-event/pair-created-event.entity';
import { TokensByAddress } from '../token/token.service';
import { Token } from '../token/token.entity';
import { Block } from '../block/block.entity';

describe('PairService', () => {
  let service: PairService;
  let pairRepository: Repository<Pair>;
  let harvesterService: HarvesterService;
  let lastProcessedBlockService: LastProcessedBlockService;
  let pairCreatedEventService: PairCreatedEventService;
  let pairTradingFeePpmService: PairTradingFeePpmUpdatedEventService;
  let tradingFeePpmService: TradingFeePpmUpdatedEventService;

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

  const mockBlock: Block = {
    id: 1010,
    blockchainType: BlockchainType.Ethereum,
    timestamp: new Date(),
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  const mockToken0: Token = {
    id: 1,
    address: '0xtoken0',
    symbol: 'TKN0',
    name: 'Token 0',
    decimals: 18,
    blockchainType: BlockchainType.Ethereum,
    exchangeId: ExchangeId.OGEthereum,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  const mockToken1: Token = {
    id: 2,
    address: '0xtoken1',
    symbol: 'TKN1',
    name: 'Token 1',
    decimals: 18,
    blockchainType: BlockchainType.Ethereum,
    exchangeId: ExchangeId.OGEthereum,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PairService,
        {
          provide: getRepositoryToken(Pair),
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
          provide: PairTradingFeePpmUpdatedEventService,
          useValue: {
            allAsDictionary: jest.fn(),
          },
        },
        {
          provide: TradingFeePpmUpdatedEventService,
          useValue: {
            last: jest.fn(),
          },
        },
      ],
    }).compile();

    service = module.get<PairService>(PairService);
    pairRepository = module.get<Repository<Pair>>(getRepositoryToken(Pair));
    harvesterService = module.get<HarvesterService>(HarvesterService);
    lastProcessedBlockService = module.get<LastProcessedBlockService>(LastProcessedBlockService);
    pairCreatedEventService = module.get<PairCreatedEventService>(PairCreatedEventService);
    pairTradingFeePpmService = module.get<PairTradingFeePpmUpdatedEventService>(PairTradingFeePpmUpdatedEventService);
    tradingFeePpmService = module.get<TradingFeePpmUpdatedEventService>(TradingFeePpmUpdatedEventService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('createFromEvents', () => {
    it('should create pairs from valid events with existing tokens', async () => {
      const tokens: TokensByAddress = {
        '0xtoken0': mockToken0,
        '0xtoken1': mockToken1,
      };

      const mockEvent: Partial<PairCreatedEvent> = {
        token0: '0xtoken0',
        token1: '0xtoken1',
        block: mockBlock,
      };

      jest.spyOn(pairRepository, 'create').mockImplementation((entity) => entity as Pair);
      jest.spyOn(pairRepository, 'save').mockResolvedValue(undefined);

      await service.createFromEvents([mockEvent as PairCreatedEvent], tokens, mockDeployment);

      expect(pairRepository.create).toHaveBeenCalledWith({
        token0: mockToken0,
        token1: mockToken1,
        name: 'TKN0_TKN1',
        block: mockBlock,
        blockchainType: mockDeployment.blockchainType,
        exchangeId: mockDeployment.exchangeId,
      });
      expect(pairRepository.save).toHaveBeenCalled();
    });

    it('should skip pair creation when token0 does not exist', async () => {
      const loggerWarnSpy = jest.spyOn(service['logger'], 'warn').mockImplementation();

      const tokens: TokensByAddress = {
        '0xtoken1': mockToken1,
        // token0 is missing
      };

      const mockEvent: Partial<PairCreatedEvent> = {
        token0: '0xtoken0', // This token doesn't exist
        token1: '0xtoken1',
        block: mockBlock,
      };

      jest.spyOn(pairRepository, 'create').mockImplementation((entity) => entity as Pair);
      jest.spyOn(pairRepository, 'save').mockResolvedValue(undefined);

      await service.createFromEvents([mockEvent as PairCreatedEvent], tokens, mockDeployment);

      expect(loggerWarnSpy).toHaveBeenCalledWith('Token not found', '0xtoken1', '0xtoken0');
      expect(pairRepository.create).not.toHaveBeenCalled();
      expect(pairRepository.save).toHaveBeenCalledWith([]);

      loggerWarnSpy.mockRestore();
    });

    it('should skip pair creation when token1 does not exist', async () => {
      const loggerWarnSpy = jest.spyOn(service['logger'], 'warn').mockImplementation();

      const tokens: TokensByAddress = {
        '0xtoken0': mockToken0,
        // token1 is missing
      };

      const mockEvent: Partial<PairCreatedEvent> = {
        token0: '0xtoken0',
        token1: '0xtoken1', // This token doesn't exist
        block: mockBlock,
      };

      jest.spyOn(pairRepository, 'create').mockImplementation((entity) => entity as Pair);
      jest.spyOn(pairRepository, 'save').mockResolvedValue(undefined);

      await service.createFromEvents([mockEvent as PairCreatedEvent], tokens, mockDeployment);

      expect(loggerWarnSpy).toHaveBeenCalledWith('Token not found', '0xtoken1', '0xtoken0');
      expect(pairRepository.create).not.toHaveBeenCalled();
      expect(pairRepository.save).toHaveBeenCalledWith([]);

      loggerWarnSpy.mockRestore();
    });

    it('should skip pair creation when both tokens do not exist', async () => {
      const loggerWarnSpy = jest.spyOn(service['logger'], 'warn').mockImplementation();

      const tokens: TokensByAddress = {
        // Both tokens missing
      };

      const mockEvent: Partial<PairCreatedEvent> = {
        token0: '0xtoken0',
        token1: '0xtoken1',
        block: mockBlock,
      };

      jest.spyOn(pairRepository, 'create').mockImplementation((entity) => entity as Pair);
      jest.spyOn(pairRepository, 'save').mockResolvedValue(undefined);

      await service.createFromEvents([mockEvent as PairCreatedEvent], tokens, mockDeployment);

      expect(loggerWarnSpy).toHaveBeenCalledWith('Token not found', '0xtoken1', '0xtoken0');
      expect(pairRepository.create).not.toHaveBeenCalled();
      expect(pairRepository.save).toHaveBeenCalledWith([]);

      loggerWarnSpy.mockRestore();
    });

    it('should handle mixed valid and invalid events', async () => {
      const loggerWarnSpy = jest.spyOn(service['logger'], 'warn').mockImplementation();

      const mockToken2: Token = {
        id: 3,
        address: '0xtoken2',
        symbol: 'TKN2',
        name: 'Token 2',
        decimals: 6,
        blockchainType: BlockchainType.Ethereum,
        exchangeId: ExchangeId.OGEthereum,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      const tokens: TokensByAddress = {
        '0xtoken0': mockToken0,
        '0xtoken1': mockToken1,
        '0xtoken2': mockToken2,
        // '0xtoken3' is missing
      };

      const validEvent: Partial<PairCreatedEvent> = {
        token0: '0xtoken0',
        token1: '0xtoken1',
        block: mockBlock,
      };

      const invalidEvent: Partial<PairCreatedEvent> = {
        token0: '0xtoken2',
        token1: '0xtoken3', // This token doesn't exist
        block: mockBlock,
      };

      const anotherValidEvent: Partial<PairCreatedEvent> = {
        token0: '0xtoken1',
        token1: '0xtoken2',
        block: mockBlock,
      };

      jest.spyOn(pairRepository, 'create').mockImplementation((entity) => entity as Pair);
      jest.spyOn(pairRepository, 'save').mockResolvedValue(undefined);

      await service.createFromEvents(
        [validEvent as PairCreatedEvent, invalidEvent as PairCreatedEvent, anotherValidEvent as PairCreatedEvent],
        tokens,
        mockDeployment,
      );

      // Should log for the invalid event
      expect(loggerWarnSpy).toHaveBeenCalledWith('Token not found', '0xtoken3', '0xtoken2');

      // Should create pairs only for valid events
      expect(pairRepository.create).toHaveBeenCalledTimes(2);
      expect(pairRepository.save).toHaveBeenCalled();

      loggerWarnSpy.mockRestore();
    });

    it('should handle empty events array', async () => {
      const tokens: TokensByAddress = {
        '0xtoken0': mockToken0,
        '0xtoken1': mockToken1,
      };

      jest.spyOn(pairRepository, 'create').mockImplementation((entity) => entity as Pair);
      jest.spyOn(pairRepository, 'save').mockResolvedValue(undefined);

      await service.createFromEvents([], tokens, mockDeployment);

      expect(pairRepository.create).not.toHaveBeenCalled();
      expect(pairRepository.save).toHaveBeenCalledWith([]);
    });
  });

  describe('update', () => {
    it('should process pair created events and update pairs', async () => {
      const tokens: TokensByAddress = {
        '0xtoken0': mockToken0,
        '0xtoken1': mockToken1,
      };

      jest.spyOn(lastProcessedBlockService, 'getOrInit').mockResolvedValue(1000);
      jest.spyOn(lastProcessedBlockService, 'update').mockResolvedValue(undefined);

      const mockEvent: Partial<PairCreatedEvent> = {
        token0: '0xtoken0',
        token1: '0xtoken1',
        block: { ...mockBlock, id: 1010 },
      };

      jest.spyOn(pairCreatedEventService, 'get').mockResolvedValue([mockEvent as PairCreatedEvent]);
      jest.spyOn(pairRepository, 'create').mockImplementation((entity) => entity as Pair);
      jest.spyOn(pairRepository, 'save').mockResolvedValue(undefined);

      await service.update(1100, tokens, mockDeployment);

      expect(lastProcessedBlockService.getOrInit).toHaveBeenCalledWith('ethereum-ethereum-pairs', 1);
      expect(pairCreatedEventService.get).toHaveBeenCalledWith(1001, 1100, mockDeployment);
      expect(pairRepository.save).toHaveBeenCalled();
      expect(lastProcessedBlockService.update).toHaveBeenCalledWith('ethereum-ethereum-pairs', 1100);
    });

    it('should skip invalid events during update', async () => {
      const loggerWarnSpy = jest.spyOn(service['logger'], 'warn').mockImplementation();

      const tokens: TokensByAddress = {
        '0xtoken0': mockToken0,
        // token1 is missing
      };

      jest.spyOn(lastProcessedBlockService, 'getOrInit').mockResolvedValue(1000);
      jest.spyOn(lastProcessedBlockService, 'update').mockResolvedValue(undefined);

      const mockEvent: Partial<PairCreatedEvent> = {
        token0: '0xtoken0',
        token1: '0xtoken1', // This token doesn't exist
        block: { ...mockBlock, id: 1010 },
      };

      jest.spyOn(pairCreatedEventService, 'get').mockResolvedValue([mockEvent as PairCreatedEvent]);
      jest.spyOn(pairRepository, 'create').mockImplementation((entity) => entity as Pair);
      jest.spyOn(pairRepository, 'save').mockResolvedValue(undefined);

      await service.update(1100, tokens, mockDeployment);

      expect(loggerWarnSpy).toHaveBeenCalledWith('Token not found', '0xtoken1', '0xtoken0');
      expect(pairRepository.save).toHaveBeenCalledWith([]);

      loggerWarnSpy.mockRestore();
    });
  });

  describe('getSymbols', () => {
    it('should fetch symbols using multicall', async () => {
      jest.spyOn(harvesterService, 'stringsWithMulticall').mockResolvedValue(['TKN0', 'TKN1']);

      const result = await service.getSymbols(['0xtoken0', '0xtoken1'], mockDeployment);

      expect(result).toEqual(['TKN0', 'TKN1']);
      expect(harvesterService.stringsWithMulticall).toHaveBeenCalledWith(
        ['0xtoken0', '0xtoken1'],
        expect.anything(),
        'symbol',
        mockDeployment,
      );
    });

    it('should override gas token symbol', async () => {
      jest.spyOn(harvesterService, 'stringsWithMulticall').mockResolvedValue(['TKN0', 'WETH', 'TKN1']); // WETH would be replaced

      const result = await service.getSymbols(
        ['0xtoken0', mockDeployment.gasToken.address, '0xtoken1'],
        mockDeployment,
      );

      expect(result).toEqual(['TKN0', 'ETH', 'TKN1']);
    });
  });

  describe('getDecimals', () => {
    it('should fetch decimals using multicall', async () => {
      jest.spyOn(harvesterService, 'integersWithMulticall').mockResolvedValue([18, 6]);

      const result = await service.getDecimals(['0xtoken0', '0xtoken1'], mockDeployment);

      expect(result).toEqual([18, 6]);
      expect(harvesterService.integersWithMulticall).toHaveBeenCalledWith(
        ['0xtoken0', '0xtoken1'],
        expect.anything(),
        'decimals',
        mockDeployment,
      );
    });

    it('should override gas token decimals to 18', async () => {
      jest.spyOn(harvesterService, 'integersWithMulticall').mockResolvedValue([18, 8, 6]);

      const result = await service.getDecimals(
        ['0xtoken0', mockDeployment.gasToken.address, '0xtoken1'],
        mockDeployment,
      );

      expect(result).toEqual([18, 18, 6]);
    });
  });
});
