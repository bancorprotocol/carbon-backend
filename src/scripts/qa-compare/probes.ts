import { EndpointSpec } from './types';
import {
  blockSensitive,
  cumulativeMetric,
  livePriceMap,
  marketRateComparator,
  roiComparator,
  volatileList,
  snapshotById,
  topKRank,
  shapeStrictById,
  walletPairBalanceComparator,
  seedDataComparator,
  merklAllDataComparator,
  baselineSize,
  exactJson,
  coingeckoTickersComparator,
} from './comparators';

const stableActivityKey = (e: any): string | null => {
  if (!e || !e.txHash) return null;
  const block = e.blockNumber ?? '';
  const sid = e.strategy?.id ?? '';
  return `${e.txHash}-${block}-${sid}-${e.action ?? ''}`;
};

const dexEventKey = (e: any): string | null => {
  if (!e) return null;
  const txn = e.txnId ?? '';
  const idx = e.eventIndex ?? '';
  if (!txn) return null;
  return `${txn}#${idx}`;
};

/**
 * Default time window for endpoints supporting `start`/`end` (unix seconds).
 * Keeps requests fast and bounded — long open-ended ranges otherwise force the
 * server to scan months of data which times out staging on large chains.
 */
const ANALYTICS_WINDOW_DAYS = 14;
function defaultRange(): { start: string; end: string } {
  const end = Math.floor(Date.now() / 1000);
  const start = end - ANALYTICS_WINDOW_DAYS * 24 * 3600;
  return { start: String(start), end: String(end) };
}

