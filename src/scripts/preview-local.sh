#!/bin/bash
set -euo pipefail

IMAGE_NAME="carbon-preview:local"
CONTAINER_NAME="carbon-preview-local"
ENV_FILE=".env.preview-local"
HOST_PORT=3000
HOST_PG_PORT=5433

red()   { printf "\033[0;31m%s\033[0m\n" "$*"; }
green() { printf "\033[0;32m%s\033[0m\n" "$*"; }
bold()  { printf "\033[1m%s\033[0m\n" "$*"; }
ts()    { date "+%H:%M:%S"; }

usage() {
  cat <<EOF
Preview Local Docker — test the all-in-one preview image locally

Usage: npm run preview:<command>  (or: bash src/scripts/preview-local.sh <command>)

  Getting started (first time):
    npm run preview:build        Build the Docker image from Dockerfile.preview
    npm run preview:run          Start container + tail logs (Ctrl+C detaches, container stays up)

  Daily workflow:
    npm run preview:rebuild      stop → build → run  (the main iteration loop)
    npm run preview:test         Run 17-check verification (infra, DB data, API endpoints)
    npm run preview:stop         Stop and remove the container

  Debugging:
    npm run preview:logs         Tail container logs
    npm run preview:shell        Open a bash shell inside the container
    npm run preview:db           Open psql to the container's Postgres

  Other:
    npm run preview:start        Like 'run' but fully detached (no log tail)
    npm run preview:status       Show container status + seed progress

  Production (GCE) testing:
    npm run preview:e2e          End-to-end test: builds image, pushes to GCR,
                                 creates a real GCE VM via the preview API.
                                 Requires: gcloud auth + Tenderly credentials.

  Postico / GUI DB access:
    Host: localhost | Port: 5433 | DB: carbon_preview | User: postgres
EOF
  exit "${1:-1}"
}

require_env_file() {
  if [ ! -f "$ENV_FILE" ]; then
    red "Missing $ENV_FILE — copy the template and fill in credentials:"
    echo "  cp .env.preview-local.example .env.preview-local"
    exit 1
  fi
}

is_running() {
  docker inspect -f '{{.State.Running}}' "$CONTAINER_NAME" 2>/dev/null | grep -q true
}

# ---------------------------------------------------------------------------
# build
# ---------------------------------------------------------------------------
cmd_build() {
  bold "[$(ts)] Building preview image: $IMAGE_NAME"
  docker build -f Dockerfile.preview -t "$IMAGE_NAME" .
  green "[$(ts)] Build complete: $IMAGE_NAME"
}

# ---------------------------------------------------------------------------
# run / start
# ---------------------------------------------------------------------------
cmd_run() {
  local detach_only="${1:-false}"
  require_env_file

  if is_running; then
    bold "Container $CONTAINER_NAME is already running."
    bold "Use 'stop' first, or 'rebuild' to stop+build+run."
    exit 1
  fi

  docker rm -f "$CONTAINER_NAME" 2>/dev/null || true

  bold "[$(ts)] Starting container: $CONTAINER_NAME (HTTP=$HOST_PORT, PG=$HOST_PG_PORT)"
  docker run -d \
    --name "$CONTAINER_NAME" \
    --env-file "$ENV_FILE" \
    -p "${HOST_PORT}:3000" \
    -p "${HOST_PG_PORT}:5432" \
    "$IMAGE_NAME"

  green "[$(ts)] Container started."
  echo ""
  echo "  Postico / psql connection:"
  echo "    Host: localhost"
  echo "    Port: $HOST_PG_PORT"
  echo "    Database: carbon_preview"
  echo "    User: postgres"
  echo "    Password: (value of PREVIEW_DB_PASSWORD in $ENV_FILE)"

  if [ "$detach_only" = "true" ]; then
    echo "Container running in background. Use 'logs' to tail output."
  else
    bold "Tailing logs (Ctrl+C to detach — container keeps running)..."
    docker logs -f "$CONTAINER_NAME"
  fi
}

# ---------------------------------------------------------------------------
# stop
# ---------------------------------------------------------------------------
cmd_stop() {
  bold "[$(ts)] Stopping container: $CONTAINER_NAME"
  docker stop "$CONTAINER_NAME" 2>/dev/null || true
  docker rm "$CONTAINER_NAME" 2>/dev/null || true
  green "[$(ts)] Container stopped and removed."
}

# ---------------------------------------------------------------------------
# rebuild
# ---------------------------------------------------------------------------
cmd_rebuild() {
  cmd_stop
  cmd_build
  cmd_run
}

# ---------------------------------------------------------------------------
# logs
# ---------------------------------------------------------------------------
cmd_logs() {
  docker logs -f "$CONTAINER_NAME"
}

