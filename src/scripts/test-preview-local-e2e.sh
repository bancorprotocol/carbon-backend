#!/bin/bash
set -e

#
# Local E2E test for the preview backend system.
# Starts the NestJS server locally, creates a preview backend using
# a real Tenderly testnet, and leaves the GCE VM running for inspection.
#
# Prerequisites:
#   - gcloud auth application-default login (for GCE API access)
#   - A local .env file with DATABASE_URL, REDIS_URL, Tenderly credentials, etc.
#   - The preview Docker image already pushed to Artifact Registry
#
# Usage:
#   bash src/scripts/test-preview-local-e2e.sh
#

TENDERLY_ID="59f398f1-ee7e-4fa6-89d0-53e456145b7b"
API_PORT=3000
API_URL="http://localhost:${API_PORT}"
SERVER_PID=""

# --- Helpers ---

red()   { echo -e "\033[0;31m$*\033[0m"; }
green() { echo -e "\033[0;32m$*\033[0m"; }
bold()  { echo -e "\033[1m$*\033[0m"; }

cleanup() {
  if [ -n "$SERVER_PID" ]; then
    echo ""
    bold "Stopping local server (PID $SERVER_PID)..."
    kill "$SERVER_PID" 2>/dev/null || true
    wait "$SERVER_PID" 2>/dev/null || true
  fi
}
trap cleanup EXIT

fail() { red "FAIL: $1"; exit 1; }

# --- Source .env (the server loads it via dotenv, but we need Tenderly vars for preflight) ---

if [ -f .env ]; then
  export TENDERLY_ACCESS_KEY=$(grep '^TENDERLY_ACCESS_KEY=' .env | cut -d= -f2-)
  TENDERLY_USERNAME=$(grep '^TENDERLY_USERNAME=' .env | cut -d= -f2-)
  TENDERLY_PROJECT=$(grep '^TENDERLY_PROJECT=' .env | cut -d= -f2-)
fi

export TENDERLY_ACCOUNT_SLUG="${TENDERLY_ACCOUNT_SLUG:-${TENDERLY_USERNAME}}"
export TENDERLY_PROJECT_SLUG="${TENDERLY_PROJECT_SLUG:-${TENDERLY_PROJECT}}"

# --- Preflight checks ---

bold "=== Preview Backend Local E2E Test ==="
echo "Tenderly ID: ${TENDERLY_ID}"
echo ""

bold "Preflight checks..."

# Tenderly credentials
[ -z "$TENDERLY_ACCESS_KEY" ] && fail "TENDERLY_ACCESS_KEY not set (check .env)"
[ -z "$TENDERLY_ACCOUNT_SLUG" ] && fail "TENDERLY_ACCOUNT_SLUG / TENDERLY_USERNAME not set (check .env)"
[ -z "$TENDERLY_PROJECT_SLUG" ] && fail "TENDERLY_PROJECT_SLUG / TENDERLY_PROJECT not set (check .env)"
green "  Tenderly credentials: account=${TENDERLY_ACCOUNT_SLUG} project=${TENDERLY_PROJECT_SLUG}"

# GCE credentials
if ! gcloud auth application-default print-access-token &>/dev/null; then
  fail "No GCE credentials. Run: gcloud auth application-default login"
fi
green "  GCE credentials valid"

# Verify the Tenderly testnet exists
echo "  Verifying Tenderly testnet ${TENDERLY_ID}..."
TENDERLY_BASE="https://api.tenderly.co/api/v1/account/${TENDERLY_ACCOUNT_SLUG}/project/${TENDERLY_PROJECT_SLUG}"
VNET_RESPONSE=$(curl -sf \
  -H "X-Access-Key: ${TENDERLY_ACCESS_KEY}" \
  "${TENDERLY_BASE}/vnets/${TENDERLY_ID}" 2>/dev/null) || fail "Tenderly testnet ${TENDERLY_ID} not found. Is it still active?"

FORK_BLOCK=$(echo "$VNET_RESPONSE" | jq -r '.fork_config.block_number // "unknown"')
NETWORK_ID=$(echo "$VNET_RESPONSE" | jq -r '.fork_config.network_id // "unknown"')
green "  Tenderly testnet verified: network=${NETWORK_ID}, fork_block=${FORK_BLOCK}"

# --- Build the preview Docker image ---

echo ""
bold "Step 1: Building and pushing preview Docker image..."
npm run gcloud:build:preview > /tmp/preview-e2e-docker-build.log 2>&1 || {
  red "  Docker image build failed. See /tmp/preview-e2e-docker-build.log"
  tail -20 /tmp/preview-e2e-docker-build.log
  fail "Docker image build failed"
}
green "  Preview Docker image pushed"

# --- Build and start the local server ---

echo ""
bold "Step 2: Building and starting local server with ENABLE_PREVIEW_API=1..."

export ENABLE_PREVIEW_API=1

# Point to ADC user credentials instead of the service account key from .env,
# which lacks compute permissions. We must export (not unset) because dotenv
# only skips variables already present in the environment.
export GOOGLE_APPLICATION_CREDENTIALS="${HOME}/.config/gcloud/application_default_credentials.json"

echo "  Building..."
npm run build > /tmp/preview-e2e-build.log 2>&1 || {
  red "  Build failed. See /tmp/preview-e2e-build.log"
  tail -20 /tmp/preview-e2e-build.log
  fail "Build failed"
}
green "  Build complete"

