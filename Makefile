.PHONY: help dev dev-d build stop clean migrate migrate-create logs logs-backend \
        shell-backend shell-db test lint format seed create-admin install-frontend \
        setup local local-migrate local-stop local-worker local-restart \
        use-gemini use-bedrock use-openai

help: ## Show this help
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) | sort | \
		awk 'BEGIN {FS = ":.*?## "}; {printf "\033[36m%-20s\033[0m %s\n", $$1, $$2}'

dev: ## Start all services (development, with build)
	docker compose up --build

dev-d: ## Start all services in background
	docker compose up --build -d

build: ## Build Docker images
	docker compose build

stop: ## Stop all services
	docker compose down

clean: ## Remove all containers and volumes
	docker compose down -v --remove-orphans

migrate: ## Run database migrations
	docker compose exec backend alembic upgrade head

migrate-create: ## Create new migration (usage: make migrate-create MSG="your message")
	docker compose exec backend alembic revision --autogenerate -m "$(MSG)"

logs: ## Follow all service logs
	docker compose logs -f

logs-backend: ## Follow backend logs only
	docker compose logs -f backend

shell-backend: ## Open backend Python shell
	docker compose exec backend python -c "import asyncio; import app"

shell-db: ## Open PostgreSQL shell
	docker compose exec db psql -U postgres -d private_ai

test: ## Run backend tests
	docker compose exec backend pytest tests/ -v

lint: ## Run linters (backend + frontend)
	docker compose exec backend ruff check app/
	docker compose exec frontend npm run lint

format: ## Format backend code with ruff
	docker compose exec backend ruff format app/

seed: ## Seed the database with test data
	docker compose exec backend python scripts/seed.py

create-admin: ## Create superuser (usage: make create-admin EMAIL=admin@example.com)
	docker compose exec backend python scripts/create_admin.py $(EMAIL)

install-frontend: ## Install frontend dependencies
	cd frontend && npm install

# ── Local development (no Docker) ─────────────────────────────────────────────

setup:        ## One-time local setup (macOS, no Docker)
	bash scripts/setup-local.sh

local:        ## Run backend + frontend locally (no Docker)
	bash scripts/local-dev.sh

local-migrate: ## Run Alembic migrations locally
	cd backend && .venv/bin/alembic upgrade head

local-stop:   ## Stop all local dev processes (uses .pids/ to avoid killing unrelated processes)
	@for svc in redis uvicorn next; do \
	  pidfile=".pids/$$svc.pid"; \
	  if [ -f "$$pidfile" ]; then \
	    pid=$$(cat "$$pidfile"); \
	    echo "→ Stopping $$svc (PID $$pid)..."; \
	    kill "$$pid" 2>/dev/null || true; \
	    rm -f "$$pidfile"; \
	  fi; \
	done
	@echo "✓ All local services stopped."

local-worker: ## Start Celery worker locally (document processing)
	cd backend && source .venv/bin/activate && \
	  set -o allexport && source ../.env && set +o allexport && \
	  .venv/bin/celery -A celery_app worker --loglevel=info

local-restart: ## Cleanly stop everything, clear Next.js cache, and restart
	@$(MAKE) local-stop
	@echo "→ Clearing Next.js cache..."
	@rm -rf frontend/.next
	@echo "→ Starting fresh..."
	@bash scripts/local-dev.sh

# ── AI provider switching ──────────────────────────────────────────────────────
# These targets patch .env and run the migration if the embedding dimension changes.
# Always restart with `make local-restart` after switching providers.

use-gemini: ## Switch AI provider to Gemini (gemini-1.5-flash + text-embedding-004 / 768-dim)
	@echo "→ Switching to Gemini..."
	@sed -i '' 's/^LLM_PROVIDER=.*/LLM_PROVIDER=gemini/'         .env
	@sed -i '' 's/^EMBEDDING_PROVIDER=.*/EMBEDDING_PROVIDER=gemini/' .env
	@sed -i '' 's/^EMBEDDING_DIMENSION=.*/EMBEDDING_DIMENSION=768/'  .env
	@sed -i '' 's/^GEMINI_CHAT_MODEL=.*/GEMINI_CHAT_MODEL=gemini-1.5-flash/' .env
	@echo "→ Running migration (resizes vector column if needed)..."
	@$(MAKE) local-migrate
	@echo ""
	@echo "✓ Now using Gemini. Run: make local-restart"
	@echo "  Make sure GEMINI_API_KEY is set in .env"
	@echo "  Get one free at: https://aistudio.google.com/apikey"

use-bedrock: ## Switch AI provider to AWS Bedrock (Claude 3.5 Sonnet + Titan Embed v2 / 1024-dim)
	@echo "→ Switching to AWS Bedrock..."
	@sed -i '' 's/^LLM_PROVIDER=.*/LLM_PROVIDER=bedrock/'           .env
	@sed -i '' 's/^EMBEDDING_PROVIDER=.*/EMBEDDING_PROVIDER=bedrock/' .env
	@sed -i '' 's/^EMBEDDING_DIMENSION=.*/EMBEDDING_DIMENSION=1024/'  .env
	@sed -i '' 's/^AWS_BEDROCK_MODEL_ID=.*/AWS_BEDROCK_MODEL_ID=anthropic.claude-3-5-sonnet-20241022-v2:0/' .env
	@sed -i '' 's/^AWS_BEDROCK_EMBEDDING_MODEL_ID=.*/AWS_BEDROCK_EMBEDDING_MODEL_ID=amazon.titan-embed-text-v2:0/' .env
	@echo "→ Running migration (resizes vector column to 1024 dims)..."
	@$(MAKE) local-migrate
	@echo ""
	@echo "✓ Now using AWS Bedrock. Run: make local-restart"
	@echo "  Required in .env:"
	@echo "    AWS_ACCESS_KEY_ID     — your IAM access key"
	@echo "    AWS_SECRET_ACCESS_KEY — your IAM secret key"
	@echo "    AWS_REGION            — region where Bedrock is enabled (e.g. us-east-1)"
	@echo "  Enable models in AWS Console → Bedrock → Model Access:"
	@echo "    • Anthropic Claude 3.5 Sonnet v2"
	@echo "    • Amazon Titan Embed Text v2"

use-openai: ## Switch AI provider to OpenAI (gpt-4o + text-embedding-3-small / 1536-dim)
	@echo "→ Switching to OpenAI..."
	@sed -i '' 's/^LLM_PROVIDER=.*/LLM_PROVIDER=openai/'           .env
	@sed -i '' 's/^EMBEDDING_PROVIDER=.*/EMBEDDING_PROVIDER=openai/' .env
	@sed -i '' 's/^EMBEDDING_DIMENSION=.*/EMBEDDING_DIMENSION=1536/' .env
	@echo "→ Running migration (resizes vector column to 1536 dims)..."
	@$(MAKE) local-migrate
	@echo ""
	@echo "✓ Now using OpenAI. Run: make local-restart"
	@echo "  Make sure OPENAI_API_KEY is set in .env"