# ---------------------------------------------------------------------------
# shell
# ---------------------------------------------------------------------------
cmd_shell() {
  docker exec -it "$CONTAINER_NAME" bash
}

# ---------------------------------------------------------------------------
# db
# ---------------------------------------------------------------------------
cmd_db() {
  docker exec -it "$CONTAINER_NAME" su-exec postgres psql -d carbon_preview
}

# ---------------------------------------------------------------------------
# status
# ---------------------------------------------------------------------------
cmd_status() {
  if is_running; then
    green "Container $CONTAINER_NAME is RUNNING"
    docker inspect -f 'Created: {{.Created}}' "$CONTAINER_NAME"
    docker inspect -f 'Ports: {{.NetworkSettings.Ports}}' "$CONTAINER_NAME"

    if docker exec "$CONTAINER_NAME" test -f /tmp/seed-complete 2>/dev/null; then
      green "  Seed: COMPLETE"
    elif docker exec "$CONTAINER_NAME" test -f /tmp/seed-failed 2>/dev/null; then
      red "  Seed: FAILED"
    else
      echo "  Seed: IN PROGRESS or not started"
    fi
  else
    red "Container $CONTAINER_NAME is NOT running."
  fi
}

# ---------------------------------------------------------------------------
# test — comprehensive verification
# ---------------------------------------------------------------------------
PASS=0
FAIL=0

check() {
  local label="$1"
  local result="$2"
  local expected="$3"

  if [ "$result" = "$expected" ]; then
    green "  PASS: $label"
    PASS=$((PASS + 1))
  else
    red "  FAIL: $label (got: '$result', expected: '$expected')"
    FAIL=$((FAIL + 1))
  fi
}

check_count() {
  local label="$1"
  local table="$2"
  local count
  count=$(docker exec "$CONTAINER_NAME" su-exec postgres psql -d carbon_preview -tAc "SELECT COUNT(*) FROM $table" 2>/dev/null | tr -d '[:space:]')

  if [ -n "$count" ] && [ "$count" -gt 0 ] 2>/dev/null; then
    green "  PASS: $label — $count rows"
    PASS=$((PASS + 1))
  else
    red "  FAIL: $label — $count rows (expected > 0)"
    FAIL=$((FAIL + 1))
  fi
}

