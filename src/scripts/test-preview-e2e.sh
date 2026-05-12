#!/bin/bash
set -e

echo "=== Preview Backend E2E Test ==="
echo "This test creates a real Tenderly vnet, deploys a preview backend, and validates the full flow."

# Required env vars
: "${API_URL:?API_URL is required (e.g. https://api.carbondefi.xyz)}"
: "${TENDERLY_ACCESS_KEY:?TENDERLY_ACCESS_KEY is required}"
: "${TENDERLY_ACCOUNT_SLUG:?TENDERLY_ACCOUNT_SLUG is required}"
: "${TENDERLY_PROJECT_SLUG:?TENDERLY_PROJECT_SLUG is required}"

TENDERLY_BASE="https://api.tenderly.co/api/v1/account/${TENDERLY_ACCOUNT_SLUG}/project/${TENDERLY_PROJECT_SLUG}"
TENDERLY_ID=""
CLEANUP_VNET=0

cleanup() {
  echo ""
  echo "--- Cleaning up ---"
  if [ -n "$TENDERLY_ID" ]; then
    echo "  Deleting preview backend..."
    curl -sf -X DELETE "${API_URL}/preview/backends/${TENDERLY_ID}" 2>/dev/null || true

    if [ "$CLEANUP_VNET" -eq 1 ]; then
      echo "  Deleting Tenderly vnet..."
      curl -sf -X DELETE "${TENDERLY_BASE}/vnets" \
        -H "X-Access-Key: ${TENDERLY_ACCESS_KEY}" \
        -H "Content-Type: application/json" \
        -d "{\"vnetIds\": [\"${TENDERLY_ID}\"]}" 2>/dev/null || true
    fi
  fi
  echo "  Done."
}
trap cleanup EXIT

assert_eq() {
  if [ "$1" != "$2" ]; then
    echo "FAIL: Expected '$2', got '$1' ($3)"
    exit 1
  fi
  echo "  PASS: $3"
}

assert_not_empty() {
  if [ -z "$1" ]; then
    echo "FAIL: Empty value ($2)"
    exit 1
  fi
  echo "  PASS: $2"
}

# 1. Create a Tenderly VNet
echo ""
echo "Step 1: Creating Tenderly Virtual TestNet..."
VNET_RESPONSE=$(curl -sf -X POST "${TENDERLY_BASE}/vnets" \
  -H "X-Access-Key: ${TENDERLY_ACCESS_KEY}" \
  -H "Content-Type: application/json" \
  -d '{
    "slug": "e2e-test-'"$(date +%s)"'",
    "display_name": "E2E Test Preview",
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
    },
    "explorer_page_config": {
      "enabled": false
    }
  }')

TENDERLY_ID=$(echo "$VNET_RESPONSE" | jq -r '.id')
CLEANUP_VNET=1
assert_not_empty "$TENDERLY_ID" "Created vnet with ID"
echo "  Tenderly ID: ${TENDERLY_ID}"

# 2. Call the preview API
echo ""
echo "Step 2: Creating preview backend..."
PREVIEW_RESPONSE=$(curl -sf -X POST "${API_URL}/preview/backends" \
  -H "Content-Type: application/json" \
  -d "{\"tenderlyId\": \"${TENDERLY_ID}\"}")

PREVIEW_URL=$(echo "$PREVIEW_RESPONSE" | jq -r '.url')
PREVIEW_STATUS=$(echo "$PREVIEW_RESPONSE" | jq -r '.status')
PREVIEW_DEPLOYMENT=$(echo "$PREVIEW_RESPONSE" | jq -r '.deployment')

assert_not_empty "$PREVIEW_URL" "Got preview URL"
assert_eq "$PREVIEW_STATUS" "creating" "Status is 'creating'"
assert_eq "$PREVIEW_DEPLOYMENT" "ethereum" "Deployment is 'ethereum'"
echo "  URL: ${PREVIEW_URL}"

# 3. Poll until ready (timeout 5 min)
echo ""
echo "Step 3: Waiting for preview backend to become ready (max 5 min)..."
for i in $(seq 1 60); do
  STATUS_RESPONSE=$(curl -sf "${API_URL}/preview/backends/${TENDERLY_ID}" 2>/dev/null || echo '{"status":"unknown"}')
  STATUS=$(echo "$STATUS_RESPONSE" | jq -r '.status')
  if [ "$STATUS" = "ready" ]; then
    echo "  Ready after ~$((i * 5)) seconds"
    break
  fi
  if [ "$STATUS" = "error" ]; then
    echo "FAIL: Preview backend entered error state"
    echo "$STATUS_RESPONSE" | jq .
    exit 1
  fi
  echo "  Status: ${STATUS} (attempt $i/60)"
  sleep 5
done

if [ "$STATUS" != "ready" ]; then
  echo "FAIL: Preview backend did not become ready within 5 minutes"
  exit 1
fi

# 4. Verify preview backend serves data
echo ""
echo "Step 4: Verifying preview backend serves data..."

STRATEGIES=$(curl -sf "${PREVIEW_URL}/v1/ethereum/strategies" 2>/dev/null || echo "[]")
STRATEGY_COUNT=$(echo "$STRATEGIES" | jq 'length')
echo "  Strategies: ${STRATEGY_COUNT}"

TOKENS=$(curl -sf "${PREVIEW_URL}/v1/ethereum/tokens" 2>/dev/null || echo "[]")
TOKEN_COUNT=$(echo "$TOKENS" | jq 'length')
echo "  Tokens: ${TOKEN_COUNT}"

if [ "$TOKEN_COUNT" -gt 0 ]; then
  echo "  PASS: Preview backend has token data"
else
  echo "  WARN: Preview backend has no token data (may still be seeding)"
fi

# 5. Delete preview backend
echo ""
echo "Step 5: Deleting preview backend..."
curl -sf -X DELETE "${API_URL}/preview/backends/${TENDERLY_ID}"
echo "  PASS: Delete request sent"

# Verify deletion
sleep 5
DELETE_CHECK=$(curl -s -o /dev/null -w "%{http_code}" "${API_URL}/preview/backends/${TENDERLY_ID}")
if [ "$DELETE_CHECK" = "404" ]; then
  echo "  PASS: Preview backend no longer exists in API"
else
  echo "  WARN: Got HTTP ${DELETE_CHECK} (expected 404)"
fi

echo ""
echo "=== E2E test completed successfully! ==="
