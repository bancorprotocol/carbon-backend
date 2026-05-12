#!/bin/bash
set -u
set -o pipefail

#
# Manual E2E test for PreviewProxyController.
#
# Stands up:
#   - a Node mock "upstream" that simulates a preview backend
#       (returns JSON, sets Set-Cookie, sends Location redirects,
#        sends a weak Content-Security-Policy, and exposes Swagger-like HTML at "/")
#   - the carbon-backend NestJS server with ENABLE_PREVIEW_API=1
#   - a preview_backends row pointing at the mock upstream (status=ready)
#
# Then exercises the proxy through real Express + NestJS routing, asserting:
#   - normal GET / POST forwarding
#   - path-traversal segments are rejected with 400
#   - upstream Set-Cookie / Location are NOT forwarded
#   - X-Content-Type-Options: nosniff is always set
#   - Content-Security-Policy is forced to a strict policy (cannot be weakened by upstream)
#   - HTML/Swagger root cannot be reached via traversal
#   - unknown tenderlyId -> 404, status!=ready -> 503
#
# Prereqs:
#   - postgres at localhost:5432, database "activityv2", with preview_backends table
#   - redis at localhost:6379
#   - node + npm + curl + jq + psql installed
#
# Usage:
#   bash src/scripts/test-preview-proxy-e2e.sh
#

API_PORT="${API_PORT:-3099}"
UPSTREAM_PORT="${UPSTREAM_PORT:-4799}"
DB_URL="${DATABASE_URL:-postgresql://localhost/activityv2}"

API_URL="http://localhost:${API_PORT}"
UPSTREAM_URL="http://127.0.0.1:${UPSTREAM_PORT}"
TENDERLY_ID="proxy-e2e-$(date +%s)"
TENDERLY_ID_NOT_READY="proxy-e2e-not-ready-$(date +%s)"
SERVER_PID=""
UPSTREAM_PID=""

LOG_DIR="/tmp"
SERVER_LOG="${LOG_DIR}/preview-proxy-e2e-server.log"
UPSTREAM_LOG="${LOG_DIR}/preview-proxy-e2e-upstream.log"

PASS=0
FAIL=0

red()    { printf '\033[0;31m%s\033[0m\n' "$*"; }
green()  { printf '\033[0;32m%s\033[0m\n' "$*"; }
yellow() { printf '\033[0;33m%s\033[0m\n' "$*"; }
bold()   { printf '\033[1m%s\033[0m\n'   "$*"; }

assert_eq() {
  local name="$1" expected="$2" actual="$3"
  if [ "$expected" = "$actual" ]; then
    green "  PASS: ${name}"
    PASS=$((PASS + 1))
  else
    red   "  FAIL: ${name}"
    red   "        expected: ${expected}"
    red   "        actual:   ${actual}"
    FAIL=$((FAIL + 1))
  fi
}

assert_empty() {
  local name="$1" actual="$2"
  if [ -z "$actual" ]; then
    green "  PASS: ${name}"
    PASS=$((PASS + 1))
  else
    red   "  FAIL: ${name}"
    red   "        expected: <empty>"
    red   "        actual:   ${actual}"
    FAIL=$((FAIL + 1))
  fi
}

assert_contains() {
  local name="$1" needle="$2" haystack="$3"
  if printf '%s' "$haystack" | grep -qF -- "$needle"; then
    green "  PASS: ${name}"
    PASS=$((PASS + 1))
  else
    red   "  FAIL: ${name}"
    red   "        expected substring: ${needle}"
    red   "        actual:             ${haystack}"
    FAIL=$((FAIL + 1))
  fi
}

cleanup() {
  echo ""
  bold "Cleanup..."
  if [ -n "$SERVER_PID" ] && kill -0 "$SERVER_PID" 2>/dev/null; then
    echo "  killing API server (pid ${SERVER_PID})"
    kill "$SERVER_PID" 2>/dev/null || true
    wait "$SERVER_PID" 2>/dev/null || true
  fi
  if [ -n "$UPSTREAM_PID" ] && kill -0 "$UPSTREAM_PID" 2>/dev/null; then
    echo "  killing mock upstream (pid ${UPSTREAM_PID})"
    kill "$UPSTREAM_PID" 2>/dev/null || true
    wait "$UPSTREAM_PID" 2>/dev/null || true
  fi
  echo "  removing seeded preview_backends rows"
  psql "$DB_URL" -q -c "DELETE FROM preview_backends WHERE \"tenderlyId\" IN ('${TENDERLY_ID}', '${TENDERLY_ID_NOT_READY}');" >/dev/null 2>&1 || true
}
trap cleanup EXIT

