/**
 * Gradient Test Verification Script
 *
 * Hits every API endpoint on a running carbon-backend server and validates
 * that gradient data is correctly mixed into the responses.
 *
 * Covers all 39 endpoints across 17 controllers with intelligent value assertions.
 *
 * Modes:
 *   --mode=layer1 (default) — Assertions match seed-data values (USDC/WETH, exact budgets/dates)
 *   --mode=layer2           — Assertions match Tenderly-harvested data (DAI/USDC, 100-unit budgets)
 *
 * Usage:
 *   npx ts-node src/scripts/gradient-test-verify.ts
 *   npx ts-node src/scripts/gradient-test-verify.ts --mode=layer2
 *   npx ts-node src/scripts/gradient-test-verify.ts --base-url=http://localhost:3001
 */

import * as fs from 'fs';
import * as path from 'path';

const BASE_URL = process.argv.find((a) => a.startsWith('--base-url='))?.split('=')[1] || 'http://localhost:3000';
const EXCHANGE_ID = 'ethereum';
const MODE: 'layer1' | 'layer2' = process.argv.find((a) => a.startsWith('--mode='))?.split('=')[1] as any || 'layer1';

let postTradeData: any = null;
if (MODE === 'layer2') {
  const dataPath = path.join(__dirname, 'gradient-e2e-data.json');
  try {
    postTradeData = JSON.parse(fs.readFileSync(dataPath, 'utf-8'));
  } catch (_) {
    console.log('  Note: gradient-e2e-data.json not found, using approximate budget assertions');
  }
}

// ─── Mode-dependent configuration ───────────────────────────────────────────

interface ModeConfig {
  gradientToken0: string;
  gradientToken1: string;
  gradientToken0Symbol: string;
  gradientToken1Symbol: string;
  sellBudget: string;
  buyBudget: string;
  exactDates: boolean;
  sellStartDate: string;
  sellEndDate: string;
  seedOrder0Liquidity: string;
  seedBlock: number;
  checkGradientTradeCount: boolean;
  checkGradientWallet: boolean;
  checkSeedDexEvents: boolean;
}

const LAYER1_CONFIG: ModeConfig = {
  gradientToken0: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48', // USDC
  gradientToken1: '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2', // WETH
  gradientToken0Symbol: 'USDC',
  gradientToken1Symbol: 'WETH',
  sellBudget: '45600000000000000',
  buyBudget: '12300',
  exactDates: true,
  sellStartDate: '1730329400',
  sellEndDate: '1767586793',
  seedOrder0Liquidity: '45600000000000000000000',
  seedBlock: 24571200,
  checkGradientTradeCount: true,
  checkGradientWallet: true,
  checkSeedDexEvents: true,
};

const PAIR2_TOKEN0 = '0x2260FAC5E5542a773Aa44fBCfeDf7C193bc2C599'; // WBTC
const PAIR2_TOKEN1 = '0x514910771AF9Ca656af840dff83E8264EcF986CA'; // LINK

const LAYER2_CONFIG: ModeConfig = {
  gradientToken0: '0x6B175474E89094C44Da98b954EedeAC495271d0F', // DAI
  gradientToken1: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48', // USDC
  gradientToken0Symbol: 'DAI',
  gradientToken1Symbol: 'USDC',
  sellBudget: '100',
  buyBudget: '100',
  exactDates: false,
  sellStartDate: '',
  sellEndDate: '',
  seedOrder0Liquidity: '100000000000000000000',
  seedBlock: 0,
  checkGradientTradeCount: true,
  checkGradientWallet: true,
  checkSeedDexEvents: false,
};

const CFG = MODE === 'layer2' ? LAYER2_CONFIG : LAYER1_CONFIG;

const TOKEN0 = '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48'; // USDC — used for non-gradient token queries
const TOKEN1 = '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2'; // WETH
const CARBON_CONTROLLER = '0xC537e898CD774e2dCBa3B14Ea6f34C93d5eA45e1';

let knownPairTickerId: string | null = null;

interface TestResult {
  group: string;
  endpoint: string;
  passed: boolean;
  details: string;
  error?: string;
}

const results: TestResult[] = [];

function pass(group: string, endpoint: string, details: string) {
  results.push({ group, endpoint, passed: true, details });
  console.log(`  \x1b[32mPASS\x1b[0m  ${endpoint} — ${details}`);
}

function fail(group: string, endpoint: string, details: string, error?: string) {
  results.push({ group, endpoint, passed: false, details, error });
  console.log(`  \x1b[31mFAIL\x1b[0m  ${endpoint} — ${details}${error ? ` (${error})` : ''}`);
}

async function fetchJson(path: string): Promise<any> {
  const url = `${BASE_URL}/v1/${EXCHANGE_ID}${path}`;
  const res = await fetch(url);
  if (!res.ok) {
    let body = '';
    try { body = await res.text(); } catch (_) {}
    throw new Error(`HTTP ${res.status} for ${path}${body ? `: ${body.substring(0, 200)}` : ''}`);
  }
  return res.json();
}

async function resolveKnownPairTickerId(): Promise<string> {
  if (knownPairTickerId) return knownPairTickerId;
  try {
    const pairs = await fetchJson('/coingecko/pairs');
    if (Array.isArray(pairs) && pairs.length > 0) {
      knownPairTickerId = pairs[0].ticker_id;
    }
  } catch (_) {}
  if (!knownPairTickerId) {
    knownPairTickerId = `${TOKEN0}_${TOKEN1}`;
  }
  return knownPairTickerId;
}

function assert(group: string, ep: string, condition: boolean, passMsg: string, failMsg: string) {
  if (condition) {
    pass(group, ep, passMsg);
  } else {
    fail(group, ep, failMsg);
  }
}

// ─── Group A: Gradient-aware endpoints ───────────────────────────────────────

