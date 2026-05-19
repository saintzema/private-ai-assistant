#!/usr/bin/env bash
set -e

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
LOCAL_DIR="$ROOT_DIR/.local"
BACKEND_DIR="$ROOT_DIR/backend"
FRONTEND_DIR="$ROOT_DIR/frontend"
PID_DIR="$ROOT_DIR/.pids"

mkdir -p "$PID_DIR"

# ── Cleanup on Ctrl-C ────────────────────────────────────────────────────────
cleanup() {
  echo ""
  echo "Stopping local servers..."
  [ -f "$PID_DIR/redis.pid" ]   && kill "$(cat "$PID_DIR/redis.pid")"   2>/dev/null || true
  [ -f "$PID_DIR/uvicorn.pid" ] && kill "$(cat "$PID_DIR/uvicorn.pid")" 2>/dev/null || true
  [ -f "$PID_DIR/next.pid" ]    && kill "$(cat "$PID_DIR/next.pid")"    2>/dev/null || true
  rm -f "$PID_DIR"/*.pid
  exit 0
}
trap cleanup SIGINT SIGTERM

# ── Find redis-server ─────────────────────────────────────────────────────────
if [ -x "$LOCAL_DIR/bin/redis-server" ]; then
  REDIS_BIN="$LOCAL_DIR/bin/redis-server"
elif command -v redis-server &>/dev/null; then
  REDIS_BIN="redis-server"
else
  echo "❌  redis-server not found. Run 'make setup' first."
  exit 1
fi

# ── Stop any stale processes from a previous run ─────────────────────────────
for svc in redis uvicorn next; do
  pidfile="$PID_DIR/$svc.pid"
  if [ -f "$pidfile" ]; then
    old_pid=$(cat "$pidfile")
    kill "$old_pid" 2>/dev/null || true
    rm -f "$pidfile"
  fi
done
sleep 1

# ── Start Redis ───────────────────────────────────────────────────────────────
echo "==> Starting Redis..."
$REDIS_BIN --daemonize no --port 6379 &
REDIS_PID=$!
echo "$REDIS_PID" > "$PID_DIR/redis.pid"
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
.venv/bin/alembic upgrade head

# ── Start Backend (uvicorn) ───────────────────────────────────────────────────
echo "==> Starting Backend (FastAPI on port 8000)..."
.venv/bin/uvicorn app.main:app --reload --port 8000 &
UVICORN_PID=$!
echo "$UVICORN_PID" > "$PID_DIR/uvicorn.pid"

# ── Start Frontend (Next.js) ─────────────────────────────────────────────────
echo "==> Starting Frontend (Next.js on port 3000)..."
cd "$FRONTEND_DIR"
npm run dev &
NEXT_PID=$!
echo "$NEXT_PID" > "$PID_DIR/next.pid"

echo ""
echo "🚀 Servers are running!"
echo "→ Backend:  http://localhost:8000"
echo "→ Frontend: http://localhost:3000"
echo ""
echo "💡 Document processing requires Celery. In another terminal run:"
echo "   make local-worker"
echo ""
echo "Press Ctrl+C to stop all services."

wait