# --- Preflight ---
bold "=== Preview Proxy Controller E2E ==="
echo "API port:      ${API_PORT}"
echo "Upstream port: ${UPSTREAM_PORT}"
echo "DB:            ${DB_URL}"
echo "Tenderly ID:   ${TENDERLY_ID}"
echo ""

command -v psql >/dev/null || { red "psql not installed"; exit 2; }
command -v jq   >/dev/null || { red "jq not installed";   exit 2; }
command -v node >/dev/null || { red "node not installed"; exit 2; }

if ! psql "$DB_URL" -c "SELECT 1" >/dev/null 2>&1; then
  red "Cannot connect to ${DB_URL}"
  exit 2
fi
if ! psql "$DB_URL" -c "SELECT 1 FROM preview_backends LIMIT 0" >/dev/null 2>&1; then
  red "preview_backends table not found in ${DB_URL}; start the API once to run migrations"
  exit 2
fi

# --- 1. Start mock upstream ---
bold "Step 1: starting mock upstream on :${UPSTREAM_PORT}"
PORT="${UPSTREAM_PORT}" node -e '
const http = require("node:http");
const port = Number(process.env.PORT);
const server = http.createServer((req, res) => {
  let body = [];
  req.on("data", (c) => body.push(c));
  req.on("end", () => {
    const raw = Buffer.concat(body).toString("utf8");
    const url = req.url || "/";

    // Echo path that surfaces method, path, headers, and body so tests can assert forwarding.
    if (url.startsWith("/v1/ethereum/strategies")) {
      res.writeHead(200, { "content-type": "application/json", "x-upstream": "yes" });
      res.end(JSON.stringify({ ok: true, route: "strategies", url, method: req.method }));
      return;
    }
    if (url.startsWith("/v1/ethereum/simulator")) {
      res.writeHead(200, { "content-type": "application/json" });
      res.end(JSON.stringify({ ok: true, route: "simulator", method: req.method, body: raw, ct: req.headers["content-type"] || null, auth: req.headers["authorization"] || null }));
      return;
    }
    // Hostile upstream behaviors.
    if (url.startsWith("/v1/ethereum/with-cookie")) {
      res.writeHead(200, { "content-type": "application/json", "set-cookie": "session=evil; Path=/" });
      res.end(JSON.stringify({ planted: true }));
      return;
    }
    if (url.startsWith("/v1/ethereum/redirect")) {
      res.writeHead(302, { location: "https://evil.example.com/" });
      res.end("");
      return;
    }
    if (url.startsWith("/v1/ethereum/weak-csp")) {
      res.writeHead(200, {
        "content-type": "application/json",
        "content-security-policy": "default-src *",
        "x-content-type-options": "sniff-it-please",
      });
      res.end(JSON.stringify({ ok: true }));
      return;
    }
    // Simulate the API root (Swagger UI HTML) so we can assert path-traversal cannot reach it.
    if (url === "/" || url === "") {
      res.writeHead(200, { "content-type": "text/html" });
      res.end("<html><body>SWAGGER UI ROOT</body></html>");
      return;
    }
    res.writeHead(404, { "content-type": "application/json" });
    res.end(JSON.stringify({ notFound: url }));
  });
});
server.listen(port, "127.0.0.1", () => {
  console.log(`mock upstream listening on :${port}`);
});
' > "$UPSTREAM_LOG" 2>&1 &
UPSTREAM_PID=$!
echo "  upstream pid: ${UPSTREAM_PID}, log: ${UPSTREAM_LOG}"

# Wait for upstream
for i in $(seq 1 30); do
  if curl -sf "${UPSTREAM_URL}/v1/ethereum/strategies" >/dev/null 2>&1; then
    green "  upstream ready"
    break
  fi
  sleep 0.2
done
if ! curl -sf "${UPSTREAM_URL}/v1/ethereum/strategies" >/dev/null 2>&1; then
  red "Mock upstream did not become ready"
  cat "$UPSTREAM_LOG" | tail -20
  exit 2
fi

# --- 2. Build & start the API ---
bold "Step 2: building carbon-backend"
npm run build > "${LOG_DIR}/preview-proxy-e2e-build.log" 2>&1 || {
  red "build failed; tail of log:"
  tail -20 "${LOG_DIR}/preview-proxy-e2e-build.log"
  exit 2
}
green "  build complete"

