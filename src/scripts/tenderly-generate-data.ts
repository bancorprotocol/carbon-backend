/**
 * Tenderly Data Generator
 *
 * Generates diverse Carbon protocol activity on a Tenderly mainnet fork:
 *   - Multiple strategies across different token pairs
 *   - Strategy updates (price edits, deposits, withdrawals)
 *   - Trades against strategies
 *   - Strategy deletion
 *
 * Requires:
 *   - Tenderly testnet running (npm run tenderly:testnet)
 *   - .env.tenderly present or ETHEREUM_RPC_ENDPOINT set
 */
import { ethers } from 'ethers';
import * as fs from 'fs';
import * as path from 'path';

const CARBON_CONTROLLER = '0xC537e898CD774e2dCBa3B14Ea6f34C93d5eA45e1';

const TOKENS = {
  DAI:  { address: '0x6B175474E89094C44Da98b954EedeAC495271d0F', decimals: 18, symbol: 'DAI' },
  USDC: { address: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48', decimals: 6,  symbol: 'USDC' },
  WBTC: { address: '0x2260FAC5E5542a773Aa44fBCfeDf7C193bc2C599', decimals: 8,  symbol: 'WBTC' },
  LINK: { address: '0x514910771AF9Ca656af840dff83E8264EcF986CA', decimals: 18, symbol: 'LINK' },
  WETH: { address: '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2', decimals: 18, symbol: 'WETH' },
};

const CARBON_ABI = [
  'function createStrategy(address token0, address token1, tuple(uint128 y, uint128 z, uint64 A, uint64 B)[2] orders) external payable returns (uint256)',
  'function updateStrategy(uint256 strategyId, tuple(uint128 y, uint128 z, uint64 A, uint64 B)[2] currentOrders, tuple(uint128 y, uint128 z, uint64 A, uint64 B)[2] newOrders) external payable',
  'function deleteStrategy(uint256 strategyId) external',
  'function tradeBySourceAmount(address sourceToken, address targetToken, tuple(uint256 strategyId, uint128 amount)[] tradeActions, uint256 deadline, uint128 minReturn) external payable returns (uint128)',
  'function strategy(uint256 id) external view returns (tuple(uint256 id, address owner, address[2] tokens, tuple(uint128 y, uint128 z, uint64 A, uint64 B)[2] orders))',
];

const ERC20_ABI = [
  'function approve(address spender, uint256 amount) external returns (bool)',
  'function balanceOf(address account) external view returns (uint256)',
];

interface OrderInput { y: ethers.BigNumberish; z: ethers.BigNumberish; A: ethers.BigNumberish; B: ethers.BigNumberish }

function loadEnvFile(): Record<string, string> {
  const envPath = path.join(__dirname, '../../.env.tenderly');
  const vars: Record<string, string> = {};
  if (fs.existsSync(envPath)) {
    for (const line of fs.readFileSync(envPath, 'utf-8').split('\n')) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      const eqIdx = trimmed.indexOf('=');
      if (eqIdx > 0) vars[trimmed.slice(0, eqIdx)] = trimmed.slice(eqIdx + 1);
    }
  }
  return vars;
}

function log(section: string, msg: string) {
  console.log(`  [${section}] ${msg}`);
}

async function fundWallet(provider: ethers.providers.JsonRpcProvider, address: string) {
  await provider.send('tenderly_setBalance', [
    [address],
    ethers.utils.hexValue(ethers.utils.parseEther('100')),
  ]);

  for (const token of Object.values(TOKENS)) {
    const amount = token.symbol === 'WBTC' ? '50' : '100000';
    await provider.send('tenderly_setErc20Balance', [
      token.address,
      address,
      ethers.utils.hexValue(ethers.utils.parseUnits(amount, token.decimals)),
    ]);
  }
}

async function approveAll(wallet: ethers.Wallet) {
  for (const token of Object.values(TOKENS)) {
    const erc20 = new ethers.Contract(token.address, ERC20_ABI, wallet);
    await (await erc20.approve(CARBON_CONTROLLER, ethers.constants.MaxUint256)).wait();
  }
}

async function createAndGetId(
  controller: ethers.Contract,
  token0: string,
  token1: string,
  orders: OrderInput[],
): Promise<{ id: string; blockNumber: number }> {
  const id = await controller.callStatic.createStrategy(token0, token1, orders, { gasLimit: 1_500_000 });
  const tx = await controller.createStrategy(token0, token1, orders, { gasLimit: 1_500_000 });
  const r = await tx.wait();
  return { id: id.toString(), blockNumber: r.blockNumber };
}