export const ENDPOINT_SPECS: EndpointSpec[] = [
  {
    id: 'state',
    description: 'Indexer last processed block',
    classifier: 'block-sensitive',
    pathSuffix: '/state',
    comparator: blockSensitive,
    timeoutMs: 60000,
  },
  {
    id: 'tokens',
    description: 'List of all tokens',
    classifier: 'shape-strict',
    pathSuffix: '/tokens',
    comparator: shapeStrictById({ keyFn: (t) => (t?.address ? String(t.address).toLowerCase() : null) }),
    timeoutMs: 45000,
  },
  {
    id: 'tokens-prices',
    description: 'USD prices map for tokens with active strategies',
    classifier: 'live-price',
    pathSuffix: '/tokens/prices',
    comparator: livePriceMap,
    timeoutMs: 45000,
  },
  {
    id: 'roi',
    description: 'Strategy ROI map',
    classifier: 'live-price',
    pathSuffix: '/roi',
    comparator: roiComparator,
    timeoutMs: 45000,
  },
  {
    id: 'analytics-generic',
    description: 'Generic protocol metrics (cumulative)',
    classifier: 'cumulative-metric',
    pathSuffix: '/analytics/generic',
    comparator: cumulativeMetric([
      'strategies_created',
      'pairs_created',
      'unique_traders',
      'active_pairs',
      'number_trades',
      'volume',
      'fees',
      'current_liquidity',
    ]),
    timeoutMs: 20000,
  },
  {
    id: 'analytics-trades-count',
    description: 'Trades count time series (last 14 days)',
    classifier: 'aggregated-snapshot',
    pathSuffix: '/analytics/trades_count',
    buildQuery: () => ({ ...defaultRange() }),
    comparator: topKRank({ rankKey: (e) => `${e?.timestamp ?? e?.day ?? ''}`, k: 100, countOnly: true }),
    timeoutMs: 45000,
  },
  {
    id: 'analytics-trending',
    description: 'Trending pairs leaderboard',
    classifier: 'aggregated-snapshot',
    pathSuffix: '/analytics/trending',
    comparator: topKRank({
      itemPath: 'tradeCount',
      rankKey: (e) => (e?.id ? String(e.id) : null),
      k: 50,
    }),
    timeoutMs: 45000,
  },
  {
    id: 'analytics-tvl',
    description: 'Total TVL series (last 14 days)',
    classifier: 'aggregated-snapshot',
    pathSuffix: '/analytics/tvl',
    buildQuery: () => ({ ...defaultRange() }),
    comparator: topKRank({ rankKey: (e) => `${e?.timestamp ?? ''}`, k: 100, countOnly: true }),
    timeoutMs: 60000,
  },
  {
    id: 'analytics-tvl-pairs',
    description: 'TVL by pair (last 14 days)',
    classifier: 'aggregated-snapshot',
    pathSuffix: '/analytics/tvl/pairs',
    needs: ['tickerIds'],
    buildQuery: (ctx) =>
      ctx.tickerIds.length > 0
        ? { ...defaultRange(), pairs: ctx.tickerIds.slice(0, 20).join(','), limit: '500' }
        : null,
    comparator: topKRank({ rankKey: (e) => `${e?.token0 ?? ''}_${e?.token1 ?? ''}_${e?.timestamp ?? ''}`, k: 200 }),
    timeoutMs: 60000,
  },
  {
    id: 'analytics-tvl-tokens',
    description: 'TVL by token (last 14 days)',
    classifier: 'aggregated-snapshot',
    pathSuffix: '/analytics/tvl/tokens',
    comparator: topKRank({ rankKey: (e) => `${e?.address ?? ''}_${e?.timestamp ?? ''}`, k: 200 }),
    needs: ['tokens'],
    buildQuery: (ctx) =>
      ctx.tokens.length > 0
        ? { ...defaultRange(), addresses: ctx.tokens.slice(0, 30).join(','), limit: '500' }
        : null,
    timeoutMs: 60000,
  },
  {
    id: 'analytics-volume',
    description: 'Total volume series (last 14 days)',
    classifier: 'aggregated-snapshot',
    pathSuffix: '/analytics/volume',
    buildQuery: () => ({ ...defaultRange() }),
    comparator: topKRank({ rankKey: (e) => `${e?.timestamp ?? ''}`, k: 100, countOnly: true }),
    timeoutMs: 60000,
  },
  {
    id: 'analytics-volume-pairs',
    description: 'Volume by pair (last 14 days)',
    classifier: 'aggregated-snapshot',
    pathSuffix: '/analytics/volume/pairs',
    needs: ['tickerIds'],
    buildQuery: (ctx) =>
      ctx.tickerIds.length > 0
        ? { ...defaultRange(), pairs: ctx.tickerIds.slice(0, 20).join(','), limit: '500' }
        : null,
    comparator: topKRank({ rankKey: (e) => `${e?.token0 ?? ''}_${e?.token1 ?? ''}_${e?.timestamp ?? ''}`, k: 200 }),
    timeoutMs: 60000,
  },
  {
    id: 'analytics-volume-tokens',
    description: 'Volume by token (last 14 days)',
    classifier: 'aggregated-snapshot',
    pathSuffix: '/analytics/volume/tokens',
    needs: ['tokens'],
    buildQuery: (ctx) =>
      ctx.tokens.length > 0
        ? { ...defaultRange(), addresses: ctx.tokens.slice(0, 30).join(','), limit: '500' }
        : null,
    comparator: topKRank({ rankKey: (e) => `${e?.address ?? ''}_${e?.timestamp ?? ''}`, k: 200 }),
    timeoutMs: 60000,
  },
  {
    id: 'activity',
    description: 'Activity feed (last 14 days)',
    classifier: 'volatile-list',
    pathSuffix: '/activity',
    buildQuery: () => ({ ...defaultRange(), limit: '200' }),
    comparator: volatileList({ keyFn: stableActivityKey }),
    timeoutMs: 45000,
  },
  {
    id: 'activity-meta',
    description: 'Activity meta',
    classifier: 'cumulative-metric',
    pathSuffix: '/activity/meta',
    comparator: cumulativeMetric(['size']),
    timeoutMs: 45000,
  },
  {
    id: 'activity-v2',
    description: 'Activity feed v2 (last 14 days)',
    classifier: 'volatile-list',
    pathSuffix: '/activity/v2',
    buildQuery: () => ({ ...defaultRange(), limit: '200' }),
    comparator: volatileList({ keyFn: stableActivityKey }),
    timeoutMs: 45000,
  },
  {
    id: 'activity-v2-meta',
    description: 'Activity v2 meta',
    classifier: 'cumulative-metric',
    pathSuffix: '/activity/v2/meta',
    comparator: cumulativeMetric(['size']),
    timeoutMs: 45000,
  },
  {
    id: 'cmc-pairs',
    description: 'CMC pairs listing',
    classifier: 'shape-strict',
    pathSuffix: '/cmc/pairs',
    comparator: shapeStrictById({ keyFn: (p) => (p?.pair ? String(p.pair) : null) }),
    timeoutMs: 45000,
  },
  {
    id: 'cmc-historical-trades',
    description: 'CMC historical trades sample (last 14 days)',
    classifier: 'volatile-list',
    pathSuffix: '/cmc/historical_trades',
    buildQuery: () => ({ ...defaultRange(), limit: '50' }),
    comparator: volatileList({ keyFn: (e) => (e?.id ? String(e.id) : null) }),
    timeoutMs: 45000,
  },
  {
    id: 'coingecko-pairs',
    description: 'Coingecko pairs listing',
    classifier: 'shape-strict',
    pathSuffix: '/coingecko/pairs',
    comparator: shapeStrictById({ keyFn: (p) => (p?.ticker_id ? String(p.ticker_id) : null) }),
    timeoutMs: 45000,
  },
  {
    id: 'coingecko-tickers',
    description: 'Coingecko tickers (live numeric drift tolerated)',
    classifier: 'live-price',
    pathSuffix: '/coingecko/tickers',
    comparator: coingeckoTickersComparator,
    timeoutMs: 60000,
  },
  {
    id: 'coingecko-historical-trades',
    description: 'Coingecko historical trades sample (last 14 days)',
    classifier: 'volatile-list',
    pathSuffix: '/coingecko/historical_trades',
    needs: ['tickerIds'],
    buildQuery: (ctx) => {
      if (ctx.tickerIds.length === 0) return null;
      const range = defaultRange();
      return { ticker_id: ctx.tickerIds[0], start_time: range.start, end_time: range.end, limit: '50' };
    },
    comparator: volatileList({ keyFn: (e) => (e?.trade_id ? String(e.trade_id) : null) }),
    timeoutMs: 45000,
  },
  {
    id: 'dex-screener-latest-block',
    description: 'DEX Screener: latest indexed block',
    classifier: 'block-sensitive',
    pathSuffix: '/dex-screener/latest-block',
    comparator: blockSensitive,
    timeoutMs: 60000,
  },
  {
    id: 'dex-screener-asset',
    description: 'DEX Screener: asset metadata',
    classifier: 'shape-strict',
    pathSuffix: '/dex-screener/asset',
    needs: ['tokens'],
    buildQuery: (ctx) => (ctx.tokens.length > 0 ? { id: ctx.tokens[0] } : null),
    comparator: exactJson({ path: 'asset' }),
    timeoutMs: 60000,
  },
  {
    id: 'dex-screener-events',
    description: 'DEX Screener: events in block range',
    classifier: 'volatile-list',
    pathSuffix: '/dex-screener/events',
    needs: ['eventRange'],
    buildQuery: (ctx) =>
      ctx.eventRange ? { fromBlock: String(ctx.eventRange.fromBlock), toBlock: String(ctx.eventRange.toBlock) } : null,
    comparator: volatileList({ keyFn: dexEventKey, itemPath: 'events' }),
    timeoutMs: 60000,
  },
  {
    id: 'dex-screener-pair',
    description: 'DEX Screener: pair metadata',
    classifier: 'shape-strict',
    pathSuffix: '/dex-screener/pair',
    needs: ['dexScreenerPairId'],
    buildQuery: (ctx) => (ctx.dexScreenerPairId !== null ? { id: ctx.dexScreenerPairId } : null),
    comparator: exactJson({ path: 'pair' }),
    timeoutMs: 60000,
  },
  {
    id: 'gecko-terminal-latest-block',
    description: 'GeckoTerminal: latest block',
    classifier: 'block-sensitive',
    pathSuffix: '/gecko-terminal/latest-block',
    comparator: blockSensitive,
    timeoutMs: 60000,
  },
  {
    id: 'gecko-terminal-asset',
    description: 'GeckoTerminal: asset metadata',
    classifier: 'shape-strict',
    pathSuffix: '/gecko-terminal/asset',
    needs: ['tokens'],
    buildQuery: (ctx) => (ctx.tokens.length > 0 ? { id: ctx.tokens[0] } : null),
    comparator: exactJson({ path: 'asset' }),
    timeoutMs: 60000,
  },
  {
    id: 'gecko-terminal-pair',
    description: 'GeckoTerminal: pair metadata',
    classifier: 'shape-strict',
    pathSuffix: '/gecko-terminal/pair',
    needs: ['geckoTerminalPairId'],
    buildQuery: (ctx) => (ctx.geckoTerminalPairId ? { id: ctx.geckoTerminalPairId } : null),
    comparator: exactJson({ path: 'pair' }),
    timeoutMs: 60000,
  },
  {
    id: 'gecko-terminal-events',
    description: 'GeckoTerminal: events in block range',
    classifier: 'volatile-list',
    pathSuffix: '/gecko-terminal/events',
    needs: ['eventRange'],
    buildQuery: (ctx) =>
      ctx.eventRange ? { fromBlock: String(ctx.eventRange.fromBlock), toBlock: String(ctx.eventRange.toBlock) } : null,
    comparator: volatileList({ keyFn: dexEventKey, itemPath: 'events' }),
    timeoutMs: 60000,
  },
  {
    id: 'market-rate',
    description: 'Token USD market rate',
    classifier: 'live-price',
    pathSuffix: '/market-rate',
    needs: ['tokens'],
    buildQuery: (ctx) => (ctx.tokens.length > 0 ? { address: ctx.tokens[0], convert: 'USD' } : null),
    comparator: marketRateComparator,
    timeoutMs: 20000,
  },
  {
    id: 'merkle-all-data',
    description: 'Merkle campaigns summary',
    classifier: 'merkl',
    pathSuffix: '/merkle/all-data',
    comparator: merklAllDataComparator,
    timeoutMs: 45000,
  },
  {
    id: 'merkle-data',
    description: 'Merkle data for a single pair',
    classifier: 'merkl',
    pathSuffix: '/merkle/data',
    needs: ['merklPair'],
    buildQuery: (ctx) =>
      ctx.merklPair ? { pair: `${ctx.merklPair.token0}_${ctx.merklPair.token1}` } : null,
    comparator: merklAllDataComparator, // fall back to baseline campaign comparator (still gates 200 + body shape)
    timeoutMs: 45000,
  },
  {
    id: 'merkle-rewards',
    description: 'Merkle rewards for a single pair',
    classifier: 'merkl',
    pathSuffix: '/merkle/rewards',
    needs: ['merklPair'],
    buildQuery: (ctx) =>
      ctx.merklPair ? { pair: `${ctx.merklPair.token0}_${ctx.merklPair.token1}` } : null,
    comparator: baselineSize,
    timeoutMs: 60000,
  },
  {
    id: 'wallet-pair-balance',
    description: 'Wallet/pair balance snapshot',
    classifier: 'snapshot',
    pathSuffix: '/wallet-pair-balance',
    comparator: walletPairBalanceComparator,
    timeoutMs: 60000,
  },
  {
    id: 'seed-data',
    description: 'SDK seed data snapshot',
    classifier: 'snapshot',
    pathSuffix: '/seed-data',
    comparator: seedDataComparator,
    timeoutMs: 60000,
  },
  {
    id: 'strategies',
    description: 'Active strategies',
    classifier: 'snapshot',
    pathSuffix: '/strategies',
    comparator: snapshotById({ keyFn: (s) => (s?.id ? String(s.id) : null), itemPath: 'strategies' }),
    timeoutMs: 60000,
  },
  // Optional / heavy:
  {
    id: 'history-prices',
    description: 'Historical USD price buckets (heavy)',
    classifier: 'static-history',
    pathSuffix: '/history/prices',
    needs: ['strategySample'],
    optional: true,
    buildQuery: (ctx) => {
      if (!ctx.strategySample) return null;
      const end = Math.floor(Date.now() / 1000) - 24 * 3600;
      const start = end - 7 * 24 * 3600;
      return {
        baseToken: ctx.strategySample.base,
        quoteToken: ctx.strategySample.quote,
        start: String(start),
        end: String(end),
      };
    },
    comparator: shapeStrictById({ keyFn: (b) => `${b?.timestamp ?? ''}` }),
    timeoutMs: 60000,
  },
  {
    id: 'simulator-create',
    description: 'Simulator (heavy)',
    classifier: 'static-history',
    pathSuffix: '/simulator/create',
    needs: ['strategySample'],
    optional: true,
    buildQuery: (ctx) => {
      if (!ctx.strategySample) return null;
      const end = Math.floor(Date.now() / 1000) - 24 * 3600;
      const start = end - 7 * 24 * 3600;
      return {
        baseToken: ctx.strategySample.base,
        quoteToken: ctx.strategySample.quote,
        start: String(start),
        end: String(end),
        sellBudget: '100',
        buyBudget: '100',
        sellMax: '5000',
        sellMin: '1000',
        buyMax: '4000',
        buyMin: '500',
      };
    },
    comparator: baselineSize,
    timeoutMs: 60000,
  },
];