async function testStrategies() {
  const G = 'A';
  const ep = '/strategies';
  try {
    const data = await fetchJson(ep);
    const strategies = data.strategies || data;

    if (!Array.isArray(strategies) || strategies.length === 0) {
      fail(G, ep, 'No strategies returned');
      return;
    }

    const gradients = strategies.filter((s: any) => s.type === 'gradient');
    const expectedCount = CFG.exactDates ? 6 : 7; // Layer 2: 8 created - 1 deleted = 7 (6 DAI/USDC + 2 WBTC/LINK - 1 deleted)
    assert(G, ep, gradients.length === expectedCount, `${expectedCount} gradient strategies found`, `Expected ${expectedCount} gradient strategies, got ${gradients.length}`);

    const types = new Set(gradients.map((s: any) => {
      const sellType = parseFloat(s.sell?.startPrice) > 0 ? 'has-sell' : 'no-sell';
      return `${s.id}-${sellType}`;
    }));
    assert(G, ep, types.size === expectedCount, `All ${expectedCount} gradient types covered (unique strategies)`, `Only ${types.size} unique gradient strategies`);

    if (!CFG.exactDates) {
      const gradientTokenPairs = new Set(gradients.map((s: any) => {
        const t0 = (s.base || s.sell?.token || s.token0 || '').toLowerCase();
        const t1 = (s.quote || s.buy?.token || s.token1 || '').toLowerCase();
        return `${t0}/${t1}`;
      }));
      assert(G, ep, gradientTokenPairs.size >= 2,
        `${gradientTokenPairs.size} unique gradient token pairs (multi-pair coverage)`,
        `Expected >= 2 unique gradient token pairs, got ${gradientTokenPairs.size}: ${[...gradientTokenPairs].join(', ')}`,
      );
    }

    if (gradients.length > 0) {
      const first = gradients[0];

      assert(G, ep,
        first.sell && typeof first.sell.startPrice === 'string' && typeof first.sell.endPrice === 'string' &&
        typeof first.sell.startDate === 'string' && typeof first.sell.endDate === 'string' &&
        typeof first.sell.budget === 'string' && typeof first.sell.marginalPrice === 'string',
        'Gradient sell order has GradientOrder shape',
        `Gradient sell order shape wrong: ${JSON.stringify(first.sell)}`,
      );

      if (CFG.exactDates) {
        assert(G, ep, first.sell?.budget === CFG.sellBudget,
          `sell.budget = "${CFG.sellBudget}"`,
          `Expected sell.budget "${CFG.sellBudget}", got "${first.sell?.budget}"`,
        );
        assert(G, ep, first.buy?.budget === CFG.buyBudget,
          `buy.budget = "${CFG.buyBudget}"`,
          `Expected buy.budget "${CFG.buyBudget}", got "${first.buy?.budget}"`,
        );
      } else {
        const sellVal = parseFloat(first.sell?.budget || '0');
        const buyVal = parseFloat(first.buy?.budget || '0');
        assert(G, ep, sellVal > 0,
          `sell.budget > 0 (actual: ${first.sell?.budget})`,
          `Expected sell.budget > 0, got "${first.sell?.budget}"`,
        );
        assert(G, ep, buyVal > 0,
          `buy.budget > 0 (actual: ${first.buy?.budget})`,
          `Expected buy.budget > 0, got "${first.buy?.budget}"`,
        );
      }

      assert(G, ep, parseFloat(first.sell?.startPrice) > 0,
        `startPrice > 0 (${first.sell?.startPrice})`,
        `startPrice should be > 0, got ${first.sell?.startPrice}`,
      );

      if (CFG.exactDates) {
        assert(G, ep, first.sell?.startDate === CFG.sellStartDate,
          `startDate = "${CFG.sellStartDate}"`,
          `Expected startDate "${CFG.sellStartDate}", got "${first.sell?.startDate}"`,
        );
        assert(G, ep, first.sell?.endDate === CFG.sellEndDate,
          `endDate = "${CFG.sellEndDate}"`,
          `Expected endDate "${CFG.sellEndDate}", got "${first.sell?.endDate}"`,
        );
      } else {
        const now = Math.floor(Date.now() / 1000);
        const startDate = parseInt(first.sell?.startDate || '0');
        const endDate = parseInt(first.sell?.endDate || '0');
        assert(G, ep, startDate > 0 && startDate < now,
          `startDate (${startDate}) is in the past`,
          `startDate should be in the past, got ${startDate}`,
        );
        assert(G, ep, endDate > now,
          `endDate (${endDate}) is in the future`,
          `endDate should be in the future, got ${endDate}`,
        );
      }

      const linearIncrease = gradients.find((s: any) =>
        parseFloat(s.sell?.marginalPrice) > parseFloat(s.sell?.startPrice),
      );
      if (linearIncrease) {
        pass(G, ep, `marginalPrice > startPrice for LINEAR_INCREASE type`);
      } else {
        fail(G, ep, 'No gradient with marginalPrice > startPrice found (LINEAR_INCREASE)');
      }
    }
  } catch (e: any) {
    fail(G, ep, 'Request failed', e.message);
  }
}

async function testSeedData() {
  const G = 'A';
  const ep = '/seed-data';
  try {
    const data = await fetchJson(ep);

    assert(G, ep, data.schemeVersion === 8, 'schemeVersion is 8', `Expected schemeVersion 8, got ${data.schemeVersion}`);

    const allStrategies = Object.values(data.strategiesByPair || {}).flat() as any[];
    const gradients = allStrategies.filter((s: any) => s.type === 'gradient');

    const expectedSeedCount = CFG.exactDates ? 6 : 5;
    assert(G, ep, gradients.length >= expectedSeedCount,
      `${gradients.length} gradient strategies in seed-data`,
      `Expected >= ${expectedSeedCount} gradient strategies, got ${gradients.length}`,
    );

    if (gradients.length > 0) {
      const first = gradients[0];

      assert(G, ep,
        first.order0 && 'liquidity' in first.order0 && 'initialPrice' in first.order0 && 'gradientType' in first.order0,
        'Gradient order0 has { liquidity, initialPrice, gradientType }',
        `Wrong gradient order shape: ${JSON.stringify(first.order0)}`,
      );

      if (CFG.exactDates) {
        assert(G, ep, first.order0?.liquidity === CFG.seedOrder0Liquidity,
          `order0.liquidity = "${CFG.seedOrder0Liquidity}"`,
          `Expected order0.liquidity "${CFG.seedOrder0Liquidity}", got "${first.order0?.liquidity}"`,
        );
      } else {
        const liqVal = BigInt(first.order0?.liquidity || '0');
        const liqExpected = BigInt(CFG.seedOrder0Liquidity);
        const diff = liqVal > liqExpected ? liqVal - liqExpected : liqExpected - liqVal;
        assert(G, ep, diff * 100n / liqExpected < 5n,
          `order0.liquidity ≈ "${CFG.seedOrder0Liquidity}" (actual: ${first.order0?.liquidity})`,
          `Expected order0.liquidity ≈ "${CFG.seedOrder0Liquidity}", got "${first.order0?.liquidity}"`,
        );
      }

      if (CFG.exactDates) {
        assert(G, ep, first.order0?.tradingStartTime === 1730329400,
          `order0.tradingStartTime = 1730329400`,
          `Expected 1730329400, got ${first.order0?.tradingStartTime}`,
        );
      } else {
        assert(G, ep, first.order0?.tradingStartTime > 0,
          `order0.tradingStartTime > 0 (${first.order0?.tradingStartTime})`,
          `tradingStartTime should be > 0`,
        );
      }

      const gradientTypes = gradients.map((g: any) => g.order0?.gradientType);
      const expectedTypes = CFG.exactDates ? ['0', '1', '2', '3', '4', '5'] : ['0', '1', '2', '3', '4'];
      const allTypesPresent = expectedTypes.every((t) => gradientTypes.includes(t));
      assert(G, ep, allTypesPresent,
        `Gradient types ${JSON.stringify(expectedTypes)} all present`,
        `Missing gradient types. Found: ${JSON.stringify(gradientTypes)}`,
      );
    }
  } catch (e: any) {
    fail(G, ep, 'Request failed', e.message);
  }
}