cmd_test() {
  PASS=0
  FAIL=0

  if ! is_running; then
    red "Container $CONTAINER_NAME is not running. Start it first with 'run'."
    exit 1
  fi

  bold "=== Preview Container Verification ==="
  echo ""

  # --- Infrastructure ---
  bold "1. Infrastructure"

  local pg_ready
  pg_ready=$(docker exec "$CONTAINER_NAME" su-exec postgres pg_isready 2>/dev/null | grep -c "accepting connections" || echo "0")
  if [ "$pg_ready" -gt 0 ] 2>/dev/null; then
    green "  PASS: PostgreSQL is ready"
    PASS=$((PASS + 1))
  else
    red "  FAIL: PostgreSQL is not accepting connections"
    FAIL=$((FAIL + 1))
  fi

  local ts_ext
  ts_ext=$(docker exec "$CONTAINER_NAME" su-exec postgres psql -d carbon_preview -tAc \
    "SELECT extname FROM pg_extension WHERE extname='timescaledb'" 2>/dev/null | tr -d '[:space:]')
  check "TimescaleDB extension loaded" "$ts_ext" "timescaledb"

  local redis_pong
  redis_pong=$(docker exec "$CONTAINER_NAME" redis-cli ping 2>/dev/null | tr -d '[:space:]')
  check "Redis responding" "$redis_pong" "PONG"

  local http_code
  http_code=$(curl -s -o /dev/null -w "%{http_code}" "http://localhost:${HOST_PORT}/" 2>/dev/null || echo "000")
  if [ "$http_code" = "200" ] || [ "$http_code" = "302" ]; then
    green "  PASS: NestJS HTTP responds ($http_code)"
    PASS=$((PASS + 1))
  else
    red "  FAIL: NestJS HTTP responds (got: $http_code, expected: 200 or 302)"
    FAIL=$((FAIL + 1))
  fi

  # Seed marker
  if docker exec "$CONTAINER_NAME" test -f /tmp/seed-complete 2>/dev/null; then
    green "  PASS: Seed completed marker present"
    PASS=$((PASS + 1))
  elif docker exec "$CONTAINER_NAME" test -f /tmp/seed-failed 2>/dev/null; then
    red "  FAIL: Seed FAILED (check logs: bash src/scripts/preview-local.sh logs)"
    FAIL=$((FAIL + 1))
  else
    echo "  WARN: No seed marker found (seed may still be running)"
  fi

  echo ""

  # --- Database Content ---
  bold "2. Database Content (seeded data)"

  check_count "blocks" "blocks"
  check_count "tokens" "tokens"
  check_count "pairs" "pairs"
  check_count "strategies" "strategies"
  check_count "strategy-realtime" '"strategy-realtime"'
  check_count "historic-quotes" '"historic-quotes"'
  check_count "quotes" "quotes"
  check_count "last_processed_block" "last_processed_block"

  # Verify LPB block matches fork block (resolved inside container at /tmp/preview-env)
  local fork_block
  fork_block=$(docker exec "$CONTAINER_NAME" sh -c 'grep "^FORK_BLOCK_NUMBER=" /tmp/preview-env 2>/dev/null | cut -d= -f2-' | tr -d '[:space:]')
  [ -z "$fork_block" ] && fork_block=$(grep '^FORK_BLOCK_NUMBER=' "$ENV_FILE" 2>/dev/null | cut -d= -f2- | tr -d '[:space:]')
  if [ -n "$fork_block" ]; then
    local lpb_block
    lpb_block=$(docker exec "$CONTAINER_NAME" su-exec postgres psql -d carbon_preview -tAc \
      "SELECT block FROM last_processed_block LIMIT 1" 2>/dev/null | tr -d '[:space:]')
    if [ "$lpb_block" = "$fork_block" ]; then
      green "  PASS: last_processed_block.block = $fork_block (matches FORK_BLOCK_NUMBER)"
      PASS=$((PASS + 1))
    else
      red "  FAIL: last_processed_block.block = $lpb_block (expected $fork_block)"
      FAIL=$((FAIL + 1))
    fi
  fi

  echo ""

  # --- API Endpoints ---
  bold "3. API Endpoints"

  local deployment
  deployment=$(docker exec "$CONTAINER_NAME" sh -c 'grep "^PREVIEW_DEPLOYMENT=" /tmp/preview-env 2>/dev/null | cut -d= -f2-' | tr -d '[:space:]')
  [ -z "$deployment" ] && deployment=$(grep '^PREVIEW_DEPLOYMENT=' "$ENV_FILE" 2>/dev/null | cut -d= -f2- | tr -d '[:space:]')
  deployment="${deployment:-ethereum}"

  local base="http://localhost:${HOST_PORT}"

  check_api() {
    local label="$1"
    local url="$2"
    local body
    local code

    code=$(curl -s -o /tmp/preview-test-response.json -w "%{http_code}" "$url" 2>/dev/null || echo "000")
    body=$(cat /tmp/preview-test-response.json 2>/dev/null || echo "")

    if [ "$code" = "000" ]; then
      red "  FAIL: $label — connection refused"
      FAIL=$((FAIL + 1))
      return
    fi

    if [ "$code" -ge 400 ] 2>/dev/null; then
      red "  FAIL: $label — HTTP $code"
      FAIL=$((FAIL + 1))
      return
    fi

    local length
    length=$(echo "$body" | python3 -c "import sys,json; d=json.load(sys.stdin); print(len(d) if isinstance(d,list) else 1)" 2>/dev/null || echo "0")

    if [ "$length" -gt 0 ] 2>/dev/null; then
      green "  PASS: $label — HTTP $code, $length items"
      PASS=$((PASS + 1))
    else
      red "  FAIL: $label — HTTP $code but empty response"
      FAIL=$((FAIL + 1))
    fi
  }

  check_api "GET /v1/${deployment}/strategies" "${base}/v1/${deployment}/strategies"
  check_api "GET /v1/${deployment}/tokens"     "${base}/v1/${deployment}/tokens"
  check_api "GET /v1/${deployment}/coingecko/pairs" "${base}/v1/${deployment}/coingecko/pairs"

  echo ""

  # --- Summary ---
  bold "=== Results: $PASS passed, $FAIL failed ==="
  if [ "$FAIL" -gt 0 ]; then
    red "Some checks failed. Debug with:"
    echo "  bash src/scripts/preview-local.sh logs    # container logs"
    echo "  bash src/scripts/preview-local.sh db      # psql into container PG"
    echo "  bash src/scripts/preview-local.sh shell   # bash into container"
    exit 1
  else
    green "All checks passed!"
  fi
}

# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------
case "${1:-}" in
  build)   cmd_build ;;
  run)     cmd_run ;;
  start)   cmd_run true ;;
  test)    cmd_test ;;
  stop)    cmd_stop ;;
  rebuild) cmd_rebuild ;;
  logs)    cmd_logs ;;
  shell)   cmd_shell ;;
  db)      cmd_db ;;
  status)  cmd_status ;;
  help)    usage 0 ;;
  *)       usage ;;
esac
