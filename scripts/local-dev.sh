#!/usr/bin/env bash
set -e

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
LOCAL_DIR="$ROOT_DIR/.local"
BACKEND_DIR="$ROOT_DIR/backend"
FRONTEND_DIR="$ROOT_DIR/frontend"

# ── Cleanup on Ctrl-C ────────────────────────────────────────────────────────
cleanup() {
  echo ""
  echo "Stopping local servers..."
  kill "$REDIS_PID" 2>/dev/null || true
  kill "$UVICORN_PID" 2>/dev/null || true
  kill "$NEXT_PID" 2>/dev/null || true
  exit 0
}
trap cleanup SIGINT SIGTERM

# ── Find redis-server ─────────────────────────────────────────────────────────
if command -v redis-server &>/dev/null; then
  REDIS_BIN="redis-server"
elif [ -x "$LOCAL_DIR/bin/redis-server" ]; then
  REDIS_BIN="$LOCAL_DIR/bin/redis-server"
else
  echo "❌  redis-server not found. Run 'make setup' first."
  exit 1
fi

# ── Start Redis ───────────────────────────────────────────────────────────────
echo "==> Starting Redis..."
pkill -f "redis-server" 2>/dev/null || true
sleep 1
$REDIS_BIN --daemonize no --port 6379 &
REDIS_PID=$!
sleep 1

# ── Start PostgreSQL ──────────────────────────────────────────────────────────
echo "==> Ensuring PostgreSQL 14 is running..."
brew services start postgresql@14 2>/dev/null || true
sleep 2

# ── Load .env ─────────────────────────────────────────────────────────────────
if [ -f "$ROOT_DIR/.env" ]; then
  set -o allexport
  source "$ROOT_DIR/.env"
  set +o allexport
fi

# ── Run Alembic migrations ────────────────────────────────────────────────────
echo "==> Running database migrations..."
cd "$BACKEND_DIR"
source .venv/bin/activate
alembic upgrade head

# ── Start Backend (uvicorn) ───────────────────────────────────────────────────
echo "==> Starting Backend (FastAPI on port 8000)..."
cd "$BACKEND_DIR"
source .venv/bin/activate
uvicorn app.main:app --reload --port 8000 &
UVICORN_PID=$!

# ── Start Frontend (Next.js) ─────────────────────────────────────────────────
echo "==> Starting Frontend (Next.js on port 3000)..."
cd "$FRONTEND_DIR"
npm run dev &
NEXT_PID=$!

echo ""
echo "🚀 Servers are running!"
echo "→ Backend:  http://localhost:8000"
echo "→ Frontend: http://localhost:3000"
echo ""
echo "💡 Document processing requires Celery. In another terminal run:"
echo "   make local-worker"
echo ""
echo "Press Ctrl+C to stop all services."

# Wait for any child to exit
wait