async function testAnalyticsGeneric() {
  const G = 'A';
  const ep = '/analytics/generic';
  try {
    const data = await fetchJson(ep);

    if (!data || (Array.isArray(data) && data.length === 0)) {
      fail(G, ep, 'No generic metrics returned (analytics cache may not be populated)');
      return;
    }

    const metrics = Array.isArray(data) ? data[0] : data;

    assert(G, ep, metrics.strategies_created > 0,
      `strategies_created=${metrics.strategies_created} (includes gradient)`,
      `strategies_created is zero or missing`,
    );

    if (metrics.number_trades !== undefined) {
      assert(G, ep, metrics.number_trades > 0,
        `number_trades=${metrics.number_trades}`,
        `number_trades is zero`,
      );
    }
  } catch (e: any) {
    fail(G, ep, 'Request failed', e.message);
  }
}

async function testAnalyticsTradesCount() {
  const G = 'A';
  const ep = '/analytics/trades_count';
  try {
    const data = await fetchJson(ep);

    if (!Array.isArray(data)) {
      fail(G, ep, 'Expected array response');
      return;
    }

    assert(G, ep, data.length > 0, `${data.length} trade count entries`, 'No trade count entries');

    if (CFG.checkGradientTradeCount) {
      const gradientTrades = data.filter((t: any) => t.strategyId && t.strategyId.length > 50);

      if (gradientTrades.length > 0) {
        pass(G, ep, `${gradientTrades.length} gradient strategy trade counts`);

        if (CFG.exactDates) {
          const firstGradient = gradientTrades[0];
          assert(G, ep, firstGradient.tradeCount === 2,
            `Gradient tradeCount = 2`,
            `Expected tradeCount 2, got ${firstGradient.tradeCount}`,
          );
        } else {
          const firstGradient = gradientTrades[0];
          assert(G, ep, firstGradient.tradeCount >= 1,
            `Gradient tradeCount >= 1 (${firstGradient.tradeCount})`,
            `Expected tradeCount >= 1, got ${firstGradient.tradeCount}`,
          );
        }
      } else {
        fail(G, ep, 'No gradient strategy trade counts (IDs with length > 50)');
      }
    } else {
      pass(G, ep, `${data.length} trade count entries (gradient trade counts not checked in ${MODE})`);
    }
  } catch (e: any) {
    fail(G, ep, 'Request failed', e.message);
  }
}

async function testWalletPairBalance() {
  const G = 'A';
  const ep = '/wallet-pair-balance';
  try {
    const data = await fetchJson(ep);
    const pairData = data.data || data;

    assert(G, ep, pairData && typeof pairData === 'object' && Object.keys(pairData).length > 0,
      `${Object.keys(pairData || {}).length} pairs with balances`,
      'No pair balances returned',
    );

    if (CFG.checkGradientWallet) {
      const gradPairKey = Object.keys(pairData || {}).find((k) => {
        const lower = k.toLowerCase();
        return lower.includes(CFG.gradientToken0.toLowerCase()) && lower.includes(CFG.gradientToken1.toLowerCase());
      });

      assert(G, ep, !!gradPairKey,
        `${CFG.gradientToken0Symbol}/${CFG.gradientToken1Symbol} pair key found`,
        `No ${CFG.gradientToken0Symbol}/${CFG.gradientToken1Symbol} pair key in wallet-pair-balance`,
      );

      if (gradPairKey) {
        const wallets = pairData[gradPairKey]?.wallets || pairData[gradPairKey] || {};
        const walletAddresses = Object.keys(wallets);
        assert(G, ep, walletAddresses.length > 0,
          `${walletAddresses.length} wallet(s) found for gradient pair`,
          'No wallets found for gradient pair',
        );
      }
    }
  } catch (e: any) {
    fail(G, ep, 'Request failed', e.message);
  }
}

// ─── Group B: Activity endpoints ─────────────────────────────────────────────

async function testActivity() {
  const G = 'B';
  const ep = '/activity';
  try {
    const data = await fetchJson(ep + '?limit=200');

    assert(G, ep, Array.isArray(data) && data.length > 0,
      `${data.length} activities returned`,
      'No activities returned',
    );

    if (Array.isArray(data) && data.length > 0) {
      const withType = data.filter((a: any) => a.strategy && a.strategy.type);
      assert(G, ep, withType.length > 0,
        'Activities have strategy.type discriminator',
        'Activities missing strategy.type',
      );

      const hasRegular = withType.some((a: any) => a.strategy.type === 'regular');
      assert(G, ep, hasRegular,
        'At least one activity has strategy.type === "regular"',
        'No regular-typed activities found',
      );

      const hasGradient = withType.some((a: any) => a.strategy.type === 'gradient');
      assert(G, ep, hasGradient,
        'At least one activity has strategy.type === "gradient"',
        'No gradient-typed activities found',
      );

      const validActions = ['sell', 'buy', 'create', 'deposit', 'withdraw', 'transfer', 'edit', 'delete', 'pause'];
      const allActionsValid = data.every((a: any) => validActions.includes(a.action));
      assert(G, ep, allActionsValid,
        'All actions are valid strings',
        `Invalid actions found: ${data.filter((a: any) => !validActions.includes(a.action)).map((a: any) => a.action)}`,
      );
    }
  } catch (e: any) {
    fail(G, ep, 'Request failed', e.message);
  }
}

