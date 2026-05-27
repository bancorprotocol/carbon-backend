/**
 * Tenderly Seed
 *
 * Populates a Tenderly fork (created by `tenderly/create.sh`) with activity
 * on both the mainnet CarbonController and the mainnet GradientController.
 * Because the fork inherits mainnet state, both contracts already exist at
 * their canonical addresses — we just sign transactions against them with
 * the deterministic Hardhat / Anvil test accounts (Alice / Bob / Carol) so a
 * frontend developer can sign in deterministically.
 *
 * Two phases, both always run:
 *   1. Carbon  — strategies + updates + trades + one deletion across 3 pairs
 *                (DAI/USDC, WBTC/USDC, LINK/DAI) via CarbonController.
 *   2. Gradient — strategies of every gradient type (0-4) on DAI/USDC + a
 *                couple of strategies on WBTC/USDC and LINK/DAI, plus one
 *                trade, one update, one deletion via GradientController.
 *                Writes src/scripts/test/e2e-data.json for the API verifier.
 *
 * Required env (auto-loaded from .env.tenderly):
 *   ETHEREUM_RPC_ENDPOINT
 *
 * Run:
 *   npm run tenderly:seed
 */
import { ethers, BigNumber } from 'ethers';
import * as fs from 'fs';
import * as path from 'path';

// ─── Deterministic Hardhat / Anvil test accounts ──────────────────────────
const WALLETS = {
  alice: {
    address: '0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266',
    privateKey: '0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80',
  },
  bob: {
    address: '0x70997970C51812dc3A010C7d01b50e0d17dc79C8',
    privateKey: '0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d',
  },
  carol: {
    address: '0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC',
    privateKey: '0x5de4111afa1a4b94908f83103eb1f1706367c2e68ca870fc3fb9a804cdab365a',
  },
} as const;