async function readOrders(controller: ethers.Contract, strategyId: string): Promise<OrderInput[]> {
  const s = await controller.strategy(strategyId);
  return s.orders.map((o: any) => ({
    y: o.y,
    z: o.z,
    A: o.A,
    B: o.B,
  }));
}

async function tryTrade(
  controller: ethers.Contract,
  sourceToken: string,
  targetToken: string,
  strategyId: string,
  amount: ethers.BigNumber,
  deadline: number,
): Promise<{ ok: boolean; direction: string }> {
  const actions = [{ strategyId, amount }];
  try {
    await controller.callStatic.tradeBySourceAmount(
      sourceToken, targetToken, actions, deadline, 1, { gasLimit: 1_000_000 },
    );
    const tx = await controller.tradeBySourceAmount(
      sourceToken, targetToken, actions, deadline, 1, { gasLimit: 1_000_000 },
    );
    const r = await tx.wait();
    return { ok: r.status === 1, direction: 'forward' };
  } catch {
    // try reverse direction with same amount
  }
  const revActions = [{ strategyId, amount }];
  try {
    await controller.callStatic.tradeBySourceAmount(
      targetToken, sourceToken, revActions, deadline, 1, { gasLimit: 1_000_000 },
    );
    const tx = await controller.tradeBySourceAmount(
      targetToken, sourceToken, revActions, deadline, 1, { gasLimit: 1_000_000 },
    );
    const r = await tx.wait();
    return { ok: r.status === 1, direction: 'reverse' };
  } catch {
    return { ok: false, direction: 'none' };
  }
}