async function testActivityActionsCreate() {
  const G = 'B';
  const ep = '/activity?actions=create';
  try {
    const data = await fetchJson('/activity?actions=create&limit=50');

    assert(G, ep, Array.isArray(data) && data.length > 0,
      `${data.length} create activities returned`,
      'No create activities returned',
    );

    if (Array.isArray(data) && data.length > 0) {
      const allCreate = data.every((a: any) => a.action === 'create');
      assert(G, ep, allCreate,
        'All returned activities have action "create"',
        `Non-create actions found: ${data.filter((a: any) => a.action !== 'create').map((a: any) => a.action)}`,
      );

      const gradientCreates = data.filter((a: any) => a.strategy?.type === 'gradient');
      assert(G, ep, gradientCreates.length > 0,
        `${gradientCreates.length} gradient create activities found`,
        'No gradient create activities found',
      );
    }
  } catch (e: any) {
    fail(G, ep, 'Request failed', e.message);
  }
}

async function testActivityMeta() {
  const G = 'B';
  const ep = '/activity/meta';
  try {
    const data = await fetchJson('/activity/meta');

    assert(G, ep, data && typeof data === 'object',
      'Returns object',
      'Invalid response shape',
    );

    assert(G, ep, data.size !== undefined && data.size > 0,
      `size = ${data.size}`,
      `size is missing or zero: ${data.size}`,
    );

    assert(G, ep, Array.isArray(data.actions) && data.actions.length > 0,
      `actions = [${data.actions?.join(', ')}]`,
      `actions missing or empty`,
    );
  } catch (e: any) {
    fail(G, ep, 'Request failed', e.message);
  }
}

async function testActivityV2() {
  const G = 'B';
  const ep = '/activity/v2';
  try {
    const data = await fetchJson('/activity/v2?limit=10');

    assert(G, ep, Array.isArray(data) && data.length > 0,
      `${data.length} v2 activities returned`,
      'No v2 activities returned',
    );

    if (Array.isArray(data) && data.length > 0) {
      assert(G, ep, data[0].strategy && typeof data[0].strategy.type === 'string',
        'v2 activity has strategy.type',
        'v2 activity missing strategy.type',
      );

      const gradientV2 = data.filter((a: any) => a.strategy?.type === 'gradient');
      assert(G, ep, gradientV2.length > 0,
        `${gradientV2.length} gradient v2 activities found`,
        'No gradient v2 activities found',
      );
    }
  } catch (e: any) {
    fail(G, ep, 'Request failed', e.message);
  }
}

async function testActivityV2Meta() {
  const G = 'B';
  const ep = '/activity/v2/meta';
  try {
    const data = await fetchJson('/activity/v2/meta');

    assert(G, ep, data && data.size !== undefined && Array.isArray(data.actions),
      `size=${data.size}, actions=[${data.actions?.join(', ')}]`,
      'Invalid v2 meta shape',
    );
  } catch (e: any) {
    fail(G, ep, 'Request failed', e.message);
  }
}

// ─── Group C: Token/pair data endpoints ──────────────────────────────────────

async function testTokens() {
  const G = 'C';
  const ep = '/tokens';
  try {
    const data = await fetchJson('/tokens');

    assert(G, ep, Array.isArray(data) && data.length > 100,
      `${data.length} tokens returned`,
      `Expected > 100 tokens, got ${Array.isArray(data) ? data.length : 'non-array'}`,
    );

    if (Array.isArray(data)) {
      const usdc = data.find((t: any) => t.address?.toLowerCase() === TOKEN0.toLowerCase());
      assert(G, ep, usdc && usdc.decimals === 6,
        `USDC found with decimals=6`,
        `USDC not found or wrong decimals: ${JSON.stringify(usdc)}`,
      );

      const weth = data.find((t: any) => t.address?.toLowerCase() === TOKEN1.toLowerCase());
      assert(G, ep, weth && weth.decimals === 18,
        `WETH found with decimals=18`,
        `WETH not found or wrong decimals: ${JSON.stringify(weth)}`,
      );
    }
  } catch (e: any) {
    fail(G, ep, 'Request failed', e.message);
  }
}

async function testTokensPrices() {
  const G = 'C';
  const ep = '/tokens/prices';
  try {
    const data = await fetchJson('/tokens/prices');

    assert(G, ep, data && typeof data === 'object' && Object.keys(data).length > 0,
      `${Object.keys(data).length} token prices`,
      'No token prices returned',
    );

    const usdcKey = Object.keys(data).find((k) => k.toLowerCase() === TOKEN0.toLowerCase());
    if (usdcKey) {
      const usdcPrice = parseFloat(data[usdcKey]);
      assert(G, ep, usdcPrice >= 0.95 && usdcPrice <= 1.05,
        `USDC price = ${usdcPrice} (within 0.95-1.05)`,
        `USDC price out of range: ${usdcPrice}`,
      );
    } else {
      fail(G, ep, 'USDC price not found');
    }

    const ethKey = Object.keys(data).find((k) => k.toLowerCase() === TOKEN1.toLowerCase());
    if (ethKey) {
      const ethPrice = parseFloat(data[ethKey]);
      assert(G, ep, ethPrice > 1000,
        `ETH price = ${ethPrice} (> 1000)`,
        `ETH price too low: ${ethPrice}`,
      );
    } else {
      fail(G, ep, 'ETH price not found');
    }
  } catch (e: any) {
    fail(G, ep, 'Request failed', e.message);
  }
}

async function testCoingeckoPairs() {
  const G = 'C';
  const ep = '/coingecko/pairs';
  try {
    const data = await fetchJson('/coingecko/pairs');

    assert(G, ep, Array.isArray(data) && data.length > 0,
      `${data.length} coingecko pairs`,
      'No coingecko pairs returned',
    );

    if (Array.isArray(data) && data.length > 0) {
      const first = data[0];
      assert(G, ep,
        'base_currency' in first && 'target_currency' in first && 'ticker_id' in first,
        'Pair has base_currency, target_currency, ticker_id',
        `Missing fields: ${JSON.stringify(Object.keys(first))}`,
      );

      const hasUnderscoreFormat = data.some((p: any) => p.ticker_id && p.ticker_id.includes('_'));
      assert(G, ep, hasUnderscoreFormat,
        'ticker_id uses addr_addr format',
        'No ticker_id with underscore format found',
      );
    }
  } catch (e: any) {
    fail(G, ep, 'Request failed', e.message);
  }
}

async function testCmcPairs() {
  const G = 'C';
  const ep = '/cmc/pairs';
  try {
    const data = await fetchJson('/cmc/pairs');

    assert(G, ep, Array.isArray(data) && data.length > 0,
      `${data.length} CMC pairs`,
      'No CMC pairs returned',
    );

    if (Array.isArray(data) && data.length > 0) {
      const first = data[0];
      assert(G, ep,
        'base_id' in first && 'base_symbol' in first && 'quote_id' in first && 'quote_symbol' in first && 'pair' in first,
        'CMC pair has required fields',
        `Missing fields: ${JSON.stringify(Object.keys(first))}`,
      );
    }
  } catch (e: any) {
    fail(G, ep, 'Request failed', e.message);
  }
}

