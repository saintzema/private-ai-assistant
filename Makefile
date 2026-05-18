.PHONY: help dev dev-d build stop clean migrate migrate-create logs logs-backend \
        shell-backend shell-db test lint format seed create-admin install-frontend

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
