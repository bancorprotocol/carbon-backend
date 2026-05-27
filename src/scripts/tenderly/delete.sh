#!/bin/bash
#
# Deletes a Tenderly VNet that was created by tenderly/create.sh.
#
# Usage:
#   npm run tenderly:delete -- <testnet-id>
#   (or: bash src/scripts/tenderly/delete.sh <testnet-id>)
#
# Prerequisites:
#   - TENDERLY_ACCESS_KEY, TENDERLY_USERNAME, TENDERLY_PROJECT set
#     (in shell env or in any sourced .env)
#

set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(cd "$SCRIPT_DIR/../../.." && pwd)"

# Load .env so TENDERLY_* vars are available without manual export.
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

TESTNET_ID="$1"

if [ -z "$TESTNET_ID" ]; then
  echo -e "${RED}Usage: npm run tenderly:delete -- <testnet-id>${NC}"
  echo
  echo "The testnet ID is printed when you create a testnet, and also stored in .env.tenderly"
  if [ -f "$PROJECT_DIR/.env.tenderly" ]; then
    STORED_ID=$(grep '^TENDERLY_TESTNET_ID=' "$PROJECT_DIR/.env.tenderly" 2>/dev/null | cut -d'=' -f2)
    if [ -n "$STORED_ID" ]; then
      echo -e "  Found in .env.tenderly: ${YELLOW}${STORED_ID}${NC}"
    fi
  fi
  exit 1
fi

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

TENDERLY_TESTNET_API="https://api.tenderly.co/api/v1/account/${TENDERLY_USERNAME}/project/${TENDERLY_PROJECT}/vnets"

echo -e "${YELLOW}Deleting Tenderly testnet ${TESTNET_ID}...${NC}"

HTTP_CODE=$(curl -sX DELETE "${TENDERLY_TESTNET_API}/${TESTNET_ID}" \
  -H "Content-Type: application/json" \
  -H "X-Access-Key: ${TENDERLY_ACCESS_KEY}" \
  -o /dev/null -w "%{http_code}")

if [ "$HTTP_CODE" = "200" ] || [ "$HTTP_CODE" = "204" ]; then
  echo -e "${GREEN}Testnet ${TESTNET_ID} deleted successfully${NC}"

  if [ -f "$PROJECT_DIR/.env.tenderly" ]; then
    STORED_ID=$(grep '^TENDERLY_TESTNET_ID=' "$PROJECT_DIR/.env.tenderly" 2>/dev/null | cut -d'=' -f2)
    if [ "$STORED_ID" = "$TESTNET_ID" ]; then
      rm -f "$PROJECT_DIR/.env.tenderly"
      echo -e "  Removed .env.tenderly"
    fi
  fi
else
  echo -e "${RED}Failed to delete testnet (HTTP ${HTTP_CODE})${NC}"
  exit 1
fi
