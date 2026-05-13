import { Decimal } from 'decimal.js';

Decimal.set({
  precision: 100,
  toExpNeg: -100,
  toExpPos: 100,
});

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface RawEvent {
  strategyId: string;
  blockId: number;
  transactionIndex: number;
  logIndex: number;
  transactionHash: string;
  timestamp: Date;
  order0: string;
  order1: string;
  reason: number; // 2 = created, 1 = trade, 0 = user update
  owner?: string; // only on created events
  token0Id: number;
  token1Id: number;
  pairId: number;
}

export interface TokenInfo {
  address: string;
  symbol: string;
  decimals: number;
}

export interface FeePPMEntry {
  blockId: number;
  newFeePPM: number;
}

export interface VoucherTransfer {
  strategyId: string;
  blockId: number;
  transactionIndex: number;
  logIndex: number;
  to: string;
}

export interface TradeDirectionEntry {
  logIndex: number;
  byTargetAmount: boolean;
}

export interface CsvRow {
  action: string;
  direction: string;
  block_number: number;
  timestamp: string;
  transaction_hash: string;
  transaction_index: number;
  log_index: number;
  strategy_owner: string;
  strategy_id: string;
  token0_address: string;
  token1_address: string;
  token0_symbol: string;
  token1_symbol: string;
  token0_delta: string;
  token1_delta: string;
  token0_balance: string;
  token1_balance: string;
  fee_ppm: string;
  token0_fee_delta: string;
  token1_fee_delta: string;
  token0_fee_balance: string;
  token1_fee_balance: string;
}

interface StrategyProcessingState {
  previousBalance0: Decimal;
  previousBalance1: Decimal;
  cumulativeFee0: Decimal;
  cumulativeFee1: Decimal;
  owner: string;
}

// ---------------------------------------------------------------------------
// Sorting
// ---------------------------------------------------------------------------

export function sortEvents<T extends { blockId: number; transactionIndex: number; logIndex: number }>(
  events: T[],
): T[] {
  return events.slice().sort((a, b) => {
    if (a.blockId !== b.blockId) return a.blockId - b.blockId;
    if (a.transactionIndex !== b.transactionIndex) return a.transactionIndex - b.transactionIndex;
    return a.logIndex - b.logIndex;
  });
}

// ---------------------------------------------------------------------------
// Balance computation
// ---------------------------------------------------------------------------

export function computeBalances(
  order0Json: string,
  order1Json: string,
  decimals0: number,
  decimals1: number,
): { balance0: Decimal; balance1: Decimal } {
  const order0 = JSON.parse(order0Json);
  const order1 = JSON.parse(order1Json);

  const y0 = new Decimal(order0.y || 0);
  const y1 = new Decimal(order1.y || 0);

  const balance0 = y0.div(new Decimal(10).pow(decimals0));
  const balance1 = y1.div(new Decimal(10).pow(decimals1));

  return { balance0, balance1 };
}

// ---------------------------------------------------------------------------
// Delta computation
// ---------------------------------------------------------------------------

export function computeDeltas(
  currentBalance0: Decimal,
  currentBalance1: Decimal,
  previousBalance0: Decimal,
  previousBalance1: Decimal,
): { delta0: Decimal; delta1: Decimal } {
  return {
    delta0: currentBalance0.minus(previousBalance0),
    delta1: currentBalance1.minus(previousBalance1),
  };
}

// ---------------------------------------------------------------------------
// Action classification
// ---------------------------------------------------------------------------

export function classifyAction(
  reason: number,
  delta0: Decimal,
  delta1: Decimal,
): 'deposit' | 'trade' | 'withdraw' | null {
  if (reason === 2) return 'deposit';
  if (reason === 1) return 'trade';

  if (reason === 0) {
    const hasPositive = delta0.gt(0) || delta1.gt(0);
    const hasNegative = delta0.lt(0) || delta1.lt(0);

    if (hasNegative) return 'withdraw';
    if (hasPositive) return 'deposit';
    return null;
  }

  return null;
}

// ---------------------------------------------------------------------------
// Fee PPM lookup
// ---------------------------------------------------------------------------

export function getEffectiveFeePPM(
  pairId: number,
  blockId: number,
  pairFeeHistory: Map<number, FeePPMEntry[]>,
  globalFeeHistory: FeePPMEntry[],
): number {
  const pairEntries = pairFeeHistory.get(pairId);
  if (pairEntries && pairEntries.length > 0) {
    const entry = findMostRecentEntry(pairEntries, blockId);
    if (entry !== null) return entry.newFeePPM;
  }

  const globalEntry = findMostRecentEntry(globalFeeHistory, blockId);
  if (globalEntry !== null) return globalEntry.newFeePPM;

  return 0;
}

