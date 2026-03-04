#!/bin/bash
#
# Layer 2: Automated Gradient E2E Tenderly Test
#
# Sets up strategies on a Tenderly testnet, starts the server with
# harvesting pointed at Tenderly, waits for data to be ingested,
# then verifies all APIs.
#
# Prerequisites:
#   - Tenderly testnet already created via carbon-gradients-contracts:
#       cd ../carbon-gradients-contracts && pnpm setup:testnet
#   - .env configured with DATABASE_URL, REDIS_URL
#   - The following env vars set (or passed to this script):
#       GRADIENT_TENDERLY_RPC            - Tenderly testnet RPC URL
#       GRADIENT_CONTROLLER_ADDRESS      - Deployed GradientController address
#       GRADIENT_DEPLOYER_KEY            - Private key of a funded account
#
# Usage:
#   GRADIENT_TENDERLY_RPC=https://... \
#   GRADIENT_CONTROLLER_ADDRESS=0x... \
#   GRADIENT_DEPLOYER_KEY=0x... \
#   bash src/scripts/run-layer2-test.sh
#

set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(cd "$SCRIPT_DIR/../.." && pwd)"
cd "$PROJECT_DIR"

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

SERVER_PID=""

cleanup() {
  if [ -n "$SERVER_PID" ]; then
    echo -e "\n${YELLOW}Stopping server (PID $SERVER_PID)...${NC}"
    kill "$SERVER_PID" 2>/dev/null || true
    pkill -P "$SERVER_PID" 2>/dev/null || true
    wait "$SERVER_PID" 2>/dev/null || true
  fi
}
trap cleanup EXIT INT TERM

# Validate required env vars
if [ -z "$GRADIENT_TENDERLY_RPC" ]; then
  echo -e "${RED}Error: GRADIENT_TENDERLY_RPC is not set${NC}"
  echo "Create a Tenderly testnet first:"
  echo "  cd ../carbon-gradients-contracts && pnpm setup:testnet"
  exit 1
fi
if [ -z "$GRADIENT_CONTROLLER_ADDRESS" ]; then
  echo -e "${RED}Error: GRADIENT_CONTROLLER_ADDRESS is not set${NC}"
  exit 1
fi
if [ -z "$GRADIENT_DEPLOYER_KEY" ]; then
  echo -e "${RED}Error: GRADIENT_DEPLOYER_KEY is not set${NC}"
  exit 1
fi

echo -e "${YELLOW}==========================================${NC}"
echo -e "${YELLOW}  Layer 2: Gradient E2E Tenderly Test     ${NC}"
echo -e "${YELLOW}==========================================${NC}"
echo
echo "  RPC:        $GRADIENT_TENDERLY_RPC"
echo "  Controller: $GRADIENT_CONTROLLER_ADDRESS"
echo

# Step 1: Create strategies on Tenderly
echo -e "${YELLOW}Step 1: Creating strategies on Tenderly testnet...${NC}"
npx ts-node src/scripts/gradient-e2e-tenderly.ts
echo

# Step 2: Start the server with harvesting pointed at Tenderly
echo -e "${YELLOW}Step 2: Starting server with harvesting (IS_FORK=1)...${NC}"
SHOULD_HARVEST=1 \
SHOULD_UPDATE_ANALYTICS=0 \
IS_FORK=1 \
ETHEREUM_RPC_ENDPOINT="$GRADIENT_TENDERLY_RPC" \
ETHEREUM_GRADIENT_CONTROLLER_ADDRESS="$GRADIENT_CONTROLLER_ADDRESS" \
TZ=UTC \
npx nest start &
SERVER_PID=$!
echo "  Server PID: $SERVER_PID"

# Step 3: Wait for the server to be healthy
echo -e "${YELLOW}Step 3: Waiting for server to be ready...${NC}"
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

# Step 4: Wait for the realtime updater to harvest gradient data
# The updater polls every 3 seconds; give it a few cycles
echo -e "${YELLOW}Step 4: Waiting for gradient data to be harvested (20s)...${NC}"
sleep 20

# Check if gradient strategies appeared
echo -e "${YELLOW}Step 5: Checking for gradient data in /strategies...${NC}"
STRATS=$(curl -s http://localhost:3000/v1/ethereum/strategies)
GRADIENT_COUNT=$(echo "$STRATS" | grep -o '"type":"gradient"' | wc -l | tr -d ' ')
echo "  Found $GRADIENT_COUNT gradient strategies in API response"

if [ "$GRADIENT_COUNT" -eq 0 ]; then
  echo -e "  ${YELLOW}No gradient strategies yet, waiting another 15s...${NC}"
  sleep 15
  STRATS=$(curl -s http://localhost:3000/v1/ethereum/strategies)
  GRADIENT_COUNT=$(echo "$STRATS" | grep -o '"type":"gradient"' | wc -l | tr -d ' ')
  echo "  Found $GRADIENT_COUNT gradient strategies after retry"
fi

# Step 6: Run the API verification
echo
echo -e "${YELLOW}Step 6: Running API verification...${NC}"
echo
npx ts-node src/scripts/gradient-test-verify.ts
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
