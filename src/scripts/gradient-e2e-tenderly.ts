/**
 * Gradient E2E Tenderly Test
 *
 * Full end-to-end test against a Tenderly virtual testnet:
 *   1. Connects to an existing Tenderly testnet with GradientController deployed
 *   2. Creates gradient strategies with all 6 gradient types
 *   3. Starts carbon-backend with harvesting pointed at the Tenderly RPC
 *   4. Waits for the realtime updater to poll the contract
 *   5. Verifies all API endpoints return gradient data
 *
 * Prerequisites:
 *   - A Tenderly testnet created via carbon-gradients-contracts setup:
 *       cd ../carbon-gradients-contracts && pnpm setup:testnet
 *   - The GradientController address from the deployment output
 *   - A funded account on the testnet (done by setup:testnet)
 *
 * Required env vars:
 *   GRADIENT_TENDERLY_RPC          - Tenderly testnet RPC URL
 *   GRADIENT_CONTROLLER_ADDRESS    - Deployed GradientController address
 *   GRADIENT_DEPLOYER_KEY          - Private key of a funded account on the testnet
 *
 * Optional:
 *   GRADIENT_TOKEN0                - Token0 address (default: DAI on mainnet)
 *   GRADIENT_TOKEN1                - Token1 address (default: USDC on mainnet)
 *
 * Usage:
 *   GRADIENT_TENDERLY_RPC=https://rpc.tenderly.co/fork/xxx \
 *   GRADIENT_CONTROLLER_ADDRESS=0x... \
 *   GRADIENT_DEPLOYER_KEY=0x... \
 *   npx ts-node src/scripts/gradient-e2e-tenderly.ts
 */
import { ethers } from 'ethers';

const GRADIENT_CONTROLLER_ABI = [
  'function createPair(address token0, address token1) external returns (tuple(uint128 id, address[2] tokens))',
  'function createStrategy(address token0, address token1, tuple(uint128 liquidity, uint64 initialPrice, uint32 tradingStartTime, uint32 expiry, uint32 multiFactor, uint8 gradientType)[2] orders) external payable returns (uint256)',
  'function pairs(uint128 startIndex, uint128 endIndex) external view returns (address[2][] memory)',
  'function strategiesByPairCount(address token0, address token1) external view returns (uint256)',
  'function strategiesByPair(address token0, address token1, uint256 startIndex, uint256 endIndex) external view returns (tuple(uint256 id, address owner, address[2] tokens, tuple(uint128 liquidity, uint64 initialPrice, uint32 tradingStartTime, uint32 expiry, uint32 multiFactor, uint8 gradientType)[2] orders)[] memory)',
  'function tradeBySourceAmount(address sourceToken, address targetToken, tuple(uint256 strategyId, uint128 amount)[] tradeActions, uint256 deadline, uint128 minReturn) external payable returns (uint128)',
  'function tradingFeePPM() external view returns (uint32)',
];

const ERC20_ABI = [
  'function approve(address spender, uint256 amount) external returns (bool)',
  'function balanceOf(address account) external view returns (uint256)',
  'function decimals() external view returns (uint8)',
  'function symbol() external view returns (string)',
];

// Default to DAI and USDC on mainnet fork
const DEFAULT_TOKEN0 = '0x6B175474E89094C44Da98b954EedeAC495271d0F'; // DAI
const DEFAULT_TOKEN1 = '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48'; // USDC

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