// ─── Tokens & pairs ───────────────────────────────────────────────────────
const TOKENS = {
  DAI: { address: '0x6B175474E89094C44Da98b954EedeAC495271d0F', decimals: 18, symbol: 'DAI' },
  USDC: { address: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48', decimals: 6, symbol: 'USDC' },
  WBTC: { address: '0x2260FAC5E5542a773Aa44fBCfeDf7C193bc2C599', decimals: 8, symbol: 'WBTC' },
  LINK: { address: '0x514910771AF9Ca656af840dff83E8264EcF986CA', decimals: 18, symbol: 'LINK' },
} as const;

type Token = (typeof TOKENS)[keyof typeof TOKENS];

const PAIRS: { name: string; token0: Token; token1: Token }[] = [
  { name: 'DAI/USDC', token0: TOKENS.DAI, token1: TOKENS.USDC },
  { name: 'WBTC/USDC', token0: TOKENS.WBTC, token1: TOKENS.USDC },
  { name: 'LINK/DAI', token0: TOKENS.LINK, token1: TOKENS.DAI },
];

// Canonical mainnet contract addresses. Mirrors src/deployment/deployment.service.ts.
const CARBON_CONTROLLER = '0xC537e898CD774e2dCBa3B14Ea6f34C93d5eA45e1';
const GRADIENT_CONTROLLER = '0x37A65Dda75A4C32959834C9b391a24dCa17eeC10';

// ─── ABIs ─────────────────────────────────────────────────────────────────
const CARBON_ABI = [
  'function createStrategy(address token0, address token1, tuple(uint128 y, uint128 z, uint64 A, uint64 B)[2] orders) external payable returns (uint256)',
  'function updateStrategy(uint256 strategyId, tuple(uint128 y, uint128 z, uint64 A, uint64 B)[2] currentOrders, tuple(uint128 y, uint128 z, uint64 A, uint64 B)[2] newOrders) external payable',
  'function deleteStrategy(uint256 strategyId) external',
  'function tradeBySourceAmount(address sourceToken, address targetToken, tuple(uint256 strategyId, uint128 amount)[] tradeActions, uint256 deadline, uint128 minReturn) external payable returns (uint128)',
  'function strategy(uint256 id) external view returns (tuple(uint256 id, address owner, address[2] tokens, tuple(uint128 y, uint128 z, uint64 A, uint64 B)[2] orders))',
];

const GRADIENT_ABI = [
  'function createPair(address token0, address token1) external returns (tuple(uint128 id, address[2] tokens))',
  'function createStrategy(address token0, address token1, tuple(uint128 liquidity, uint64 initialPrice, uint32 tradingStartTime, uint32 expiry, uint32 multiFactor, uint8 gradientType)[2] orders) external payable returns (uint256)',
  'function updateStrategy(uint256 strategyId, tuple(uint128 liquidity, uint64 initialPrice, uint32 tradingStartTime, uint32 expiry, uint32 multiFactor, uint8 gradientType)[2] currentOrders, tuple(uint128 liquidity, uint64 initialPrice, uint32 tradingStartTime, uint32 expiry, uint32 multiFactor, uint8 gradientType)[2] newOrders) external payable',
  'function deleteStrategy(uint256 strategyId) external',
  'function strategiesByPairCount(address token0, address token1) external view returns (uint256)',
  'function strategiesByPair(address token0, address token1, uint256 startIndex, uint256 endIndex) external view returns (tuple(uint256 id, address owner, address[2] tokens, tuple(uint128 liquidity, uint64 initialPrice, uint32 tradingStartTime, uint32 expiry, uint32 multiFactor, uint8 gradientType)[2] orders)[] memory)',
  'function strategy(uint256 id) external view returns (tuple(uint256 id, address owner, address[2] tokens, tuple(uint128 liquidity, uint64 initialPrice, uint32 tradingStartTime, uint32 expiry, uint32 multiFactor, uint8 gradientType)[2] orders))',
  'function tradeBySourceAmount(address sourceToken, address targetToken, tuple(uint256 strategyId, uint128 amount)[] tradeActions, uint256 deadline, uint128 minReturn) external payable returns (uint128)',
];

const ERC20_ABI = [
  'function approve(address spender, uint256 amount) external returns (bool)',
  'function balanceOf(address account) external view returns (uint256)',
];

// Per-position initialPrice values that GradientController accepts on these pairs.
// Symmetric initialPrice on both orders reverts on the contract.
const ORDER0_INITIAL_PRICE = 6001066667089;
const ORDER1_INITIAL_PRICE = 1897467523720620;

const GRADIENT_TYPE_NAMES = [
  'LINEAR_INCREASE',
  'LINEAR_DECREASE',
  'LINEAR_INV_INCREASE',
  'LINEAR_INV_DECREASE',
  'EXPONENTIAL_INCREASE',
] as const;

// ─── Pretty printing ──────────────────────────────────────────────────────
const RED = '\x1b[0;31m';
const GREEN = '\x1b[0;32m';
const YELLOW = '\x1b[1;33m';
const CYAN = '\x1b[0;36m';
const NC = '\x1b[0m';

function section(title: string) {
  console.log(`\n${CYAN}── ${title} ${'─'.repeat(Math.max(0, 60 - title.length))}${NC}`);
}
function ok(msg: string) {
  console.log(`  ${GREEN}✓${NC} ${msg}`);
}
function info(msg: string) {
  console.log(`  ${msg}`);
}
function warn(msg: string) {
  console.log(`  ${YELLOW}!${NC} ${msg}`);
}
function fail(msg: string): never {
  console.error(`  ${RED}✗${NC} ${msg}`);
  process.exit(1);
}

// ─── Helpers ──────────────────────────────────────────────────────────────
function loadEnvFile(): Record<string, string> {
  const envPath = path.join(__dirname, '../../../.env.tenderly');
  const vars: Record<string, string> = {};
  if (!fs.existsSync(envPath)) return vars;
  for (const line of fs.readFileSync(envPath, 'utf-8').split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eqIdx = trimmed.indexOf('=');
    if (eqIdx > 0) vars[trimmed.slice(0, eqIdx)] = trimmed.slice(eqIdx + 1);
  }
  return vars;
}

// Tenderly's admin RPC (tenderly_setBalance / setErc20Balance / setCode)
// occasionally returns a transient "Service unavailable" (-32010). Retry a
// handful of times with linear backoff so a one-off hiccup doesn't fail the
// whole seed.
async function withRetry<T>(label: string, fn: () => Promise<T>, attempts = 4): Promise<T> {
  let lastErr: any;
  for (let i = 1; i <= attempts; i++) {
    try {
      return await fn();
    } catch (e: any) {
      lastErr = e;
      const transient = e?.code === 'SERVER_ERROR' || /Service unavailable|-32010|ECONNRESET|timeout/i.test(e?.message || '');
      if (!transient || i === attempts) break;
      const delay = 500 * i;
      warn(`${label} transient failure (attempt ${i}/${attempts}, retrying in ${delay}ms)`);
      await new Promise((r) => setTimeout(r, delay));
    }
  }
  throw lastErr;
}

async function setEth(provider: ethers.providers.JsonRpcProvider, address: string, eth: string) {
  await withRetry(`setEth(${address})`, () =>
    provider.send('tenderly_setBalance', [[address], ethers.utils.hexValue(ethers.utils.parseEther(eth))]),
  );
}

async function setErc20(provider: ethers.providers.JsonRpcProvider, token: Token, address: string, amount: string) {
  await withRetry(`setErc20(${token.symbol}, ${address})`, () =>
    provider.send('tenderly_setErc20Balance', [
      token.address,
      address,
      ethers.utils.hexValue(ethers.utils.parseUnits(amount, token.decimals)),
    ]),
  );
}

async function clearCode(provider: ethers.providers.JsonRpcProvider, address: string) {
  // Hardhat default accounts have EIP-7702 delegation code on mainnet, which
  // makes _safeMint think they are contracts. Wipe the code on the fork.
  try {
    await withRetry(`setCode(${address})`, () => provider.send('tenderly_setCode', [address, '0x']));
  } catch {
    /* tenderly_setCode unsupported on this provider — best effort */
  }
}

async function fundWallet(provider: ethers.providers.JsonRpcProvider, address: string, label: string) {
  await clearCode(provider, address);
  await setEth(provider, address, '1000');
  for (const t of Object.values(TOKENS)) {
    const amount = t.symbol === 'WBTC' ? '100' : '500000';
    await setErc20(provider, t, address, amount);
  }
  ok(`Funded ${label} ${address}: 1000 ETH + 500k of each token (100 WBTC)`);
}

async function approveAll(wallet: ethers.Wallet, spender: string) {
  for (const t of Object.values(TOKENS)) {
    const erc20 = new ethers.Contract(t.address, ERC20_ABI, wallet);
    const tx = await erc20.approve(spender, ethers.constants.MaxUint256);
    await tx.wait();
  }
}

// ─── Phase Carbon ─────────────────────────────────────────────────────────
interface CarbonOrder {
  y: ethers.BigNumberish;
  z: ethers.BigNumberish;
  A: ethers.BigNumberish;
  B: ethers.BigNumberish;
}

async function readCarbonOrders(controller: ethers.Contract, strategyId: string): Promise<CarbonOrder[]> {
  const s = await controller.strategy(strategyId);
  return s.orders.map((o: any) => ({ y: o.y, z: o.z, A: o.A, B: o.B }));
}

async function tryCarbonTrade(
  controller: ethers.Contract,
  sourceToken: string,
  targetToken: string,
  strategyId: string,
  amount: ethers.BigNumber,
  deadline: number,
): Promise<{ ok: boolean; direction: string }> {
  for (const [src, dst, dir] of [
    [sourceToken, targetToken, 'forward'] as const,
    [targetToken, sourceToken, 'reverse'] as const,
  ]) {
    const actions = [{ strategyId, amount }];
    try {
      await controller.callStatic.tradeBySourceAmount(src, dst, actions, deadline, 1, { gasLimit: 1_000_000 });
      const tx = await controller.tradeBySourceAmount(src, dst, actions, deadline, 1, { gasLimit: 1_000_000 });
      const r = await tx.wait();
      if (r.status === 1) return { ok: true, direction: dir };
    } catch {
      // try the other direction
    }
  }
  return { ok: false, direction: 'none' };
}

async function phaseCarbon(provider: ethers.providers.JsonRpcProvider, alice: ethers.Wallet) {
  section('Carbon: create activity on mainnet CarbonController');
  info(`CarbonController: ${CARBON_CONTROLLER}`);

  const controller = new ethers.Contract(CARBON_CONTROLLER, CARBON_ABI, alice);
  const latestBlock = await provider.getBlock('latest');
  const deadline = latestBlock.timestamp + 86_400;

  await approveAll(alice, CARBON_CONTROLLER);
  ok('Approved CarbonController for Alice (all tokens)');

  const created: { id: string; pair: string; token0: string; token1: string }[] = [];

  const daiUsdcOrders: CarbonOrder[][] = [
    [
      { y: ethers.utils.parseUnits('500', 18), z: ethers.utils.parseUnits('500', 18), A: 0, B: 6001066667089 },
      { y: ethers.utils.parseUnits('500', 6), z: ethers.utils.parseUnits('500', 6), A: 0, B: 1897467523720620 },
    ],
    [
      { y: ethers.utils.parseUnits('200', 18), z: ethers.utils.parseUnits('200', 18), A: 100000, B: 5800000000000 },
      { y: ethers.utils.parseUnits('200', 6), z: ethers.utils.parseUnits('200', 6), A: 100000, B: 1900000000000000 },
    ],
    [
      { y: ethers.utils.parseUnits('1000', 18), z: ethers.utils.parseUnits('1000', 18), A: 0, B: 6100000000000 },
      { y: 0, z: 0, A: 0, B: 0 },
    ],
  ];
  for (let i = 0; i < daiUsdcOrders.length; i++) {
    const id = await controller.callStatic.createStrategy(TOKENS.DAI.address, TOKENS.USDC.address, daiUsdcOrders[i], { gasLimit: 1_500_000 });
    const tx = await controller.createStrategy(TOKENS.DAI.address, TOKENS.USDC.address, daiUsdcOrders[i], { gasLimit: 1_500_000 });
    const r = await tx.wait();
    created.push({ id: id.toString(), pair: 'DAI/USDC', token0: TOKENS.DAI.address, token1: TOKENS.USDC.address });
    ok(`DAI/USDC strategy ${String.fromCharCode(65 + i)} created: id=${id.toString()} block=${r.blockNumber}`);
  }

  const wbtcUsdcOrders: CarbonOrder[][] = [
    [
      { y: ethers.utils.parseUnits('1', 8), z: ethers.utils.parseUnits('1', 8), A: 0, B: 750000000000000 },
      { y: ethers.utils.parseUnits('30000', 6), z: ethers.utils.parseUnits('30000', 6), A: 0, B: 15000000000 },
    ],
    [
      { y: ethers.utils.parseUnits('2', 8), z: ethers.utils.parseUnits('2', 8), A: 50000, B: 720000000000000 },
      { y: ethers.utils.parseUnits('50000', 6), z: ethers.utils.parseUnits('50000', 6), A: 50000, B: 14500000000 },
    ],
  ];
  for (let i = 0; i < wbtcUsdcOrders.length; i++) {
    const id = await controller.callStatic.createStrategy(TOKENS.WBTC.address, TOKENS.USDC.address, wbtcUsdcOrders[i], { gasLimit: 1_500_000 });
    const tx = await controller.createStrategy(TOKENS.WBTC.address, TOKENS.USDC.address, wbtcUsdcOrders[i], { gasLimit: 1_500_000 });
    const r = await tx.wait();
    created.push({ id: id.toString(), pair: 'WBTC/USDC', token0: TOKENS.WBTC.address, token1: TOKENS.USDC.address });
    ok(`WBTC/USDC strategy ${String.fromCharCode(65 + i)} created: id=${id.toString()} block=${r.blockNumber}`);
  }

  const linkDaiOrders: CarbonOrder[][] = [
    [
      { y: ethers.utils.parseUnits('100', 18), z: ethers.utils.parseUnits('100', 18), A: 0, B: 24000000000000 },
      { y: ethers.utils.parseUnits('1000', 18), z: ethers.utils.parseUnits('1000', 18), A: 0, B: 47000000000 },
    ],
    [
      { y: ethers.utils.parseUnits('200', 18), z: ethers.utils.parseUnits('200', 18), A: 80000, B: 23000000000000 },
      { y: ethers.utils.parseUnits('2000', 18), z: ethers.utils.parseUnits('2000', 18), A: 80000, B: 46000000000 },
    ],
  ];
  for (let i = 0; i < linkDaiOrders.length; i++) {
    const id = await controller.callStatic.createStrategy(TOKENS.LINK.address, TOKENS.DAI.address, linkDaiOrders[i], { gasLimit: 1_500_000 });
    const tx = await controller.createStrategy(TOKENS.LINK.address, TOKENS.DAI.address, linkDaiOrders[i], { gasLimit: 1_500_000 });
    const r = await tx.wait();
    created.push({ id: id.toString(), pair: 'LINK/DAI', token0: TOKENS.LINK.address, token1: TOKENS.DAI.address });
    ok(`LINK/DAI strategy ${String.fromCharCode(65 + i)} created: id=${id.toString()} block=${r.blockNumber}`);
  }

  // Updates
  info('Updates:');
  {
    const s = created[0];
    const orders = await readCarbonOrders(controller, s.id);
    const newOrders = [
      {
        ...orders[0],
        y: ethers.BigNumber.from(orders[0].y).add(ethers.utils.parseUnits('300', 18)),
        z: ethers.BigNumber.from(orders[0].z).add(ethers.utils.parseUnits('300', 18)),
      },
      {
        ...orders[1],
        y: ethers.BigNumber.from(orders[1].y).add(ethers.utils.parseUnits('300', 6)),
        z: ethers.BigNumber.from(orders[1].z).add(ethers.utils.parseUnits('300', 6)),
      },
    ];
    const tx = await controller.updateStrategy(s.id, orders, newOrders, { gasLimit: 500_000, value: 0 });
    const r = await tx.wait();
    ok(`Deposit on ${s.pair} Strategy A: +300 DAI / +300 USDC (block ${r.blockNumber})`);
  }
  {
    const s = created[1];
    const orders = await readCarbonOrders(controller, s.id);
    const newOrders = [
      { ...orders[0], y: ethers.BigNumber.from(orders[0].y).sub(ethers.utils.parseUnits('50', 18)) },
      { ...orders[1] },
    ];
    const tx = await controller.updateStrategy(s.id, orders, newOrders, { gasLimit: 500_000, value: 0 });
    const r = await tx.wait();
    ok(`Withdraw on ${s.pair} Strategy B: -50 DAI (block ${r.blockNumber})`);
  }
  {
    const s = created[3];
    const orders = await readCarbonOrders(controller, s.id);
    const newOrders = [
      { ...orders[0], B: 760000000000000 },
      { ...orders[1], B: 15200000000 },
    ];
    const tx = await controller.updateStrategy(s.id, orders, newOrders, { gasLimit: 500_000, value: 0 });
    const r = await tx.wait();
    ok(`PriceEdit on ${s.pair} Strategy A: adjusted B parameters (block ${r.blockNumber})`);
  }

  // Trades
  info('Trades:');
  const trades = [
    { s: created[0], amount: '10', decimals: 6, label: 'USDC -> DAI via Strategy A' },
    { s: created[0], amount: '5', decimals: 6, label: 'USDC -> DAI via Strategy A (2nd)' },
    { s: created[1], amount: '8', decimals: 6, label: 'USDC -> DAI via Strategy B' },
    { s: created[3], amount: '1000', decimals: 6, label: 'USDC -> WBTC via Strategy A' },
    { s: created[5], amount: '2', decimals: 18, label: 'LINK -> DAI via Strategy A' },
    { s: created[6], amount: '20', decimals: 18, label: 'DAI -> LINK via Strategy B' },
  ];
  let tradeCount = 0;
  for (const t of trades) {
    const amount = ethers.utils.parseUnits(t.amount, t.decimals);
    const { ok: tradeOk, direction } = await tryCarbonTrade(controller, t.s.token1, t.s.token0, t.s.id, amount, deadline);
    if (tradeOk) tradeCount++;
    ok(`${t.s.pair}: ${t.label}: ${tradeOk ? `OK (${direction})` : 'SKIPPED'}`);
  }

  // Delete
  {
    const s = created[2];
    const tx = await controller.deleteStrategy(s.id, { gasLimit: 300_000 });
    const r = await tx.wait();
    ok(`Deleted ${s.pair} Strategy C (id=${s.id}) block ${r.blockNumber}`);
  }

  info(`Carbon summary: ${created.length} created, 3 updates, ${tradeCount}/${trades.length} trades, 1 deletion`);
}

// ─── Phase Gradient ───────────────────────────────────────────────────────
function buildGradientOrder(
  token: Token,
  liquidityUnits: string,
  gradientType: number,
  now: number,
  position: 0 | 1,
) {
  const defaultInitialPrice = position === 0 ? ORDER0_INITIAL_PRICE : ORDER1_INITIAL_PRICE;
  return {
    liquidity: ethers.utils.parseUnits(liquidityUnits, token.decimals),
    initialPrice: defaultInitialPrice,
    tradingStartTime: now - 50,
    expiry: now + 86_400,
    multiFactor: 2_814_749,
    gradientType,
  };
}

async function tryGradientTradeBoth(
  controller: ethers.Contract,
  strategyId: string,
  token0: Token,
  token1: Token,
  amount: string,
  deadline: number,
): Promise<{ ok: boolean; direction: 'forward' | 'reverse' | 'none' }> {
  for (const dir of ['forward', 'reverse'] as const) {
    const [src, dst] = dir === 'forward' ? [token0, token1] : [token1, token0];
    const actions = [{ strategyId, amount: ethers.utils.parseUnits(amount, src.decimals) }];
    try {
      await controller.callStatic.tradeBySourceAmount(src.address, dst.address, actions, deadline, 1, { gasLimit: 1_000_000 });
      const tx = await controller.tradeBySourceAmount(src.address, dst.address, actions, deadline, 1, { gasLimit: 1_000_000 });
      const r = await tx.wait();
      if (r.status === 1) return { ok: true, direction: dir };
    } catch {
      // try the other direction
    }
  }
  return { ok: false, direction: 'none' };
}

async function phaseGradient(provider: ethers.providers.JsonRpcProvider, alice: ethers.Wallet, bob: ethers.Wallet) {
  section('Gradient: create activity on mainnet GradientController');
  info(`GradientController: ${GRADIENT_CONTROLLER}`);

  const cAlice = new ethers.Contract(GRADIENT_CONTROLLER, GRADIENT_ABI, alice);
  const cBob = new ethers.Contract(GRADIENT_CONTROLLER, GRADIENT_ABI, bob);

  await approveAll(alice, GRADIENT_CONTROLLER);
  await approveAll(bob, GRADIENT_CONTROLLER);
  ok('Approved GradientController on Alice + Bob (all tokens)');

  // Ensure all 3 pairs exist on GradientController (createPair reverts if it
  // already does; we treat that as success).
  for (const p of PAIRS) {
    try {
      await cAlice.callStatic.strategiesByPairCount(p.token0.address, p.token1.address);
      ok(`Pair ${p.name} already exists`);
    } catch {
      try {
        const tx = await cAlice.createPair(p.token0.address, p.token1.address, { gasLimit: 500_000 });
        const r = await tx.wait();
        if (r.status !== 1) fail(`Pair ${p.name} creation reverted on-chain`);
        ok(`Created pair ${p.name} (block ${r.blockNumber})`);
      } catch (e: any) {
        const msg = e.reason || e.error?.reason || e.message || '';
        warn(`Pair ${p.name}: ${msg.slice(0, 160)}`);
      }
    }
  }

  const latest = await provider.getBlock('latest');
  const now = latest.timestamp;
  const deadline = now + 86_400;

  const created: { id: string; owner: string; pair: string; type: string }[] = [];

  // DAI/USDC — all 5 gradient types (the verifier expects types 0-4 present).
  // order0 liquidity = 100 DAI matches verify.ts CFG.seedOrder0Liquidity.
  {
    const p = PAIRS[0];
    info(`${p.name}:`);
    for (let gt = 0; gt < GRADIENT_TYPE_NAMES.length; gt++) {
      const order0 = buildGradientOrder(p.token0, '100', gt, now, 0);
      const order1 = buildGradientOrder(p.token1, '100', gt, now, 1);
      const id = await cAlice.callStatic.createStrategy(p.token0.address, p.token1.address, [order0, order1]);
      const r = await (await cAlice.createStrategy(p.token0.address, p.token1.address, [order0, order1])).wait();
      created.push({ id: id.toString(), owner: alice.address, pair: p.name, type: GRADIENT_TYPE_NAMES[gt] });
      ok(`Alice: ${GRADIENT_TYPE_NAMES[gt]} (id=${id.toString()}) block ${r.blockNumber}`);
    }
  }

  // WBTC/USDC — two strategies (types 0 and 1) so types 0-4 stay covered
  // even after we delete the LINEAR_INCREASE on DAI/USDC below, and so the
  // total active count after deletion lands at 7 (= 5 DAI/USDC + 2 WBTC/USDC
  // + 1 LINK/DAI - 1 deletion), which is what the e2e verifier asserts.
  // LINK/DAI — one strategy, mirroring the Carbon side.
  const extraPlan: { pair: (typeof PAIRS)[number]; type: number; liq0: string; liq1: string }[] = [
    { pair: PAIRS[1], type: 0, liq0: '1', liq1: '30000' },
    { pair: PAIRS[1], type: 1, liq0: '1', liq1: '30000' },
    { pair: PAIRS[2], type: 0, liq0: '100', liq1: '1500' },
  ];
  for (const plan of extraPlan) {
    const p = plan.pair;
    const order0 = buildGradientOrder(p.token0, plan.liq0, plan.type, now, 0);
    const order1 = buildGradientOrder(p.token1, plan.liq1, plan.type, now, 1);
    try {
      const id = await cAlice.callStatic.createStrategy(p.token0.address, p.token1.address, [order0, order1]);
      const r = await (await cAlice.createStrategy(p.token0.address, p.token1.address, [order0, order1])).wait();
      created.push({ id: id.toString(), owner: alice.address, pair: p.name, type: GRADIENT_TYPE_NAMES[plan.type] });
      ok(`Alice on ${p.name}: ${GRADIENT_TYPE_NAMES[plan.type]} (id=${id.toString()}) block ${r.blockNumber}`);
    } catch (e: any) {
      warn(`Skipped create on ${p.name} type ${plan.type}: ${(e.reason || e.message || '').slice(0, 120)}`);
    }
  }

  // Update: deposit liquidity into one strategy.
  if (created.length > 0) {
    info('Update:');
    const s = created[0];
    const fresh = await cAlice.strategy(s.id);
    const cur = fresh.orders.map((o: any) => ({
      liquidity: o.liquidity,
      initialPrice: o.initialPrice,
      tradingStartTime: o.tradingStartTime,
      expiry: o.expiry,
      multiFactor: o.multiFactor,
      gradientType: o.gradientType,
    }));
    const next = [
      { ...cur[0], liquidity: BigNumber.from(cur[0].liquidity).add(ethers.utils.parseUnits('100', 18)) },
      { ...cur[1], liquidity: BigNumber.from(cur[1].liquidity).add(ethers.utils.parseUnits('100', 6)) },
    ];
    const tx = await cAlice.updateStrategy(s.id, cur, next, { gasLimit: 500_000, value: 0 });
    const r = await tx.wait();
    if (r.status !== 1) fail(`Deposit update reverted for id=${s.id}`);
    ok(`Deposit: +100/+100 on ${s.pair} ${s.type} (id=${s.id}) block ${r.blockNumber}`);
  }

  // Trades — at least one per pair where we have a strategy.
  info('Trades:');
  let trades = 0;
  for (const p of PAIRS) {
    const candidate = created.find((s) => s.pair === p.name);
    if (!candidate) continue;
    const amount = p.token0.symbol === 'WBTC' ? '0.05' : '5';
    const result = await tryGradientTradeBoth(cBob, candidate.id, p.token0, p.token1, amount, deadline);
    if (result.ok) {
      trades++;
      ok(`Bob -> ${p.name} id=${candidate.id} (${result.direction})`);
    } else {
      warn(`Trade on ${p.name} id=${candidate.id} skipped (both directions reverted)`);
    }
  }

  // Delete: drop one DAI/USDC strategy.
  let deletions = 0;
  const deletable = created.find((s) => s.pair === 'DAI/USDC');
  if (deletable) {
    info('Deletion:');
    try {
      const tx = await cAlice.deleteStrategy(deletable.id, { gasLimit: 300_000 });
      const r = await tx.wait();
      if (r.status !== 1) fail(`Delete reverted for id=${deletable.id}`);
      deletions++;
      ok(`Deleted ${deletable.pair} ${deletable.type} (id=${deletable.id}) block ${r.blockNumber}`);
    } catch (e: any) {
      warn(`Delete failed for id=${deletable.id}: ${(e.reason || e.message || '').slice(0, 120)}`);
    }
  }

  // Write post-trade liquidity snapshot for the API verifier (e2e mode).
  section('Write e2e-data.json (post-trade liquidity snapshot)');
  try {
    const p1 = PAIRS[0];
    const p2 = PAIRS[1];
    const p1Count = await cAlice.strategiesByPairCount(p1.token0.address, p1.token1.address);
    const p1Strats = p1Count > 0 ? await cAlice.strategiesByPair(p1.token0.address, p1.token1.address, 0, p1Count) : [];
    const p2Count = await cAlice.strategiesByPairCount(p2.token0.address, p2.token1.address);
    const p2Strats = p2Count > 0 ? await cAlice.strategiesByPair(p2.token0.address, p2.token1.address, 0, p2Count) : [];
    const postTradeData = {
      pair1: p1Strats.map((s: any) => ({
        id: s.id.toString(),
        order0Liquidity: s.orders[0].liquidity.toString(),
        order1Liquidity: s.orders[1].liquidity.toString(),
      })),
      pair2: p2Strats.map((s: any) => ({
        id: s.id.toString(),
        order0Liquidity: s.orders[0].liquidity.toString(),
        order1Liquidity: s.orders[1].liquidity.toString(),
      })),
    };
    const dataPath = path.join(__dirname, '..', 'test', 'e2e-data.json');
    fs.mkdirSync(path.dirname(dataPath), { recursive: true });
    fs.writeFileSync(dataPath, JSON.stringify(postTradeData, null, 2));
    ok(`Wrote post-trade data to ${dataPath}`);
  } catch (e: any) {
    warn(`Failed to write e2e-data.json: ${(e.reason || e.message || '').slice(0, 200)}`);
  }

  info(`Gradient summary: ${created.length} created, 1 update, ${trades} trades, ${deletions} deletions`);
}

// ─── Main ─────────────────────────────────────────────────────────────────
async function main() {
  console.log(`\n${CYAN}==========================================${NC}`);
  console.log(`${CYAN}  Tenderly Seed (Carbon + Gradient)        ${NC}`);
  console.log(`${CYAN}==========================================${NC}`);

  const env = loadEnvFile();
  const rpcUrl = process.env.ETHEREUM_RPC_ENDPOINT || env.ETHEREUM_RPC_ENDPOINT;

  if (!rpcUrl) {
    fail('Missing ETHEREUM_RPC_ENDPOINT. Run `npm run tenderly:create` first or source .env.tenderly.');
  }

  info(`RPC:                ${rpcUrl}`);
  info(`CarbonController:   ${CARBON_CONTROLLER}`);
  info(`GradientController: ${GRADIENT_CONTROLLER}`);
  info(`Alice:              ${WALLETS.alice.address}`);
  info(`Bob:                ${WALLETS.bob.address}`);
  info(`Carol:              ${WALLETS.carol.address}`);

  const provider = new ethers.providers.JsonRpcProvider(rpcUrl);
  const alice = new ethers.Wallet(WALLETS.alice.privateKey, provider);
  const bob = new ethers.Wallet(WALLETS.bob.privateKey, provider);
  const carol = new ethers.Wallet(WALLETS.carol.privateKey, provider);

  section('Fund Alice + Bob + Carol');
  await fundWallet(provider, alice.address, 'Alice');
  await fundWallet(provider, bob.address, 'Bob  ');
  await fundWallet(provider, carol.address, 'Carol');

  await phaseCarbon(provider, alice);
  await phaseGradient(provider, alice, bob);

  const finalBlock = (await provider.getBlock('latest')).number;
  console.log(`\n${CYAN}==========================================${NC}`);
  console.log(`${CYAN}  Seed Complete (final block ${finalBlock})${NC}`);
  console.log(`${CYAN}==========================================${NC}\n`);
  console.log(`  Test addresses (Hardhat / Anvil defaults — same private keys every run):`);
  console.log(`    Alice  ${alice.address}`);
  console.log(`    Bob    ${bob.address}`);
  console.log(`    Carol  ${carol.address}`);
  console.log();
}

main().catch((err) => {
  console.error('\nSeed failed:', err);
  process.exit(1);
});
