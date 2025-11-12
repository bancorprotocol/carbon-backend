import { Test, TestingModule } from '@nestjs/testing';
import { WalletPairBalanceController } from './wallet-pair-balance.controller';
import { WalletPairBalanceService } from '../../wallet-pair-balance/wallet-pair-balance.service';
import { DeploymentService, ExchangeId, BlockchainType, Deployment } from '../../deployment/deployment.service';
import { LastProcessedBlockService } from '../../last-processed-block/last-processed-block.service';

describe('WalletPairBalanceController', () => {
  let controller: WalletPairBalanceController;
  let walletPairBalanceService: jest.Mocked<WalletPairBalanceService>;
  let deploymentService: jest.Mocked<DeploymentService>;
  let lastProcessedBlockService: jest.Mocked<LastProcessedBlockService>;

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

  const mockBalances = [
    {
      wallet: '0xWallet1',
      pair: '0xPair1',
      balance0: '1000',
      balance1: '2000',
    },
    {
      wallet: '0xWallet2',
      pair: '0xPair2',
      balance0: '3000',
      balance1: '4000',
    },
  ];

  const mockBlockState = {
    lastBlock: 12345,
    timestamp: new Date('2024-01-01T12:00:00Z'),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [WalletPairBalanceController],
      providers: [
        {
          provide: WalletPairBalanceService,
          useValue: {
            getLatestBalances: jest.fn(),
          },
        },
        {
          provide: DeploymentService,
          useValue: {
            getDeploymentByExchangeId: jest.fn(),
          },
        },
        {
          provide: LastProcessedBlockService,
          useValue: {
            getState: jest.fn(),
          },
        },
      ],
    }).compile();

    controller = module.get<WalletPairBalanceController>(WalletPairBalanceController);
    walletPairBalanceService = module.get(WalletPairBalanceService);
    deploymentService = module.get(DeploymentService);
    lastProcessedBlockService = module.get(LastProcessedBlockService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('getWalletPairBalances', () => {
    it('should return wallet pair balances with block state', async () => {
      deploymentService.getDeploymentByExchangeId.mockReturnValue(mockDeployment);
      walletPairBalanceService.getLatestBalances.mockResolvedValue(mockBalances);
      lastProcessedBlockService.getState.mockResolvedValue(mockBlockState);

      const result = await controller.getWalletPairBalances(ExchangeId.OGEthereum);

      expect(result).toEqual({
        blockNumber: 12345,
        blockTimestamp: 1704110400,
        data: mockBalances,
      });

      expect(deploymentService.getDeploymentByExchangeId).toHaveBeenCalledWith(ExchangeId.OGEthereum);
      expect(walletPairBalanceService.getLatestBalances).toHaveBeenCalledWith(mockDeployment);
      expect(lastProcessedBlockService.getState).toHaveBeenCalledWith(mockDeployment);
    });

    it('should handle empty balances', async () => {
      deploymentService.getDeploymentByExchangeId.mockReturnValue(mockDeployment);
      walletPairBalanceService.getLatestBalances.mockResolvedValue([]);
      lastProcessedBlockService.getState.mockResolvedValue(mockBlockState);

      const result = await controller.getWalletPairBalances(ExchangeId.OGEthereum);

      expect(result).toEqual({
        blockNumber: 12345,
        blockTimestamp: 1704110400,
        data: [],
      });
    });

    it('should work with different exchange IDs', async () => {
      const seiDeployment: Deployment = {
        ...mockDeployment,
        blockchainType: BlockchainType.Sei,
        exchangeId: ExchangeId.OGSei,
      };

      deploymentService.getDeploymentByExchangeId.mockReturnValue(seiDeployment);
      walletPairBalanceService.getLatestBalances.mockResolvedValue(mockBalances);
      lastProcessedBlockService.getState.mockResolvedValue(mockBlockState);

      const result = await controller.getWalletPairBalances(ExchangeId.OGSei);

      expect(result.data).toEqual(mockBalances);
      expect(deploymentService.getDeploymentByExchangeId).toHaveBeenCalledWith(ExchangeId.OGSei);
    });

    it('should correctly convert timestamp to Unix epoch seconds', async () => {
      const customBlockState = {
        lastBlock: 99999,
        timestamp: new Date('2023-06-15T08:30:45.123Z'),
      };

      deploymentService.getDeploymentByExchangeId.mockReturnValue(mockDeployment);
      walletPairBalanceService.getLatestBalances.mockResolvedValue(mockBalances);
      lastProcessedBlockService.getState.mockResolvedValue(customBlockState);

      const result = await controller.getWalletPairBalances(ExchangeId.OGEthereum);

      const expectedTimestamp = Math.floor(customBlockState.timestamp.getTime() / 1000);
      expect(result.blockTimestamp).toBe(expectedTimestamp);
      expect(result.blockNumber).toBe(99999);
    });
  });
});