function findMostRecentEntry(entries: FeePPMEntry[], blockId: number): FeePPMEntry | null {
  let lo = 0;
  let hi = entries.length - 1;
  let result: FeePPMEntry | null = null;

  while (lo <= hi) {
    const mid = (lo + hi) >>> 1;
    if (entries[mid].blockId <= blockId) {
      result = entries[mid];
      lo = mid + 1;
    } else {
      hi = mid - 1;
    }
  }

  return result;
}

// ---------------------------------------------------------------------------
// Trade direction lookup
// ---------------------------------------------------------------------------

export function getTradeDirection(
  transactionHash: string,
  logIndex: number,
  tradeDirectionMap: Map<string, TradeDirectionEntry[]>,
): boolean | null {
  const entries = tradeDirectionMap.get(transactionHash);
  if (!entries || entries.length === 0) return null;

  // Binary search for the smallest entry.logIndex > logIndex
  let lo = 0;
  let hi = entries.length - 1;
  let result: TradeDirectionEntry | null = null;

  while (lo <= hi) {
    const mid = (lo + hi) >>> 1;
    if (entries[mid].logIndex > logIndex) {
      result = entries[mid];
      hi = mid - 1;
    } else {
      lo = mid + 1;
    }
  }

  return result !== null ? result.byTargetAmount : null;
}

// ---------------------------------------------------------------------------
// Trade fee computation
// ---------------------------------------------------------------------------

export function computeTradeFee(
  delta0: Decimal,
  delta1: Decimal,
  feePPM: number,
  byTargetAmount: boolean,
  decimals0: number,
  decimals1: number,
): { token0Fee: Decimal; token1Fee: Decimal } {
  if (feePPM === 0) {
    return { token0Fee: new Decimal(0), token1Fee: new Decimal(0) };
  }

  const feePPMDecimal = new Decimal(feePPM);
  const million = new Decimal(1_000_000);
  const scale0 = new Decimal(10).pow(decimals0);
  const scale1 = new Decimal(10).pow(decimals1);

  let token0Fee = new Decimal(0);
  let token1Fee = new Decimal(0);

  if (byTargetAmount) {
    // byTarget (_addFee): amountIncludingFee = ceil(source * 1M / (1M - fee))
    // tradingFee = amountIncludingFee - source → effectively ceiled
    const denominator = million.minus(feePPMDecimal);
    if (delta0.gt(0)) {
      const raw = delta0.mul(scale0);
      token0Fee = raw.mul(feePPMDecimal).div(denominator).ceil().div(scale0);
    }
    if (delta1.gt(0)) {
      const raw = delta1.mul(scale1);
      token1Fee = raw.mul(feePPMDecimal).div(denominator).ceil().div(scale1);
    }
  } else {
    // bySource (_subtractFee): amountExcludingFee = floor(target * (1M - fee) / 1M)
    // tradingFee = target - amountExcludingFee → effectively ceiled
    if (delta0.lt(0)) {
      const raw = delta0.abs().mul(scale0);
      token0Fee = raw.mul(feePPMDecimal).div(million).ceil().div(scale0);
    }
    if (delta1.lt(0)) {
      const raw = delta1.abs().mul(scale1);
      token1Fee = raw.mul(feePPMDecimal).div(million).ceil().div(scale1);
    }
  }

  return { token0Fee, token1Fee };
}

// ---------------------------------------------------------------------------
// Owner resolution
// ---------------------------------------------------------------------------

export function resolveOwner(
  blockId: number,
  transactionIndex: number,
  logIndex: number,
  creationOwner: string,
  transfers: VoucherTransfer[],
): string {
  if (!transfers || transfers.length === 0) return creationOwner;

  let owner = creationOwner;
  for (const t of transfers) {
    const transferBefore =
      t.blockId < blockId ||
      (t.blockId === blockId && t.transactionIndex < transactionIndex) ||
      (t.blockId === blockId && t.transactionIndex === transactionIndex && t.logIndex <= logIndex);

    if (transferBefore) {
      owner = t.to;
    } else {
      break;
    }
  }

  return owner;
}

// ---------------------------------------------------------------------------
// Per-strategy event processing
// ---------------------------------------------------------------------------