async function testCmcHistoricalTrades() {
  const G = 'C';
  const ep = '/cmc/historical_trades';
  try {
    const data = await fetchJson('/cmc/historical_trades?limit=5');

    assert(G, ep, Array.isArray(data) && data.length > 0,
      `${data.length} CMC historical trades`,
      'No CMC historical trades',
    );

    if (Array.isArray(data) && data.length > 0) {
      const first = data[0];
      assert(G, ep,
        'fromAmount' in first && 'id' in first && 'pair' in first && 'timestamp' in first && 'toAmount' in first,
        'Trade has { fromAmount, id, pair, timestamp, toAmount }',
        `Missing fields: ${JSON.stringify(Object.keys(first))}`,
      );

      if (first.pair) {
        assert(G, ep,
          first.pair.fromToken && 'decimals' in first.pair.fromToken && 'symbol' in first.pair.fromToken && 'address' in first.pair.fromToken,
          'pair.fromToken has { decimals, symbol, address }',
          `Pair fromToken shape wrong: ${JSON.stringify(first.pair.fromToken)}`,
        );
      }
    }
  } catch (e: any) {
    fail(G, ep, 'Request failed', e.message);
  }
}

// ─── Group D: Analytics / volume / TVL endpoints ─────────────────────────────

async function testAnalyticsTvl() {
  const G = 'D';
  const ep = '/analytics/tvl';
  try {
    const data = await fetchJson('/analytics/tvl');

    assert(G, ep, Array.isArray(data) && data.length > 0,
      `${data.length} TVL entries`,
      'No TVL data returned',
    );

    if (Array.isArray(data) && data.length > 0) {
      const first = data[0];
      assert(G, ep, 'timestamp' in first && 'tvlUsd' in first,
        'TVL entry has { timestamp, tvlUsd }',
        `Missing fields: ${JSON.stringify(Object.keys(first))}`,
      );

      const tvlVal = parseFloat(first.tvlUsd);
      assert(G, ep, !isNaN(tvlVal) && tvlVal > 0,
        `tvlUsd = ${tvlVal} (> 0, includes gradient liquidity)`,
        `tvlUsd should be > 0 (gradient strategies contribute liquidity), got ${first.tvlUsd}`,
      );
    }
  } catch (e: any) {
    fail(G, ep, 'Request failed', e.message);
  }
}

async function testAnalyticsTvlTokens() {
  const G = 'D';
  const ep = `/analytics/tvl/tokens?addresses=${TOKEN0}`;
  try {
    const data = await fetchJson(`/analytics/tvl/tokens?addresses=${TOKEN0}`);

    assert(G, ep, Array.isArray(data),
      `Returns array (${data.length} entries)`,
      'Expected array response',
    );

    if (Array.isArray(data) && data.length > 0) {
      const first = data[0];
      assert(G, ep, 'address' in first || 'symbol' in first || 'tvlUsd' in first,
        'TVL token entry has expected fields',
        `Unexpected shape: ${JSON.stringify(Object.keys(first))}`,
      );
    }
  } catch (e: any) {
    fail(G, ep, 'Request failed', e.message);
  }
}

async function testAnalyticsVolume() {
  const G = 'D';
  const ep = '/analytics/volume';
  try {
    const data = await fetchJson('/analytics/volume');

    assert(G, ep, Array.isArray(data) && data.length > 0,
      `${data.length} volume entries`,
      'No volume data returned',
    );

    if (Array.isArray(data) && data.length > 0) {
      const first = data[0];
      assert(G, ep, 'timestamp' in first && 'volumeUsd' in first && 'feesUsd' in first,
        'Volume entry has { timestamp, volumeUsd, feesUsd }',
        `Missing fields: ${JSON.stringify(Object.keys(first))}`,
      );

      const volVal = parseFloat(first.volumeUsd);
      assert(G, ep, !isNaN(volVal),
        `volumeUsd is numeric: ${volVal}`,
        `volumeUsd is not numeric: ${first.volumeUsd}`,
      );

      const totalVol = data.reduce((sum: number, v: any) => sum + parseFloat(v.volumeUsd || '0'), 0);
      assert(G, ep, totalVol > 0,
        `Total volume across all entries = ${totalVol.toFixed(2)} (includes gradient trades)`,
        `Total volume is 0 — gradient trades should contribute`,
      );
    }
  } catch (e: any) {
    fail(G, ep, 'Request failed', e.message);
  }
}

async function testAnalyticsVolumeTokens() {
  const G = 'D';
  const ep = `/analytics/volume/tokens?addresses=${TOKEN0}`;
  try {
    const data = await fetchJson(`/analytics/volume/tokens?addresses=${TOKEN0}`);

    assert(G, ep, Array.isArray(data),
      `Returns array (${data.length} entries)`,
      'Expected array response',
    );
  } catch (e: any) {
    fail(G, ep, 'Request failed', e.message);
  }
}

async function testAnalyticsTrending() {
  const G = 'D';
  const ep = '/analytics/trending';
  try {
    const data = await fetchJson('/analytics/trending');

    assert(G, ep, data && typeof data === 'object',
      'Returns object',
      'Invalid response shape',
    );

    assert(G, ep, 'totalTradeCount' in data && data.totalTradeCount > 0,
      `totalTradeCount = ${data.totalTradeCount}`,
      `totalTradeCount missing or zero`,
    );

    assert(G, ep, Array.isArray(data.tradeCount) && Array.isArray(data.pairCount),
      `tradeCount (${data.tradeCount?.length}) and pairCount (${data.pairCount?.length}) are arrays`,
      'tradeCount or pairCount not arrays',
    );

    if (Array.isArray(data.tradeCount) && data.tradeCount.length > 0) {
      const first = data.tradeCount[0];
      assert(G, ep,
        'strategyTrades' in first && 'token0' in first && 'token1' in first && 'pairSymbol' in first,
        'tradeCount entry has { strategyTrades, token0, token1, pairSymbol }',
        `Missing fields: ${JSON.stringify(Object.keys(first))}`,
      );

      const gradPair = data.tradeCount.find((tc: any) => {
        const t0 = tc.token0?.toLowerCase();
        const t1 = tc.token1?.toLowerCase();
        return (t0 === CFG.gradientToken0.toLowerCase() && t1 === CFG.gradientToken1.toLowerCase()) ||
               (t0 === CFG.gradientToken1.toLowerCase() && t1 === CFG.gradientToken0.toLowerCase());
      });
      if (gradPair) {
        assert(G, ep, gradPair.strategyTrades > 0,
          `Gradient pair ${CFG.gradientToken0Symbol}/${CFG.gradientToken1Symbol} has ${gradPair.strategyTrades} trades in trending`,
          `Gradient pair trending entry has 0 trades`,
        );
      }
    }
  } catch (e: any) {
    fail(G, ep, 'Request failed', e.message);
  }
}

