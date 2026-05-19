#!/usr/bin/env bash
set -e

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
LOCAL_DIR="$ROOT_DIR/.local"

echo "==> Setting up local development environment (macOS, no Docker)..."

# ── 1. Redis — build from source ──────────────────────────────────────────────
if command -v redis-server &>/dev/null; then
  echo "==> Redis already installed ($(redis-server --version | head -c 40))"
elif [ -x "$LOCAL_DIR/bin/redis-server" ]; then
  echo "==> Redis already built at $LOCAL_DIR/bin/redis-server"
else
  echo "==> Building Redis from source..."
  mkdir -p "$LOCAL_DIR/src"
  cd "$LOCAL_DIR/src"
  curl -fsSL https://download.redis.io/redis-stable.tar.gz -o redis-stable.tar.gz
  tar xzf redis-stable.tar.gz
  cd redis-stable
  make -j"$(sysctl -n hw.ncpu)" PREFIX="$LOCAL_DIR" install
  echo "==> Redis built → $LOCAL_DIR/bin/redis-server"
  cd "$ROOT_DIR"
fi

# ── 2. pgvector — build from source against pg14 ─────────────────────────────
PG_CONFIG="$(brew --prefix postgresql@14)/bin/pg_config"
SHAREDIR="$($PG_CONFIG --sharedir)"
PKGLIBDIR="$($PG_CONFIG --pkglibdir)"

if [ -f "$SHAREDIR/extension/vector.control" ]; then
  echo "==> pgvector extension already installed"
else
  echo "==> Building pgvector from source for PostgreSQL 14..."
  mkdir -p "$LOCAL_DIR/src"
  cd "$LOCAL_DIR/src"
  if [ ! -d pgvector ]; then
    git clone --branch v0.8.0 https://github.com/pgvector/pgvector.git
  fi
  cd pgvector
  make clean || true
  make PG_CONFIG="$PG_CONFIG" -j"$(sysctl -n hw.ncpu)"
  make PG_CONFIG="$PG_CONFIG" install
  echo "==> pgvector installed into PostgreSQL 14"
  cd "$ROOT_DIR"
fi

# ── 3. PostgreSQL — ensure running ────────────────────────────────────────────
echo "==> Starting PostgreSQL 14..."
brew services restart postgresql@14 || true

# Wait for PostgreSQL to accept connections (up to 15 seconds)
echo "==> Waiting for PostgreSQL to be ready..."
for i in $(seq 1 15); do
  if pg_isready -q 2>/dev/null; then
    echo "    PostgreSQL ready (${i}s)"
    break
  fi
  sleep 1
done
if ! pg_isready -q 2>/dev/null; then
  echo "❌  PostgreSQL not ready after 15s. Check: cat /usr/local/var/log/postgresql@14.log"
  exit 1
fi

# Detect the superuser that owns the PG cluster
PG_SUPER=$(psql -U zema -d postgres -tAc "SELECT current_user;" 2>/dev/null || \
           psql -d postgres -tAc "SELECT current_user;" 2>/dev/null || \
           echo "$(whoami)")
echo "    Using PostgreSQL superuser: $PG_SUPER"

# Ensure current macOS user has a PG role
psql -U "$PG_SUPER" -d postgres -c "CREATE ROLE $(whoami) WITH SUPERUSER CREATEDB CREATEROLE LOGIN;" 2>/dev/null || true
# Ensure 'postgres' role exists (needed by DATABASE_URL in .env)
psql -U "$PG_SUPER" -d postgres -c "CREATE ROLE postgres WITH SUPERUSER LOGIN PASSWORD 'postgres';" 2>/dev/null || true

# Create DB (ignore error if already exists)
echo "==> Creating database 'private_ai'..."
createdb -U "$PG_SUPER" private_ai 2>/dev/null || true

# Enable extensions
echo "==> Enabling PostgreSQL extensions..."
psql -U "$PG_SUPER" -d private_ai -c 'CREATE EXTENSION IF NOT EXISTS vector;'
psql -U "$PG_SUPER" -d private_ai -c 'CREATE EXTENSION IF NOT EXISTS "uuid-ossp";'

# ── 4. Python virtual environment ─────────────────────────────────────────────
echo "==> Setting up Python virtual environment..."
cd "$ROOT_DIR/backend"
if [ ! -d .venv ]; then
  python3 -m venv .venv
fi
source .venv/bin/activate
pip install --upgrade pip --timeout=300
pip install -r requirements.txt --timeout=300 --retries=10
cd "$ROOT_DIR"

# ── 5. Frontend dependencies ─────────────────────────────────────────────────
echo "==> Installing frontend dependencies..."
cd "$ROOT_DIR/frontend"
npm install --legacy-peer-deps
cd "$ROOT_DIR"

# ── 6. Environment file ──────────────────────────────────────────────────────
echo "==> Checking .env file..."
if [ ! -f "$ROOT_DIR/.env" ]; then
  cp "$ROOT_DIR/.env.example" "$ROOT_DIR/.env"

  # Auto-generate SECRET_KEY
  SECRET=$(openssl rand -hex 32)
  sed -i '' "s/your-super-secret-key-min-32-chars-change-in-production/${SECRET}/g" "$ROOT_DIR/.env"

  # Patch local DB and Redis URLs
  sed -i '' 's|DATABASE_URL=postgresql+asyncpg://postgres:postgres@db:5432/private_ai|DATABASE_URL=postgresql+asyncpg://postgres@localhost:5432/private_ai|g' "$ROOT_DIR/.env"
  sed -i '' 's|REDIS_URL=redis://redis:6379/0|REDIS_URL=redis://localhost:6379/0|g' "$ROOT_DIR/.env"

  echo "==> Created .env — please set OPENAI_API_KEY before running."
else
  echo "==> .env already exists, skipping."
fi

# ── 7. Add .local to .gitignore ──────────────────────────────────────────────
if ! grep -q "^\.local" "$ROOT_DIR/.gitignore" 2>/dev/null; then
  echo ".local" >> "$ROOT_DIR/.gitignore"
fi

echo ""
echo "✅  Setup complete!"
echo "    Run 'make local' to start the servers."