export function processStrategyEvents(
  events: RawEvent[],
  token0Info: TokenInfo,
  token1Info: TokenInfo,
  pairId: number,
  pairFeeHistory: Map<number, FeePPMEntry[]>,
  globalFeeHistory: FeePPMEntry[],
  transfers: VoucherTransfer[],
  creationOwner: string,
  tradeDirectionMap: Map<string, TradeDirectionEntry[]>,
): CsvRow[] {
  const rows: CsvRow[] = [];

  const state: StrategyProcessingState = {
    previousBalance0: new Decimal(0),
    previousBalance1: new Decimal(0),
    cumulativeFee0: new Decimal(0),
    cumulativeFee1: new Decimal(0),
    owner: creationOwner,
  };

  for (const event of events) {
    const { balance0, balance1 } = computeBalances(
      event.order0,
      event.order1,
      token0Info.decimals,
      token1Info.decimals,
    );

    const { delta0, delta1 } = computeDeltas(balance0, balance1, state.previousBalance0, state.previousBalance1);

    const action = classifyAction(event.reason, delta0, delta1);
    if (action === null) {
      state.previousBalance0 = balance0;
      state.previousBalance1 = balance1;
      continue;
    }

    let direction = '';
    let feePPM = 0;
    let token0Fee = new Decimal(0);
    let token1Fee = new Decimal(0);
    if (action === 'trade') {
      feePPM = getEffectiveFeePPM(pairId, event.blockId, pairFeeHistory, globalFeeHistory);
      const byTargetAmount = getTradeDirection(event.transactionHash, event.logIndex, tradeDirectionMap) ?? false;
      direction = byTargetAmount ? 'byTarget' : 'bySource';
      const fees = computeTradeFee(delta0, delta1, feePPM, byTargetAmount, token0Info.decimals, token1Info.decimals);
      token0Fee = fees.token0Fee;
      token1Fee = fees.token1Fee;
      state.cumulativeFee0 = state.cumulativeFee0.plus(token0Fee);
      state.cumulativeFee1 = state.cumulativeFee1.plus(token1Fee);
    }

    state.owner = resolveOwner(event.blockId, event.transactionIndex, event.logIndex, creationOwner, transfers);

    rows.push({
      action,
      direction,
      block_number: event.blockId,
      timestamp: event.timestamp instanceof Date ? event.timestamp.toISOString() : String(event.timestamp),
      transaction_hash: event.transactionHash,
      transaction_index: event.transactionIndex,
      log_index: event.logIndex,
      strategy_owner: state.owner,
      strategy_id: event.strategyId,
      token0_address: token0Info.address,
      token1_address: token1Info.address,
      token0_symbol: token0Info.symbol,
      token1_symbol: token1Info.symbol,
      token0_delta: delta0.toString(),
      token1_delta: delta1.toString(),
      token0_balance: balance0.toString(),
      token1_balance: balance1.toString(),
      fee_ppm: action === 'trade' ? String(feePPM) : '',
      token0_fee_delta: token0Fee.toString(),
      token1_fee_delta: token1Fee.toString(),
      token0_fee_balance: state.cumulativeFee0.toString(),
      token1_fee_balance: state.cumulativeFee1.toString(),
    });

    state.previousBalance0 = balance0;
    state.previousBalance1 = balance1;
  }

  return rows;
}

// ---------------------------------------------------------------------------
// CSV formatting
// ---------------------------------------------------------------------------

export const CSV_HEADERS = [
  'action',
  'direction',
  'block_number',
  'timestamp',
  'transaction_hash',
  'transaction_index',
  'log_index',
  'strategy_owner',
  'strategy_id',
  'token0_address',
  'token1_address',
  'token0_symbol',
  'token1_symbol',
  'token0_delta',
  'token1_delta',
  'token0_balance',
  'token1_balance',
  'fee_ppm',
  'token0_fee_delta',
  'token1_fee_delta',
  'token0_fee_balance',
  'token1_fee_balance',
];

const FORCE_QUOTE_FIELDS = new Set(['strategy_id', 'strategy_owner']);

export function csvRowToLine(row: CsvRow): string {
  return CSV_HEADERS.map((header) => {
    const value = String(row[header]);
    if (FORCE_QUOTE_FIELDS.has(header)) {
      return `"${value.replace(/"/g, '""')}"`;
    }
    if (value.includes(',') || value.includes('"') || value.includes('\n')) {
      return `"${value.replace(/"/g, '""')}"`;
    }
    return value;
  }).join(',');
}
