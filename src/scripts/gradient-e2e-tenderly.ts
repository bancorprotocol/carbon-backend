/**
 * Gradient E2E Tenderly — Strategy Creator
 *
 * Creates gradient strategies for TWO token pairs:
 *   Pair 1: DAI/USDC (existing tokens in Carbon)
 *   Pair 2: WBTC/LINK (new tokens, not tracked in Carbon — tests token discovery)
 *
 * Required env vars:
 *   GRADIENT_TENDERLY_RPC          - Tenderly testnet RPC URL
 *   GRADIENT_CONTROLLER_ADDRESS    - Deployed GradientController address
 *   GRADIENT_DEPLOYER_KEY          - Private key of the ephemeral wallet
 */
import { ethers } from 'ethers';
import * as fs from 'fs';
import * as path from 'path';

const GRADIENT_CONTROLLER_ABI = [
  'function createPair(address token0, address token1) external returns (tuple(uint128 id, address[2] tokens))',
  'function createStrategy(address token0, address token1, tuple(uint128 liquidity, uint64 initialPrice, uint32 tradingStartTime, uint32 expiry, uint32 multiFactor, uint8 gradientType)[2] orders) external payable returns (uint256)',
  'function updateStrategy(uint256 strategyId, tuple(uint128 liquidity, uint64 initialPrice, uint32 tradingStartTime, uint32 expiry, uint32 multiFactor, uint8 gradientType)[2] currentOrders, tuple(uint128 liquidity, uint64 initialPrice, uint32 tradingStartTime, uint32 expiry, uint32 multiFactor, uint8 gradientType)[2] newOrders) external payable',
  'function deleteStrategy(uint256 strategyId) external',
  'function pairs(uint128 startIndex, uint128 endIndex) external view returns (address[2][] memory)',
  'function strategiesByPairCount(address token0, address token1) external view returns (uint256)',
  'function strategiesByPair(address token0, address token1, uint256 startIndex, uint256 endIndex) external view returns (tuple(uint256 id, address owner, address[2] tokens, tuple(uint128 liquidity, uint64 initialPrice, uint32 tradingStartTime, uint32 expiry, uint32 multiFactor, uint8 gradientType)[2] orders)[] memory)',
  'function tradeBySourceAmount(address sourceToken, address targetToken, tuple(uint256 strategyId, uint128 amount)[] tradeActions, uint256 deadline, uint128 minReturn) external payable returns (uint128)',
];

const ERC20_ABI = [
  'function approve(address spender, uint256 amount) external returns (bool)',
  'function balanceOf(address account) external view returns (uint256)',
  'function decimals() external view returns (uint8)',
  'function symbol() external view returns (string)',
];

const PAIR1_TOKEN0 = '0x6B175474E89094C44Da98b954EedeAC495271d0F'; // DAI
const PAIR1_TOKEN1 = '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48'; // USDC
const PAIR2_TOKEN0 = '0x2260FAC5E5542a773Aa44fBCfeDf7C193bc2C599'; // WBTC (8 decimals)
const PAIR2_TOKEN1 = '0x514910771AF9Ca656af840dff83E8264EcF986CA'; // LINK (18 decimals)

const GRADIENT_TYPES = [0, 1, 2, 3, 4, 5];
const GRADIENT_TYPE_NAMES = [
  'LINEAR_INCREASE', 'LINEAR_DECREASE', 'LINEAR_INV_INCREASE',
  'LINEAR_INV_DECREASE', 'EXPONENTIAL_INCREASE', 'EXPONENTIAL_DECREASE',
];

function env(key: string, fallback?: string): string {
  const val = process.env[key] || fallback;
  if (!val) {
    console.error(`Missing required env var: ${key}`);
    process.exit(1);
  }
  return val;
}

async function fundTokens(
  provider: ethers.providers.JsonRpcProvider,
  address: string,
  tokenAddr: string,
  amount: string,
  decimals: number,
  symbol: string,
) {
  await provider.send('tenderly_setErc20Balance', [
    tokenAddr,
    address,
    ethers.utils.hexValue(ethers.utils.parseUnits(amount, decimals)),
  ]);
  console.log(`  Funded ${amount} ${symbol}`);
}

