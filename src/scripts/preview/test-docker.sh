#!/bin/bash
set -e

echo "=== Preview Docker Image Smoke Test ==="

IMAGE_NAME="carbon-preview-test"
CONTAINER_NAME="preview-smoke-test"

cleanup() {
  echo "Cleaning up..."
  docker stop "$CONTAINER_NAME" 2>/dev/null || true
  docker rm "$CONTAINER_NAME" 2>/dev/null || true
}
trap cleanup EXIT

echo "1. Building preview image..."
docker build -f Dockerfile.preview -t "$IMAGE_NAME" .

echo "2. Starting container (skip seed)..."
docker run -d --name "$CONTAINER_NAME" \
  -e SKIP_SEED=1 \
  -e DATABASE_URL=postgresql://postgres:postgres@localhost:5432/carbon_preview \
  -e REDIS_URL=redis://localhost:6379 \
  -e PREVIEW_DEPLOYMENT=ethereum \
  -e IS_FORK=1 \
  -e FORK_BLOCK_NUMBER=20000000 \
  -e SHOULD_HARVEST=0 \
  -e SEND_NOTIFICATIONS=0 \
  -e ETHEREUM_RPC_ENDPOINT=https://eth-mainnet.g.alchemy.com/v2/demo \
  -p 3000:3000 \
  "$IMAGE_NAME"

echo "3. Waiting for container to start (max 120s)..."
for i in $(seq 1 60); do
  if curl -sf http://localhost:3000/ > /dev/null 2>&1; then
    echo "   NestJS is responding! (after ~${i}x2 seconds)"
    break
  fi
  if [ "$i" -eq 60 ]; then
    echo "FAIL: NestJS did not start within 120 seconds"
    docker logs "$CONTAINER_NAME"
    exit 1
  fi
  sleep 2
done

echo "4. Checking PostgreSQL..."
docker exec "$CONTAINER_NAME" su-exec postgres pg_isready
if [ $? -eq 0 ]; then
  echo "   PASS: PostgreSQL is running"
else
  echo "   FAIL: PostgreSQL is not running"
  exit 1
fi

echo "5. Checking Redis..."
REDIS_PONG=$(docker exec "$CONTAINER_NAME" redis-cli ping)
if [ "$REDIS_PONG" = "PONG" ]; then
  echo "   PASS: Redis is running"
else
  echo "   FAIL: Redis is not running (got: $REDIS_PONG)"
  exit 1
fi

echo "6. Checking TimescaleDB extension..."
TS_EXT=$(docker exec "$CONTAINER_NAME" su-exec postgres psql -d carbon_preview -tAc "SELECT extname FROM pg_extension WHERE extname='timescaledb'")
if [ "$TS_EXT" = "timescaledb" ]; then
  echo "   PASS: TimescaleDB extension is loaded"
else
  echo "   FAIL: TimescaleDB extension not found"
  exit 1
fi

echo "7. Checking NestJS HTTP response..."
HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" http://localhost:3000/)
if [ "$HTTP_CODE" = "200" ] || [ "$HTTP_CODE" = "302" ]; then
  echo "   PASS: NestJS responds with HTTP $HTTP_CODE"
else
  echo "   FAIL: NestJS returned HTTP $HTTP_CODE"
  exit 1
fi

echo ""
echo "=== All smoke tests passed! ==="
