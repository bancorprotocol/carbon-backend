#!/bin/bash
#
# Layer 2: Fully Automated Gradient E2E Tenderly Test
#
# Creates a Tenderly VNet, deploys GradientController, creates strategies,
# starts carbon-backend with harvesting, and verifies all APIs.
#
# Prerequisites:
#   - ../carbon-gradients-contracts with node_modules installed
#   - Local PostgreSQL + Redis running
#   - .env with DATABASE_URL and REDIS_URL
#   - TENDERLY_ACCESS_KEY, TENDERLY_USERNAME, TENDERLY_PROJECT set
#     (in shell env or in ../carbon-gradients-contracts/.env)
#
# Usage:
#   bash src/scripts/run-layer2-test.sh
#

set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(cd "$SCRIPT_DIR/../.." && pwd)"
CONTRACTS_DIR="$(cd "$PROJECT_DIR/../carbon-gradients-contracts" 2>/dev/null && pwd || echo "")"

cd "$PROJECT_DIR"

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

SERVER_PID=""
TESTNET_ID=""
TENDERLY_TESTNET_API=""

# ─── Load Tenderly env from contracts repo if not already set ─────────────────

if [ -f "$CONTRACTS_DIR/.env" ]; then
  source "$CONTRACTS_DIR/.env"
fi

# ─── Cleanup ──────────────────────────────────────────────────────────────────

cleanup() {
  if [ -n "$SERVER_PID" ]; then
    echo -e "\n${YELLOW}Stopping server (PID $SERVER_PID)...${NC}"
    kill "$SERVER_PID" 2>/dev/null || true
    pkill -P "$SERVER_PID" 2>/dev/null || true
    wait "$SERVER_PID" 2>/dev/null || true
  fi
  lsof -ti:3000 | xargs kill -9 2>/dev/null || true

  if [ -n "$TESTNET_ID" ] && [ -n "$TENDERLY_TESTNET_API" ]; then
    echo -e "${YELLOW}Deleting Tenderly testnet ${TESTNET_ID}...${NC}"
    curl -sX DELETE "${TENDERLY_TESTNET_API}/${TESTNET_ID}" \
      -H "Content-Type: application/json" \
      -H "X-Access-Key: ${TENDERLY_ACCESS_KEY}" > /dev/null 2>&1 || true
    echo -e "${GREEN}Testnet deleted${NC}"
  fi
}
trap cleanup EXIT INT TERM

# ─── Validate prerequisites ──────────────────────────────────────────────────

echo -e "${YELLOW}==========================================${NC}"
echo -e "${YELLOW}  Layer 2: Gradient E2E Tenderly Test     ${NC}"
echo -e "${YELLOW}==========================================${NC}"
echo

if [ -z "$TENDERLY_ACCESS_KEY" ]; then
  echo -e "${RED}Error: TENDERLY_ACCESS_KEY not set${NC}"
  exit 1
fi
if [ -z "$TENDERLY_USERNAME" ]; then
  echo -e "${RED}Error: TENDERLY_USERNAME not set${NC}"
  exit 1
fi
if [ -z "$TENDERLY_PROJECT" ]; then
  echo -e "${RED}Error: TENDERLY_PROJECT not set${NC}"
  exit 1
fi
if [ -z "$CONTRACTS_DIR" ] || [ ! -d "$CONTRACTS_DIR/node_modules" ]; then
  echo -e "${RED}Error: ../carbon-gradients-contracts not found or node_modules missing${NC}"
  echo "  Run: cd ../carbon-gradients-contracts && pnpm install"
  exit 1
fi

lsof -ti:3000 | xargs kill -9 2>/dev/null || true
sleep 1

# ─── Phase 1: Create Tenderly VNet ───────────────────────────────────────────

echo -e "${YELLOW}Phase 1: Creating Tenderly virtual testnet (mainnet fork)...${NC}"

TENDERLY_TESTNET_API="https://api.tenderly.co/api/v1/account/${TENDERLY_USERNAME}/project/${TENDERLY_PROJECT}/vnets"
TIMESTAMP=$(date +"%s")

