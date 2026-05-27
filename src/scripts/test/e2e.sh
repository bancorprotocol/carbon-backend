#!/bin/bash
#
# E2E Test (full Tenderly fork)
#
# Creates a Tenderly VNet (which inherits the mainnet CarbonController +
# GradientController), seeds the fork with Carbon + gradient activity,
# starts carbon-backend with harvesting, and verifies the harvested DB
# state plus all 39 API endpoints. Tears down the testnet at the end.
#
# Prerequisites:
#   - Local PostgreSQL + Redis running
#   - .env with DATABASE_URL and REDIS_URL
#   - TENDERLY_ACCESS_KEY, TENDERLY_USERNAME, TENDERLY_PROJECT set
#     (in shell env or in any sourced .env)
#
# Usage:
#   npm run test:e2e
#   (or: bash src/scripts/test/e2e.sh)
#

set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(cd "$SCRIPT_DIR/../../.." && pwd)"

cd "$PROJECT_DIR"

# Load .env so TENDERLY_*, DATABASE_URL etc. are available without manual
# export. Mirrors what the TS scripts do via dotenv.config().
if [ -f "$PROJECT_DIR/.env" ]; then
  set -a
  # shellcheck source=/dev/null
  source "$PROJECT_DIR/.env"
  set +a
fi

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

SERVER_PID=""
TESTNET_ID=""
TENDERLY_TESTNET_API=""

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
echo -e "${YELLOW}  E2E Test (Tenderly fork)                ${NC}"
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

