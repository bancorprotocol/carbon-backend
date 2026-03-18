/**
 * Tenderly Testnet Harvest Test
 *
 * Creates a Carbon strategy on the mainnet-forked CarbonController,
 * then polls the backend API to verify the StrategyCreated event was harvested.
 *
 * Requires:
 *   - Backend running against the Tenderly testnet (npm run tenderly:testnet -- --run)
 *   - .env.tenderly present (or ETHEREUM_RPC_ENDPOINT set in env)
 */
import { ethers } from 'ethers';
import * as fs from 'fs';
import * as path from 'path';
import * as http from 'http';

const CARBON_CONTROLLER = '0xC537e898CD774e2dCBa3B14Ea6f34C93d5eA45e1';
const DAI = '0x6B175474E89094C44Da98b954EedeAC495271d0F';
const USDC = '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48';

const CARBON_ABI = [
  'function createStrategy(address token0, address token1, tuple(uint128 y, uint128 z, uint64 A, uint64 B)[2] orders) external payable returns (uint256)',
  'event StrategyCreated(uint256 id, address indexed owner, address indexed token0, address indexed token1, tuple(uint128 y, uint128 z, uint64 A, uint64 B) order0, tuple(uint128 y, uint128 z, uint64 A, uint64 B) order1)',
];

const ERC20_ABI = [
  'function approve(address spender, uint256 amount) external returns (bool)',
];

function loadEnvFile(): Record<string, string> {
  const envPath = path.join(__dirname, '../../.env.tenderly');
  const vars: Record<string, string> = {};
  if (fs.existsSync(envPath)) {
    const content = fs.readFileSync(envPath, 'utf-8');
    for (const line of content.split('\n')) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      const eqIdx = trimmed.indexOf('=');
      if (eqIdx > 0) {
        vars[trimmed.slice(0, eqIdx)] = trimmed.slice(eqIdx + 1);
      }
    }
  }
  return vars;
}

function fetchJson(urlStr: string): Promise<any> {
  return new Promise((resolve, reject) => {
    http.get(urlStr, (res) => {
      let data = '';
      res.on('data', (chunk) => (data += chunk));
      res.on('end', () => {
        try {
          resolve(JSON.parse(data));
        } catch {
          reject(new Error(`Invalid JSON from ${urlStr}: ${data.slice(0, 200)}`));
        }
      });
    }).on('error', reject);
  });
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

async function main() {
  const envVars = loadEnvFile();
  const rpcUrl = process.env.ETHEREUM_RPC_ENDPOINT || envVars.ETHEREUM_RPC_ENDPOINT;

  if (!rpcUrl) {
    console.error('ETHEREUM_RPC_ENDPOINT not set. Run tenderly:testnet first or source .env.tenderly');
    process.exit(1);
  }

  console.log('\n=== Tenderly Testnet Harvest Test ===\n');
  console.log(`RPC:              ${rpcUrl}`);
  console.log(`CarbonController: ${CARBON_CONTROLLER}`);
  console.log(`Pair:             DAI / USDC`);

  const provider = new ethers.providers.JsonRpcProvider(rpcUrl);
  const wallet = ethers.Wallet.createRandom().connect(provider);
  console.log(`Test wallet:      ${wallet.address}\n`);

  // Fund the wallet with ETH
  console.log('Funding wallet...');
  await provider.send('tenderly_setBalance', [
    [wallet.address],
    ethers.utils.hexValue(ethers.utils.parseEther('10')),
  ]);

  // Fund with DAI and USDC
  await provider.send('tenderly_setErc20Balance', [
    DAI,
    wallet.address,
    ethers.utils.hexValue(ethers.utils.parseUnits('1000', 18)),
  ]);
  await provider.send('tenderly_setErc20Balance', [
    USDC,
    wallet.address,
    ethers.utils.hexValue(ethers.utils.parseUnits('1000', 6)),
  ]);
  console.log('  Funded 10 ETH + 1000 DAI + 1000 USDC');

  // Approve CarbonController
  const dai = new ethers.Contract(DAI, ERC20_ABI, wallet);
  const usdc = new ethers.Contract(USDC, ERC20_ABI, wallet);
  await (await dai.approve(CARBON_CONTROLLER, ethers.constants.MaxUint256)).wait();
  await (await usdc.approve(CARBON_CONTROLLER, ethers.constants.MaxUint256)).wait();
  console.log('  Approved DAI + USDC');

  // Create a strategy on CarbonController
  // Order params: y=current liquidity, z=initial capacity, A=0 (flat price), B=price encoding
  const order0 = {
    y: ethers.utils.parseUnits('100', 18),
    z: ethers.utils.parseUnits('100', 18),
    A: 0,
    B: 6001066667089,
  };
  const order1 = {
    y: ethers.utils.parseUnits('100', 6),
    z: ethers.utils.parseUnits('100', 6),
    A: 0,
    B: 1897467523720620,
  };

  console.log('\nCreating Carbon strategy (DAI/USDC)...');
  const controller = new ethers.Contract(CARBON_CONTROLLER, CARBON_ABI, wallet);
  const tx = await controller.createStrategy(DAI, USDC, [order0, order1], { gasLimit: 1_000_000 });
  const receipt = await tx.wait();

  const createdEvent = receipt.events?.find((e: any) => e.event === 'StrategyCreated');
  const strategyId = createdEvent?.args?.id?.toString();

  console.log(`  Strategy created in block ${receipt.blockNumber}`);
  console.log(`  Strategy ID: ${strategyId}`);
  console.log(`  Tx hash: ${receipt.transactionHash}`);

  // Poll the backend API until the strategy appears
  console.log('\nPolling backend for harvested strategy...');
  const apiUrl = 'http://localhost:3000/v1/ethereum/strategies';
  const maxWait = 90;
  let waited = 0;
  let found = false;

  while (waited < maxWait) {
    try {
      const data = await fetchJson(apiUrl);
      const strategies = data.strategies || data;
      if (Array.isArray(strategies)) {
        const match = strategies.find(
          (s: any) => s.id === strategyId || s.strategyId === strategyId,
        );
        if (match) {
          found = true;
          console.log(`\n  FOUND strategy ${strategyId} after ${waited}s`);
          console.log(`  Token0: ${match.baseToken?.symbol || match.token0 || 'N/A'}`);
          console.log(`  Token1: ${match.quoteToken?.symbol || match.token1 || 'N/A'}`);
          break;
        }
      }
    } catch {
      // server might not be ready yet
    }

    await sleep(3000);
    waited += 3;
    process.stdout.write(`  Polling... (${waited}s)\r`);
  }

  console.log();
  if (found) {
    console.log('==========================================');
    console.log('  PASS: Strategy was harvested by backend');
    console.log('==========================================');
  } else {
    console.log('==========================================');
    console.log(`  FAIL: Strategy ${strategyId} not found after ${maxWait}s`);
    console.log('==========================================');
    process.exit(1);
  }
}

main().catch((err) => {
  console.error('Test failed:', err);
  process.exit(1);
});