TZ=UTC node dist/main.js > /tmp/preview-e2e-server.log 2>&1 &
SERVER_PID=$!

echo "  Server PID: ${SERVER_PID}"
echo "  Log file: /tmp/preview-e2e-server.log"
echo "  Waiting for server to be ready..."

for i in $(seq 1 90); do
  if curl -sf "${API_URL}/" &>/dev/null; then
    green "  Server ready after ~${i}s"
    break
  fi
  if ! kill -0 "$SERVER_PID" 2>/dev/null; then
    echo ""
    red "Server process died during startup. Last 30 lines of log:"
    tail -30 /tmp/preview-e2e-server.log
    fail "Server crashed"
  fi
  sleep 1
done

if ! curl -sf "${API_URL}/" &>/dev/null; then
  echo ""
  red "Server not ready after 90s. Last 30 lines of log:"
  tail -30 /tmp/preview-e2e-server.log
  fail "Server startup timeout"
fi

# --- Create preview backend ---

echo ""
bold "Step 3: POST /preview/backends (tenderlyId: ${TENDERLY_ID})..."

HTTP_CODE=$(curl -s -o /tmp/preview-e2e-response.json -w "%{http_code}" \
  -X POST "${API_URL}/preview/backends" \
  -H "Content-Type: application/json" \
  -d "{\"tenderlyId\": \"${TENDERLY_ID}\"}")

RESPONSE=$(cat /tmp/preview-e2e-response.json)

if [ "$HTTP_CODE" -ge 400 ]; then
  red "  API returned HTTP ${HTTP_CODE}:"
  echo "$RESPONSE" | jq . 2>/dev/null || echo "$RESPONSE"
  echo ""
  red "Last 20 lines of server log:"
  tail -20 /tmp/preview-e2e-server.log
  fail "POST /preview/backends failed"
fi

echo "$RESPONSE" | jq .

PREVIEW_URL=$(echo "$RESPONSE" | jq -r '.url')
STATUS=$(echo "$RESPONSE" | jq -r '.status')
DEPLOYMENT=$(echo "$RESPONSE" | jq -r '.deployment')

echo ""
echo "  URL:        ${PREVIEW_URL}"
echo "  Status:     ${STATUS}"
echo "  Deployment: ${DEPLOYMENT}"

if [ "$STATUS" != "creating" ] && [ "$STATUS" != "existing" ]; then
  fail "Unexpected status: ${STATUS}"
fi
green "  Preview backend creation initiated"

# --- Poll for status ---

echo ""
bold "Step 4: Polling GET /preview/backends/${TENDERLY_ID} until ready (max ~10 min)..."

FINAL_STATUS=""
for i in $(seq 1 60); do
  POLL=$(curl -sf "${API_URL}/preview/backends/${TENDERLY_ID}" 2>/dev/null || echo '{"status":"fetch_error"}')
  POLL_STATUS=$(echo "$POLL" | jq -r '.status')

  if [ "$POLL_STATUS" = "ready" ]; then
    green "  Ready after ~$((i * 10))s"
    FINAL_STATUS="ready"
    break
  fi

  if [ "$POLL_STATUS" = "error" ]; then
    red "  Backend entered error state:"
    echo "$POLL" | jq .
    FINAL_STATUS="error"
    break
  fi

  echo "  [$i/60] status=${POLL_STATUS} (waiting 10s...)"
  sleep 10
done

echo ""
bold "Step 5: Final state"

FINAL_RESPONSE=$(curl -sf "${API_URL}/preview/backends/${TENDERLY_ID}" 2>/dev/null || echo '{}')
echo "$FINAL_RESPONSE" | jq .

FINAL_URL=$(echo "$FINAL_RESPONSE" | jq -r '.url')
FINAL_STATUS=$(echo "$FINAL_RESPONSE" | jq -r '.status')

echo ""
if [ "$FINAL_STATUS" = "ready" ]; then
  green "=== SUCCESS ==="
  echo ""
  echo "The preview VM is running and serving at:"
  bold "  ${FINAL_URL}"
  echo ""
  echo "The VM is harvesting Tenderly testnet ${TENDERLY_ID}"
  echo "(fork_block: ${FORK_BLOCK}, network: ${NETWORK_ID})"
else
  bold "Status: ${FINAL_STATUS}"
  echo "The GCE VM may still be starting up (pulling image, seeding data)."
  echo ""
  if [ -n "$FINAL_URL" ] && [ "$FINAL_URL" != "null" ]; then
    echo "Preview URL (may not respond yet):"
    bold "  ${FINAL_URL}"
  fi
fi

echo ""
echo "--- Useful commands ---"
echo ""
echo "Check the VM:"
echo "  gcloud compute instances list --filter='name~carbon-prev' --project=bancor-api"
echo ""
echo "SSH into the VM:"
echo "  gcloud compute ssh <instance-name> --project=bancor-api --zone=europe-west2-b"
echo ""
echo "Delete the preview (via API while server runs):"
echo "  curl -X DELETE ${API_URL}/preview/backends/${TENDERLY_ID}"
echo ""
echo "Delete the VM directly:"
echo "  gcloud compute instances delete <instance-name> --project=bancor-api --zone=europe-west2-b"
echo ""
bold "NOTE: The GCE VM has NOT been deleted. It will auto-clean after 48h."
echo ""
echo "Stopping local server..."