async function main() {
  const envVars = loadEnvFile();
  const rpcUrl = process.env.ETHEREUM_RPC_ENDPOINT || envVars.ETHEREUM_RPC_ENDPOINT;
  if (!rpcUrl) {
    console.error('ETHEREUM_RPC_ENDPOINT not set. Run tenderly:testnet first or source .env.tenderly');
    process.exit(1);
  }

  console.log('\n=== Tenderly Data Generator ===\n');
  console.log(`RPC: ${rpcUrl}`);
  console.log(`CarbonController: ${CARBON_CONTROLLER}\n`);

  const provider = new ethers.providers.JsonRpcProvider(rpcUrl);
  const wallet = ethers.Wallet.createRandom().connect(provider);
  const controller = new ethers.Contract(CARBON_CONTROLLER, CARBON_ABI, wallet);
  const latestBlock = await provider.getBlock('latest');
  const deadline = latestBlock.timestamp + 86400;

  console.log(`Wallet: ${wallet.address}`);
  console.log('Funding wallet with ETH + all tokens...');
  await fundWallet(provider, wallet.address);
  console.log('Approving CarbonController for all tokens...');
  await approveAll(wallet);
  console.log();

  const created: { id: string; pair: string; token0: string; token1: string }[] = [];

  // ─── Pair 1: DAI / USDC  (stablecoin pair) ──────────────────────────
  const P1 = 'DAI/USDC';
  console.log(`--- ${P1}: Create 3 strategies ---`);

  const daiUsdcOrders: OrderInput[][] = [
    [
      { y: ethers.utils.parseUnits('500', 18),  z: ethers.utils.parseUnits('500', 18),  A: 0, B: 6001066667089 },
      { y: ethers.utils.parseUnits('500', 6),   z: ethers.utils.parseUnits('500', 6),   A: 0, B: 1897467523720620 },
    ],
    [
      { y: ethers.utils.parseUnits('200', 18),  z: ethers.utils.parseUnits('200', 18),  A: 100000, B: 5800000000000 },
      { y: ethers.utils.parseUnits('200', 6),   z: ethers.utils.parseUnits('200', 6),   A: 100000, B: 1900000000000000 },
    ],
    [
      { y: ethers.utils.parseUnits('1000', 18), z: ethers.utils.parseUnits('1000', 18), A: 0, B: 6100000000000 },
      { y: 0, z: 0, A: 0, B: 0 },
    ],
  ];

  for (let i = 0; i < daiUsdcOrders.length; i++) {
    const { id, blockNumber } = await createAndGetId(controller, TOKENS.DAI.address, TOKENS.USDC.address, daiUsdcOrders[i]);
    created.push({ id, pair: P1, token0: TOKENS.DAI.address, token1: TOKENS.USDC.address });
    log(P1, `Strategy ${String.fromCharCode(65 + i)} created: id=${id} block=${blockNumber}`);
  }

  // ─── Pair 2: WBTC / USDC  (volatile pair) ───────────────────────────
  const P2 = 'WBTC/USDC';
  console.log(`\n--- ${P2}: Create 2 strategies ---`);

  const wbtcUsdcOrders: OrderInput[][] = [
    [
      { y: ethers.utils.parseUnits('1', 8),     z: ethers.utils.parseUnits('1', 8),     A: 0, B: 750000000000000 },
      { y: ethers.utils.parseUnits('30000', 6), z: ethers.utils.parseUnits('30000', 6), A: 0, B: 15000000000 },
    ],
    [
      { y: ethers.utils.parseUnits('2', 8),     z: ethers.utils.parseUnits('2', 8),     A: 50000, B: 720000000000000 },
      { y: ethers.utils.parseUnits('50000', 6), z: ethers.utils.parseUnits('50000', 6), A: 50000, B: 14500000000 },
    ],
  ];

  for (let i = 0; i < wbtcUsdcOrders.length; i++) {
    const { id, blockNumber } = await createAndGetId(controller, TOKENS.WBTC.address, TOKENS.USDC.address, wbtcUsdcOrders[i]);
    created.push({ id, pair: P2, token0: TOKENS.WBTC.address, token1: TOKENS.USDC.address });
    log(P2, `Strategy ${String.fromCharCode(65 + i)} created: id=${id} block=${blockNumber}`);
  }

  // ─── Pair 3: LINK / DAI  (alt pair) ─────────────────────────────────
  const P3 = 'LINK/DAI';
  console.log(`\n--- ${P3}: Create 2 strategies ---`);

  const linkDaiOrders: OrderInput[][] = [
    [
      { y: ethers.utils.parseUnits('100', 18),  z: ethers.utils.parseUnits('100', 18),  A: 0, B: 24000000000000 },
      { y: ethers.utils.parseUnits('1000', 18), z: ethers.utils.parseUnits('1000', 18), A: 0, B: 47000000000 },
    ],
    [
      { y: ethers.utils.parseUnits('200', 18),  z: ethers.utils.parseUnits('200', 18),  A: 80000, B: 23000000000000 },
      { y: ethers.utils.parseUnits('2000', 18), z: ethers.utils.parseUnits('2000', 18), A: 80000, B: 46000000000 },
    ],
  ];

  for (let i = 0; i < linkDaiOrders.length; i++) {
    const { id, blockNumber } = await createAndGetId(controller, TOKENS.LINK.address, TOKENS.DAI.address, linkDaiOrders[i]);
    created.push({ id, pair: P3, token0: TOKENS.LINK.address, token1: TOKENS.DAI.address });
    log(P3, `Strategy ${String.fromCharCode(65 + i)} created: id=${id} block=${blockNumber}`);
  }

  console.log(`\n  Total strategies created: ${created.length}`);

  // ─── Updates: deposit, withdraw, price edit ──────────────────────────
  console.log('\n--- Strategy Updates ---');

  // Deposit into DAI/USDC Strategy A (increase liquidity in both orders)
  {
    const s = created[0];
    const orders = await readOrders(controller, s.id);
    const newOrders = [
      { ...orders[0], y: ethers.BigNumber.from(orders[0].y).add(ethers.utils.parseUnits('300', 18)), z: ethers.BigNumber.from(orders[0].z).add(ethers.utils.parseUnits('300', 18)) },
      { ...orders[1], y: ethers.BigNumber.from(orders[1].y).add(ethers.utils.parseUnits('300', 6)), z: ethers.BigNumber.from(orders[1].z).add(ethers.utils.parseUnits('300', 6)) },
    ];
    const tx = await controller.updateStrategy(s.id, orders, newOrders, { gasLimit: 500_000, value: 0 });
    const r = await tx.wait();
    log('Deposit', `${s.pair} Strategy A: +300 DAI / +300 USDC (block ${r.blockNumber})`);
  }

  // Withdraw from DAI/USDC Strategy B (decrease liquidity on order0 side)
  {
    const s = created[1];
    const orders = await readOrders(controller, s.id);
    const newOrders = [
      { ...orders[0], y: ethers.BigNumber.from(orders[0].y).sub(ethers.utils.parseUnits('50', 18)) },
      { ...orders[1] },
    ];
    const tx = await controller.updateStrategy(s.id, orders, newOrders, { gasLimit: 500_000, value: 0 });
    const r = await tx.wait();
    log('Withdraw', `${s.pair} Strategy B: -50 DAI from order0 (block ${r.blockNumber})`);
  }

  // Price edit on WBTC/USDC Strategy A (change B parameter)
  {
    const s = created[3];
    const orders = await readOrders(controller, s.id);
    const newOrders = [
      { ...orders[0], B: 760000000000000 },
      { ...orders[1], B: 15200000000 },
    ];
    const tx = await controller.updateStrategy(s.id, orders, newOrders, { gasLimit: 500_000, value: 0 });
    const r = await tx.wait();
    log('PriceEdit', `${s.pair} Strategy A: adjusted price parameters (block ${r.blockNumber})`);
  }

  // Deposit into LINK/DAI Strategy B
  {
    const s = created[6];
    const orders = await readOrders(controller, s.id);
    const newOrders = [
      { ...orders[0], y: ethers.BigNumber.from(orders[0].y).add(ethers.utils.parseUnits('50', 18)), z: ethers.BigNumber.from(orders[0].z).add(ethers.utils.parseUnits('50', 18)) },
      { ...orders[1], y: ethers.BigNumber.from(orders[1].y).add(ethers.utils.parseUnits('500', 18)), z: ethers.BigNumber.from(orders[1].z).add(ethers.utils.parseUnits('500', 18)) },
    ];
    const tx = await controller.updateStrategy(s.id, orders, newOrders, { gasLimit: 500_000, value: 0 });
    const r = await tx.wait();
    log('Deposit', `${s.pair} Strategy B: +50 LINK / +500 DAI (block ${r.blockNumber})`);
  }

  // ─── Trades ──────────────────────────────────────────────────────────
  console.log('\n--- Trades ---');
  let tradeCount = 0;

  const trades = [
    { s: created[0], amount: '10', decimals: 6,  label: 'USDC -> DAI via Strategy A' },
    { s: created[0], amount: '5',  decimals: 6,  label: 'USDC -> DAI via Strategy A (2nd)' },
    { s: created[1], amount: '8',  decimals: 6,  label: 'USDC -> DAI via Strategy B' },
    { s: created[3], amount: '1000', decimals: 6, label: 'USDC -> WBTC via Strategy A' },
    { s: created[5], amount: '2',  decimals: 18, label: 'LINK -> DAI via Strategy A' },
    { s: created[6], amount: '20', decimals: 18, label: 'DAI -> LINK via Strategy B' },
  ];

  for (const t of trades) {
    const amount = ethers.utils.parseUnits(t.amount, t.decimals);
    const { ok, direction } = await tryTrade(controller, t.s.token1, t.s.token0, t.s.id, amount, deadline);
    if (ok) tradeCount++;
    log('Trade', `${t.s.pair}: ${t.label}: ${ok ? `OK (${direction})` : 'SKIPPED'}`);
  }

  // ─── Delete one strategy ─────────────────────────────────────────────
  console.log('\n--- Delete ---');
  {
    const s = created[2]; // DAI/USDC Strategy C (one-sided)
    const tx = await controller.deleteStrategy(s.id, { gasLimit: 300_000 });
    const r = await tx.wait();
    log('Delete', `${s.pair} Strategy C (id=${s.id}) deleted (block ${r.blockNumber})`);
  }

  // ─── Summary ─────────────────────────────────────────────────────────
  console.log('\n==========================================');
  console.log('  Data Generation Complete');
  console.log('==========================================\n');
  console.log(`  Strategies created:  7 (across 3 pairs)`);
  console.log(`  Updates:             4 (2 deposits, 1 withdrawal, 1 price edit)`);
  console.log(`  Trades:              ${tradeCount}/${trades.length} succeeded`);
  console.log(`  Deletions:           1`);
  console.log(`  Pairs:               DAI/USDC, WBTC/USDC, LINK/DAI`);
  console.log();
  console.log(`  Events emitted:`);
  console.log(`    - StrategyCreated   x7`);
  console.log(`    - StrategyUpdated   x4`);
  console.log(`    - TokensTraded      x${tradeCount}`);
  console.log(`    - StrategyDeleted   x1`);
  console.log(`    - PairCreated       (for any new pairs)`);
  console.log();
}

main().catch((err) => {
  console.error('Data generation failed:', err);
  process.exit(1);
});
