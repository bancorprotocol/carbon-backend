import { Decimal } from 'decimal.js';
import {
  sortEvents,
  classifyAction,
  computeBalances,
  computeDeltas,
  getEffectiveFeePPM,
  computeTradeFee,
  getTradeDirection,
  resolveOwner,
  processStrategyEvents,
  csvRowToLine,
  CSV_HEADERS,
  RawEvent,
  TokenInfo,
  FeePPMEntry,
  VoucherTransfer,
  TradeDirectionEntry,
} from './processing';

Decimal.set({ precision: 100, toExpNeg: -100, toExpPos: 100 });

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeOrder(y: string, z?: string): string {
  return JSON.stringify({ y, z: z || y, A: '0', B: '0' });
}

function makeEvent(overrides: Partial<RawEvent> = {}): RawEvent {
  return {
    strategyId: '1',
    blockId: 100,
    transactionIndex: 0,
    logIndex: 0,
    transactionHash: '0xabc',
    timestamp: new Date('2024-01-01T00:00:00Z'),
    order0: makeOrder('0'),
    order1: makeOrder('0'),
    reason: 2,
    owner: '0xOwner',
    token0Id: 1,
    token1Id: 2,
    pairId: 10,
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// 1. Sorting
// ---------------------------------------------------------------------------

describe('sortEvents', () => {
  it('should sort by blockId', () => {
    const events = [
      { blockId: 300, transactionIndex: 0, logIndex: 0 },
      { blockId: 100, transactionIndex: 0, logIndex: 0 },
      { blockId: 200, transactionIndex: 0, logIndex: 0 },
    ];
    const sorted = sortEvents(events);
    expect(sorted.map((e) => e.blockId)).toEqual([100, 200, 300]);
  });

  it('should sort by transactionIndex within the same block', () => {
    const events = [
      { blockId: 100, transactionIndex: 5, logIndex: 0 },
      { blockId: 100, transactionIndex: 1, logIndex: 0 },
      { blockId: 100, transactionIndex: 3, logIndex: 0 },
    ];
    const sorted = sortEvents(events);
    expect(sorted.map((e) => e.transactionIndex)).toEqual([1, 3, 5]);
  });

  it('should sort by logIndex within the same block and transactionIndex', () => {
    const events = [
      { blockId: 100, transactionIndex: 1, logIndex: 10 },
      { blockId: 100, transactionIndex: 1, logIndex: 2 },
      { blockId: 100, transactionIndex: 1, logIndex: 5 },
    ];
    const sorted = sortEvents(events);
    expect(sorted.map((e) => e.logIndex)).toEqual([2, 5, 10]);
  });

  it('should handle mixed events from different sources', () => {
    const events = [
      { blockId: 200, transactionIndex: 0, logIndex: 1, type: 'updated' },
      { blockId: 100, transactionIndex: 0, logIndex: 0, type: 'created' },
      { blockId: 200, transactionIndex: 0, logIndex: 0, type: 'updated' },
      { blockId: 100, transactionIndex: 1, logIndex: 0, type: 'updated' },
    ];
    const sorted = sortEvents(events);
    expect(sorted.map((e) => `${e.blockId}-${e.transactionIndex}-${e.logIndex}`)).toEqual([
      '100-0-0',
      '100-1-0',
      '200-0-0',
      '200-0-1',
    ]);
  });

  it('should not mutate the original array', () => {
    const events = [
      { blockId: 200, transactionIndex: 0, logIndex: 0 },
      { blockId: 100, transactionIndex: 0, logIndex: 0 },
    ];
    const sorted = sortEvents(events);
    expect(events[0].blockId).toBe(200);
    expect(sorted[0].blockId).toBe(100);
  });
});

// ---------------------------------------------------------------------------
// 2. Action classification
// ---------------------------------------------------------------------------

describe('classifyAction', () => {
  it('should return deposit for reason=2 (creation)', () => {
    expect(classifyAction(2, new Decimal(100), new Decimal(50))).toBe('deposit');
  });

  it('should return deposit for reason=2 even with zero deltas', () => {
    expect(classifyAction(2, new Decimal(0), new Decimal(0))).toBe('deposit');
  });

  it('should return trade for reason=1', () => {
    expect(classifyAction(1, new Decimal(-10), new Decimal(20))).toBe('trade');
  });

  it('should return deposit for reason=0 with positive delta0', () => {
    expect(classifyAction(0, new Decimal(50), new Decimal(0))).toBe('deposit');
  });

  it('should return deposit for reason=0 with positive delta1', () => {
    expect(classifyAction(0, new Decimal(0), new Decimal(100))).toBe('deposit');
  });

  it('should return withdraw for reason=0 with negative delta0', () => {
    expect(classifyAction(0, new Decimal(-50), new Decimal(0))).toBe('withdraw');
  });

  it('should return withdraw for reason=0 with negative delta1', () => {
    expect(classifyAction(0, new Decimal(0), new Decimal(-100))).toBe('withdraw');
  });

  it('should return null for reason=0 with both deltas zero (price-only edit)', () => {
    expect(classifyAction(0, new Decimal(0), new Decimal(0))).toBeNull();
  });

  it('should return withdraw when one positive and one negative (net negative)', () => {
    expect(classifyAction(0, new Decimal(10), new Decimal(-50))).toBe('withdraw');
  });

  it('should return withdraw when negative takes priority over positive', () => {
    expect(classifyAction(0, new Decimal(-10), new Decimal(50))).toBe('withdraw');
  });
});

// ---------------------------------------------------------------------------
// 3. Balance computation
// ---------------------------------------------------------------------------

describe('computeBalances', () => {
  it('should compute balances for 18-decimal tokens', () => {
    const order0 = makeOrder('1000000000000000000'); // 1e18 = 1.0
    const order1 = makeOrder('2000000000000000000'); // 2e18 = 2.0
    const { balance0, balance1 } = computeBalances(order0, order1, 18, 18);
    expect(balance0.toString()).toBe('1');
    expect(balance1.toString()).toBe('2');
  });

  it('should compute balances for 6-decimal tokens (USDC)', () => {
    const order0 = makeOrder('1500000'); // 1.5 USDC
    const order1 = makeOrder('250000'); // 0.25 USDC
    const { balance0, balance1 } = computeBalances(order0, order1, 6, 6);
    expect(balance0.toString()).toBe('1.5');
    expect(balance1.toString()).toBe('0.25');
  });

  it('should handle mixed decimals (18 and 6)', () => {
    const order0 = makeOrder('1000000000000000000'); // 1 ETH (18 dec)
    const order1 = makeOrder('1000000'); // 1 USDC (6 dec)
    const { balance0, balance1 } = computeBalances(order0, order1, 18, 6);
    expect(balance0.toString()).toBe('1');
    expect(balance1.toString()).toBe('1');
  });

  it('should maintain precision for very large y values', () => {
    const order0 = makeOrder('34993279133544987885948');
    const { balance0 } = computeBalances(order0, makeOrder('0'), 18, 18);
    expect(balance0.toString()).toBe('34993.279133544987885948');
  });

  it('should handle zero balances', () => {
    const order0 = makeOrder('0');
    const order1 = makeOrder('0');
    const { balance0, balance1 } = computeBalances(order0, order1, 18, 18);
    expect(balance0.toString()).toBe('0');
    expect(balance1.toString()).toBe('0');
  });

  it('should handle y values exceeding 10^30', () => {
    const bigY = '29394173322282207054332469326543456';
    const order0 = makeOrder(bigY);
    const { balance0 } = computeBalances(order0, makeOrder('0'), 18, 18);
    expect(balance0.toString()).toBe('29394173322282207.054332469326543456');
  });
});

// ---------------------------------------------------------------------------
// 4. Fee calculation
// ---------------------------------------------------------------------------

describe('computeTradeFee', () => {
  const D = 18;
  const scale = new Decimal(10).pow(D);

  describe('bySource (byTargetAmount=false)', () => {
    it('should compute fee on outgoing token0 (negative delta0)', () => {
      const { token0Fee, token1Fee } = computeTradeFee(new Decimal(-100), new Decimal(50), 2000, false, D, D);
      const expected = new Decimal(100).mul(scale).mul(2000).div(1_000_000).ceil().div(scale);
      expect(token0Fee.toString()).toBe(expected.toString());
      expect(token1Fee.toString()).toBe('0');
    });

    it('should compute fee on outgoing token1 (negative delta1)', () => {
      const { token0Fee, token1Fee } = computeTradeFee(new Decimal(50), new Decimal(-200), 2000, false, D, D);
      const expected = new Decimal(200).mul(scale).mul(2000).div(1_000_000).ceil().div(scale);
      expect(token0Fee.toString()).toBe('0');
      expect(token1Fee.toString()).toBe(expected.toString());
    });

    it('should not apply fee to incoming (positive) deltas', () => {
      const { token0Fee, token1Fee } = computeTradeFee(new Decimal(100), new Decimal(50), 2000, false, D, D);
      expect(token0Fee.toString()).toBe('0');
      expect(token1Fee.toString()).toBe('0');
    });

    it('should maintain precision with feePPM=2000 (0.2%)', () => {
      const delta = new Decimal('-1000000000000000000');
      const { token0Fee } = computeTradeFee(delta, new Decimal(1), 2000, false, D, D);
      const expected = delta.abs().mul(scale).mul(2000).div(1_000_000).ceil().div(scale);
      expect(token0Fee.eq(expected)).toBe(true);
      expect(token0Fee.toString().length).toBeGreaterThan(10);
    });
  });

  describe('byTarget (byTargetAmount=true)', () => {
    it('should compute fee on incoming token0 (positive delta0)', () => {
      const { token0Fee, token1Fee } = computeTradeFee(new Decimal(100), new Decimal(-50), 2000, true, D, D);
      const expected = new Decimal(100).mul(scale).mul(2000).div(998000).ceil().div(scale);
      expect(token0Fee.toString()).toBe(expected.toString());
      expect(token1Fee.toString()).toBe('0');
    });

    it('should compute fee on incoming token1 (positive delta1)', () => {
      const { token0Fee, token1Fee } = computeTradeFee(new Decimal(-50), new Decimal(200), 2000, true, D, D);
      const expected = new Decimal(200).mul(scale).mul(2000).div(998000).ceil().div(scale);
      expect(token0Fee.toString()).toBe('0');
      expect(token1Fee.toString()).toBe(expected.toString());
    });

    it('should not apply fee to outgoing (negative) deltas', () => {
      const { token0Fee, token1Fee } = computeTradeFee(new Decimal(-100), new Decimal(-50), 2000, true, D, D);
      expect(token0Fee.toString()).toBe('0');
      expect(token1Fee.toString()).toBe('0');
    });

    it('should maintain precision with feePPM=2000 (0.2%)', () => {
      const delta = new Decimal('1000000000000000000');
      const { token0Fee } = computeTradeFee(delta, new Decimal(-1), 2000, true, D, D);
      const expected = delta.mul(scale).mul(2000).div(998000).ceil().div(scale);
      expect(token0Fee.eq(expected)).toBe(true);
      expect(token0Fee.toString().length).toBeGreaterThan(10);
    });
  });

  it('should return zero fees when feePPM is 0 (either direction)', () => {
    const r1 = computeTradeFee(new Decimal(-100), new Decimal(50), 0, false, D, D);
    expect(r1.token0Fee.toString()).toBe('0');
    expect(r1.token1Fee.toString()).toBe('0');
    const r2 = computeTradeFee(new Decimal(100), new Decimal(-50), 0, true, D, D);
    expect(r2.token0Fee.toString()).toBe('0');
    expect(r2.token1Fee.toString()).toBe('0');
  });

  it('should handle zero deltas (either direction)', () => {
    const r1 = computeTradeFee(new Decimal(0), new Decimal(0), 2000, false, D, D);
    expect(r1.token0Fee.toString()).toBe('0');
    const r2 = computeTradeFee(new Decimal(0), new Decimal(0), 2000, true, D, D);
    expect(r2.token0Fee.toString()).toBe('0');
  });

  it('should ceil raw fee to match Solidity integer rounding', () => {
    // 1 raw unit of a 6-decimal token = 0.000001
    // bySource: rawFee = 1 * 2000 / 1_000_000 = 0.002 → ceil = 1
    // fee = 1 / 10^6 = 0.000001
    // Without ceiling this would be 0.000000000002
    const { token0Fee } = computeTradeFee(new Decimal('-0.000001'), new Decimal(0), 2000, false, 6, 6);
    expect(token0Fee.toString()).toBe('0.000001');
  });
});

// ---------------------------------------------------------------------------
// 5. Fee PPM lookup
// ---------------------------------------------------------------------------

describe('getEffectiveFeePPM', () => {
  const globalHistory: FeePPMEntry[] = [
    { blockId: 100, newFeePPM: 2000 },
    { blockId: 500, newFeePPM: 3000 },
  ];

  it('should return global fee when no pair-specific exists', () => {
    const pairFeeHistory = new Map<number, FeePPMEntry[]>();
    expect(getEffectiveFeePPM(10, 200, pairFeeHistory, globalHistory)).toBe(2000);
  });

  it('should return updated global fee after change', () => {
    const pairFeeHistory = new Map<number, FeePPMEntry[]>();
    expect(getEffectiveFeePPM(10, 600, pairFeeHistory, globalHistory)).toBe(3000);
  });

  it('should return pair-specific fee when it exists', () => {
    const pairFeeHistory = new Map<number, FeePPMEntry[]>();
    pairFeeHistory.set(10, [{ blockId: 150, newFeePPM: 1500 }]);
    expect(getEffectiveFeePPM(10, 200, pairFeeHistory, globalHistory)).toBe(1500);
  });

  it('should fall back to global when pair-specific is not yet effective', () => {
    const pairFeeHistory = new Map<number, FeePPMEntry[]>();
    pairFeeHistory.set(10, [{ blockId: 300, newFeePPM: 1500 }]);
    expect(getEffectiveFeePPM(10, 200, pairFeeHistory, globalHistory)).toBe(2000);
  });

  it('should return 0 when no fee history exists at all', () => {
    expect(getEffectiveFeePPM(10, 50, new Map(), [])).toBe(0);
  });

  it('should return 0 when event is before any fee update', () => {
    expect(getEffectiveFeePPM(10, 50, new Map(), globalHistory)).toBe(0);
  });

  it('should handle multiple pair fee changes over time', () => {
    const pairFeeHistory = new Map<number, FeePPMEntry[]>();
    pairFeeHistory.set(10, [
      { blockId: 100, newFeePPM: 1000 },
      { blockId: 300, newFeePPM: 1500 },
      { blockId: 600, newFeePPM: 500 },
    ]);
    expect(getEffectiveFeePPM(10, 200, pairFeeHistory, globalHistory)).toBe(1000);
    expect(getEffectiveFeePPM(10, 400, pairFeeHistory, globalHistory)).toBe(1500);
    expect(getEffectiveFeePPM(10, 700, pairFeeHistory, globalHistory)).toBe(500);
  });

  it('should use exact blockId match', () => {
    const pairFeeHistory = new Map<number, FeePPMEntry[]>();
    pairFeeHistory.set(10, [{ blockId: 200, newFeePPM: 4000 }]);
    expect(getEffectiveFeePPM(10, 200, pairFeeHistory, globalHistory)).toBe(4000);
  });
});

// ---------------------------------------------------------------------------
// 5b. Trade direction lookup
// ---------------------------------------------------------------------------

describe('getTradeDirection', () => {
  it('should find byTargetAmount for the next TokensTraded after a StrategyUpdated', () => {
    const map = new Map<string, TradeDirectionEntry[]>();
    map.set('0xTx1', [{ logIndex: 5, byTargetAmount: false }]);
    expect(getTradeDirection('0xTx1', 3, map)).toBe(false);
  });

  it('should return true when the matching TokensTraded has byTargetAmount=true', () => {
    const map = new Map<string, TradeDirectionEntry[]>();
    map.set('0xTx1', [{ logIndex: 10, byTargetAmount: true }]);
    expect(getTradeDirection('0xTx1', 8, map)).toBe(true);
  });

  it('should pick the closest TokensTraded with logIndex > given logIndex', () => {
    const map = new Map<string, TradeDirectionEntry[]>();
    map.set('0xTx1', [
      { logIndex: 5, byTargetAmount: false },
      { logIndex: 10, byTargetAmount: true },
    ]);
    expect(getTradeDirection('0xTx1', 3, map)).toBe(false);
    expect(getTradeDirection('0xTx1', 7, map)).toBe(true);
  });

  it('should handle multicall: multiple trades in one transaction', () => {
    const map = new Map<string, TradeDirectionEntry[]>();
    map.set('0xMulti', [
      { logIndex: 3, byTargetAmount: false },
      { logIndex: 8, byTargetAmount: true },
    ]);
    // StrategyUpdated at logIndex=1 belongs to first trade (TokensTraded at logIndex=3)
    expect(getTradeDirection('0xMulti', 1, map)).toBe(false);
    // StrategyUpdated at logIndex=6 belongs to second trade (TokensTraded at logIndex=8)
    expect(getTradeDirection('0xMulti', 6, map)).toBe(true);
  });

  it('should return null for unknown transaction hash', () => {
    const map = new Map<string, TradeDirectionEntry[]>();
    expect(getTradeDirection('0xUnknown', 5, map)).toBeNull();
  });

  it('should return null when all TokensTraded have logIndex <= given logIndex', () => {
    const map = new Map<string, TradeDirectionEntry[]>();
    map.set('0xTx1', [{ logIndex: 3, byTargetAmount: false }]);
    expect(getTradeDirection('0xTx1', 5, map)).toBeNull();
  });

  it('should handle exact logIndex boundary (not matching equal logIndex)', () => {
    const map = new Map<string, TradeDirectionEntry[]>();
    map.set('0xTx1', [{ logIndex: 5, byTargetAmount: true }]);
    expect(getTradeDirection('0xTx1', 5, map)).toBeNull();
    expect(getTradeDirection('0xTx1', 4, map)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// 6. Cumulative fee balances
// ---------------------------------------------------------------------------

function makeBySourceDirectionMap(...txLogPairs: [string, number][]): Map<string, TradeDirectionEntry[]> {
  const map = new Map<string, TradeDirectionEntry[]>();
  for (const [txHash, logIndex] of txLogPairs) {
    if (!map.has(txHash)) map.set(txHash, []);
    map.get(txHash)!.push({ logIndex, byTargetAmount: false });
  }
  return map;
}

function makeByTargetDirectionMap(...txLogPairs: [string, number][]): Map<string, TradeDirectionEntry[]> {
  const map = new Map<string, TradeDirectionEntry[]>();
  for (const [txHash, logIndex] of txLogPairs) {
    if (!map.has(txHash)) map.set(txHash, []);
    map.get(txHash)!.push({ logIndex, byTargetAmount: true });
  }
  return map;
}

describe('processStrategyEvents - cumulative fees', () => {
  const token0: TokenInfo = { address: '0xToken0', symbol: 'TK0', decimals: 18 };
  const token1: TokenInfo = { address: '0xToken1', symbol: 'TK1', decimals: 18 };
  const globalFeeHistory: FeePPMEntry[] = [{ blockId: 1, newFeePPM: 2000 }];
  const pairFeeHistory = new Map<number, FeePPMEntry[]>();
  const noTransfers: VoucherTransfer[] = [];
  const emptyDirectionMap = new Map<string, TradeDirectionEntry[]>();

  it('should start cumulative fees at (0, 0) at creation', () => {
    const events: RawEvent[] = [
      makeEvent({
        reason: 2,
        order0: makeOrder('1000000000000000000'),
        order1: makeOrder('2000000000000000000'),
      }),
    ];
    const rows = processStrategyEvents(
      events,
      token0,
      token1,
      10,
      pairFeeHistory,
      globalFeeHistory,
      noTransfers,
      '0xOwner',
      emptyDirectionMap,
    );
    expect(rows).toHaveLength(1);
    expect(rows[0].token0_fee_balance).toBe('0');
    expect(rows[0].token1_fee_balance).toBe('0');
  });

  it('should accumulate fee on outgoing token0 after a bySource trade', () => {
    const events: RawEvent[] = [
      makeEvent({
        reason: 2,
        blockId: 100,
        order0: makeOrder('1000000000000000000'),
        order1: makeOrder('0'),
      }),
      makeEvent({
        reason: 1,
        blockId: 200,
        transactionIndex: 1,
        logIndex: 5,
        order0: makeOrder('500000000000000000'), // decreased by 0.5 (outgoing)
        order1: makeOrder('1000000000000000000'), // increased by 1.0 (incoming)
      }),
    ];
    const dirMap = makeBySourceDirectionMap(['0xabc', 6]);
    const rows = processStrategyEvents(
      events,
      token0,
      token1,
      10,
      pairFeeHistory,
      globalFeeHistory,
      noTransfers,
      '0xOwner',
      dirMap,
    );
    expect(rows).toHaveLength(2);
    expect(rows[0].token0_fee_balance).toBe('0');
    expect(rows[0].token1_fee_balance).toBe('0');
    // bySource: token0 flowed out by 0.5, fee = 0.5 * 2000 / 1_000_000 = 0.001
    const expectedFee = new Decimal('0.5').mul(2000).div(1_000_000);
    expect(rows[1].token0_fee_balance).toBe(expectedFee.toString());
    expect(rows[1].token1_fee_balance).toBe('0');
  });

  it('should accumulate fee on incoming token1 after a byTarget trade', () => {
    const events: RawEvent[] = [
      makeEvent({
        reason: 2,
        blockId: 100,
        order0: makeOrder('1000000000000000000'),
        order1: makeOrder('0'),
      }),
      makeEvent({
        reason: 1,
        blockId: 200,
        transactionIndex: 1,
        logIndex: 5,
        order0: makeOrder('500000000000000000'), // decreased by 0.5 (outgoing)
        order1: makeOrder('1000000000000000000'), // increased by 1.0 (incoming)
      }),
    ];
    const dirMap = makeByTargetDirectionMap(['0xabc', 6]);
    const rows = processStrategyEvents(
      events,
      token0,
      token1,
      10,
      pairFeeHistory,
      globalFeeHistory,
      noTransfers,
      '0xOwner',
      dirMap,
    );
    expect(rows).toHaveLength(2);
    // byTarget: token1 flowed in by 1.0, fee ceiled in raw units
    const scale1 = new Decimal(10).pow(18);
    const expectedFee = new Decimal(1).mul(scale1).mul(2000).div(998000).ceil().div(scale1);
    expect(rows[1].token0_fee_balance).toBe('0');
    expect(rows[1].token1_fee_balance).toBe(expectedFee.toString());
  });

  it('should not change cumulative fees on deposit', () => {
    const events: RawEvent[] = [
      makeEvent({
        reason: 2,
        blockId: 100,
        order0: makeOrder('1000000000000000000'),
        order1: makeOrder('0'),
      }),
      makeEvent({
        reason: 1,
        blockId: 200,
        transactionIndex: 1,
        logIndex: 5,
        order0: makeOrder('500000000000000000'),
        order1: makeOrder('1000000000000000000'),
      }),
      makeEvent({
        reason: 0,
        blockId: 300,
        transactionIndex: 2,
        order0: makeOrder('2000000000000000000'),
        order1: makeOrder('1000000000000000000'),
      }),
    ];
    const dirMap = makeBySourceDirectionMap(['0xabc', 6]);
    const rows = processStrategyEvents(
      events,
      token0,
      token1,
      10,
      pairFeeHistory,
      globalFeeHistory,
      noTransfers,
      '0xOwner',
      dirMap,
    );
    expect(rows).toHaveLength(3);
    expect(rows[2].token0_fee_balance).toBe(rows[1].token0_fee_balance);
    expect(rows[2].token1_fee_balance).toBe(rows[1].token1_fee_balance);
  });

  it('should strictly increase cumulative fees across multiple trades', () => {
    const events: RawEvent[] = [
      makeEvent({ reason: 2, blockId: 100, order0: makeOrder('2000000000000000000'), order1: makeOrder('0') }),
      makeEvent({
        reason: 1,
        blockId: 200,
        transactionIndex: 1,
        logIndex: 5,
        transactionHash: '0xTx1',
        order0: makeOrder('1000000000000000000'),
        order1: makeOrder('500000000000000000'),
      }),
      makeEvent({
        reason: 1,
        blockId: 300,
        transactionIndex: 2,
        logIndex: 5,
        transactionHash: '0xTx2',
        order0: makeOrder('500000000000000000'),
        order1: makeOrder('1200000000000000000'),
      }),
    ];
    const dirMap = makeBySourceDirectionMap(['0xTx1', 6], ['0xTx2', 6]);
    const rows = processStrategyEvents(
      events,
      token0,
      token1,
      10,
      pairFeeHistory,
      globalFeeHistory,
      noTransfers,
      '0xOwner',
      dirMap,
    );
    expect(rows).toHaveLength(3);

    const fee0_1 = new Decimal(rows[1].token0_fee_balance);
    const fee0_2 = new Decimal(rows[2].token0_fee_balance);
    expect(fee0_1.gt(0)).toBe(true);
    expect(fee0_2.gt(fee0_1)).toBe(true);
  });

  it('should handle mixed token0 and token1 fees (bySource)', () => {
    const events: RawEvent[] = [
      makeEvent({
        reason: 2,
        blockId: 100,
        order0: makeOrder('1000000000000000000'),
        order1: makeOrder('1000000000000000000'),
      }),
      makeEvent({
        reason: 1,
        blockId: 200,
        transactionIndex: 1,
        logIndex: 5,
        transactionHash: '0xTx1',
        order0: makeOrder('500000000000000000'),
        order1: makeOrder('1500000000000000000'),
      }),
      makeEvent({
        reason: 1,
        blockId: 300,
        transactionIndex: 2,
        logIndex: 5,
        transactionHash: '0xTx2',
        order0: makeOrder('1200000000000000000'),
        order1: makeOrder('800000000000000000'),
      }),
    ];
    const dirMap = makeBySourceDirectionMap(['0xTx1', 6], ['0xTx2', 6]);
    const rows = processStrategyEvents(
      events,
      token0,
      token1,
      10,
      pairFeeHistory,
      globalFeeHistory,
      noTransfers,
      '0xOwner',
      dirMap,
    );
    expect(rows).toHaveLength(3);
    // Trade 1 (bySource): fee on outgoing token0
    expect(new Decimal(rows[1].token0_fee_balance).gt(0)).toBe(true);
    expect(rows[1].token1_fee_balance).toBe('0');
    // Trade 2 (bySource): fee on outgoing token1, token0 fee unchanged
    expect(rows[2].token0_fee_balance).toBe(rows[1].token0_fee_balance);
    expect(new Decimal(rows[2].token1_fee_balance).gt(0)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// 7. Owner resolution
// ---------------------------------------------------------------------------

describe('resolveOwner', () => {
  it('should return creation owner when no transfers exist', () => {
    expect(resolveOwner(200, 0, 0, '0xCreator', [])).toBe('0xCreator');
  });

  it('should return new owner after a transfer', () => {
    const transfers: VoucherTransfer[] = [
      { strategyId: '1', blockId: 150, transactionIndex: 0, logIndex: 0, to: '0xNew' },
    ];
    expect(resolveOwner(200, 0, 0, '0xCreator', transfers)).toBe('0xNew');
  });

  it('should return creation owner for events before the transfer', () => {
    const transfers: VoucherTransfer[] = [
      { strategyId: '1', blockId: 150, transactionIndex: 0, logIndex: 0, to: '0xNew' },
    ];
    expect(resolveOwner(100, 0, 0, '0xCreator', transfers)).toBe('0xCreator');
  });

  it('should return most recent owner for multiple transfers', () => {
    const transfers: VoucherTransfer[] = [
      { strategyId: '1', blockId: 100, transactionIndex: 0, logIndex: 0, to: '0xA' },
      { strategyId: '1', blockId: 200, transactionIndex: 0, logIndex: 0, to: '0xB' },
      { strategyId: '1', blockId: 300, transactionIndex: 0, logIndex: 0, to: '0xC' },
    ];
    expect(resolveOwner(250, 0, 0, '0xCreator', transfers)).toBe('0xB');
    expect(resolveOwner(350, 0, 0, '0xCreator', transfers)).toBe('0xC');
    expect(resolveOwner(50, 0, 0, '0xCreator', transfers)).toBe('0xCreator');
  });

  it('should handle transfer at the same block/tx/log as the event', () => {
    const transfers: VoucherTransfer[] = [
      { strategyId: '1', blockId: 200, transactionIndex: 5, logIndex: 3, to: '0xNew' },
    ];
    expect(resolveOwner(200, 5, 3, '0xCreator', transfers)).toBe('0xNew');
  });

  it('should handle transfer at same block but higher txIndex', () => {
    const transfers: VoucherTransfer[] = [
      { strategyId: '1', blockId: 200, transactionIndex: 10, logIndex: 0, to: '0xNew' },
    ];
    expect(resolveOwner(200, 5, 0, '0xCreator', transfers)).toBe('0xCreator');
  });

  it('should handle transfer at same block and txIndex but higher logIndex', () => {
    const transfers: VoucherTransfer[] = [
      { strategyId: '1', blockId: 200, transactionIndex: 5, logIndex: 10, to: '0xNew' },
    ];
    expect(resolveOwner(200, 5, 5, '0xCreator', transfers)).toBe('0xCreator');
  });
});

// ---------------------------------------------------------------------------
// 8. End-to-end (processStrategyEvents)
// ---------------------------------------------------------------------------

describe('processStrategyEvents - end-to-end', () => {
  const token0: TokenInfo = { address: '0xAAA', symbol: 'ETH', decimals: 18 };
  const token1: TokenInfo = { address: '0xBBB', symbol: 'USDC', decimals: 6 };
  const globalFeeHistory: FeePPMEntry[] = [{ blockId: 1, newFeePPM: 2000 }];
  const pairFeeHistory = new Map<number, FeePPMEntry[]>();

  it('should handle full lifecycle: create -> trade -> deposit -> trade -> withdraw', () => {
    const events: RawEvent[] = [
      // Create: deposit 1 ETH + 1000 USDC
      makeEvent({
        reason: 2,
        blockId: 100,
        logIndex: 0,
        order0: makeOrder('1000000000000000000'), // 1 ETH
        order1: makeOrder('1000000000'), // 1000 USDC (6 dec -> 1000 * 1e6)
      }),
      // Trade: sell 0.5 ETH, receive 500 USDC
      makeEvent({
        reason: 1,
        blockId: 200,
        transactionIndex: 1,
        logIndex: 0,
        order0: makeOrder('500000000000000000'), // 0.5 ETH
        order1: makeOrder('1500000000'), // 1500 USDC
      }),
      // Deposit: add 2 ETH
      makeEvent({
        reason: 0,
        blockId: 300,
        transactionIndex: 2,
        logIndex: 0,
        order0: makeOrder('2500000000000000000'), // 2.5 ETH
        order1: makeOrder('1500000000'), // 1500 USDC unchanged
      }),
      // Trade: receive 0.3 ETH, sell 300 USDC
      makeEvent({
        reason: 1,
        blockId: 400,
        transactionIndex: 3,
        logIndex: 0,
        order0: makeOrder('2800000000000000000'), // 2.8 ETH
        order1: makeOrder('1200000000'), // 1200 USDC
      }),
      // Withdraw: remove 1 ETH
      makeEvent({
        reason: 0,
        blockId: 500,
        transactionIndex: 4,
        logIndex: 0,
        order0: makeOrder('1800000000000000000'), // 1.8 ETH
        order1: makeOrder('1200000000'), // 1200 USDC unchanged
      }),
    ];

    const dirMap = makeBySourceDirectionMap(['0xabc', 1], ['0xabc', 1]);
    // Both trades at logIndex=0 need a TokensTraded at logIndex=1 in the same tx
    // But trades are in different blocks/txs, so use separate tx hashes
    const events2 = events.map((e, i) => {
      if (e.reason === 1 && e.blockId === 200) return { ...e, transactionHash: '0xTrade1', logIndex: 5 };
      if (e.reason === 1 && e.blockId === 400) return { ...e, transactionHash: '0xTrade2', logIndex: 5 };
      return e;
    });
    const dirMap2 = makeBySourceDirectionMap(['0xTrade1', 6], ['0xTrade2', 6]);

    const rows = processStrategyEvents(
      events2,
      token0,
      token1,
      10,
      pairFeeHistory,
      globalFeeHistory,
      [],
      '0xOwner',
      dirMap2,
    );
    expect(rows).toHaveLength(5);

    // Row 0: Create (deposit)
    expect(rows[0].action).toBe('deposit');
    expect(rows[0].token0_balance).toBe('1');
    expect(rows[0].token1_balance).toBe('1000');
    expect(rows[0].token0_fee_balance).toBe('0');
    expect(rows[0].token1_fee_balance).toBe('0');
    expect(rows[0].strategy_owner).toBe('0xOwner');
    expect(rows[0].token0_address).toBe('0xAAA');
    expect(rows[0].token1_symbol).toBe('USDC');

    // Row 1: Trade (bySource) - ETH flowed out by 0.5, fee on outgoing ETH
    expect(rows[1].action).toBe('trade');
    expect(rows[1].token0_balance).toBe('0.5');
    expect(rows[1].token1_balance).toBe('1500');
    const ethFee1 = new Decimal('0.5').mul(2000).div(1_000_000);
    expect(rows[1].token0_fee_balance).toBe(ethFee1.toString());
    expect(rows[1].token1_fee_balance).toBe('0');

    // Row 2: Deposit - fees unchanged
    expect(rows[2].action).toBe('deposit');
    expect(rows[2].token0_balance).toBe('2.5');
    expect(rows[2].token0_fee_balance).toBe(ethFee1.toString());
    expect(rows[2].token1_fee_balance).toBe('0');

    // Row 3: Trade (bySource) - USDC flowed out by 300, fee on outgoing USDC
    expect(rows[3].action).toBe('trade');
    expect(rows[3].token0_balance).toBe('2.8');
    expect(rows[3].token1_balance).toBe('1200');
    const usdcFee = new Decimal(300).mul(2000).div(1_000_000);
    expect(rows[3].token0_fee_balance).toBe(ethFee1.toString());
    expect(rows[3].token1_fee_balance).toBe(usdcFee.toString());

    // Row 4: Withdraw - fees unchanged
    expect(rows[4].action).toBe('withdraw');
    expect(rows[4].token0_balance).toBe('1.8');
    expect(rows[4].token0_fee_balance).toBe(ethFee1.toString());
    expect(rows[4].token1_fee_balance).toBe(usdcFee.toString());
  });

  it('should skip price-only edits', () => {
    const events: RawEvent[] = [
      makeEvent({
        reason: 2,
        blockId: 100,
        order0: makeOrder('1000000000000000000'),
        order1: makeOrder('0'),
      }),
      makeEvent({
        reason: 0,
        blockId: 200,
        transactionIndex: 1,
        order0: makeOrder('1000000000000000000'), // same balance, different A/B
        order1: makeOrder('0'),
      }),
    ];
    const rows = processStrategyEvents(
      events,
      token0,
      token1,
      10,
      pairFeeHistory,
      globalFeeHistory,
      [],
      '0xOwner',
      new Map(),
    );
    expect(rows).toHaveLength(1);
    expect(rows[0].action).toBe('deposit');
  });

  it('should resolve owner changes across events', () => {
    const transfers: VoucherTransfer[] = [
      { strategyId: '1', blockId: 250, transactionIndex: 0, logIndex: 0, to: '0xBuyer' },
    ];
    const events: RawEvent[] = [
      makeEvent({ reason: 2, blockId: 100, order0: makeOrder('1000000000000000000'), order1: makeOrder('0') }),
      makeEvent({
        reason: 1,
        blockId: 200,
        transactionIndex: 1,
        order0: makeOrder('500000000000000000'),
        order1: makeOrder('500000000'),
      }),
      makeEvent({
        reason: 1,
        blockId: 300,
        transactionIndex: 2,
        order0: makeOrder('200000000000000000'),
        order1: makeOrder('1000000000'),
      }),
    ];
    const dirMap = makeBySourceDirectionMap(['0xabc', 99]);
    const rows = processStrategyEvents(
      events,
      token0,
      token1,
      10,
      pairFeeHistory,
      globalFeeHistory,
      transfers,
      '0xOwner',
      dirMap,
    );
    expect(rows[0].strategy_owner).toBe('0xOwner');
    expect(rows[1].strategy_owner).toBe('0xOwner');
    expect(rows[2].strategy_owner).toBe('0xBuyer');
  });

  it('should preserve precision through entire pipeline', () => {
    const t0: TokenInfo = { address: '0xA', symbol: 'A', decimals: 18 };
    const t1: TokenInfo = { address: '0xB', symbol: 'B', decimals: 18 };
    const events: RawEvent[] = [
      makeEvent({
        reason: 2,
        blockId: 100,
        order0: makeOrder('34993279133544987885948'),
        order1: makeOrder('29394173322282207054332469326543456'),
      }),
    ];
    const rows = processStrategyEvents(events, t0, t1, 10, pairFeeHistory, globalFeeHistory, [], '0xOwner', new Map());
    expect(rows[0].token0_balance).toBe('34993.279133544987885948');
    expect(rows[0].token1_balance).toBe('29394173322282207.054332469326543456');
  });
});

// ---------------------------------------------------------------------------
// CSV formatting
// ---------------------------------------------------------------------------

describe('csvRowToLine', () => {
  it('should produce a comma-separated line', () => {
    const row = {
      action: 'trade',
      direction: 'bySource',
      block_number: 12345,
      timestamp: '2024-01-01T00:00:00.000Z',
      transaction_hash: '0xTxHash',
      transaction_index: 5,
      log_index: 3,
      strategy_owner: '0xOwner',
      strategy_id: '1',
      token0_address: '0xAAA',
      token1_address: '0xBBB',
      token0_symbol: 'ETH',
      token1_symbol: 'USDC',
      token0_delta: '-0.5',
      token1_delta: '100',
      token0_balance: '1.5',
      token1_balance: '1000',
      fee_ppm: '2000',
      token0_fee_delta: '0.001',
      token1_fee_delta: '0',
      token0_fee_balance: '0.001',
      token1_fee_balance: '0.5',
    };
    const line = csvRowToLine(row);
    expect(line).toBe(
      'trade,bySource,12345,2024-01-01T00:00:00.000Z,0xTxHash,5,3,"0xOwner","1",0xAAA,0xBBB,ETH,USDC,-0.5,100,1.5,1000,2000,0.001,0,0.001,0.5',
    );
  });

  it('should quote values containing commas', () => {
    const row = {
      action: 'trade',
      direction: 'byTarget',
      block_number: 100,
      timestamp: '2024-01-01T00:00:00.000Z',
      transaction_hash: '0xTx',
      transaction_index: 0,
      log_index: 0,
      strategy_owner: '0xOwner',
      strategy_id: '1',
      token0_address: '0xAAA',
      token1_address: '0xBBB',
      token0_symbol: 'A,B',
      token1_symbol: 'C',
      token0_delta: '0',
      token1_delta: '0',
      token0_balance: '0',
      token1_balance: '0',
      fee_ppm: '0',
      token0_fee_delta: '0',
      token1_fee_delta: '0',
      token0_fee_balance: '0',
      token1_fee_balance: '0',
    };
    const line = csvRowToLine(row);
    expect(line).toContain('"A,B"');
  });

  it('should have correct number of headers', () => {
    expect(CSV_HEADERS).toHaveLength(22);
  });
});

// ---------------------------------------------------------------------------
// computeDeltas
// ---------------------------------------------------------------------------

describe('computeDeltas', () => {
  it('should compute positive deltas', () => {
    const { delta0, delta1 } = computeDeltas(new Decimal(10), new Decimal(20), new Decimal(5), new Decimal(8));
    expect(delta0.toString()).toBe('5');
    expect(delta1.toString()).toBe('12');
  });

  it('should compute negative deltas', () => {
    const { delta0, delta1 } = computeDeltas(new Decimal(3), new Decimal(5), new Decimal(10), new Decimal(20));
    expect(delta0.toString()).toBe('-7');
    expect(delta1.toString()).toBe('-15');
  });

  it('should compute zero deltas', () => {
    const { delta0, delta1 } = computeDeltas(new Decimal(10), new Decimal(20), new Decimal(10), new Decimal(20));
    expect(delta0.toString()).toBe('0');
    expect(delta1.toString()).toBe('0');
  });
});
