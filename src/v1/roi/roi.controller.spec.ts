import { Test, TestingModule } from '@nestjs/testing';
import { RoiController } from './roi.controller';
import { RoiService } from './roi.service';
import { DeploymentService, ExchangeId, BlockchainType, Deployment } from '../../deployment/deployment.service';

describe('RoiController', () => {
  let controller: RoiController;
  let roiService: jest.Mocked<RoiService>;
  let deploymentService: jest.Mocked<DeploymentService>;

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

  const mockRoiData = {
    pairs: [
      { pair: '0xPair1', roi: '10.5', apy: '120.5' },
      { pair: '0xPair2', roi: '5.2', apy: '60.8' },
    ],
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [RoiController],
      providers: [
        {
          provide: RoiService,
          useValue: {
            getCachedROI: jest.fn(),
          },
        },
        {
          provide: DeploymentService,
          useValue: {
            getDeploymentByExchangeId: jest.fn(),
          },
        },
      ],
    }).compile();

    controller = module.get<RoiController>(RoiController);
    roiService = module.get(RoiService);
    deploymentService = module.get(DeploymentService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('roi', () => {
    it('should return cached ROI data without recomputing', async () => {
      deploymentService.getDeploymentByExchangeId.mockReturnValue(mockDeployment);
      roiService.getCachedROI.mockResolvedValue(mockRoiData);

      const result = await controller.roi(ExchangeId.OGEthereum);

      expect(result).toEqual(mockRoiData);
      expect(deploymentService.getDeploymentByExchangeId).toHaveBeenCalledWith(ExchangeId.OGEthereum);
      expect(roiService.getCachedROI).toHaveBeenCalledWith(mockDeployment);
    });

    it('should work with different exchange IDs', async () => {
      const seiDeployment: Deployment = {
        ...mockDeployment,
        blockchainType: BlockchainType.Sei,
        exchangeId: ExchangeId.OGSei,
      };

      deploymentService.getDeploymentByExchangeId.mockReturnValue(seiDeployment);
      roiService.getCachedROI.mockResolvedValue(mockRoiData);

      const result = await controller.roi(ExchangeId.OGSei);

      expect(result).toEqual(mockRoiData);
      expect(deploymentService.getDeploymentByExchangeId).toHaveBeenCalledWith(ExchangeId.OGSei);
      expect(roiService.getCachedROI).toHaveBeenCalledWith(seiDeployment);
    });

    it('should return whatever the cache holds (including empty results)', async () => {
      deploymentService.getDeploymentByExchangeId.mockReturnValue(mockDeployment);
      roiService.getCachedROI.mockResolvedValue({ pairs: [] });

      const result = await controller.roi(ExchangeId.OGEthereum);

      expect(result).toEqual({ pairs: [] });
    });
  });
});
