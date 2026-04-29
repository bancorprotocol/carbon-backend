import { ConfigService } from '@nestjs/config';
import { UpdaterService } from './updater.service';
import { BlockchainType, Deployment, ExchangeId } from '../deployment/deployment.service';

describe('UpdaterService realtime gating', () => {
  let scheduleDeploymentUpdateSpy: jest.SpyInstance;
  let scheduleRealtimeSpy: jest.SpyInstance;
  let initWssSpy: jest.SpyInstance;

  const baseDeployment: Deployment = {
    blockchainType: BlockchainType.Ethereum,
    exchangeId: ExchangeId.OGEthereum,
    rpcEndpoint: 'https://eth-mainnet.example.com',
    startBlock: 1,
    harvestConcurrency: 1,
    harvestEventsBatchSize: 100,
    multicallAddress: '0xMulticall',
    gasToken: { name: 'Ethereum', symbol: 'ETH', address: '0xEee' },
    contracts: { CarbonController: { address: '0xCarbon' } },
  };

  function makeService(env: Record<string, string | undefined>, deployments: Deployment[]): UpdaterService {
    const configService = {
      get: (key: string) => env[key],
    } as unknown as ConfigService;

    const deploymentService = {
      getDeployments: () => deployments,
    } as any;

    const noop = {} as any;
    const redis = { client: { get: jest.fn(), set: jest.fn(), setex: jest.fn() } };

    return new UpdaterService(
      configService,
      noop, // harvesterService
      noop, // tokenService
      noop, // pairService
      noop, // pairCreatedEventService
      noop, // strategyService
      noop, // tokensTradedEventService
      noop, // roiService
      noop, // coingeckoService
      noop, // tradingFeePpmUpdatedEventService
      noop, // pairTradingFeePpmUpdatedEventService
      noop, // analyticsService
      noop, // dexScreenerV2Service
      noop, // tvlService
      deploymentService,
      noop, // arbitrageExecutedEventService
      noop, // arbitrageExecutedEventServiceV2
      noop, // vortexTokensTradedEventService
      noop, // vortexTradingResetEventService
      noop, // vortexFundsWithdrawnEventService
      noop, // notificationService
      noop, // protectionRemovedEventService
      noop, // activityV2Service
      noop, // carbonPriceService
      noop, // carbonGraphPriceService
      noop, // quoteService
      noop, // historicQuoteService
      noop, // merklProcessorService
      noop, // strategyRealtimeService
      redis,
    );
  }

  beforeEach(() => {
    scheduleDeploymentUpdateSpy = jest
      .spyOn(UpdaterService.prototype as any, 'scheduleDeploymentUpdate')
      .mockImplementation(() => undefined);
    scheduleRealtimeSpy = jest
      .spyOn(UpdaterService.prototype as any, 'scheduleRealtimeStrategyUpdate')
      .mockImplementation(() => undefined);
    initWssSpy = jest
      .spyOn(UpdaterService.prototype as any, 'initWssRealtimeStrategy')
      .mockImplementation(() => undefined);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('when SHOULD_HARVEST is not enabled', () => {
    it('schedules nothing', () => {
      makeService({ SHOULD_HARVEST: '0' }, [baseDeployment]);

      expect(scheduleDeploymentUpdateSpy).not.toHaveBeenCalled();
      expect(scheduleRealtimeSpy).not.toHaveBeenCalled();
      expect(initWssSpy).not.toHaveBeenCalled();
    });

    it('schedules nothing when env is unset', () => {
      makeService({}, [baseDeployment]);

      expect(scheduleDeploymentUpdateSpy).not.toHaveBeenCalled();
      expect(scheduleRealtimeSpy).not.toHaveBeenCalled();
      expect(initWssSpy).not.toHaveBeenCalled();
    });
  });

  describe('when SHOULD_HARVEST=1', () => {
    it('schedules periodic realtime polling as a fallback when wssEndpoint is missing', () => {
      const deployments = [{ ...baseDeployment, wssEndpoint: undefined }];

      makeService({ SHOULD_HARVEST: '1' }, deployments);

      expect(scheduleDeploymentUpdateSpy).toHaveBeenCalledTimes(1);
      expect(scheduleRealtimeSpy).toHaveBeenCalledTimes(1);
      expect(scheduleRealtimeSpy).toHaveBeenCalledWith(deployments[0], 30000);
      expect(initWssSpy).not.toHaveBeenCalled();
    });

    it('skips periodic polling and initializes WSS when wssEndpoint is present', () => {
      const deployments = [{ ...baseDeployment, wssEndpoint: 'wss://example.com' }];

      makeService({ SHOULD_HARVEST: '1' }, deployments);

      expect(scheduleRealtimeSpy).not.toHaveBeenCalled();
      expect(initWssSpy).toHaveBeenCalledTimes(1);
      expect(initWssSpy).toHaveBeenCalledWith(deployments[0]);
    });

    it('handles mixed deployments: WSS init for chains with wssEndpoint, polling fallback for those without', () => {
      const deployments = [
        { ...baseDeployment, exchangeId: ExchangeId.OGEthereum, wssEndpoint: 'wss://eth.example.com' },
        { ...baseDeployment, exchangeId: ExchangeId.OGSei, blockchainType: BlockchainType.Sei, wssEndpoint: undefined },
      ];

      makeService({ SHOULD_HARVEST: '1' }, deployments);

      expect(initWssSpy).toHaveBeenCalledTimes(1);
      expect(initWssSpy).toHaveBeenCalledWith(deployments[0]);
      expect(scheduleRealtimeSpy).toHaveBeenCalledTimes(1);
      expect(scheduleRealtimeSpy).toHaveBeenCalledWith(deployments[1], 30000);
    });
  });
});