async function executeTrade(
  controller: ethers.Contract,
  strategyId: string,
  token0Addr: string,
  token1Addr: string,
  t0Decimals: number,
  t1Decimals: number,
  t0Symbol: string,
  t1Symbol: string,
  deadline: number,
  tradeIndex: number,
): Promise<void> {
  let traded = false;

  // Try forward direction
  try {
    const tradeAmount = ethers.utils.parseUnits('1', t0Decimals);
    const fwdActions = [{ strategyId, amount: tradeAmount }];
    await controller.callStatic.tradeBySourceAmount(
      token0Addr, token1Addr, fwdActions, deadline, 1,
      { gasLimit: 1000000 },
    );
    const tx = await controller.tradeBySourceAmount(
      token0Addr, token1Addr, fwdActions, deadline, 1,
      { gasLimit: 1000000 },
    );
    const receipt = await tx.wait();
    console.log(`  Trade ${tradeIndex}: sold 1 ${t0Symbol} -> ${t1Symbol} via strategy ${strategyId} (block ${receipt.blockNumber})`);
    traded = true;
  } catch (fwdErr: any) {
    console.log(`  Trade ${tradeIndex} forward (${t0Symbol}->${t1Symbol}) failed: ${fwdErr.reason || fwdErr.error?.data || fwdErr.data || fwdErr.message?.substring(0, 200)}`);
  }

  if (!traded) {
    try {
      const revAmount = ethers.utils.parseUnits('1', t1Decimals);
      const revActions = [{ strategyId, amount: revAmount }];
      await controller.callStatic.tradeBySourceAmount(
        token1Addr, token0Addr, revActions, deadline, 1,
        { gasLimit: 1000000 },
      );
      const tx = await controller.tradeBySourceAmount(
        token1Addr, token0Addr, revActions, deadline, 1,
        { gasLimit: 1000000 },
      );
      const receipt = await tx.wait();
      console.log(`  Trade ${tradeIndex}: sold 1 ${t1Symbol} -> ${t0Symbol} via strategy ${strategyId} (block ${receipt.blockNumber})`);
      traded = true;
    } catch (revErr: any) {
      console.log(`  Trade ${tradeIndex} reverse (${t1Symbol}->${t0Symbol}) failed: ${revErr.reason || revErr.error?.data || revErr.data || revErr.message?.substring(0, 200)}`);
    }
  }

  if (!traded) {
    console.error(`  Trade ${tradeIndex} failed in both directions — aborting`);
    process.exit(1);
  }
}

