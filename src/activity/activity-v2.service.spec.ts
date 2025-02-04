import { StrategyCreatedEvent } from '../events/strategy-created-event/strategy-created-event.entity';
import { StrategyUpdatedEvent } from '../events/strategy-updated-event/strategy-updated-event.entity';
import { StrategyDeletedEvent } from '../events/strategy-deleted-event/strategy-deleted-event.entity';
import { BlockchainType, Deployment, ExchangeId } from '../deployment/deployment.service';
import { TokensByAddress } from '../token/token.service';
import { createActivityFromEvent } from './activity.utils';
import { StrategyState } from './activity.types';

describe('ActivityV2Service - Action Determination', () => {
  const mockDeployment: Deployment = {
    blockchainType: BlockchainType.Ethereum,
    exchangeId: ExchangeId.OGEthereum,
    startBlock: 1,
    rpcEndpoint: '',
    harvestEventsBatchSize: 0,
    harvestConcurrency: 0,
    multicallAddress: '',
    gasToken: undefined,
    contracts: {},
  };

  const mockTokens: TokensByAddress = {
    '0xtoken0': {
      id: 1,
      address: '0xtoken0',
      symbol: 'TKN0',
      decimals: 18,
      blockchainType: mockDeployment.blockchainType,
      exchangeId: mockDeployment.exchangeId,
      name: 'Token 0',
      createdAt: new Date(),
      updatedAt: new Date(),
    },
    '0xtoken1': {
      id: 2,
      address: '0xtoken1',
      symbol: 'TKN1',
      decimals: 18,
      blockchainType: mockDeployment.blockchainType,
      exchangeId: mockDeployment.exchangeId,
      name: 'Token 1',
      createdAt: new Date(),
      updatedAt: new Date(),
    },
  };

  // Create a mock strategy states map for tests
  const mockStrategyStates = new Map<string, StrategyState>();

  it('should create activity with create_strategy action for StrategyCreatedEvent', () => {
    const event = {
      strategyId: '1',
      owner: '0xowner',
      token0: { address: '0xtoken0', symbol: 'TKN0' },
      token1: { address: '0xtoken1', symbol: 'TKN1' },
      order0: JSON.stringify({ y: '100', A: '1', B: '1' }),
      order1: JSON.stringify({ y: '100', A: '1', B: '1' }),
      timestamp: new Date(),
      transactionHash: '0xtx',
      block: { id: 1 },
      transactionIndex: 0,
      logIndex: 0,
    } as StrategyCreatedEvent;

    const activity = createActivityFromEvent(event, 'create_strategy', mockDeployment, mockTokens, mockStrategyStates);

    expect(activity.action).toBe('create_strategy');
  });

  it('should convert edit_price to strategy_paused when all prices are zero', () => {
    const event = {
      strategyId: '1',
      token0: { address: '0xtoken0', symbol: 'TKN0' },
      token1: { address: '0xtoken1', symbol: 'TKN1' },
      order0: JSON.stringify({ y: '100', A: '0', B: '0' }),
      order1: JSON.stringify({ y: '100', A: '0', B: '0' }),
      timestamp: new Date(),
      transactionHash: '0xtx',
      block: { id: 1 },
      transactionIndex: 0,
      logIndex: 0,
      reason: 0,
    } as StrategyUpdatedEvent;

    // Set up mock strategy state
    mockStrategyStates.set('1', {
      currentOwner: '0xowner',
      creationWallet: '0xowner',
      order0: JSON.stringify({ y: '100', A: '1', B: '1' }),
      order1: JSON.stringify({ y: '100', A: '1', B: '1' }),
      token0: mockTokens['0xtoken0'],
      token1: mockTokens['0xtoken1'],
      lastProcessedBlock: 0,
    });

    const activity = createActivityFromEvent(event, 'edit_price', mockDeployment, mockTokens, mockStrategyStates);

    expect(activity.action).toBe('strategy_paused');
  });

  it('should maintain edit_price action when prices are not zero', () => {
    const event = {
      strategyId: '1',
      token0: { address: '0xtoken0', symbol: 'TKN0' },
      token1: { address: '0xtoken1', symbol: 'TKN1' },
      order0: JSON.stringify({ y: '100', A: '1', B: '1' }),
      order1: JSON.stringify({ y: '100', A: '1', B: '1' }),
      timestamp: new Date(),
      transactionHash: '0xtx',
      block: { id: 1 },
      transactionIndex: 0,
      logIndex: 0,
      reason: 0,
    } as StrategyUpdatedEvent;

    // Set up mock strategy state
    mockStrategyStates.set('1', {
      currentOwner: '0xowner',
      creationWallet: '0xowner',
      order0: JSON.stringify({ y: '100', A: '2', B: '2' }),
      order1: JSON.stringify({ y: '100', A: '2', B: '2' }),
      token0: mockTokens['0xtoken0'],
      token1: mockTokens['0xtoken1'],
      lastProcessedBlock: 0,
    });

    const activity = createActivityFromEvent(event, 'edit_price', mockDeployment, mockTokens, mockStrategyStates);

    expect(activity.action).toBe('edit_price');
  });

  it('should set action to deleted for StrategyDeletedEvent', () => {
    const event = {
      strategyId: '1',
      token0: { address: '0xtoken0', symbol: 'TKN0' },
      token1: { address: '0xtoken1', symbol: 'TKN1' },
      order0: JSON.stringify({ y: '0', A: '0', B: '0' }),
      order1: JSON.stringify({ y: '0', A: '0', B: '0' }),
      timestamp: new Date(),
      transactionHash: '0xtx',
      block: { id: 1 },
      transactionIndex: 0,
      logIndex: 0,
    } as StrategyDeletedEvent;

    const activity = createActivityFromEvent(event, 'deleted', mockDeployment, mockTokens, mockStrategyStates);

    expect(activity.action).toBe('deleted');
  });

  it('should set buy_low action for trade events with token1 sold', () => {
    const event = {
      strategyId: '1',
      token0: { address: '0xtoken0', symbol: 'TKN0' },
      token1: { address: '0xtoken1', symbol: 'TKN1' },
      order0: JSON.stringify({ y: '150', A: '1', B: '1' }), // Increased token0
      order1: JSON.stringify({ y: '50', A: '1', B: '1' }), // Decreased token1
      timestamp: new Date(),
      transactionHash: '0xtx',
      block: { id: 1 },
      transactionIndex: 0,
      logIndex: 0,
      reason: 1, // Trade event
    } as StrategyUpdatedEvent;

    // Set up mock strategy state
    mockStrategyStates.set('1', {
      currentOwner: '0xowner',
      creationWallet: '0xowner',
      order0: JSON.stringify({ y: '100', A: '1', B: '1' }),
      order1: JSON.stringify({ y: '100', A: '1', B: '1' }),
      token0: mockTokens['0xtoken0'],
      token1: mockTokens['0xtoken1'],
      lastProcessedBlock: 0,
    });

    const activity = createActivityFromEvent(event, 'edit_price', mockDeployment, mockTokens, mockStrategyStates);

    expect(activity.action).toBe('buy_low');
  });

  it('should set sell_high action for trade events with token0 sold', () => {
    const event = {
      strategyId: '1',
      token0: { address: '0xtoken0', symbol: 'TKN0' },
      token1: { address: '0xtoken1', symbol: 'TKN1' },
      order0: JSON.stringify({ y: '50', A: '1', B: '1' }), // Decreased token0
      order1: JSON.stringify({ y: '150', A: '1', B: '1' }), // Increased token1
      timestamp: new Date(),
      transactionHash: '0xtx',
      block: { id: 1 },
      transactionIndex: 0,
      logIndex: 0,
      reason: 1, // Trade event
    } as StrategyUpdatedEvent;

    // Set up mock strategy state
    mockStrategyStates.set('1', {
      currentOwner: '0xowner',
      creationWallet: '0xowner',
      order0: JSON.stringify({ y: '100', A: '1', B: '1' }),
      order1: JSON.stringify({ y: '100', A: '1', B: '1' }),
      token0: mockTokens['0xtoken0'],
      token1: mockTokens['0xtoken1'],
      lastProcessedBlock: 0,
    });

    const activity = createActivityFromEvent(event, 'edit_price', mockDeployment, mockTokens, mockStrategyStates);

    expect(activity.action).toBe('sell_high');
  });

  afterEach(() => {
    // Clear the strategy states between tests
    mockStrategyStates.clear();
  });
});
