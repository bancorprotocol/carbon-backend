#!/bin/bash

ts() { date "+%Y-%m-%d %H:%M:%S"; }

echo "$(ts) === Preview Backend Startup ==="

# ---------------------------------------------------------------------------
# 0. Resolve Tenderly vnet → RPC endpoint, fork block, deployment
#    If TENDERLY_VNET_ID is set, auto-derive FORK_BLOCK_NUMBER,
#    PREVIEW_DEPLOYMENT, and the chain-specific RPC env var.
# ---------------------------------------------------------------------------
if [ -n "${TENDERLY_VNET_ID}" ]; then
  echo "$(ts) --- Resolving Tenderly vnet: ${TENDERLY_VNET_ID} ---"

  TENDERLY_ACCOUNT="${TENDERLY_ACCOUNT_SLUG:-${TENDERLY_USERNAME}}"
  TENDERLY_PROJECT="${TENDERLY_PROJECT_SLUG:-${TENDERLY_PROJECT}}"

  if [ -z "${TENDERLY_ACCESS_KEY}" ] || [ -z "${TENDERLY_ACCOUNT}" ] || [ -z "${TENDERLY_PROJECT}" ]; then
    echo "$(ts) ERROR: TENDERLY_ACCESS_KEY, TENDERLY_ACCOUNT_SLUG, and TENDERLY_PROJECT_SLUG are required when using TENDERLY_VNET_ID"
    exit 1
  fi

  VNET_URL="https://api.tenderly.co/api/v1/account/${TENDERLY_ACCOUNT}/project/${TENDERLY_PROJECT}/vnets/${TENDERLY_VNET_ID}"
  VNET_JSON=$(curl -sf -H "X-Access-Key: ${TENDERLY_ACCESS_KEY}" "${VNET_URL}")

  if [ -z "${VNET_JSON}" ]; then
    echo "$(ts) ERROR: Failed to fetch Tenderly vnet (check ID and credentials)"
    exit 1
  fi

  RESOLVED=$(python3 -c "
import json, sys

CHAIN_MAP = {
    1:       {'deployment': 'ethereum', 'rpc_var': 'ETHEREUM_RPC_ENDPOINT', 'wss_var': 'ETHEREUM_WSS_ENDPOINT'},
    1329:    {'deployment': 'sei',      'rpc_var': 'SEI_RPC_ENDPOINT',      'wss_var': 'SEI_WSS_ENDPOINT'},
    42220:   {'deployment': 'celo',     'rpc_var': 'CELO_RPC_ENDPOINT',     'wss_var': 'CELO_WSS_ENDPOINT'},
    2632500: {'deployment': 'coti',     'rpc_var': 'COTI_RPC_ENDPOINT',     'wss_var': 'COTI_WSS_ENDPOINT'},
}

vnet = json.loads(sys.stdin.read())
chain_id = vnet['fork_config']['network_id']
block_raw = vnet['fork_config']['block_number']

# Convert hex block number to decimal
if isinstance(block_raw, str) and block_raw.startswith('0x'):
    block = int(block_raw, 16)
else:
    block = int(block_raw)

chain = CHAIN_MAP.get(chain_id)
if not chain:
    print(f'ERROR: unsupported chain_id {chain_id}', file=sys.stderr)
    sys.exit(1)

# Pick the best RPC: prefer HTTPS public over WSS, skip Admin RPC
rpcs = vnet.get('rpcs', [])
rpc_url = ''
for rpc in rpcs:
    url = rpc.get('url', '')
    name = rpc.get('name', '')
    if name == 'Admin RPC':
        continue
    if url.startswith('https://'):
        rpc_url = url
        break
    if not rpc_url:
        rpc_url = url
if not rpc_url and rpcs:
    rpc_url = rpcs[0]['url']

# If only WSS available, convert to HTTPS
if rpc_url.startswith('wss://'):
    rpc_url = rpc_url.replace('wss://', 'https://', 1)

# Find WSS URL for realtime event subscriptions
wss_url = ''
for rpc in rpcs:
    url = rpc.get('url', '')
    if url.startswith('wss://'):
        wss_url = url
        break

print(f\"{chain['rpc_var']}={rpc_url}\")
if wss_url:
    print(f\"{chain['wss_var']}={wss_url}\")
print(f\"FORK_BLOCK_NUMBER={block}\")
print(f\"PREVIEW_DEPLOYMENT={chain['deployment']}\")
" <<< "${VNET_JSON}")

  if [ $? -ne 0 ]; then
    echo "$(ts) ERROR: Failed to parse Tenderly vnet response"
    exit 1
  fi

  while IFS= read -r line; do
    [ -n "$line" ] && export "$line"
  done <<< "${RESOLVED}"
  export IS_FORK=1

  echo "$(ts)   Resolved from Tenderly vnet:"
  echo "${RESOLVED}" | while IFS= read -r line; do echo "$(ts)     ${line}"; done
fi

# Persist resolved config so `docker exec` and tests can read it
cat > /tmp/preview-env <<ENVEOF
PREVIEW_DEPLOYMENT=${PREVIEW_DEPLOYMENT}
FORK_BLOCK_NUMBER=${FORK_BLOCK_NUMBER}
ENVEOF

echo "$(ts) PREVIEW_DEPLOYMENT=${PREVIEW_DEPLOYMENT}"
echo "$(ts) FORK_BLOCK_NUMBER=${FORK_BLOCK_NUMBER}"

# URL-encode the DB password so special chars (+, /, @, etc.) don't break the connection string
ENCODED_DB_PASSWORD=$(python3 -c "import urllib.parse; print(urllib.parse.quote('${PREVIEW_DB_PASSWORD}', safe=''))")
export DATABASE_URL="postgresql://postgres:${ENCODED_DB_PASSWORD}@localhost:5432/carbon_preview"

# 1. Initialize and start PostgreSQL
echo "$(ts) --- Initializing PostgreSQL ---"
if [ ! -s "$PGDATA/PG_VERSION" ]; then
  su-exec postgres initdb -D "$PGDATA"
  echo "host all all 0.0.0.0/0 scram-sha-256" >> "$PGDATA/pg_hba.conf"
  cat >> "$PGDATA/postgresql.conf" <<PGCONF
listen_addresses='*'
shared_buffers = 256MB
max_wal_size = 256MB
min_wal_size = 64MB
checkpoint_completion_target = 0.5
wal_level = minimal
max_wal_senders = 0
temp_file_limit = 256MB
work_mem = 16MB
maintenance_work_mem = 128MB
shared_preload_libraries = 'timescaledb,pg_prewarm'
pg_prewarm.autoprewarm = on
PGCONF
fi

su-exec postgres pg_ctl start -D "$PGDATA" -w -t 60
su-exec postgres psql -c "ALTER USER postgres PASSWORD '${PREVIEW_DB_PASSWORD}';"
su-exec postgres createdb carbon_preview 2>/dev/null || true
su-exec postgres psql -d carbon_preview -c "CREATE EXTENSION IF NOT EXISTS timescaledb;" 2>/dev/null || true
echo "$(ts) PostgreSQL ready"

# 2. Start Redis
echo "$(ts) --- Starting Redis ---"
redis-server --daemonize yes
echo "$(ts) Redis ready"

# 3. Run migrations
echo "$(ts) --- Running Migrations ---"
cd /usr/src/app
if ! npx typeorm-ts-node-commonjs migration:run -d src/typeorm.config.ts; then
  echo "$(ts) ERROR: Migrations failed"
  touch /tmp/seed-failed
fi

# 4. Seed from production DB (skip if SKIP_SEED=1 for testing)
if [ "${SKIP_SEED}" != "1" ]; then
  echo "$(ts) --- Seeding from Production DB ---"
  if npx ts-node -r tsconfig-paths/register src/preview/seed-preview.ts; then
    echo "$(ts) Seed completed successfully"
    touch /tmp/seed-complete
  else
    echo "$(ts) ERROR: Seed failed (see output above)"
    touch /tmp/seed-failed
  fi
else
  echo "$(ts) --- Skipping seed (SKIP_SEED=1) ---"
  touch /tmp/seed-complete
fi

# 5. Reclaim disk — the bulk inserts generate large WAL files
echo "$(ts) --- Compacting database ---"
su-exec postgres psql -d carbon_preview -c "VACUUM ANALYZE;" 2>/dev/null
su-exec postgres psql -d carbon_preview -c "CHECKPOINT;" 2>/dev/null
echo "$(ts) Compaction done"

# 5b. Prewarm hot-path tables + indexes into shared_buffers, then dump the
#     buffer map so autoprewarm restores it when supervisord restarts PG.
echo "$(ts) --- Prewarming database ---"
su-exec postgres psql -d carbon_preview -q -f /usr/src/app/prewarm.sql
su-exec postgres psql -d carbon_preview -q -c "SELECT autoprewarm_dump_now();"
echo "$(ts) Prewarm complete (autoprewarm dump saved)"

# 6. Stop the temporary PostgreSQL (supervisord will manage it)
echo "$(ts) --- Stopping temporary services (supervisord will restart them) ---"
su-exec postgres pg_ctl stop -D "$PGDATA" -m fast -w
redis-cli shutdown 2>/dev/null || true

# 6. Start everything via supervisord
echo "$(ts) --- Starting supervisord ---"
exec supervisord -c /etc/supervisord.conf