// ─── Group E: Coingecko / DexScreener / GeckoTerminal ────────────────────────

async function testCoingeckoTickers() {
  const G = 'E';
  const ep = '/coingecko/tickers';
  try {
    const data = await fetchJson('/coingecko/tickers');

    assert(G, ep, Array.isArray(data) && data.length > 0,
      `${data.length} tickers returned`,
      'No tickers returned',
    );

    if (Array.isArray(data) && data.length > 0) {
      const first = data[0];
      assert(G, ep,
        'ticker_id' in first && 'base_currency' in first && 'last_price' in first && 'base_volume' in first && 'liquidity_in_usd' in first,
        'Ticker has { ticker_id, base_currency, last_price, base_volume, liquidity_in_usd }',
        `Missing fields: ${JSON.stringify(Object.keys(first))}`,
      );
    }
  } catch (e: any) {
    fail(G, ep, 'Request failed', e.message);
  }
}

async function testCoingeckoHistoricalTrades() {
  const G = 'E';
  const ep = '/coingecko/historical_trades?limit=5';
  try {
    const data = await fetchJson('/coingecko/historical_trades?limit=5');

    assert(G, ep, Array.isArray(data) && data.length > 0,
      `${data.length} historical trades`,
      'No historical trades returned',
    );

    if (Array.isArray(data) && data.length > 0) {
      const first = data[0];
      assert(G, ep,
        'base_volume' in first && 'target_volume' in first && 'trade_id' in first && 'type' in first,
        'Trade has { base_volume, target_volume, trade_id, type }',
        `Missing fields: ${JSON.stringify(Object.keys(first))}`,
      );

      assert(G, ep, parseFloat(first.price) > 0,
        `price > 0: ${first.price}`,
        `price not > 0: ${first.price}`,
      );
    }
  } catch (e: any) {
    fail(G, ep, 'Request failed', e.message);
  }
}

async function testDexScreenerLatestBlock() {
  const G = 'E';
  const ep = '/dex-screener/latest-block';
  try {
    const data = await fetchJson('/dex-screener/latest-block');

    assert(G, ep, data && data.block && data.block.blockNumber > 0,
      `blockNumber = ${data.block?.blockNumber}`,
      `blockNumber missing or zero: ${JSON.stringify(data)}`,
    );

    assert(G, ep, data.block?.blockTimestamp !== undefined,
      `blockTimestamp present`,
      'blockTimestamp missing',
    );
  } catch (e: any) {
    fail(G, ep, 'Request failed', e.message);
  }
}

async function testDexScreenerAsset() {
  const G = 'E';
  const ep = `/dex-screener/asset?id=${TOKEN0}`;
  try {
    const data = await fetchJson(`/dex-screener/asset?id=${TOKEN0}`);

    assert(G, ep, data && data.asset,
      'Returns { asset }',
      `Invalid shape: ${JSON.stringify(data)}`,
    );

    if (data?.asset) {
      assert(G, ep, data.asset.symbol === 'USDC',
        `symbol = "USDC"`,
        `Expected "USDC", got "${data.asset.symbol}"`,
      );

      assert(G, ep, data.asset.decimals === 6,
        `decimals = 6`,
        `Expected 6, got ${data.asset.decimals}`,
      );
    }
  } catch (e: any) {
    fail(G, ep, 'Request failed', e.message);
  }
}

async function testDexScreenerEvents() {
  const G = 'E';
  if (CFG.checkSeedDexEvents) {
    const fromBlock = CFG.seedBlock;
    const toBlock = CFG.seedBlock + 10;
    const ep = `/dex-screener/events?fromBlock=${fromBlock}&toBlock=${toBlock}`;
    try {
      const data = await fetchJson(`/dex-screener/events?fromBlock=${fromBlock}&toBlock=${toBlock}`);

      assert(G, ep, data && Array.isArray(data.events),
        `Returns { events: [...] }`,
        `Invalid shape: ${JSON.stringify(data && Object.keys(data))}`,
      );

      if (data?.events?.length > 0) {
        const first = data.events[0];
        assert(G, ep,
          'eventType' in first && 'txnId' in first && 'pairId' in first,
          'Event has { eventType, txnId, pairId }',
          `Missing fields: ${JSON.stringify(Object.keys(first))}`,
        );

        assert(G, ep, first.block && first.block.blockNumber > 0,
          `block.blockNumber = ${first.block?.blockNumber}`,
          `block.blockNumber missing`,
        );
      } else {
        fail(G, ep, 'No events returned for seed block range');
      }
    } catch (e: any) {
      fail(G, ep, 'Request failed', e.message);
    }
  } else {
    const ep = `/dex-screener/events`;
    try {
      const stateData = await fetchJson('/state');
      const latestBlock = stateData?.lastBlock || 20000000;
      const fromBlock = Math.max(1, latestBlock - 500);
      const toBlock = latestBlock;
      const data = await fetchJson(`/dex-screener/events?fromBlock=${fromBlock}&toBlock=${toBlock}`);

      assert(G, ep, data && Array.isArray(data.events),
        `Returns { events: [...] } (${data?.events?.length || 0} events)`,
        `Invalid shape`,
      );

      if (data?.events) {
        assert(G, ep, data.events.length > 0,
          `${data.events.length} DexScreener events in block range`,
          'No DexScreener events returned — gradient events should be present',
        );

        const eventTypes = new Set(data.events.map((e: any) => e.eventType));
        assert(G, ep, eventTypes.has('join') || eventTypes.has('swap'),
          `Event types found: ${Array.from(eventTypes).join(', ')}`,
          'Expected join or swap events from gradient strategies',
        );
      }
    } catch (e: any) {
      fail(G, ep, 'Request failed', e.message);
    }
  }
}

