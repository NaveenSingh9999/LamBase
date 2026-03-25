#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

echo "[1/7] Detecting package manager..."
if command -v apt-get >/dev/null 2>&1; then
  PM="apt"
elif command -v dnf >/dev/null 2>&1; then
  PM="dnf"
else
  PM="none"
fi

if [[ "$PM" == "apt" ]]; then
  echo "[2/7] Installing system dependencies with apt..."
  sudo apt-get update
  sudo apt-get install -y curl ca-certificates git build-essential postgresql postgresql-contrib nodejs npm golang
elif [[ "$PM" == "dnf" ]]; then
  echo "[2/7] Installing system dependencies with dnf..."
  sudo dnf install -y curl ca-certificates git gcc gcc-c++ make postgresql-server postgresql-contrib nodejs npm golang
else
  echo "[2/7] Skipping OS package install (unsupported package manager)."
fi

echo "[3/7] Starting PostgreSQL service..."
if command -v systemctl >/dev/null 2>&1; then
  sudo systemctl enable postgresql || true
  sudo systemctl start postgresql || true
fi
if command -v service >/dev/null 2>&1; then
  sudo service postgresql start || true
fi

echo "[4/7] Ensuring PostgreSQL role/database..."
if command -v sudo >/dev/null 2>&1 && id postgres >/dev/null 2>&1; then
  sudo -u postgres psql <<'SQL'
DO $$
BEGIN
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'postgres') THEN
    CREATE ROLE postgres LOGIN SUPERUSER PASSWORD 'postgres';
  END IF;
END$$;
SQL

  if ! sudo -u postgres psql -tAc "SELECT 1 FROM pg_database WHERE datname='lambase'" | grep -q 1; then
    sudo -u postgres createdb lambase
  fi

  sudo -u postgres psql -d lambase -c "CREATE EXTENSION IF NOT EXISTS pgcrypto;" || true
else
  echo "Could not run postgres bootstrap as postgres user. Ensure DB is ready manually."
fi

echo "[5/7] Creating .env if missing..."
if [[ ! -f .env ]]; then
  JWT_SECRET="$(openssl rand -hex 32 2>/dev/null || date +%s%N | sha256sum | awk '{print $1}')"
  cat > .env <<EOF
PORT=3000
DATABASE_URL=postgres://postgres:postgres@localhost:5432/lambase?sslmode=disable
JWT_SECRET=${JWT_SECRET}
DASHBOARD_AUTH_DB_PATH=lambase_dashboard_auth.db
DASHBOARD_SESSION_HOURS=24
DASHBOARD_LOCKOUT_MINUTES=15
EOF
fi

echo "[6/7] Building bootstrap binary..."
go mod tidy
go build -o lambase-bootstrap ./cmd/lambase-bootstrap

echo "[7/7] Running bootstrap in prepare mode..."
./lambase-bootstrap --prepare-only

echo "Setup complete. Start LamBase with: ./lambase-bootstrap"
