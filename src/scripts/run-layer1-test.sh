#!/bin/bash
#
# Layer 1: Automated Gradient Integration Test
#
# Seeds the DB with gradient data, starts the server, verifies all APIs,
# then cleans up. Fully automated, no manual steps.
#
# Prerequisites:
#   - Local PostgreSQL running with carbon-backend schema
#   - Redis running
#   - .env configured with DATABASE_URL and REDIS_URL
#
# Usage:
#   bash src/scripts/run-layer1-test.sh
#

set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(cd "$SCRIPT_DIR/../.." && pwd)"
cd "$PROJECT_DIR"

# Colors for output
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
  # Ensure port 3000 is free
  lsof -ti:3000 | xargs kill -9 2>/dev/null || true
}
trap cleanup EXIT INT TERM

# Kill anything on port 3000 before we start
lsof -ti:3000 | xargs kill -9 2>/dev/null || true
sleep 1

echo -e "${YELLOW}========================================${NC}"
echo -e "${YELLOW}  Layer 1: Gradient Integration Test    ${NC}"
echo -e "${YELLOW}========================================${NC}"
echo

# Step 1: Seed the database
echo -e "${YELLOW}Step 1: Seeding database with gradient data...${NC}"
npx ts-node src/scripts/gradient-test-seed.ts --clean
echo

# Step 2: Start the server in the background (no harvesting, but with analytics)
# Set a dummy GradientController address so hasGradientSupport() returns true
echo -e "${YELLOW}Step 2: Starting server (SHOULD_HARVEST=0, SHOULD_UPDATE_ANALYTICS=1)...${NC}"
SHOULD_HARVEST=0 \
SHOULD_UPDATE_ANALYTICS=1 \
ETHEREUM_GRADIENT_CONTROLLER_ADDRESS="0x0000000000000000000000000000000000000001" \
TZ=UTC \
npx nest start &
SERVER_PID=$!
echo "  Server PID: $SERVER_PID"

# Step 3: Wait for the server to be healthy
echo -e "${YELLOW}Step 3: Waiting for server to be ready...${NC}"
MAX_WAIT=60
WAITED=0
while [ $WAITED -lt $MAX_WAIT ]; do
  if curl -s http://localhost:3000/v1/ethereum/state > /dev/null 2>&1; then
    echo -e "  ${GREEN}Server is ready (waited ${WAITED}s)${NC}"
    break
  fi
  sleep 2
  WAITED=$((WAITED + 2))
  echo "  Waiting... (${WAITED}s)"
done

if [ $WAITED -ge $MAX_WAIT ]; then
  echo -e "  ${RED}Server did not start within ${MAX_WAIT}s${NC}"
  exit 1
fi

# Wait for analytics cache to populate (analytics runs every 5s)
echo -e "${YELLOW}  Waiting for analytics cache to populate (12s)...${NC}"
sleep 12

# Step 4: Run the API verification
echo
echo -e "${YELLOW}Step 4: Running API verification...${NC}"
echo
npx ts-node src/scripts/gradient-test-verify.ts
VERIFY_EXIT=$?

echo
if [ $VERIFY_EXIT -eq 0 ]; then
  echo -e "${GREEN}========================================${NC}"
  echo -e "${GREEN}  Layer 1: ALL CHECKS PASSED            ${NC}"
  echo -e "${GREEN}========================================${NC}"
else
  echo -e "${RED}========================================${NC}"
  echo -e "${RED}  Layer 1: SOME CHECKS FAILED           ${NC}"
  echo -e "${RED}========================================${NC}"
fi

exit $VERIFY_EXIT