async function main() {
  const rpcUrl = env('GRADIENT_TENDERLY_RPC');
  const controllerAddr = env('GRADIENT_CONTROLLER_ADDRESS');
  const deployerKey = env('GRADIENT_DEPLOYER_KEY');

  console.log('\n=== Gradient E2E — Multi-Pair Strategy Creator ===\n');
  console.log(`RPC:                 ${rpcUrl}`);
  console.log(`GradientController:  ${controllerAddr}`);
  console.log(`Pair 1:              DAI/USDC (existing)`);
  console.log(`Pair 2:              WBTC/LINK (new tokens)`);
  console.log();

  const provider = new ethers.providers.JsonRpcProvider(rpcUrl);
  const signer = new ethers.Wallet(deployerKey, provider);
  console.log(`Deployer:            ${signer.address}`);
  const controller = new ethers.Contract(controllerAddr, GRADIENT_CONTROLLER_ABI, signer);
  const maxApproval = ethers.constants.MaxUint256;

  // ── Fund wallet ───────────────────────────────────────────────────────
  console.log('\n--- Funding wallet via Tenderly RPC ---');
  await provider.send('tenderly_setBalance', [
    [signer.address],
    ethers.utils.hexValue(ethers.utils.parseEther('1000')),
  ]);
  console.log('  Funded 1000 ETH');

  await fundTokens(provider, signer.address, PAIR1_TOKEN0, '50000', 18, 'DAI');
  await fundTokens(provider, signer.address, PAIR1_TOKEN1, '50000', 6, 'USDC');
  await fundTokens(provider, signer.address, PAIR2_TOKEN0, '100', 8, 'WBTC');
  await fundTokens(provider, signer.address, PAIR2_TOKEN1, '50000', 18, 'LINK');

  // ── Pair 1: DAI/USDC — 6 strategies ──────────────────────────────────
  console.log('\n--- Step 1: Create DAI/USDC pair ---');
  const p1t0 = new ethers.Contract(PAIR1_TOKEN0, ERC20_ABI, signer);
  const p1t1 = new ethers.Contract(PAIR1_TOKEN1, ERC20_ABI, signer);
  const p1t0Dec = await p1t0.decimals();
  const p1t1Dec = await p1t1.decimals();

  try {
    const tx = await controller.createPair(PAIR1_TOKEN0, PAIR1_TOKEN1);
    await tx.wait();
    console.log('  Created pair DAI/USDC');
  } catch (e: any) {
    if (e.message?.includes('PairAlreadyExists')) {
      console.log('  Pair DAI/USDC already exists');
    } else {
      console.log(`  Pair creation: ${e.reason || e.message}`);
    }
  }

  await (await p1t0.approve(controllerAddr, maxApproval)).wait();
  await (await p1t1.approve(controllerAddr, maxApproval)).wait();
  console.log('  Approved DAI + USDC');

  console.log('\n--- Step 2: Create 6 strategies on DAI/USDC ---');
  const latestBlock = await provider.getBlock('latest');
  const now = latestBlock.timestamp;
  const pair1StrategyIds: string[] = [];

  for (const gt of GRADIENT_TYPES) {
    const order0 = {
      liquidity: ethers.utils.parseUnits('100', p1t0Dec),
      initialPrice: 6001066667089,
      tradingStartTime: now - 50,
      expiry: now + 86400,
      multiFactor: 2814749,
      gradientType: gt,
    };
    const order1 = {
      liquidity: ethers.utils.parseUnits('100', p1t1Dec),
      initialPrice: 1897467523720620,
      tradingStartTime: now - 50,
      expiry: now + 86400,
      multiFactor: 2814749,
      gradientType: gt,
    };
    try {
      const tx = await controller.createStrategy(PAIR1_TOKEN0, PAIR1_TOKEN1, [order0, order1]);
      await tx.wait();
      console.log(`  [${gt + 1}/6] ${GRADIENT_TYPE_NAMES[gt]}: created`);
    } catch (e: any) {
      console.error(`  FAILED ${GRADIENT_TYPE_NAMES[gt]}: ${e.reason || e.message}`);
      process.exit(1);
    }
  }

  const p1Count = await controller.strategiesByPairCount(PAIR1_TOKEN0, PAIR1_TOKEN1);
  const p1Strategies = await controller.strategiesByPair(PAIR1_TOKEN0, PAIR1_TOKEN1, 0, p1Count);
  for (const s of p1Strategies) pair1StrategyIds.push(s.id.toString());
  console.log(`  Created ${pair1StrategyIds.length}/6 DAI/USDC strategies`);
  if (pair1StrategyIds.length !== 6) {
    console.error('Not all DAI/USDC strategies were created — aborting');
    process.exit(1);
  }

  // ── Pair 2: WBTC/LINK — 2 strategies ─────────────────────────────────
  console.log('\n--- Step 3: Create WBTC/LINK pair ---');
  const p2t0 = new ethers.Contract(PAIR2_TOKEN0, ERC20_ABI, signer);
  const p2t1 = new ethers.Contract(PAIR2_TOKEN1, ERC20_ABI, signer);
  const p2t0Dec = await p2t0.decimals();
  const p2t1Dec = await p2t1.decimals();

  try {
    const tx = await controller.createPair(PAIR2_TOKEN0, PAIR2_TOKEN1);
    await tx.wait();
    console.log('  Created pair WBTC/LINK');
  } catch (e: any) {
    if (e.message?.includes('PairAlreadyExists')) {
      console.log('  Pair WBTC/LINK already exists');
    } else {
      console.log(`  Pair creation: ${e.reason || e.message}`);
    }
  }

  await (await p2t0.approve(controllerAddr, maxApproval)).wait();
  await (await p2t1.approve(controllerAddr, maxApproval)).wait();
  console.log('  Approved WBTC + LINK');

  console.log('\n--- Step 4: Create 2 strategies on WBTC/LINK ---');
  const nowP2 = (await provider.getBlock('latest')).timestamp;
  const pair2StrategyIds: string[] = [];

  for (const gt of [0, 1]) {
    const order0 = {
      liquidity: ethers.utils.parseUnits('1', p2t0Dec),
      initialPrice: 6001066667089,
      tradingStartTime: nowP2 - 50,
      expiry: nowP2 + 86400,
      multiFactor: 2814749,
      gradientType: gt,
    };
    const order1 = {
      liquidity: ethers.utils.parseUnits('100', p2t1Dec),
      initialPrice: 1897467523720620,
      tradingStartTime: nowP2 - 50,
      expiry: nowP2 + 86400,
      multiFactor: 2814749,
      gradientType: gt,
    };
    try {
      const tx = await controller.createStrategy(PAIR2_TOKEN0, PAIR2_TOKEN1, [order0, order1]);
      await tx.wait();
      console.log(`  [${gt + 1}/2] ${GRADIENT_TYPE_NAMES[gt]}: created`);
    } catch (e: any) {
      console.error(`  FAILED ${GRADIENT_TYPE_NAMES[gt]}: ${e.reason || e.message}`);
      process.exit(1);
    }
  }

  const p2Count = await controller.strategiesByPairCount(PAIR2_TOKEN0, PAIR2_TOKEN1);
  const p2Strategies = await controller.strategiesByPair(PAIR2_TOKEN0, PAIR2_TOKEN1, 0, p2Count);
  for (const s of p2Strategies) pair2StrategyIds.push(s.id.toString());
  console.log(`  Created ${pair2StrategyIds.length}/2 WBTC/LINK strategies`);
  if (pair2StrategyIds.length !== 2) {
    console.error('Not all WBTC/LINK strategies were created — aborting');
    process.exit(1);
  }

  // ── Step 5: Execute trades ────────────────────────────────────────────
  console.log('\n--- Step 5: Execute trades ---');
  const tradeBlock = await provider.getBlock('latest');
  const deadline = tradeBlock.timestamp + 86400;

  // Trade on DAI/USDC pair (2 trades)
  for (let i = 0; i < 2; i++) {
    await executeTrade(
      controller, pair1StrategyIds[i],
      PAIR1_TOKEN0, PAIR1_TOKEN1, p1t0Dec, p1t1Dec,
      'DAI', 'USDC', deadline, i + 1,
    );
  }

  // Trade on WBTC/LINK pair (1 trade)
  await executeTrade(
    controller, pair2StrategyIds[0],
    PAIR2_TOKEN0, PAIR2_TOKEN1, p2t0Dec, p2t1Dec,
    'WBTC', 'LINK', deadline, 3,
  );

  // ── Step 6: Read exact post-trade liquidity values ────────────────────
  console.log('\n--- Step 6: Read post-trade liquidity ---');
  const postP1Strats = await controller.strategiesByPair(PAIR1_TOKEN0, PAIR1_TOKEN1, 0, await controller.strategiesByPairCount(PAIR1_TOKEN0, PAIR1_TOKEN1));
  const postP2Strats = await controller.strategiesByPair(PAIR2_TOKEN0, PAIR2_TOKEN1, 0, await controller.strategiesByPairCount(PAIR2_TOKEN0, PAIR2_TOKEN1));

  const postTradeData = {
    pair1: postP1Strats.map((s: any) => ({
      id: s.id.toString(),
      order0Liquidity: s.orders[0].liquidity.toString(),
      order1Liquidity: s.orders[1].liquidity.toString(),
    })),
    pair2: postP2Strats.map((s: any) => ({
      id: s.id.toString(),
      order0Liquidity: s.orders[0].liquidity.toString(),
      order1Liquidity: s.orders[1].liquidity.toString(),
    })),
  };

  const dataPath = path.join(__dirname, 'gradient-e2e-data.json');
  fs.writeFileSync(dataPath, JSON.stringify(postTradeData, null, 2));
  console.log(`  Wrote post-trade data to ${dataPath}`);

  // ── Step 7: Update a strategy (manual edit) ─────────────────────────
  console.log('\n--- Step 7: Update strategy (manual edit) ---');
  const updateId = pair1StrategyIds[0];
  const currentStrats = await controller.strategiesByPair(PAIR1_TOKEN0, PAIR1_TOKEN1, 0, 1);
  const currentStrategy = currentStrats[0];
  const currentOrders = currentStrategy.orders.map((o: any) => ({
    liquidity: o.liquidity,
    initialPrice: o.initialPrice,
    tradingStartTime: o.tradingStartTime,
    expiry: o.expiry,
    multiFactor: o.multiFactor,
    gradientType: o.gradientType,
  }));
  const newOrders = currentOrders.map((o: any, i: number) => ({
    ...o,
    liquidity: ethers.BigNumber.from(o.liquidity).add(i === 0 ? 1000 : 500),
  }));
  const updateTx = await controller.updateStrategy(updateId, currentOrders, newOrders, { gasLimit: 500000, value: 0 });
  const updateReceipt = await updateTx.wait();
  if (updateReceipt.status !== 1) {
    console.error('  updateStrategy reverted on-chain');
    process.exit(1);
  }
  console.log(`  Updated strategy ${updateId} (block ${updateReceipt.blockNumber})`);

  // ── Step 8: Delete one strategy ──────────────────────────────────────
  console.log('\n--- Step 8: Delete strategy ---');
  const deleteId = pair1StrategyIds[5];
  const delTx = await controller.deleteStrategy(deleteId, { gasLimit: 300000 });
  const delReceipt = await delTx.wait();
  if (delReceipt.status !== 1) {
    console.error('  Deletion reverted on-chain');
    process.exit(1);
  }
  console.log(`  Deleted strategy ${deleteId} (block ${delReceipt.blockNumber})`);

  const finalP1Count = await controller.strategiesByPairCount(PAIR1_TOKEN0, PAIR1_TOKEN1);
  console.log(`  Final DAI/USDC strategiesByPairCount: ${finalP1Count} (expected 5)`);
  if (finalP1Count.toNumber() !== 5) {
    console.error(`  Expected 5 strategies after deletion, got ${finalP1Count}`);
    process.exit(1);
  }

  // ── Step 9: Fee changes ──────────────────────────────────────────────
  console.log('\n--- Step 9: Fee changes (admin impersonation) ---');
  const adminAddr = env('GRADIENT_ADMIN_ADDRESS', '0x5bEBA4D3533a963Dedb270a95ae5f7752fA0Fe22');

  await provider.send('tenderly_setBalance', [
    [adminAddr],
    ethers.utils.hexValue(ethers.utils.parseEther('10')),
  ]);

  const FEE_ABI = [
    'function setTradingFeePPM(uint32 newTradingFeePPM) external',
    'function setPairTradingFeePPM(address token0, address token1, uint32 newPairTradingFeePPM) external',
    'function tradingFeePPM() external view returns (uint32)',
    'function pairTradingFeePPM(address token0, address token1) external view returns (uint32)',
  ];
  const feeIface = new ethers.utils.Interface(FEE_ABI);

  const setGlobalFeeData = feeIface.encodeFunctionData('setTradingFeePPM', [100]);
  const globalFeeTx = await provider.send('eth_sendTransaction', [{
    from: adminAddr,
    to: controllerAddr,
    data: setGlobalFeeData,
    gas: ethers.utils.hexValue(200000),
  }]);
  await provider.waitForTransaction(globalFeeTx);
  console.log('  setTradingFeePPM(100) — done');

  const setPairFeeData = feeIface.encodeFunctionData('setPairTradingFeePPM', [PAIR1_TOKEN0, PAIR1_TOKEN1, 50]);
  const pairFeeTx = await provider.send('eth_sendTransaction', [{
    from: adminAddr,
    to: controllerAddr,
    data: setPairFeeData,
    gas: ethers.utils.hexValue(200000),
  }]);
  await provider.waitForTransaction(pairFeeTx);
  console.log('  setPairTradingFeePPM(50) for DAI/USDC — done');

  const globalFeeResult = await provider.call({
    to: controllerAddr,
    data: feeIface.encodeFunctionData('tradingFeePPM', []),
  });
  const globalFee = feeIface.decodeFunctionResult('tradingFeePPM', globalFeeResult)[0];
  console.log(`  Verified tradingFeePPM = ${globalFee}`);
  if (Number(globalFee) !== 100) {
    console.error(`  Expected tradingFeePPM=100, got ${globalFee}`);
    process.exit(1);
  }

  const pairFeeResult = await provider.call({
    to: controllerAddr,
    data: feeIface.encodeFunctionData('pairTradingFeePPM', [PAIR1_TOKEN0, PAIR1_TOKEN1]),
  });
  const pairFee = feeIface.decodeFunctionResult('pairTradingFeePPM', pairFeeResult)[0];
  console.log(`  Verified pairTradingFeePPM = ${pairFee}`);
  if (Number(pairFee) !== 50) {
    console.error(`  Expected pairTradingFeePPM=50, got ${pairFee}`);
    process.exit(1);
  }

  console.log('\n=== Multi-pair strategy creation, trades, deletion, and fee changes complete ===');
  console.log(`  DAI/USDC: ${finalP1Count} active strategies, 2 trades`);
  console.log(`  WBTC/LINK: ${pair2StrategyIds.length} active strategies, 1 trade`);
  console.log(`  Total created: 8, Total active: 7, Total deleted: 1`);
}

main().catch((err) => {
  console.error('E2E strategy creation failed:', err);
  process.exit(1);
});