bold "Step 3: starting API on :${API_PORT} with ENABLE_PREVIEW_API=1"
ENABLE_PREVIEW_API=1 \
  PORT="${API_PORT}" \
  NODE_ENV=development \
  TZ=UTC \
  node dist/main.js > "$SERVER_LOG" 2>&1 &
SERVER_PID=$!
echo "  api pid: ${SERVER_PID}, log: ${SERVER_LOG}"

for i in $(seq 1 60); do
  if curl -sf "${API_URL}/" >/dev/null 2>&1; then
    green "  API ready after ~${i}s"
    break
  fi
  if ! kill -0 "$SERVER_PID" 2>/dev/null; then
    red "API process exited during startup; tail of log:"
    tail -40 "$SERVER_LOG"
    exit 2
  fi
  sleep 1
done
if ! curl -sf "${API_URL}/" >/dev/null 2>&1; then
  red "API did not become ready within 60s; tail of log:"
  tail -40 "$SERVER_LOG"
  exit 2
fi

# --- 4. Seed preview_backends rows ---
bold "Step 4: seeding preview_backends rows"
psql "$DB_URL" -q -c "
  INSERT INTO preview_backends
    (\"tenderlyId\", \"instanceName\", \"instanceId\", provider, url, deployment, \"networkId\", \"forkBlock\", \"rpcUrl\", status)
  VALUES
    ('${TENDERLY_ID}',           'mock-ready',     'mock/zone/1', 'gce', '${UPSTREAM_URL}', 'ethereum', 1, 0, '${UPSTREAM_URL}', 'ready'),
    ('${TENDERLY_ID_NOT_READY}', 'mock-creating', 'mock/zone/2', 'gce', '${UPSTREAM_URL}', 'ethereum', 1, 0, '${UPSTREAM_URL}', 'creating');
" >/dev/null
green "  seeded ${TENDERLY_ID} (ready) and ${TENDERLY_ID_NOT_READY} (creating)"

# --- 5. Run assertions ---

# --path-as-is preserves /../ in the URL on the wire; without it curl normalizes the path
# client-side and we can't actually reach the proxy with traversal segments.
curl_status()  { curl --path-as-is -sS -o /dev/null -w '%{http_code}' "$@"; }
curl_body()    { curl --path-as-is -sS "$@"; }
curl_headers() { curl --path-as-is -sS -D - -o /dev/null "$@"; }
header_value() {
  # $1 = full header dump, $2 = header name (case insensitive)
  printf '%s' "$1" | awk -v IGNORECASE=1 -v name="$2" 'BEGIN{IGNORECASE=1} /^\r$/{exit} index(tolower($0), tolower(name) ":")==1 { sub(/^[^:]*:[ \t]*/, ""); sub(/\r$/, ""); print; exit }'
}

echo ""
bold "Step 5: running assertions"

# 5.1 GET success path
# Proxy URL no longer includes a deployment segment — the upstream prefix is
# derived from the seeded record's `deployment` column ('ethereum' here).
PROXY_BASE="${API_URL}/v1/proxy/${TENDERLY_ID}"
echo ""
yellow "Test: GET basic proxied request"
RESP=$(curl_body "${PROXY_BASE}/strategies?page=1")
HEADERS=$(curl_headers "${PROXY_BASE}/strategies?page=1")
assert_eq "status code"        "200"               "$(curl_status "${PROXY_BASE}/strategies?page=1")"
assert_eq "body route"         "strategies"        "$(printf '%s' "$RESP" | jq -r '.route')"
assert_eq "body method"        "GET"               "$(printf '%s' "$RESP" | jq -r '.method')"
assert_eq "upstream saw query" "/v1/ethereum/strategies?page=1" "$(printf '%s' "$RESP" | jq -r '.url')"
assert_eq "upstream header forwarded" "yes"        "$(header_value "$HEADERS" 'x-upstream')"
assert_eq "X-Content-Type-Options" "nosniff"       "$(header_value "$HEADERS" 'x-content-type-options')"
assert_eq "Content-Security-Policy" "default-src 'none'; frame-ancestors 'none'" "$(header_value "$HEADERS" 'content-security-policy')"

# 5.2 POST with JSON body
echo ""
yellow "Test: POST with JSON body and authorization header"
RESP=$(curl_body -X POST -H 'content-type: application/json' -H 'authorization: Bearer test-token' \
  -d '{"amount":"10"}' "${PROXY_BASE}/simulator")
assert_eq "echoed method"  "POST"               "$(printf '%s' "$RESP" | jq -r '.method')"
assert_eq "echoed body"    '{"amount":"10"}'    "$(printf '%s' "$RESP" | jq -r '.body')"
assert_eq "content-type forwarded" "application/json" "$(printf '%s' "$RESP" | jq -r '.ct')"
assert_eq "authorization forwarded" "Bearer test-token" "$(printf '%s' "$RESP" | jq -r '.auth')"

# 5.3 Path traversal in wildcard segment
echo ""
yellow "Test: path traversal in wildcard segment is rejected"
TRAV_STATUS=$(curl_status "${PROXY_BASE}/../../")
TRAV_BODY=$(curl_body   "${PROXY_BASE}/../../")
assert_eq "traversal status" "400" "$TRAV_STATUS"
assert_contains "traversal body mentions invalid path" "Invalid proxy path" "$TRAV_BODY"

# 5.3.b Encoded traversal
echo ""
yellow "Test: percent-encoded traversal segment is rejected"
ENC_STATUS=$(curl_status "${PROXY_BASE}/%2E%2E/%2E%2E/")
assert_eq "encoded traversal status" "400" "$ENC_STATUS"

# 5.3.c Reaching upstream root via traversal returns 400, NOT the upstream HTML
echo ""
yellow "Test: traversal cannot reach upstream HTML root"
TRAV_BODY=$(curl_body "${PROXY_BASE}/../../../")
assert_contains "traversal body is BadRequest, not Swagger HTML" "Invalid proxy path" "$TRAV_BODY"
if printf '%s' "$TRAV_BODY" | grep -q 'SWAGGER UI ROOT'; then
  red   "  FAIL: traversal leaked upstream HTML"
  FAIL=$((FAIL + 1))
else
  green "  PASS: upstream HTML not exposed via traversal"
  PASS=$((PASS + 1))
fi

# 5.4 Set-Cookie stripped
echo ""
yellow "Test: upstream Set-Cookie is stripped"
HEADERS=$(curl_headers "${PROXY_BASE}/with-cookie")
SET_COOKIE=$(header_value "$HEADERS" 'set-cookie')
assert_empty "Set-Cookie absent" "$SET_COOKIE"
assert_eq    "X-Content-Type-Options" "nosniff" "$(header_value "$HEADERS" 'x-content-type-options')"

# 5.5 Location stripped on 3xx
echo ""
yellow "Test: upstream Location on 3xx is stripped"
HEADERS=$(curl_headers "${PROXY_BASE}/redirect")
STATUS=$(curl_status "${PROXY_BASE}/redirect")
LOC=$(header_value "$HEADERS" 'location')
assert_eq    "status forwarded as 302" "302" "$STATUS"
assert_empty "Location absent"               "$LOC"

# 5.6 Weak CSP / sniff override from upstream is replaced with the strict one
echo ""
yellow "Test: upstream cannot weaken CSP / X-Content-Type-Options"
HEADERS=$(curl_headers "${PROXY_BASE}/weak-csp")
assert_eq "CSP forced strict" "default-src 'none'; frame-ancestors 'none'" "$(header_value "$HEADERS" 'content-security-policy')"
assert_eq "X-Content-Type-Options forced" "nosniff" "$(header_value "$HEADERS" 'x-content-type-options')"

# 5.7 Unknown tenderlyId -> 404
echo ""
yellow "Test: unknown tenderlyId returns 404"
assert_eq "unknown id status" "404" "$(curl_status "${API_URL}/v1/proxy/does-not-exist/strategies")"

# 5.8 status != ready -> 503
echo ""
yellow "Test: not-ready preview returns 503"
assert_eq "not-ready status" "503" "$(curl_status "${API_URL}/v1/proxy/${TENDERLY_ID_NOT_READY}/strategies")"

# 5.9 Bare proxy URL (no trailing path) is intentionally not routed
echo ""
yellow "Test: bare proxy URL (no trailing segment) returns 404"
# Express @All('*') doesn't match the bare URL — the proxy only handles
# /v1/proxy/<tenderlyId>/<...>; there is no upstream resource at the bare
# /v1/<deployment> prefix so this is by design.
assert_eq "bare proxy URL status" "404" "$(curl_status "${PROXY_BASE}")"

# --- Summary ---
echo ""
bold "=== Summary ==="
green "  PASS: ${PASS}"
if [ "$FAIL" -gt 0 ]; then
  red "  FAIL: ${FAIL}"
  exit 1
else
  green "  FAIL: 0"
fi