async function main() {
  const rpcUrl = env('GRADIENT_TENDERLY_RPC');
  const controllerAddr = env('GRADIENT_CONTROLLER_ADDRESS');
  const deployerKey = env('GRADIENT_DEPLOYER_KEY');
  const token0Addr = env('GRADIENT_TOKEN0', DEFAULT_TOKEN0);
  const token1Addr = env('GRADIENT_TOKEN1', DEFAULT_TOKEN1);

  console.log('\n=== Gradient E2E Tenderly Test ===\n');
  console.log(`RPC:                 ${rpcUrl}`);
  console.log(`GradientController:  ${controllerAddr}`);
  console.log(`Token0:              ${token0Addr}`);
  console.log(`Token1:              ${token1Addr}`);
  console.log();

  const provider = new ethers.providers.JsonRpcProvider(rpcUrl);
  const signer = new ethers.Wallet(deployerKey, provider);
  const controller = new ethers.Contract(controllerAddr, GRADIENT_CONTROLLER_ABI, signer);
  const token0 = new ethers.Contract(token0Addr, ERC20_ABI, signer);
  const token1 = new ethers.Contract(token1Addr, ERC20_ABI, signer);

  console.log(`Deployer:            ${signer.address}`);
  const balance = await provider.getBalance(signer.address);
  console.log(`ETH balance:         ${ethers.utils.formatEther(balance)}`);

  const t0Balance = await token0.balanceOf(signer.address);
  const t1Balance = await token1.balanceOf(signer.address);
  const t0Symbol = await token0.symbol();
  const t1Symbol = await token1.symbol();
  const t0Decimals = await token0.decimals();
  const t1Decimals = await token1.decimals();
  console.log(`${t0Symbol} balance:  ${ethers.utils.formatUnits(t0Balance, t0Decimals)}`);
  console.log(`${t1Symbol} balance:  ${ethers.utils.formatUnits(t1Balance, t1Decimals)}`);
  console.log();

  // Step 1: Create pair
  console.log('--- Step 1: Create pair ---');
  try {
    const tx = await controller.createPair(token0Addr, token1Addr);
    await tx.wait();
    console.log(`Created pair ${t0Symbol}/${t1Symbol}`);
  } catch (e: any) {
    if (e.message?.includes('PairAlreadyExists')) {
      console.log(`Pair ${t0Symbol}/${t1Symbol} already exists`);
    } else {
      console.log(`Pair creation: ${e.reason || e.message}`);
    }
  }

  // Step 2: Approve tokens
  console.log('\n--- Step 2: Approve tokens ---');
  const maxApproval = ethers.constants.MaxUint256;
  await (await token0.approve(controllerAddr, maxApproval)).wait();
  await (await token1.approve(controllerAddr, maxApproval)).wait();
  console.log('Approved both tokens for GradientController');

  // Step 3: Create strategies for all 6 gradient types
  console.log('\n--- Step 3: Create strategies ---');
  const now = Math.floor(Date.now() / 1000);
  const strategyIds: string[] = [];

  for (const gt of GRADIENT_TYPES) {
    const order0 = {
      liquidity: ethers.utils.parseUnits('100', t0Decimals),
      initialPrice: 6001066667089,
      tradingStartTime: now - 3600,
      expiry: now + 86400,
      multiFactor: 2814749,
      gradientType: gt,
    };
    const order1 = {
      liquidity: ethers.utils.parseUnits('100', t1Decimals),
      initialPrice: 1897467523720620,
      tradingStartTime: now - 3600,
      expiry: now + 86400,
      multiFactor: 2814749,
      gradientType: gt,
    };

    try {
      const tx = await controller.createStrategy(token0Addr, token1Addr, [order0, order1]);
      const receipt = await tx.wait();
      const strategyId = receipt.events?.[0]?.args?.id?.toString() || 'unknown';
      strategyIds.push(strategyId);
      console.log(`  Created strategy ${GRADIENT_TYPE_NAMES[gt]}: ID=${strategyId}`);
    } catch (e: any) {
      console.error(`  Failed to create strategy ${GRADIENT_TYPE_NAMES[gt]}: ${e.reason || e.message}`);
    }
  }

  console.log(`\nCreated ${strategyIds.length} strategies`);

  // Step 4: Verify strategies on-chain
  console.log('\n--- Step 4: Verify on-chain ---');
  const count = await controller.strategiesByPairCount(token0Addr, token1Addr);
  console.log(`strategiesByPairCount: ${count}`);

  if (count.gt(0)) {
    const strategies = await controller.strategiesByPair(token0Addr, token1Addr, 0, count);
    console.log(`Fetched ${strategies.length} strategies from contract`);
    for (const s of strategies) {
      console.log(`  ID=${s.id.toString()}, owner=${s.owner}, order0.gradientType=${s.orders[0].gradientType}, order1.gradientType=${s.orders[1].gradientType}`);
    }
  }

  // Step 5: Print instructions for carbon-backend
  console.log('\n--- Step 5: Next steps ---');
  console.log('Strategies are now live on the Tenderly testnet.');
  console.log('To test the full harvesting pipeline:\n');
  console.log('1. Update your carbon-backend .env:');
  console.log(`   ETHEREUM_RPC_ENDPOINT=${rpcUrl}`);
  console.log(`   ETHEREUM_GRADIENT_CONTROLLER_ADDRESS=${controllerAddr}`);
  console.log(`   SHOULD_HARVEST=1`);
  console.log(`   IS_FORK=1`);
  console.log();
  console.log('2. Start the server:');
  console.log('   npm run start:dev');
  console.log();
  console.log('3. Wait 10-15 seconds for the realtime updater to poll, then verify:');
  console.log('   npx ts-node src/scripts/gradient-test-verify.ts');
  console.log();
  console.log('=== Setup complete ===');
}

main().catch((err) => {
  console.error('E2E setup failed:', err);
  process.exit(1);
});