RESPONSE=$(curl -sX POST "$TENDERLY_TESTNET_API" \
  -H "Content-Type: application/json" \
  -H "X-Access-Key: ${TENDERLY_ACCESS_KEY}" \
  -d '{
    "slug": "carbon-e2e-test-'"${TIMESTAMP}"'",
    "display_name": "Carbon E2E Test '"${TIMESTAMP}"'",
    "fork_config": {
      "network_id": 1,
      "block_number": "latest"
    },
    "virtual_network_config": {
      "chain_config": {
        "chain_id": 1
      }
    },
    "sync_state_config": {
      "enabled": false
    }
  }')

TESTNET_ID=$(echo "$RESPONSE" | jq -r '.id')
RPC_URL=$(echo "$RESPONSE" | jq -r '.rpcs[0].url')

if [ -z "$TESTNET_ID" ] || [ "$TESTNET_ID" = "null" ] || [ -z "$RPC_URL" ] || [ "$RPC_URL" = "null" ]; then
  echo -e "${RED}Failed to create Tenderly testnet${NC}"
  echo "$RESPONSE" | jq . 2>/dev/null || echo "$RESPONSE"
  exit 1
fi

echo -e "  ${GREEN}Testnet created: ${TESTNET_ID}${NC}"
echo "  RPC: $RPC_URL"