INITIAL_FORK_BLOCK=$(curl -sX POST "$RPC_URL" \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","method":"eth_blockNumber","params":[],"id":1}' | jq -r '.result' | xargs printf "%d\n")
echo "  Initial fork block: $INITIAL_FORK_BLOCK"
echo

# ─── Phase 2: Seed Carbon + Gradient activity on the fork ────────────────────

echo -e "${YELLOW}Phase 2: Seeding Carbon + gradient activity on the fork...${NC}"

ETHEREUM_RPC_ENDPOINT="$RPC_URL" \
TZ=UTC \
npx ts-node -r tsconfig-paths/register src/scripts/tenderly/seed.ts 2>&1 | while IFS= read -r line; do echo "    $line"; done

SEED_EXIT=${PIPESTATUS[0]}
if [ "$SEED_EXIT" -ne 0 ]; then
  echo -e "${RED}Tenderly seed failed${NC}"
  exit 1
fi
echo

# ─── Phase 2.5: Bump LPB to fork-block-1 so harvest doesn't grind mainnet ────
#
# Without this, the gradient harvester starts at ~24.5M while the fork is at
# ~25.18M — ~600k blocks of mainnet to scan before it reaches the seeded
# events. Same story (smaller) for the Carbon-side LPB rows. By rewinding /
# fast-forwarding every ethereum-ethereum LPB row to fork_block - 1, the
# harvester boots right at the fork's tail and picks up our seeded events
# almost immediately. Idempotent via UPSERT.

echo -e "${YELLOW}Phase 2.5: Aligning last_processed_block to fork tail (${INITIAL_FORK_BLOCK})...${NC}"
node -e "
  require('dotenv').config();
  const { Client } = require('pg');
  const forkBlock = ${INITIAL_FORK_BLOCK};
  const target = forkBlock - 1;
  (async () => {
    const c = new Client({ connectionString: process.env.DATABASE_URL });
    await c.connect();
    const res = await c.query(\`
      UPDATE last_processed_block
         SET block = \$1, \"updatedAt\" = now()
       WHERE param LIKE 'ethereum-ethereum-%'
       RETURNING param
    \`, [target]);
    console.log('  Aligned ' + res.rowCount + ' LPB rows to block ' + target);
    await c.end();
  })().catch(e => { console.error(e); process.exit(1); });
"
echo

# ─── Phase 3: Start server with harvesting ───────────────────────────────────

echo -e "${YELLOW}Phase 3: Starting server with harvesting (IS_FORK=1)...${NC}"

SHOULD_HARVEST=1 \
SHOULD_UPDATE_ANALYTICS=1 \
IS_FORK=1 \
ETHEREUM_RPC_ENDPOINT="$RPC_URL" \
TZ=UTC \
npx nest start &
SERVER_PID=$!
echo "  Server PID: $SERVER_PID"

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

# ─── Phase 4: Wait for gradient data to be harvested ─────────────────────────
#
# The seed creates 7 gradient strategies (5 on DAI/USDC types 0-4 + WBTC/USDC
# + LINK/DAI), 1 update, 3 trades, and 1 deletion. We poll the DB until ALL
# of these are reflected so the verifier isn't racing the harvester.

echo -e "${YELLOW}Phase 4: Waiting for gradient data to be harvested...${NC}"

MAX_HARVEST_WAIT=180
HARVEST_WAITED=0
HARVEST_DONE=0
while [ $HARVEST_WAITED -lt $MAX_HARVEST_WAIT ]; do
  COUNTS=$(psql -h localhost -d activityv2 -tA -F'|' -c "
    SELECT
      (SELECT COUNT(*) FROM gradient_strategy_created_events WHERE \"blockchainType\"='ethereum' AND \"exchangeId\"='ethereum'),
      (SELECT COUNT(*) FROM gradient_strategy_deleted_events WHERE \"blockchainType\"='ethereum' AND \"exchangeId\"='ethereum'),
      (SELECT COUNT(*) FROM gradient_strategy_liquidity_updated_events WHERE \"blockchainType\"='ethereum' AND \"exchangeId\"='ethereum'),
      (SELECT block FROM last_processed_block WHERE param='ethereum-ethereum-gradient-strategy-deleted-events');
  " 2>/dev/null)
  CREATED_N=$(echo "$COUNTS" | cut -d'|' -f1)
  DELETED_N=$(echo "$COUNTS" | cut -d'|' -f2)
  LIQ_N=$(echo "$COUNTS" | cut -d'|' -f3)
  DEL_LPB=$(echo "$COUNTS" | cut -d'|' -f4)
  if [ "${CREATED_N:-0}" -ge 8 ] && [ "${DELETED_N:-0}" -ge 1 ] && [ "${LIQ_N:-0}" -ge 1 ]; then
    echo -e "  ${GREEN}Harvest complete: ${CREATED_N} created, ${DELETED_N} deleted, ${LIQ_N} liquidity-updates (waited ${HARVEST_WAITED}s)${NC}"
    HARVEST_DONE=1
    break
  fi
  sleep 3
  HARVEST_WAITED=$((HARVEST_WAITED + 3))
  echo "  Polling... (created=${CREATED_N:-0}/8, deleted=${DELETED_N:-0}/1, liq=${LIQ_N:-0}/1, deleted-LPB=${DEL_LPB:-N/A}, ${HARVEST_WAITED}s)"
done

if [ "$HARVEST_DONE" -ne 1 ]; then
  echo -e "  ${RED}Harvest did not complete after ${MAX_HARVEST_WAIT}s (created=${CREATED_N:-0}/8, deleted=${DELETED_N:-0}/1)${NC}"
  exit 1
fi

echo -e "${YELLOW}  Waiting for analytics cache (12s)...${NC}"
sleep 12

# ─── Phase 5: DB verification ─────────────────────────────────────────────────

echo -e "${YELLOW}Phase 5: Verifying harvested DB state...${NC}"

DB_CHECK_EXIT=0
node -e "
  require('dotenv').config();
  const { Client } = require('pg');
  (async () => {
    const c = new Client({ connectionString: process.env.DATABASE_URL });
    await c.connect();

    const checks = [
      { table: 'gradient_strategy_created_events', minRows: 5, label: 'StrategyCreated events (gradient)' },
      { table: 'gradient_strategy_liquidity_updated_events', minRows: 1, label: 'StrategyLiquidityUpdated events (gradient trades)' },
      { table: 'gradient_strategy_updated_events', minRows: 1, label: 'StrategyUpdated events (gradient)' },
      { table: 'gradient_strategy_deleted_events', minRows: 1, label: 'StrategyDeleted events (gradient)' },
      { table: 'gradient_strategies', minRows: 5, label: 'Gradient strategies' },
      { table: 'strategy-created-events', minRows: 5, label: 'StrategyCreated events (carbon)' },
    ];

    let allPassed = true;
    for (const check of checks) {
      const tableEsc = check.table.replace(/\"/g, '');
      const r = await c.query(
        'SELECT COUNT(*) as cnt FROM \"' + tableEsc + '\" WHERE \"blockchainType\"=\$1 AND \"exchangeId\"=\$2' +
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

    const tradedR = await c.query(
      \"SELECT COUNT(*) as cnt FROM \\\"tokens-traded-events\\\" WHERE \\\"blockchainType\\\"=\\\$1 AND \\\"exchangeId\\\"=\\\$2\",
      ['ethereum', 'ethereum']
    );
    if (parseInt(tradedR.rows[0].cnt) > 0) {
      console.log('  PASS  tokens-traded-events: ' + tradedR.rows[0].cnt + ' rows (Carbon + gradient trades)');
    } else {
      console.log('  FAIL  tokens-traded-events: 0 rows');
      allPassed = false;
    }

    const gradActR = await c.query(
      \"SELECT COUNT(*) as cnt FROM \\\"activities-v2\\\" a INNER JOIN gradient_strategy_created_events g ON a.\\\"strategyId\\\" = g.\\\"strategyId\\\" AND a.\\\"blockchainType\\\" = g.\\\"blockchainType\\\" AND a.\\\"exchangeId\\\" = g.\\\"exchangeId\\\" WHERE a.\\\"blockchainType\\\"=\\\$1 AND a.\\\"exchangeId\\\"=\\\$2\",
      ['ethereum', 'ethereum']
    );
    const gradActCnt = parseInt(gradActR.rows[0].cnt);
    if (gradActCnt >= 5) {
      console.log('  PASS  activities-v2 gradient rows: ' + gradActCnt + ' (expected >= 5)');
    } else {
      console.log('  FAIL  activities-v2 gradient rows: ' + gradActCnt + ' (expected >= 5)');
      allPassed = false;
    }

    const unknownR = await c.query(
      \"SELECT COUNT(*) as cnt FROM \\\"activities-v2\\\" WHERE \\\"blockchainType\\\"=\\\$1 AND \\\"exchangeId\\\"=\\\$2 AND (\\\"baseSellToken\\\" = 'UNKNOWN' OR \\\"quoteBuyToken\\\" = 'UNKNOWN')\",
      ['ethereum', 'ethereum']
    );
    if (parseInt(unknownR.rows[0].cnt) === 0) {
      console.log('  PASS  activities-v2: zero UNKNOWN token names');
    } else {
      console.log('  FAIL  activities-v2: ' + unknownR.rows[0].cnt + ' rows with UNKNOWN token names');
      allPassed = false;
    }

    const dexR = await c.query(
      \"SELECT COUNT(*) as cnt FROM \\\"dex-screener-events-v2\\\" WHERE \\\"blockchainType\\\"=\\\$1 AND \\\"exchangeId\\\"=\\\$2\",
      ['ethereum', 'ethereum']
    );
    if (parseInt(dexR.rows[0].cnt) > 0) {
      console.log('  PASS  dex-screener-events-v2: ' + dexR.rows[0].cnt + ' rows');
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

# ─── Phase 6: Run API verification ───────────────────────────────────────────

echo
echo -e "${YELLOW}Phase 6: Running API verification (e2e mode)...${NC}"
echo

npx ts-node src/scripts/test/verify.ts --mode=e2e
VERIFY_EXIT=$?

echo
if [ $VERIFY_EXIT -eq 0 ]; then
  echo -e "${GREEN}==========================================${NC}"
  echo -e "${GREEN}  E2E: ALL CHECKS PASSED                  ${NC}"
  echo -e "${GREEN}==========================================${NC}"
else
  echo -e "${RED}==========================================${NC}"
  echo -e "${RED}  E2E: SOME CHECKS FAILED                 ${NC}"
  echo -e "${RED}==========================================${NC}"
fi

exit $VERIFY_EXIT
