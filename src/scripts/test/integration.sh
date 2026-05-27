#!/bin/bash
#
# Integration Test (DB-only)
#
# Seeds DB with synthetic Carbon + gradient fixtures, starts the server,
# verifies all APIs, then cleans up. Fully automated, no manual steps.
# Fast pre-merge gate — no Tenderly, no contracts.
#
# Prerequisites:
#   - Local PostgreSQL running with carbon-backend schema
#   - Redis running
#   - .env configured with DATABASE_URL and REDIS_URL
#
# Usage:
#   npm run test:integration
#   (or: bash src/scripts/test/integration.sh)
#

set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(cd "$SCRIPT_DIR/../../.." && pwd)"
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
  lsof -ti:3000 | xargs kill -9 2>/dev/null || true
}
trap cleanup EXIT INT TERM

lsof -ti:3000 | xargs kill -9 2>/dev/null || true
sleep 1

echo -e "${YELLOW}========================================${NC}"
echo -e "${YELLOW}  Integration Test (DB-only)            ${NC}"
echo -e "${YELLOW}========================================${NC}"
echo

# Step 1: Seed the database
echo -e "${YELLOW}Step 1: Seeding database with synthetic Carbon + gradient fixtures...${NC}"
npx ts-node src/scripts/test/db-seed.ts --clean
echo

# Step 2: Start the server (no harvesting, but with analytics)
echo -e "${YELLOW}Step 2: Starting server (SHOULD_HARVEST=0, SHOULD_UPDATE_ANALYTICS=1)...${NC}"
SHOULD_HARVEST=0 \
SHOULD_UPDATE_ANALYTICS=1 \
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

# Wait for the analytics updater to pick up the freshly-seeded gradient rows
# and populate the ethereum:ethereum cache. The updater runs every 5s but
# ethereum's cycle is slower than the lighter chains (~30k pairs to crunch),
# so we actively poll /analytics/trades_count instead of guessing a sleep.
echo -e "${YELLOW}  Waiting for ethereum:ethereum analytics cache to include gradient trade counts...${NC}"
MAX_ANALYTICS_WAIT=90
ANALYTICS_WAITED=0
while [ $ANALYTICS_WAITED -lt $MAX_ANALYTICS_WAIT ]; do
  GRAD_TC=$(curl -s http://localhost:3000/v1/ethereum/analytics/trades_count 2>/dev/null \
    | node -e "let s=''; process.stdin.on('data',d=>s+=d); process.stdin.on('end',()=>{try{const a=JSON.parse(s);console.log(Array.isArray(a)?a.filter(t=>t.strategyId&&t.strategyId.length>50).length:0);}catch{console.log(0);}})" 2>/dev/null \
    || echo 0)
  if [ "$GRAD_TC" -ge 6 ]; then
    echo -e "  ${GREEN}Gradient trade counts present (${GRAD_TC}, waited ${ANALYTICS_WAITED}s)${NC}"
    break
  fi
  sleep 3
  ANALYTICS_WAITED=$((ANALYTICS_WAITED + 3))
  echo "  Waiting... (${GRAD_TC} gradient entries so far, ${ANALYTICS_WAITED}s)"
done

if [ "$GRAD_TC" -lt 6 ]; then
  echo -e "  ${RED}Analytics cache did not include gradient trade counts after ${MAX_ANALYTICS_WAIT}s${NC}"
  exit 1
fi

# Step 4: Run the API verification
echo
echo -e "${YELLOW}Step 4: Running API verification (integration mode)...${NC}"
echo
npx ts-node src/scripts/test/verify.ts --mode=integration
VERIFY_EXIT=$?

echo
if [ $VERIFY_EXIT -eq 0 ]; then
  echo -e "${GREEN}========================================${NC}"
  echo -e "${GREEN}  Integration: ALL CHECKS PASSED        ${NC}"
  echo -e "${GREEN}========================================${NC}"
else
  echo -e "${RED}========================================${NC}"
  echo -e "${RED}  Integration: SOME CHECKS FAILED       ${NC}"
  echo -e "${RED}========================================${NC}"
fi

exit $VERIFY_EXIT
