#!/usr/bin/env sh
set -eu

APP_DIR="${APP_DIR:-/var/www/bookora-api}"
IMAGE_TAG="${IMAGE_TAG:-latest}"
HEALTH_URL="${HEALTH_URL:-http://localhost:3000/api/v1/health}"
FALLBACK_HEALTH_URL="${FALLBACK_HEALTH_URL:-http://localhost:3000/api/health}"

cd "$APP_DIR"

if [ ! -f docker-compose.yml ]; then
  echo "docker-compose.yml is missing in $APP_DIR"
  exit 1
fi

if [ ! -f .env.production ]; then
  echo ".env.production is missing in $APP_DIR"
  exit 1
fi

echo "Deploying ptxuan/bookora-api:$IMAGE_TAG"

export IMAGE_TAG

docker compose --env-file .env.production pull backend
docker compose --env-file .env.production up -d minio

echo "Running Prisma migrations"
docker compose --env-file .env.production run --rm --no-deps backend \
  npx prisma migrate deploy --schema=prisma/schema

echo "Restarting backend"
docker compose --env-file .env.production up -d --no-deps backend

echo "Waiting for backend health check"
healthy=0
for i in $(seq 1 30); do
  if curl -fsS "$HEALTH_URL" || curl -fsS "$FALLBACK_HEALTH_URL"; then
    healthy=1
    break
  fi

  echo "Backend not ready yet... $i/30"
  sleep 3
done

if [ "$healthy" -ne 1 ]; then
  echo "Backend health check failed"
  docker compose --env-file .env.production ps
  docker logs nestjs-backend --tail 100
  exit 1
fi

docker image prune -af --filter "until=168h"
echo "Deploy completed"