# Capture the initial fork block (before any deployment transactions)
INITIAL_FORK_BLOCK=$(curl -sX POST "$RPC_URL" \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","method":"eth_blockNumber","params":[],"id":1}' | jq -r '.result' | xargs printf "%d\n")
echo "  Initial fork block: $INITIAL_FORK_BLOCK"
echo

# ─── Phase 2: Deploy GradientController ──────────────────────────────────────

echo -e "${YELLOW}Phase 2: Deploying GradientController...${NC}"

DEPLOYER_ADDR="0x5bEBA4D3533a963Dedb270a95ae5f7752fA0Fe22"

echo "  Funding deployer ${DEPLOYER_ADDR} with ETH..."
curl -sX POST "$RPC_URL" \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","method":"tenderly_setBalance","params":[["'"$DEPLOYER_ADDR"'"],"0x56BC75E2D63100000"],"id":1}' > /dev/null

cd "$CONTRACTS_DIR"

# Prepare deployment directories (same as run-testnet.sh)
mkdir -p deployments/mainnet
echo "1" > deployments/mainnet/.chainId
if [ ! -d "deploy/scripts/mainnet" ]; then
  rsync -a --delete deploy/scripts/network/ deploy/scripts/mainnet/
fi
rm -rf deployments/tenderly && cp -rf deployments/mainnet/. deployments/tenderly

echo "  Running hardhat deploy..."
HARDHAT_NETWORK=tenderly \
TENDERLY_TESTNET_PROVIDER_URL="$RPC_URL" \
TENDERLY_NETWORK_NAME=mainnet \
npx hardhat deploy --no-compile 2>&1 | while IFS= read -r line; do echo "    $line"; done

# Read the deployed GradientController and Voucher addresses
if [ ! -f "deployments/tenderly/GradientController.json" ]; then
  echo -e "${RED}GradientController.json not found after deployment${NC}"
  cd "$PROJECT_DIR"
  exit 1
fi

CONTROLLER_ADDR=$(jq -r '.address' deployments/tenderly/GradientController.json)
echo -e "  ${GREEN}GradientController deployed: ${CONTROLLER_ADDR}${NC}"

VOUCHER_ADDR=""
if [ -f "deployments/tenderly/Voucher.json" ]; then
  VOUCHER_ADDR=$(jq -r '.address' deployments/tenderly/Voucher.json)
  echo -e "  ${GREEN}GradientVoucher deployed: ${VOUCHER_ADDR}${NC}"
fi

cd "$PROJECT_DIR"
echo

# ─── Phase 3: Create gradient strategies ─────────────────────────────────────

echo -e "${YELLOW}Phase 3: Creating gradient strategies on Tenderly...${NC}"

EPHEMERAL=$(node -e "const w = require('ethers').Wallet.createRandom(); console.log(w.address + ':' + w.privateKey)")
EPHEMERAL_ADDR=$(echo "$EPHEMERAL" | cut -d':' -f1)
EPHEMERAL_KEY=$(echo "$EPHEMERAL" | cut -d':' -f2)

echo "  Ephemeral wallet: $EPHEMERAL_ADDR"

GRADIENT_TENDERLY_RPC="$RPC_URL" \
GRADIENT_CONTROLLER_ADDRESS="$CONTROLLER_ADDR" \
GRADIENT_DEPLOYER_KEY="$EPHEMERAL_KEY" \
npx ts-node src/scripts/gradient-e2e-tenderly.ts 2>&1 | while IFS= read -r line; do echo "    $line"; done

E2E_EXIT=${PIPESTATUS[0]}
if [ "$E2E_EXIT" -ne 0 ]; then
  echo -e "${RED}Strategy creation failed${NC}"
  exit 1
fi

echo

# ─── Phase 3.5: Clean gradient DB state for fresh Tenderly harvesting ────────

echo -e "${YELLOW}  Cleaning gradient DB state for fresh Tenderly harvesting...${NC}"

# Use the initial fork block (captured before deployment) so the harvester
# scans ALL blocks where deployment, strategy creation, trades etc. happened.
SYNC_BLOCK=$((INITIAL_FORK_BLOCK - 1))
FORK_BLOCK=$(curl -sX POST "$RPC_URL" \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","method":"eth_blockNumber","params":[],"id":1}' | jq -r '.result' | xargs printf "%d\n")
echo "  Initial fork block: $INITIAL_FORK_BLOCK, latest block: $FORK_BLOCK, setting lastProcessedBlock to: $SYNC_BLOCK"

node -e "
  require('dotenv').config();
  const { Client } = require('pg');
  (async () => {
    const c = new Client({ connectionString: process.env.DATABASE_URL });
    await c.connect();

    // Clean all gradient tables
    const tables = [
      'gradient_strategies',
      'gradient_strategy_realtime',
      'gradient_strategy_created_events',
      'gradient_strategy_updated_events',
      'gradient_strategy_deleted_events',
      'gradient_strategy_liquidity_updated_events',
      'gradient_trading_fee_ppm_events',
      'gradient_pair_trading_fee_ppm_events',
    ];
    for (const t of tables) {
      await c.query('DELETE FROM \"' + t + '\" WHERE \"blockchainType\"=\$1 AND \"exchangeId\"=\$2', ['ethereum','ethereum']);
    }

    // Set gradient lastProcessedBlock entries to near the fork block
    // so the harvester only scans the few blocks where our strategies were created
    const gradientKeys = [
      'ethereum-ethereum-gradient-strategy-created-events',
      'ethereum-ethereum-gradient-strategy-updated-events',
      'ethereum-ethereum-gradient-strategy-deleted-events',
      'ethereum-ethereum-gradient-strategy-liquidity-updated-events',
      'ethereum-ethereum-gradient-activities',
      'ethereum-ethereum-gradient-pair-created-events',
      'ethereum-ethereum-gradient-tokens-traded-events',
      'ethereum-ethereum-gradient-trading-fee-ppm-events',
      'ethereum-ethereum-gradient-pair-trading-fee-ppm-events',
      'ethereum-ethereum-gradient-voucher-transfer-events',
      'ethereum-ethereum-gradient-dex-screener-v2',
      'ethereum-ethereum-gradient-strategies',
    ];
    for (const key of gradientKeys) {
      await c.query('DELETE FROM last_processed_block WHERE param = \$1', [key]);
      await c.query('INSERT INTO last_processed_block (param, block) VALUES (\$1, \$2)', [key, ${SYNC_BLOCK}]);
    }

    // Clean gradient-owner activities from previous runs
    await c.query(
      'DELETE FROM \"activities-v2\" WHERE \"blockchainType\"=\$1 AND \"exchangeId\"=\$2 AND \"currentOwner\" IN (SELECT DISTINCT \"owner\" FROM gradient_strategy_created_events WHERE \"blockchainType\"=\$1 AND \"exchangeId\"=\$2)',
      ['ethereum','ethereum']
    ).catch(() => {});

    await c.end();
    console.log('Cleaned gradient tables and set lastProcessedBlock to ${SYNC_BLOCK}');
  })().catch(e => { console.error(e); process.exit(1); });
"
echo

# ─── Phase 4: Start server with harvesting ───────────────────────────────────

echo -e "${YELLOW}Phase 4: Starting server with harvesting (IS_FORK=1)...${NC}"

SHOULD_HARVEST=1 \
SHOULD_UPDATE_ANALYTICS=1 \
IS_FORK=1 \
ETHEREUM_RPC_ENDPOINT="$RPC_URL" \
ETHEREUM_GRADIENT_CONTROLLER_ADDRESS="$CONTROLLER_ADDR" \
ETHEREUM_GRADIENT_VOUCHER_ADDRESS="$VOUCHER_ADDR" \
TZ=UTC \
npx nest start &
SERVER_PID=$!
echo "  Server PID: $SERVER_PID"

# Wait for server health
echo -e "${YELLOW}  Waiting for server to be ready...${NC}"
MAX_WAIT=90
WAITED=0
while [ $WAITED -lt $MAX_WAIT ]; do
  if curl -s http://localhost:3000/v1/ethereum/state > /dev/null 2>&1; then
    echo -e "  ${GREEN}Server is ready (waited ${WAITED}s)${NC}"
    break
  fi
  sleep 3
  WAITED=$((WAITED + 3))
  echo "  Waiting... (${WAITED}s)"
done

if [ $WAITED -ge $MAX_WAIT ]; then
  echo -e "  ${RED}Server did not start within ${MAX_WAIT}s${NC}"
  exit 1
fi

# ─── Phase 5: Wait for gradient data to be harvested ─────────────────────────

echo -e "${YELLOW}Phase 5: Waiting for gradient data to be harvested...${NC}"

MAX_HARVEST_WAIT=60
HARVEST_WAITED=0
while [ $HARVEST_WAITED -lt $MAX_HARVEST_WAIT ]; do
  STRATS=$(curl -s http://localhost:3000/v1/ethereum/strategies 2>/dev/null || echo '{}')
  GRADIENT_COUNT=$(echo "$STRATS" | grep -o '"type":"gradient"' | wc -l | tr -d ' ')
  if [ "$GRADIENT_COUNT" -ge 7 ]; then
    echo -e "  ${GREEN}Found $GRADIENT_COUNT gradient strategies (waited ${HARVEST_WAITED}s)${NC}"
    break
  fi
  sleep 3
  HARVEST_WAITED=$((HARVEST_WAITED + 3))
  echo "  Polling... ($GRADIENT_COUNT gradient strategies so far, ${HARVEST_WAITED}s)"
done

if [ "$GRADIENT_COUNT" -lt 7 ]; then
  echo -e "  ${RED}Only found $GRADIENT_COUNT gradient strategies after ${MAX_HARVEST_WAIT}s${NC}"
  exit 1
fi

# Wait for analytics cache
echo -e "${YELLOW}  Waiting for analytics cache (12s)...${NC}"
sleep 12

# ─── Phase 6: DB verification ─────────────────────────────────────────────────

echo -e "${YELLOW}Phase 6: Verifying gradient DB state...${NC}"

DB_CHECK_EXIT=0
node -e "
  require('dotenv').config();
  const { Client } = require('pg');
  (async () => {
    const c = new Client({ connectionString: process.env.DATABASE_URL });
    await c.connect();

    const checks = [
      { table: 'gradient_strategy_created_events', minRows: 8, label: 'StrategyCreated events (6 DAI/USDC + 2 WBTC/LINK)' },
      { table: 'gradient_strategy_liquidity_updated_events', minRows: 3, label: 'StrategyLiquidityUpdated events (trades)' },
      { table: 'gradient_strategy_updated_events', minRows: 1, label: 'StrategyUpdated events (from explicit updateStrategy call)' },
      { table: 'gradient_strategy_deleted_events', minRows: 1, label: 'StrategyDeleted events' },
      { table: 'gradient_strategies', minRows: 7, label: 'Gradient strategies (8 created - 1 deleted = 7 active)' },
    ];

    let allPassed = true;
    for (const check of checks) {
      const r = await c.query(
        'SELECT COUNT(*) as cnt FROM \"' + check.table + '\" WHERE \"blockchainType\"=\$1 AND \"exchangeId\"=\$2' +
        (check.table === 'gradient_strategies' ? ' AND deleted = false' : ''),
        ['ethereum', 'ethereum']
      );
      const cnt = parseInt(r.rows[0].cnt);
      if (cnt >= check.minRows) {
        console.log('  PASS  ' + check.label + ': ' + cnt + ' rows (expected >= ' + check.minRows + ')');
      } else {
        console.log('  FAIL  ' + check.label + ': ' + cnt + ' rows (expected >= ' + check.minRows + ')');
        allPassed = false;
      }
    }

    // Check shared tables for gradient data
    const tradedR = await c.query(
      \"SELECT COUNT(*) as cnt FROM \\\"tokens-traded-events\\\" WHERE \\\"blockchainType\\\"=\\\$1 AND \\\"exchangeId\\\"=\\\$2\",
      ['ethereum', 'ethereum']
    );
    const tradedCnt = parseInt(tradedR.rows[0].cnt);
    if (tradedCnt > 0) {
      console.log('  PASS  tokens-traded-events: ' + tradedCnt + ' rows (includes gradient trades)');
    } else {
      console.log('  FAIL  tokens-traded-events: 0 rows');
      allPassed = false;
    }

    const pairR = await c.query(
      \"SELECT COUNT(*) as cnt FROM \\\"pair-created-events\\\" WHERE \\\"blockchainType\\\"=\\\$1 AND \\\"exchangeId\\\"=\\\$2\",
      ['ethereum', 'ethereum']
    );
    const pairCnt = parseInt(pairR.rows[0].cnt);
    if (pairCnt > 0) {
      console.log('  PASS  pair-created-events: ' + pairCnt + ' rows (includes gradient pair)');
    } else {
      console.log('  FAIL  pair-created-events: 0 rows');
      allPassed = false;
    }

    const actR = await c.query(
      \"SELECT COUNT(*) as cnt FROM \\\"activities-v2\\\" WHERE \\\"blockchainType\\\"=\\\$1 AND \\\"exchangeId\\\"=\\\$2\",
      ['ethereum', 'ethereum']
    );
    const actCnt = parseInt(actR.rows[0].cnt);
    if (actCnt > 0) {
      console.log('  PASS  activities-v2: ' + actCnt + ' rows (includes gradient activities)');
    } else {
      console.log('  FAIL  activities-v2: 0 rows');
      allPassed = false;
    }

    const dexR = await c.query(
      \"SELECT COUNT(*) as cnt FROM \\\"dex-screener-events-v2\\\" WHERE \\\"blockchainType\\\"=\\\$1 AND \\\"exchangeId\\\"=\\\$2\",
      ['ethereum', 'ethereum']
    );
    const dexCnt = parseInt(dexR.rows[0].cnt);
    if (dexCnt > 0) {
      console.log('  PASS  dex-screener-events-v2: ' + dexCnt + ' rows (includes gradient events)');
    } else {
      console.log('  FAIL  dex-screener-events-v2: 0 rows');
      allPassed = false;
    }

    await c.end();
    if (!allPassed) {
      console.log('\\n  DB verification FAILED');
      process.exit(1);
    }
    console.log('\\n  DB verification PASSED');
  })().catch(e => { console.error(e); process.exit(1); });
"
DB_CHECK_EXIT=$?

if [ $DB_CHECK_EXIT -ne 0 ]; then
  echo -e "${RED}DB verification failed${NC}"
  exit 1
fi
echo

# ─── Phase 7: Run API verification ───────────────────────────────────────────

echo
echo -e "${YELLOW}Phase 7: Running API verification (Layer 2 mode)...${NC}"
echo

npx ts-node src/scripts/gradient-test-verify.ts --mode=layer2
VERIFY_EXIT=$?

echo
if [ $VERIFY_EXIT -eq 0 ]; then
  echo -e "${GREEN}==========================================${NC}"
  echo -e "${GREEN}  Layer 2: ALL CHECKS PASSED              ${NC}"
  echo -e "${GREEN}==========================================${NC}"
else
  echo -e "${RED}==========================================${NC}"
  echo -e "${RED}  Layer 2: SOME CHECKS FAILED             ${NC}"
  echo -e "${RED}==========================================${NC}"
fi

exit $VERIFY_EXIT
