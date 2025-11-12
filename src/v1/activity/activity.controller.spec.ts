import { Test, TestingModule } from '@nestjs/testing';
import { ActivityController } from './activity.controller';
import { ActivityV2Service } from '../../activity/activity-v2.service';
import { DeploymentService, ExchangeId, BlockchainType, Deployment } from '../../deployment/deployment.service';

describe('ActivityController', () => {
  let controller: ActivityController;
  let activityV2Service: jest.Mocked<ActivityV2Service>;
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

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [ActivityController],
      providers: [
        {
          provide: ActivityV2Service,
          useValue: {
            getFilteredActivities: jest.fn(),
            getActivityMeta: jest.fn(),
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

    controller = module.get<ActivityController>(ActivityController);
    activityV2Service = module.get(ActivityV2Service);
    deploymentService = module.get(DeploymentService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('activity', () => {
    it('should return formatted activity data', async () => {
      const mockActivities = [
        {
          action: 'token_sell_executed',
          strategyId: 123,
          currentOwner: '0xOwner',
          baseSellTokenAddress: '0xBase',
          quoteBuyTokenAddress: '0xQuote',
          buyBudget: 1000,
          buyPriceA: 1.5,
          buyPriceB: 2.0,
          buyPriceMarg: 1.75,
          sellBudget: 2000,
          sellPriceA: 1.8,
          sellPriceB: 2.2,
          sellPriceMarg: 2.0,
          blockNumber: 1000,
          txhash: '0xTx',
          timestamp: new Date('2024-01-01T12:00:00Z'),
        },
      ];

      deploymentService.getDeploymentByExchangeId.mockReturnValue(mockDeployment);
      activityV2Service.getFilteredActivities.mockResolvedValue(mockActivities as any);

      const result = await controller.activity(ExchangeId.OGEthereum, { limit: 100 });

      expect(result).toHaveLength(1);
      expect(result[0]).toEqual({
        action: 'sell',
        strategy: {
          id: 123,
          owner: '0xOwner',
          base: '0xBase',
          quote: '0xQuote',
          buy: {
            budget: '1000',
            min: '1.5',
            max: '2',
            marginal: '1.75',
          },
          sell: {
            budget: '2000',
            min: '1.8',
            max: '2.2',
            marginal: '2',
          },
        },
        blockNumber: 1000,
        txHash: '0xTx',
        timestamp: 1704110400,
      });
    });

    it('should include changes when present', async () => {
      const mockActivities = [
        {
          action: 'strategy_updated',
          strategyId: 123,
          currentOwner: '0xOwner',
          baseSellTokenAddress: '0xBase',
          quoteBuyTokenAddress: '0xQuote',
          buyBudget: 1000,
          buyPriceA: 1.5,
          buyPriceB: 2.0,
          buyPriceMarg: 1.75,
          sellBudget: 2000,
          sellPriceA: 1.8,
          sellPriceB: 2.2,
          sellPriceMarg: 2.0,
          buyBudgetChange: 100,
          sellBudgetChange: 200,
          buyPriceADelta: 0.1,
          blockNumber: 1000,
          txhash: '0xTx',
          timestamp: new Date('2024-01-01T12:00:00Z'),
        },
      ];

      deploymentService.getDeploymentByExchangeId.mockReturnValue(mockDeployment);
      activityV2Service.getFilteredActivities.mockResolvedValue(mockActivities as any);

      const result = await controller.activity(ExchangeId.OGEthereum, { limit: 100 });

      expect(result[0].changes).toBeDefined();
      expect(result[0].changes.buy).toEqual({
        budget: '100',
        min: '0.1',
      });
      expect(result[0].changes.sell).toEqual({
        budget: '200',
      });
    });

    it('should format different action types correctly', async () => {
      const actions = [
        'token_sell_executed',
        'token_buy_executed',
        'strategy_created',
        'strategy_deposit',
        'strategy_withdraw',
        'strategy_transfer',
        'strategy_edit',
        'strategy_deleted',
        'strategy_pause',
      ];

      const expectedActions = ['sell', 'buy', 'create', 'deposit', 'withdraw', 'transfer', 'edit', 'delete', 'pause'];

      for (let i = 0; i < actions.length; i++) {
        const mockActivities = [
          {
            action: actions[i],
            strategyId: 123,
            currentOwner: '0xOwner',
            baseSellTokenAddress: '0xBase',
            quoteBuyTokenAddress: '0xQuote',
            buyBudget: 1000,
            buyPriceA: 1.5,
            buyPriceB: 2.0,
            buyPriceMarg: 1.75,
            sellBudget: 2000,
            sellPriceA: 1.8,
            sellPriceB: 2.2,
            sellPriceMarg: 2.0,
            blockNumber: 1000,
            txhash: '0xTx',
            timestamp: new Date('2024-01-01T12:00:00Z'),
          },
        ];

        activityV2Service.getFilteredActivities.mockResolvedValue(mockActivities as any);

        const result = await controller.activity(ExchangeId.OGEthereum, { limit: 100 });

        expect(result[0].action).toBe(expectedActions[i]);
      }
    });

    it('should handle owner change in changes object', async () => {
      const mockActivities = [
        {
          action: 'strategy_transfer',
          strategyId: 123,
          currentOwner: '0xNewOwner',
          baseSellTokenAddress: '0xBase',
          quoteBuyTokenAddress: '0xQuote',
          buyBudget: 1000,
          buyPriceA: 1.5,
          buyPriceB: 2.0,
          buyPriceMarg: 1.75,
          sellBudget: 2000,
          sellPriceA: 1.8,
          sellPriceB: 2.2,
          sellPriceMarg: 2.0,
          newOwner: '0xNewOwner',
          oldOwner: '0xOldOwner',
          blockNumber: 1000,
          txhash: '0xTx',
          timestamp: new Date('2024-01-01T12:00:00Z'),
        },
      ];

      deploymentService.getDeploymentByExchangeId.mockReturnValue(mockDeployment);
      activityV2Service.getFilteredActivities.mockResolvedValue(mockActivities as any);

      const result = await controller.activity(ExchangeId.OGEthereum, { limit: 100 });

      expect(result[0].changes.owner).toBe('0xOldOwner');
    });
  });

  describe('activityMeta', () => {
    it('should return activity meta with formatted actions', async () => {
      const mockMeta = {
        actions: ['token_sell_executed', 'token_buy_executed', 'strategy_created'],
      };

      deploymentService.getDeploymentByExchangeId.mockReturnValue(mockDeployment);
      activityV2Service.getActivityMeta.mockResolvedValue(mockMeta as any);

      const result = await controller.activityMeta(ExchangeId.OGEthereum, {});

      expect(result.actions).toEqual(['sell', 'buy', 'create']);
    });
  });

  describe('activityV2', () => {
    it('should call the same logic as activity', async () => {
      const mockActivities = [
        {
          action: 'token_sell_executed',
          strategyId: 123,
          currentOwner: '0xOwner',
          baseSellTokenAddress: '0xBase',
          quoteBuyTokenAddress: '0xQuote',
          buyBudget: 1000,
          buyPriceA: 1.5,
          buyPriceB: 2.0,
          buyPriceMarg: 1.75,
          sellBudget: 2000,
          sellPriceA: 1.8,
          sellPriceB: 2.2,
          sellPriceMarg: 2.0,
          blockNumber: 1000,
          txhash: '0xTx',
          timestamp: new Date('2024-01-01T12:00:00Z'),
        },
      ];

      deploymentService.getDeploymentByExchangeId.mockReturnValue(mockDeployment);
      activityV2Service.getFilteredActivities.mockResolvedValue(mockActivities as any);

      const result = await controller.activityV2(ExchangeId.OGEthereum, { limit: 100 });

      expect(result).toHaveLength(1);
      expect(result[0].action).toBe('sell');
    });
  });

  describe('activityV2Meta', () => {
    it('should call the same logic as activityMeta', async () => {
      const mockMeta = {
        actions: ['token_sell_executed', 'token_buy_executed'],
      };

      deploymentService.getDeploymentByExchangeId.mockReturnValue(mockDeployment);
      activityV2Service.getActivityMeta.mockResolvedValue(mockMeta as any);

      const result = await controller.activityV2Meta(ExchangeId.OGEthereum, {});

      expect(result.actions).toEqual(['sell', 'buy']);
    });
  });
});
