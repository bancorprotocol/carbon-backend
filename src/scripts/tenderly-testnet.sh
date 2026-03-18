#!/bin/bash
#
# Tenderly Testnet Launcher
#
# Creates a Tenderly VNet (mainnet fork), deploys GradientController,
# and outputs all env vars needed to run the backend against it.
#
# Usage:
#   bash src/scripts/tenderly-testnet.sh           # create testnet, print env vars, exit
#   bash src/scripts/tenderly-testnet.sh --run      # create testnet + start the backend
#
# Prerequisites:
#   - ../carbon-gradients-contracts with node_modules installed
#   - TENDERLY_ACCESS_KEY, TENDERLY_USERNAME, TENDERLY_PROJECT set
#     (in shell env or in ../carbon-gradients-contracts/.env)
#   - jq and curl available
#   - Local PostgreSQL + Redis running (for --run mode)
#

set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(cd "$SCRIPT_DIR/../.." && pwd)"
CONTRACTS_DIR="$(cd "$PROJECT_DIR/../carbon-gradients-contracts" 2>/dev/null && pwd || echo "")"

cd "$PROJECT_DIR"

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
NC='\033[0m'

RUN_BACKEND=false
for arg in "$@"; do
  case "$arg" in
    --run) RUN_BACKEND=true ;;
  esac
done

SERVER_PID=""

# ─── Load Tenderly env from contracts repo if not already set ─────────────────

if [ -f "$CONTRACTS_DIR/.env" ]; then
  set -a
  source "$CONTRACTS_DIR/.env"
  set +a
fi

# ─── Cleanup (only kills the backend server, never deletes the testnet) ───────

cleanup() {
  if [ -n "$SERVER_PID" ]; then
    echo -e "\n${YELLOW}Stopping server (PID $SERVER_PID)...${NC}"
    kill "$SERVER_PID" 2>/dev/null || true
    pkill -P "$SERVER_PID" 2>/dev/null || true
    wait "$SERVER_PID" 2>/dev/null || true
  fi
  lsof -ti:3000 | xargs kill -9 2>/dev/null || true
}

if [ "$RUN_BACKEND" = true ]; then
  trap cleanup EXIT INT TERM
fi

# ─── Validate prerequisites ──────────────────────────────────────────────────

echo -e "${CYAN}==========================================${NC}"
echo -e "${CYAN}  Tenderly Testnet Launcher               ${NC}"
echo -e "${CYAN}==========================================${NC}"
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

if [ "$RUN_BACKEND" = true ]; then
  lsof -ti:3000 | xargs kill -9 2>/dev/null || true
  sleep 1
fi

# ─── Phase 1: Create Tenderly VNet ───────────────────────────────────────────

echo -e "${YELLOW}Phase 1: Creating Tenderly virtual testnet (mainnet fork)...${NC}"

TENDERLY_TESTNET_API="https://api.tenderly.co/api/v1/account/${TENDERLY_USERNAME}/project/${TENDERLY_PROJECT}/vnets"
TIMESTAMP=$(date +"%s")

