import { Test, TestingModule } from '@nestjs/testing';
import { RoiController } from './roi.controller';
import { RoiService } from './roi.service';
import { DeploymentService, ExchangeId, BlockchainType, Deployment } from '../../deployment/deployment.service';
import { QuoteService } from '../../quote/quote.service';

describe('RoiController', () => {
  let controller: RoiController;
  let roiService: jest.Mocked<RoiService>;
  let deploymentService: jest.Mocked<DeploymentService>;
  let quoteService: jest.Mocked<QuoteService>;

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

  const mockAllQuotes = {
    '0xToken1': { tokenAddress: '0xToken1', usd: '100', eth: '0.05' } as any,
    '0xToken2': { tokenAddress: '0xToken2', usd: '200', eth: '0.1' } as any,
  } as any;

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
            update: jest.fn(),
            getCachedROI: jest.fn(),
          },
        },
        {
          provide: DeploymentService,
          useValue: {
            getDeploymentByExchangeId: jest.fn(),
          },
        },
        {
          provide: QuoteService,
          useValue: {
            allByAddress: jest.fn(),
          },
        },
      ],
    }).compile();

    controller = module.get<RoiController>(RoiController);
    roiService = module.get(RoiService);
    deploymentService = module.get(DeploymentService);
    quoteService = module.get(QuoteService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('roi', () => {
    it('should return cached ROI data', async () => {
      deploymentService.getDeploymentByExchangeId.mockReturnValue(mockDeployment);
      quoteService.allByAddress.mockResolvedValue(mockAllQuotes);
      roiService.update.mockResolvedValue(undefined);
      roiService.getCachedROI.mockResolvedValue(mockRoiData);

      const result = await controller.roi(ExchangeId.OGEthereum);

      expect(result).toEqual(mockRoiData);
      expect(deploymentService.getDeploymentByExchangeId).toHaveBeenCalledWith(ExchangeId.OGEthereum);
      expect(quoteService.allByAddress).toHaveBeenCalledWith(mockDeployment);
      expect(roiService.update).toHaveBeenCalledWith(mockDeployment, Object.values(mockAllQuotes));
      expect(roiService.getCachedROI).toHaveBeenCalledWith(mockDeployment);
    });

    it('should convert quotes object to array for update', async () => {
      deploymentService.getDeploymentByExchangeId.mockReturnValue(mockDeployment);
      quoteService.allByAddress.mockResolvedValue(mockAllQuotes);
      roiService.update.mockResolvedValue(undefined);
      roiService.getCachedROI.mockResolvedValue(mockRoiData);

      await controller.roi(ExchangeId.OGEthereum);

      const expectedQuotesArray = [
        { tokenAddress: '0xToken1', usd: '100', eth: '0.05' },
        { tokenAddress: '0xToken2', usd: '200', eth: '0.1' },
      ];
      expect(roiService.update).toHaveBeenCalledWith(mockDeployment, expectedQuotesArray);
    });

    it('should work with different exchange IDs', async () => {
      const seiDeployment: Deployment = {
        ...mockDeployment,
        blockchainType: BlockchainType.Sei,
        exchangeId: ExchangeId.OGSei,
      };

      deploymentService.getDeploymentByExchangeId.mockReturnValue(seiDeployment);
      quoteService.allByAddress.mockResolvedValue(mockAllQuotes);
      roiService.update.mockResolvedValue(undefined);
      roiService.getCachedROI.mockResolvedValue(mockRoiData);

      const result = await controller.roi(ExchangeId.OGSei);

      expect(result).toEqual(mockRoiData);
      expect(deploymentService.getDeploymentByExchangeId).toHaveBeenCalledWith(ExchangeId.OGSei);
    });

    it('should handle empty quotes', async () => {
      deploymentService.getDeploymentByExchangeId.mockReturnValue(mockDeployment);
      quoteService.allByAddress.mockResolvedValue({});
      roiService.update.mockResolvedValue(undefined);
      roiService.getCachedROI.mockResolvedValue({ pairs: [] });

      const result = await controller.roi(ExchangeId.OGEthereum);

      expect(result).toEqual({ pairs: [] });
      expect(roiService.update).toHaveBeenCalledWith(mockDeployment, []);
    });
  });
});