async function testGeckoTerminalLatestBlock() {
  const G = 'E';
  const ep = '/gecko-terminal/latest-block';
  try {
    const data = await fetchJson('/gecko-terminal/latest-block');

    assert(G, ep, data && data.block && data.block.blockNumber > 0,
      `blockNumber = ${data.block?.blockNumber}`,
      `blockNumber missing or zero`,
    );

    assert(G, ep, data.block?.blockTimestamp !== undefined,
      'blockTimestamp present',
      'blockTimestamp missing',
    );
  } catch (e: any) {
    fail(G, ep, 'Request failed', e.message);
  }
}

async function testGeckoTerminalAsset() {
  const G = 'E';
  const ep = `/gecko-terminal/asset?id=${TOKEN0}`;
  try {
    const data = await fetchJson(`/gecko-terminal/asset?id=${TOKEN0}`);

    assert(G, ep, data && data.asset,
      'Returns { asset }',
      `Invalid shape: ${JSON.stringify(data)}`,
    );

    if (data?.asset) {
      assert(G, ep, data.asset.symbol === 'USDC' && data.asset.decimals === 6,
        'symbol="USDC", decimals=6',
        `Got symbol="${data.asset.symbol}", decimals=${data.asset.decimals}`,
      );
    }
  } catch (e: any) {
    fail(G, ep, 'Request failed', e.message);
  }
}

async function testGeckoTerminalEvents() {
  const G = 'E';
  if (CFG.checkSeedDexEvents) {
    const fromBlock = CFG.seedBlock;
    const toBlock = CFG.seedBlock + 10;
    const ep = `/gecko-terminal/events?fromBlock=${fromBlock}&toBlock=${toBlock}`;
    try {
      const data = await fetchJson(`/gecko-terminal/events?fromBlock=${fromBlock}&toBlock=${toBlock}`);
      assert(G, ep, data && Array.isArray(data.events),
        `Returns { events: [...] } (${data?.events?.length || 0} events)`,
        `Invalid shape: ${JSON.stringify(data && Object.keys(data))}`,
      );
    } catch (e: any) {
      fail(G, ep, 'Request failed', e.message);
    }
  } else {
    const ep = `/gecko-terminal/events`;
    try {
      const stateData = await fetchJson('/state');
      const latestBlock = stateData?.lastBlock || 20000000;
      const fromBlock = Math.max(1, latestBlock - 500);
      const toBlock = latestBlock;
      const data = await fetchJson(`/gecko-terminal/events?fromBlock=${fromBlock}&toBlock=${toBlock}`);
      assert(G, ep, data && Array.isArray(data.events),
        `Returns { events: [...] } (${data?.events?.length || 0} events)`,
        `Invalid shape`,
      );

      if (data?.events) {
        assert(G, ep, data.events.length > 0,
          `${data.events.length} GeckoTerminal events in block range`,
          'No GeckoTerminal events returned — gradient events should be present',
        );
      }
    } catch (e: any) {
      fail(G, ep, 'Request failed', e.message);
    }
  }
}

// ─── Group F: Other endpoints ────────────────────────────────────────────────

async function testRoi() {
  const G = 'F';
  const ep = '/roi';
  try {
    const data = await fetchJson('/roi');

    assert(G, ep, Array.isArray(data),
      `Returns array (${data.length} entries)`,
      'Expected array response',
    );

    if (Array.isArray(data) && data.length > 0) {
      const first = data[0];
      assert(G, ep, 'id' in first && 'ROI' in first,
        'ROI entry has { id, ROI }',
        `Missing fields: ${JSON.stringify(Object.keys(first))}`,
      );

      assert(G, ep, typeof first.ROI === 'number' && typeof first.id === 'string',
        `ROI is number, id is string`,
        `Wrong types: ROI=${typeof first.ROI}, id=${typeof first.id}`,
      );

      const gradientRois = data.filter((r: any) => r.id && r.id.length > 50);
      if (gradientRois.length > 0) {
        pass(G, ep, `${gradientRois.length} gradient strategies in ROI results`);
      }
    }
  } catch (e: any) {
    fail(G, ep, 'Request failed', e.message);
  }
}

async function testState() {
  const G = 'F';
  const ep = '/state';
  try {
    const data = await fetchJson('/state');

    assert(G, ep, data && data.lastBlock > 0,
      `lastBlock = ${data.lastBlock}`,
      `lastBlock missing or zero`,
    );

    assert(G, ep, data.timestamp !== undefined && !isNaN(new Date(data.timestamp).getTime()),
      `timestamp is valid date: ${data.timestamp}`,
      `timestamp invalid: ${data.timestamp}`,
    );
  } catch (e: any) {
    fail(G, ep, 'Request failed', e.message);
  }
}

async function testMarketRate() {
  const G = 'F';
  const ep = `/market-rate?address=${TOKEN0}&convert=usd`;
  try {
    const data = await fetchJson(`/market-rate?address=${TOKEN0}&convert=usd`);

    assert(G, ep, data && data.data && data.provider,
      `Returns { data, provider }`,
      `Invalid shape: ${JSON.stringify(data && Object.keys(data))}`,
    );

    if (data?.data?.USD !== undefined) {
      const usd = parseFloat(data.data.USD);
      assert(G, ep, usd >= 0.95 && usd <= 1.05,
        `USDC USD = ${usd} (within 0.95-1.05)`,
        `USDC USD out of range: ${usd}`,
      );
    }
  } catch (e: any) {
    fail(G, ep, 'Request failed (may need external API)', e.message);
  }
}

async function testHistoryPrices() {
  const G = 'F';
  const now = Math.floor(Date.now() / 1000);
  const start = now - 86400 * 7;
  const end = now;
  const ep = `/history/prices`;
  try {
    const data = await fetchJson(`/history/prices?baseToken=${TOKEN0}&quoteToken=${TOKEN1}&start=${start}&end=${end}`);

    assert(G, ep, Array.isArray(data),
      `Returns array (${data.length} candles)`,
      'Expected array response',
    );

    if (Array.isArray(data) && data.length > 0) {
      const first = data[0];
      assert(G, ep,
        'timestamp' in first && 'open' in first && 'close' in first && 'high' in first && 'low' in first,
        'Candle has { timestamp, open, close, high, low }',
        `Missing fields: ${JSON.stringify(Object.keys(first))}`,
      );
    }
  } catch (e: any) {
    if (e.message?.includes('No price data available')) {
      pass(G, ep, 'Endpoint reachable (no price data for this pair/range)');
    } else {
      fail(G, ep, 'Request failed', e.message);
    }
  }
}