RESPONSE=$(curl -sX POST "$TENDERLY_TESTNET_API" \
  -H "Content-Type: application/json" \
  -H "X-Access-Key: ${TENDERLY_ACCESS_KEY}" \
  -d '{
    "slug": "carbon-testnet-'"${TIMESTAMP}"'",
    "display_name": "Carbon Testnet '"${TIMESTAMP}"'",
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

# ─── Phase 2: Deploy GradientController ──────────────────────────────────────

echo -e "${YELLOW}Phase 2: Deploying GradientController...${NC}"

DEPLOYER_ADDR="0x5bEBA4D3533a963Dedb270a95ae5f7752fA0Fe22"

echo "  Funding deployer ${DEPLOYER_ADDR} with ETH..."
curl -sX POST "$RPC_URL" \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","method":"tenderly_setBalance","params":[["'"$DEPLOYER_ADDR"'"],"0x56BC75E2D63100000"],"id":1}' > /dev/null

cd "$CONTRACTS_DIR"

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

# ─── Write .env.tenderly ─────────────────────────────────────────────────────

ENV_FILE="$PROJECT_DIR/.env.tenderly"

cat > "$ENV_FILE" <<EOF
# Generated by tenderly-testnet.sh at $(date -u +"%Y-%m-%dT%H:%M:%SZ")
# Testnet ID: ${TESTNET_ID}

ETHEREUM_RPC_ENDPOINT=${RPC_URL}
ETHEREUM_GRADIENT_CONTROLLER_ADDRESS=${CONTROLLER_ADDR}
ETHEREUM_GRADIENT_VOUCHER_ADDRESS=${VOUCHER_ADDR}
IS_FORK=1
SHOULD_HARVEST=1
SHOULD_UPDATE_ANALYTICS=1

# Tenderly metadata (not consumed by the backend, kept for reference)
TENDERLY_TESTNET_ID=${TESTNET_ID}
TENDERLY_TESTNET_RPC=${RPC_URL}
TENDERLY_INITIAL_FORK_BLOCK=${INITIAL_FORK_BLOCK}
EOF

echo -e "${GREEN}Environment written to .env.tenderly${NC}"
echo

# ─── Summary ─────────────────────────────────────────────────────────────────

echo -e "${CYAN}==========================================${NC}"
echo -e "${CYAN}  Tenderly Testnet Ready                  ${NC}"
echo -e "${CYAN}==========================================${NC}"
echo
echo -e "  Testnet ID:  ${GREEN}${TESTNET_ID}${NC}"
echo -e "  RPC URL:     ${GREEN}${RPC_URL}${NC}"
echo -e "  Fork block:  ${INITIAL_FORK_BLOCK}"
echo -e "  Controller:  ${CONTROLLER_ADDR}"
echo -e "  Voucher:     ${VOUCHER_ADDR:-N/A}"
echo
echo "  Env vars (copy to .env or source .env.tenderly):"
echo
echo "    ETHEREUM_RPC_ENDPOINT=${RPC_URL}"
echo "    ETHEREUM_GRADIENT_CONTROLLER_ADDRESS=${CONTROLLER_ADDR}"
echo "    ETHEREUM_GRADIENT_VOUCHER_ADDRESS=${VOUCHER_ADDR}"
echo "    IS_FORK=1"
echo "    SHOULD_HARVEST=1"
echo "    SHOULD_UPDATE_ANALYTICS=1"
echo
echo -e "  To delete this testnet later:"
echo -e "    ${YELLOW}npm run tenderly:testnet:delete -- ${TESTNET_ID}${NC}"
echo

# ─── Clean gradient DB state (--run only) ─────────────────────────────────────

if [ "$RUN_BACKEND" = true ]; then
  echo -e "${YELLOW}Cleaning gradient DB state for fresh Tenderly harvesting...${NC}"

  SYNC_BLOCK=$((INITIAL_FORK_BLOCK - 1))

  node -e "
    require('dotenv').config();
    const { Client } = require('pg');
    (async () => {
      const c = new Client({ connectionString: process.env.DATABASE_URL });
      await c.connect();

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

      await c.query(
        'DELETE FROM \"activities-v2\" WHERE \"blockchainType\"=\$1 AND \"exchangeId\"=\$2 AND \"currentOwner\" IN (SELECT DISTINCT \"owner\" FROM gradient_strategy_created_events WHERE \"blockchainType\"=\$1 AND \"exchangeId\"=\$2)',
        ['ethereum','ethereum']
      ).catch(() => {});

      await c.end();
      console.log('  Cleaned gradient tables and set lastProcessedBlock to ${SYNC_BLOCK}');
    })().catch(e => { console.error(e); process.exit(1); });
  "
  echo
fi

# ─── Optionally start the backend ────────────────────────────────────────────

if [ "$RUN_BACKEND" = true ]; then
  echo -e "${YELLOW}Starting backend with harvesting (IS_FORK=1)...${NC}"

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

  echo -e "${YELLOW}  Waiting for server to be ready...${NC}"
  MAX_WAIT=120
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

  echo
  echo -e "${GREEN}Backend is running. Press Ctrl+C to stop (testnet stays alive).${NC}"
  echo

  wait "$SERVER_PID"
fi
