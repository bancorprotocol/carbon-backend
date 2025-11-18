import { Test, TestingModule } from '@nestjs/testing';
import { StateController } from './state.controller';
import { DeploymentService, ExchangeId, BlockchainType, Deployment } from '../../deployment/deployment.service';
import { LastProcessedBlockService } from '../../last-processed-block/last-processed-block.service';

describe('StateController', () => {
  let controller: StateController;
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

  const mockState = {
    lastBlock: 12345,
    timestamp: new Date('2024-01-01T12:00:00Z'),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [StateController],
      providers: [
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

    controller = module.get<StateController>(StateController);
    deploymentService = module.get(DeploymentService);
    lastProcessedBlockService = module.get(LastProcessedBlockService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('state', () => {
    it('should return state from lastProcessedBlockService', async () => {
      deploymentService.getDeploymentByExchangeId.mockReturnValue(mockDeployment);
      lastProcessedBlockService.getState.mockResolvedValue(mockState);

      const result = await controller.state(ExchangeId.OGEthereum);

      expect(result).toEqual(mockState);
      expect(deploymentService.getDeploymentByExchangeId).toHaveBeenCalledWith(ExchangeId.OGEthereum);
      expect(lastProcessedBlockService.getState).toHaveBeenCalledWith(mockDeployment);
    });

    it('should work with different exchange IDs', async () => {
      const seiDeployment: Deployment = {
        ...mockDeployment,
        blockchainType: BlockchainType.Sei,
        exchangeId: ExchangeId.OGSei,
      };

      deploymentService.getDeploymentByExchangeId.mockReturnValue(seiDeployment);
      lastProcessedBlockService.getState.mockResolvedValue(mockState);

      const result = await controller.state(ExchangeId.OGSei);

      expect(result).toEqual(mockState);
      expect(deploymentService.getDeploymentByExchangeId).toHaveBeenCalledWith(ExchangeId.OGSei);
    });

    it('should return different state data', async () => {
      const customState = {
        lastBlock: 99999,
        timestamp: new Date('2023-06-15T08:30:45Z'),
      };

      deploymentService.getDeploymentByExchangeId.mockReturnValue(mockDeployment);
      lastProcessedBlockService.getState.mockResolvedValue(customState);

      const result = await controller.state(ExchangeId.OGEthereum);

      expect(result).toEqual(customState);
      expect(result.lastBlock).toBe(99999);
    });
  });
});