async function testMerkleAllData() {
  const G = 'F';
  const ep = '/merkle/all-data';
  try {
    const data = await fetchJson('/merkle/all-data');

    assert(G, ep, Array.isArray(data),
      `Returns array (${data.length} entries, may be empty)`,
      'Expected array response',
    );

    if (Array.isArray(data) && data.length > 0) {
      const first = data[0];
      assert(G, ep, 'pair' in first,
        'Entry has "pair" field',
        `Missing "pair" field: ${JSON.stringify(Object.keys(first))}`,
      );
    }
  } catch (e: any) {
    fail(G, ep, 'Request failed', e.message);
  }
}

// ─── Group G: Endpoints that should not error ────────────────────────────────

async function testAnalyticsTvlPairs() {
  const G = 'G';
  const pairStr = await resolveKnownPairTickerId();
  const ep = `/analytics/tvl/pairs`;
  try {
    const data = await fetchJson(`/analytics/tvl/pairs?pairs=${pairStr}`);
    assert(G, ep, Array.isArray(data), `Returns 200 with array (${data.length} entries)`, 'Expected array response');
  } catch (e: any) {
    fail(G, ep, 'Request failed', e.message);
  }
}

async function testAnalyticsVolumePairs() {
  const G = 'G';
  const pairStr = await resolveKnownPairTickerId();
  const ep = `/analytics/volume/pairs`;
  try {
    const data = await fetchJson(`/analytics/volume/pairs?pairs=${pairStr}`);
    assert(G, ep, Array.isArray(data), `Returns 200 with array (${data.length} entries)`, 'Expected array response');
  } catch (e: any) {
    fail(G, ep, 'Request failed', e.message);
  }
}

async function testMerkleData() {
  const G = 'G';
  const pairStr = await resolveKnownPairTickerId();
  const ep = `/merkle/data`;
  try {
    const data = await fetchJson(`/merkle/data?pair=${pairStr}`);
    pass(G, ep, `Returns 200 (${typeof data === 'object' ? JSON.stringify(data).substring(0, 60) : typeof data})`);
  } catch (e: any) {
    if (e.message?.includes('No campaign found') || e.message?.includes('No active campaign')) {
      pass(G, ep, 'Endpoint reachable (no Merkle campaign for this pair)');
    } else {
      fail(G, ep, 'Request failed', e.message);
    }
  }
}

async function testMerkleRewards() {
  const G = 'G';
  const pairStr = await resolveKnownPairTickerId();
  const ep = `/merkle/rewards`;
  try {
    const data = await fetchJson(`/merkle/rewards?pair=${pairStr}`);
    pass(G, ep, `Returns 200 (${typeof data === 'object' ? JSON.stringify(data).substring(0, 60) : typeof data})`);
  } catch (e: any) {
    if (e.message?.includes('No campaign found') || e.message?.includes('No active campaign')) {
      pass(G, ep, 'Endpoint reachable (no Merkle campaign for this pair)');
    } else {
      fail(G, ep, 'Request failed', e.message);
    }
  }
}

async function testGeckoTerminalPair() {
  const G = 'G';
  const ep = '/gecko-terminal/pair';
  try {
    const data = await fetchJson(`/gecko-terminal/pair?id=${CARBON_CONTROLLER}-1`);
    pass(G, ep, `Returns 200 with pair object`);
  } catch (e: any) {
    fail(G, ep, 'Request failed', e.message);
  }
}

async function testDexScreenerPair() {
  const G = 'G';
  const ep = '/dex-screener/pair?id=1';
  try {
    const data = await fetchJson('/dex-screener/pair?id=1');
    pass(G, ep, `Returns 200 with pair object`);
  } catch (e: any) {
    fail(G, ep, 'Request failed', e.message);
  }
}

// ─── Runner ──────────────────────────────────────────────────────────────────

async function main() {
  console.log(`\nGradient API Verification — ${MODE.toUpperCase()} mode`);
  console.log(`Against ${BASE_URL}/v1/${EXCHANGE_ID}\n`);

  const groups: { name: string; tests: (() => Promise<void>)[] }[] = [
    {
      name: 'Group A — Gradient-aware endpoints',
      tests: [testStrategies, testSeedData, testAnalyticsGeneric, testAnalyticsTradesCount, testWalletPairBalance],
    },
    {
      name: 'Group B — Activity endpoints',
      tests: [testActivity, testActivityActionsCreate, testActivityMeta, testActivityV2, testActivityV2Meta],
    },
    {
      name: 'Group C — Token/pair data',
      tests: [testTokens, testTokensPrices, testCoingeckoPairs, testCmcPairs, testCmcHistoricalTrades],
    },
    {
      name: 'Group D — Analytics/volume/TVL',
      tests: [testAnalyticsTvl, testAnalyticsTvlTokens, testAnalyticsVolume, testAnalyticsVolumeTokens, testAnalyticsTrending],
    },
    {
      name: 'Group E — Coingecko/DexScreener/GeckoTerminal',
      tests: [
        testCoingeckoTickers, testCoingeckoHistoricalTrades,
        testDexScreenerLatestBlock, testDexScreenerAsset, testDexScreenerEvents,
        testGeckoTerminalLatestBlock, testGeckoTerminalAsset, testGeckoTerminalEvents,
      ],
    },
    {
      name: 'Group F — Other endpoints',
      tests: [testRoi, testState, testMarketRate, testHistoryPrices, testMerkleAllData],
    },
    {
      name: 'Group G — Should not error',
      tests: [testAnalyticsTvlPairs, testAnalyticsVolumePairs, testMerkleData, testMerkleRewards, testGeckoTerminalPair, testDexScreenerPair],
    },
  ];

  for (const group of groups) {
    console.log(`\n${'='.repeat(70)}`);
    console.log(`  ${group.name}`);
    console.log(`${'='.repeat(70)}`);

    for (const test of group.tests) {
      await test();
    }
  }

  console.log(`\n${'='.repeat(70)}`);
  const passed = results.filter((r) => r.passed).length;
  const failed = results.filter((r) => !r.passed).length;
  console.log(`\nResults: \x1b[32m${passed} passed\x1b[0m, \x1b[31m${failed} failed\x1b[0m out of ${results.length} checks`);

  const endpointsTested = new Set(results.map((r) => r.endpoint)).size;
  console.log(`Endpoints tested: ${endpointsTested}`);

  if (failed > 0) {
    console.log('\nFailed checks:');
    results
      .filter((r) => !r.passed)
      .forEach((r) => console.log(`  [${r.group}] ${r.endpoint}: ${r.details}${r.error ? ` (${r.error})` : ''}`));
    process.exit(1);
  } else {
    console.log('\n\x1b[32mAll checks passed!\x1b[0m');
  }
}

main().catch((err) => {
  console.error('Verification failed:', err);
  process.exit(1);
});
