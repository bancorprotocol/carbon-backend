import { Test, TestingModule } from '@nestjs/testing';
import { NotificationController } from './notification.controller';
import { TelegramService } from './telegram.service';
import { EventTypes } from '../events/event-types';
import { ArbitrageExecutedEventService } from '../events/arbitrage-executed-event/arbitrage-executed-event.service';
import { ArbitrageExecutedEventServiceV2 } from '../events/arbitrage-executed-event-v2/arbitrage-executed-event-v2.service';
import { VortexTokensTradedEventService } from '../events/vortex-tokens-traded-event/vortex-tokens-traded-event.service';
import { VortexTradingResetEventService } from '../events/vortex-trading-reset-event/vortex-trading-reset-event.service';
import { VortexFundsWithdrawnEventService } from '../events/vortex-funds-withdrawn-event/vortex-funds-withdrawn-event.service';
import { DeploymentService, BlockchainType, ExchangeId, Deployment } from '../deployment/deployment.service';
import { TokenService } from '../token/token.service';
import { QuoteService } from '../quote/quote.service';
import { StrategyCreatedEventService } from '../events/strategy-created-event/strategy-created-event.service';
import { TokensTradedEventService } from '../events/tokens-traded-event/tokens-traded-event.service';
import { ProtectionRemovedEventService } from '../events/protection-removed-event/protection-removed-event.service';

describe('NotificationController', () => {
  let controller: NotificationController;
  let telegramService: jest.Mocked<TelegramService>;
  let vortexTokensTradedEventService: jest.Mocked<VortexTokensTradedEventService>;
  let arbitrageExecutedEventService: jest.Mocked<ArbitrageExecutedEventService>;
  let deploymentService: jest.Mocked<DeploymentService>;
  let tokenService: jest.Mocked<TokenService>;
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

  const mockEvent = {
    id: 1,
    exchangeId: ExchangeId.OGEthereum,
    amount: '1000',
  } as any;

  const mockTokens = {
    '0xToken1': { address: '0xToken1', symbol: 'TKN1', name: 'Token 1', decimals: 18 },
  };

  const mockQuotes = {
    '0xToken1': { tokenAddress: '0xToken1', usd: '100', eth: '0.05' },
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [NotificationController],
      providers: [
        {
          provide: TelegramService,
          useValue: {
            sendEventNotification: jest.fn(),
          },
        },
        {
          provide: VortexTokensTradedEventService,
          useValue: {
            getOne: jest.fn(),
          },
        },
        {
          provide: ArbitrageExecutedEventService,
          useValue: {
            getOne: jest.fn(),
          },
        },
        {
          provide: ArbitrageExecutedEventServiceV2,
          useValue: {
            getOne: jest.fn(),
          },
        },
        {
          provide: VortexTradingResetEventService,
          useValue: {
            getOne: jest.fn(),
          },
        },
        {
          provide: VortexFundsWithdrawnEventService,
          useValue: {
            getOne: jest.fn(),
          },
        },
        {
          provide: DeploymentService,
          useValue: {
            getDeploymentByExchangeId: jest.fn(),
          },
        },
        {
          provide: TokenService,
          useValue: {
            allByAddress: jest.fn(),
          },
        },
        {
          provide: QuoteService,
          useValue: {
            allByAddress: jest.fn(),
          },
        },
        {
          provide: StrategyCreatedEventService,
          useValue: {
            getOne: jest.fn(),
          },
        },
        {
          provide: TokensTradedEventService,
          useValue: {
            getOne: jest.fn(),
          },
        },
        {
          provide: ProtectionRemovedEventService,
          useValue: {
            getOne: jest.fn(),
          },
        },
      ],
    }).compile();

    controller = module.get<NotificationController>(NotificationController);
    telegramService = module.get(TelegramService);
    vortexTokensTradedEventService = module.get(VortexTokensTradedEventService);
    arbitrageExecutedEventService = module.get(ArbitrageExecutedEventService);
    deploymentService = module.get(DeploymentService);
    tokenService = module.get(TokenService);
    quoteService = module.get(QuoteService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('sendTelegramNotification', () => {
    it('should send notification for VortexTokensTradedEvent', async () => {
      const data = { eventType: EventTypes.VortexTokensTradedEvent, eventId: 1 };

      vortexTokensTradedEventService.getOne.mockResolvedValue(mockEvent);
      deploymentService.getDeploymentByExchangeId.mockReturnValue(mockDeployment);
      tokenService.allByAddress.mockResolvedValue(mockTokens as any);
      quoteService.allByAddress.mockResolvedValue(mockQuotes as any);
      telegramService.sendEventNotification.mockResolvedValue(undefined);

      await controller.sendTelegramNotification(data);

      expect(vortexTokensTradedEventService.getOne).toHaveBeenCalledWith(1);
      expect(deploymentService.getDeploymentByExchangeId).toHaveBeenCalledWith(ExchangeId.OGEthereum);
      expect(tokenService.allByAddress).toHaveBeenCalledWith(mockDeployment);
      expect(quoteService.allByAddress).toHaveBeenCalledWith(mockDeployment);
      expect(telegramService.sendEventNotification).toHaveBeenCalledWith(
        EventTypes.VortexTokensTradedEvent,
        mockEvent,
        mockTokens,
        mockQuotes,
        mockDeployment,
      );
    });

    it('should send notification for ArbitrageExecutedEvent', async () => {
      const data = { eventType: EventTypes.ArbitrageExecutedEvent, eventId: 2 };

      arbitrageExecutedEventService.getOne.mockResolvedValue(mockEvent);
      deploymentService.getDeploymentByExchangeId.mockReturnValue(mockDeployment);
      tokenService.allByAddress.mockResolvedValue(mockTokens as any);
      quoteService.allByAddress.mockResolvedValue(mockQuotes as any);
      telegramService.sendEventNotification.mockResolvedValue(undefined);

      await controller.sendTelegramNotification(data);

      expect(arbitrageExecutedEventService.getOne).toHaveBeenCalledWith(2);
      expect(telegramService.sendEventNotification).toHaveBeenCalledWith(
        EventTypes.ArbitrageExecutedEvent,
        mockEvent,
        mockTokens,
        mockQuotes,
        mockDeployment,
      );
    });

    it('should throw error for unsupported event type', async () => {
      const data = { eventType: 'UnsupportedEventType' as EventTypes, eventId: 1 };

      await expect(controller.sendTelegramNotification(data)).rejects.toThrow('Unsupported event type');
    });
  });
});
