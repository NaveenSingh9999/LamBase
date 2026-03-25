#!/data/data/com.termux/files/usr/bin/bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

if [[ "${PREFIX:-}" != "/data/data/com.termux/files/usr" ]]; then
  echo "This script is intended for Termux only."
  exit 1
fi

echo "[1/8] Updating Termux packages..."
pkg update -y
pkg upgrade -y

echo "[2/8] Installing dependencies..."
pkg install -y git curl nodejs-lts golang postgresql openssl-tool

PGDATA_DIR="$PREFIX/var/lib/postgresql"
PGLOG_DIR="$PREFIX/var/log"
PGLOG_FILE="$PGLOG_DIR/postgresql.log"

mkdir -p "$PGDATA_DIR" "$PGLOG_DIR"

if [[ ! -f "$PGDATA_DIR/PG_VERSION" ]]; then
  echo "[3/8] Initializing PostgreSQL data directory..."
  initdb "$PGDATA_DIR"
else
  echo "[3/8] PostgreSQL data directory already initialized."
fi

echo "[4/8] Starting PostgreSQL..."
if ! pg_ctl -D "$PGDATA_DIR" status >/dev/null 2>&1; then
  pg_ctl -D "$PGDATA_DIR" -l "$PGLOG_FILE" start
  sleep 2
fi

echo "[5/8] Ensuring role/database/extension..."
if ! psql -tAc "SELECT 1 FROM pg_roles WHERE rolname='postgres'" postgres | grep -q 1; then
  psql postgres -c "CREATE ROLE postgres WITH LOGIN SUPERUSER PASSWORD 'postgres';"
fi
if ! psql -tAc "SELECT 1 FROM pg_database WHERE datname='lambase'" postgres | grep -q 1; then
  createdb -O postgres lambase
fi
psql -d lambase -c "CREATE EXTENSION IF NOT EXISTS pgcrypto;"

echo "[6/8] Creating .env if missing..."
if [[ ! -f .env ]]; then
  JWT_SECRET="$(openssl rand -hex 32 2>/dev/null || date +%s%N | sha256sum | awk '{print $1}')"
  cat > .env <<EOF
PORT=3000
DATABASE_URL=postgres://postgres:postgres@127.0.0.1:5432/lambase?sslmode=disable
JWT_SECRET=${JWT_SECRET}
DASHBOARD_AUTH_DB_PATH=lambase_dashboard_auth.db
DASHBOARD_SESSION_HOURS=24
DASHBOARD_LOCKOUT_MINUTES=15
EOF
fi

echo "[7/8] Building LamBase bootstrap binary..."
go mod tidy
go build -o lambase-bootstrap ./cmd/lambase-bootstrap

echo "[8/8] Preparing frontend/backend artifacts..."
./lambase-bootstrap --prepare-only

echo "Termux setup complete."
echo "Run LamBase with: ./lambase-bootstrap"
echo "If PostgreSQL is not running later: pg_ctl -D \"$PGDATA_DIR\" -l \"$PGLOG_FILE\" start"
