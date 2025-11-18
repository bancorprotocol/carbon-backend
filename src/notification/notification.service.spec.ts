import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { NotificationService } from './notification.service';
import { LastProcessedBlockService } from '../last-processed-block/last-processed-block.service';
import { ArbitrageExecutedEventService } from '../events/arbitrage-executed-event/arbitrage-executed-event.service';
import { ArbitrageExecutedEventServiceV2 } from '../events/arbitrage-executed-event-v2/arbitrage-executed-event-v2.service';
import { VortexFundsWithdrawnEventService } from '../events/vortex-funds-withdrawn-event/vortex-funds-withdrawn-event.service';
import { VortexTokensTradedEventService } from '../events/vortex-tokens-traded-event/vortex-tokens-traded-event.service';
import { VortexTradingResetEventService } from '../events/vortex-trading-reset-event/vortex-trading-reset-event.service';
import { StrategyCreatedEventService } from '../events/strategy-created-event/strategy-created-event.service';
import { TokensTradedEventService } from '../events/tokens-traded-event/tokens-traded-event.service';
import { ProtectionRemovedEventService } from '../events/protection-removed-event/protection-removed-event.service';
import { Deployment, BlockchainType, ExchangeId } from '../deployment/deployment.service';
import { EventTypes } from '../events/event-types';

jest.mock('@google-cloud/tasks', () => ({
  CloudTasksClient: jest.fn().mockImplementation(() => ({
    queuePath: jest.fn().mockReturnValue('projects/test/locations/us-central1/queues/test-queue'),
    createTask: jest.fn().mockResolvedValue([{}]),
  })),
}));

describe('NotificationService', () => {
  let service: NotificationService;
  let configService: jest.Mocked<ConfigService>;
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
    notifications: {
      explorerUrl: 'https://etherscan.io',
      carbonWalletUrl: 'https://app.carbondefi.xyz',
      title: 'Test Network',
      disabledEvents: [],
      telegram: {
        botToken: 'test-token',
        threads: {
          carbonThreadId: 123,
          fastlaneId: 456,
        },
      },
    },
  };

  const createMockEventService = () => ({
    get: jest.fn().mockResolvedValue([{ id: 1 }, { id: 2 }]),
  });

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        NotificationService,
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn((key: string) => {
              const config = {
                GOOGLE_CLOUD_PROJECT: 'test-project',
                QUEUE_NAME: 'test-queue',
                QUEUE_LOCATION: 'us-central1',
                SEND_NOTIFICATIONS: '1',
                TELEGRAM_CALLBACK_URL: 'https://telegram.callback.url',
              };
              return config[key];
            }),
          },
        },
        {
          provide: LastProcessedBlockService,
          useValue: {
            get: jest.fn().mockResolvedValue(1000),
            getOrInit: jest.fn().mockResolvedValue(1000),
            update: jest.fn().mockResolvedValue(undefined),
          },
        },
        {
          provide: VortexTokensTradedEventService,
          useValue: createMockEventService(),
        },
        {
          provide: ArbitrageExecutedEventService,
          useValue: createMockEventService(),
        },
        {
          provide: ArbitrageExecutedEventServiceV2,
          useValue: createMockEventService(),
        },
        {
          provide: VortexTradingResetEventService,
          useValue: createMockEventService(),
        },
        {
          provide: VortexFundsWithdrawnEventService,
          useValue: createMockEventService(),
        },
        {
          provide: StrategyCreatedEventService,
          useValue: createMockEventService(),
        },
        {
          provide: TokensTradedEventService,
          useValue: createMockEventService(),
        },
        {
          provide: ProtectionRemovedEventService,
          useValue: createMockEventService(),
        },
      ],
    }).compile();

    service = module.get<NotificationService>(NotificationService);
    configService = module.get(ConfigService);
    lastProcessedBlockService = module.get(LastProcessedBlockService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('update', () => {
    it('should return early if notifications not configured', async () => {
      const deploymentWithoutNotifications = { ...mockDeployment, notifications: undefined };

      await service.update(2000, deploymentWithoutNotifications);

      expect(lastProcessedBlockService.getOrInit).not.toHaveBeenCalled();
    });

    it('should return early if SEND_NOTIFICATIONS is not enabled', async () => {
      configService.get.mockImplementation((key: string) => {
        if (key === 'SEND_NOTIFICATIONS') return '0';
        return 'test-value';
      });

      const newService = new NotificationService(
        configService,
        null as any,
        null as any,
        null as any,
        null as any,
        null as any,
        null as any,
        lastProcessedBlockService,
        null as any,
        null as any,
      );

      await newService.update(2000, mockDeployment);

      expect(lastProcessedBlockService.getOrInit).not.toHaveBeenCalled();
    });

    it('should throw error if QUEUE_NAME or QUEUE_LOCATION not set', async () => {
      configService.get.mockImplementation((key: string) => {
        if (key === 'QUEUE_NAME' || key === 'QUEUE_LOCATION') return undefined;
        if (key === 'SEND_NOTIFICATIONS') return '1';
        return 'test-value';
      });

      const newService = new NotificationService(
        configService,
        null as any,
        null as any,
        null as any,
        null as any,
        null as any,
        null as any,
        lastProcessedBlockService,
        null as any,
        null as any,
      );

      await expect(newService.update(2000, mockDeployment)).rejects.toThrow('QUEUE_NAME or QUEUE_LOCATION is not set');
    });

    it('should process block ranges in batches', async () => {
      lastProcessedBlockService.getOrInit.mockResolvedValue(1000);

      await service.update(200000, mockDeployment);

      expect(lastProcessedBlockService.update).toHaveBeenCalled();
      expect(lastProcessedBlockService.update).toHaveBeenCalledWith(expect.stringContaining('notifications'), 200000);
    });

    it('should update last processed block for each batch', async () => {
      lastProcessedBlockService.getOrInit.mockResolvedValue(1000);

      await service.update(150000, mockDeployment);

      expect(lastProcessedBlockService.update).toHaveBeenCalledWith(
        expect.stringContaining('notifications'),
        expect.any(Number),
      );
    });

    it('should skip disabled events', async () => {
      const deploymentWithDisabledEvents = {
        ...mockDeployment,
        notifications: {
          explorerUrl: mockDeployment.notifications.explorerUrl,
          carbonWalletUrl: mockDeployment.notifications.carbonWalletUrl,
          title: mockDeployment.notifications.title,
          telegram: mockDeployment.notifications.telegram,
          disabledEvents: [EventTypes.TokensTradedEvent],
        },
      };

      lastProcessedBlockService.getOrInit.mockResolvedValue(1000);

      await service.update(2000, deploymentWithDisabledEvents);

      expect(lastProcessedBlockService.update).toHaveBeenCalled();
    });
  });
});
