# Private AI Knowledge Assistant

[![Python](https://img.shields.io/badge/Python-3.12-blue?logo=python)](https://www.python.org/)
[![Node.js](https://img.shields.io/badge/Node.js-20-green?logo=node.js)](https://nodejs.org/)
[![FastAPI](https://img.shields.io/badge/FastAPI-0.115-teal?logo=fastapi)](https://fastapi.tiangolo.com/)
[![Next.js](https://img.shields.io/badge/Next.js-15-black?logo=next.js)](https://nextjs.org/)
[![Docker](https://img.shields.io/badge/Docker-Compose-blue?logo=docker)](https://www.docker.com/)
[![PostgreSQL](https://img.shields.io/badge/PostgreSQL-16-blue?logo=postgresql)](https://www.postgresql.org/)
[![License](https://img.shields.io/badge/License-MIT-green)](../LICENSE)

A production-ready, self-hosted AI assistant that lets teams upload private documents and query them using natural language — powered by OpenAI or AWS Bedrock, with semantic search via pgvector, available as an AWS Marketplace SaaS offering.

---

## Table of Contents

- [Description](#description)
- [Architecture](#architecture)
- [Features](#features)
- [Prerequisites](#prerequisites)
- [Quick Start](#quick-start)
- [Environment Variables](#environment-variables)
- [AWS Marketplace Deployment](#aws-marketplace-deployment)
- [API Reference](#api-reference)
- [Security](#security)
- [Contributing](#contributing)
- [License](#license)

---

## Description

Private AI Knowledge Assistant transforms your organization's documents into a searchable, conversational knowledge base. Upload PDFs, Word documents, spreadsheets, and plain text files; the system chunks and embeds them into a PostgreSQL vector store; then lets users ask natural-language questions and receive AI-generated answers with cited sources — all within your own infrastructure.

The platform is multi-tenant: every team gets its own workspace with granular access control (owner, admin, member, viewer). It ships as a Docker Compose stack for local development and as an AWS ECS Fargate deployment for production.

---

## Architecture

```
┌─────────────────────────────────────────────────────────────────────┐
│                          User's Browser                             │
│                       (Next.js 15 Frontend)                         │
└───────────────────────────────┬─────────────────────────────────────┘
                                │ HTTPS
                                ▼
┌─────────────────────────────────────────────────────────────────────┐
│                         Nginx (Reverse Proxy)                       │
│              • SSL termination  • Static file serving               │
│              • /api/* → backend  • /* → frontend                    │
└──────────────┬────────────────────────────────────┬────────────────-┘
               │                                    │
               ▼                                    ▼
┌──────────────────────────┐          ┌─────────────────────────────┐
│  FastAPI Backend (async) │          │   Next.js SSR (App Router)  │
│  • Auth (JWT)            │          │   • Server Components        │
│  • REST API v1           │          │   • Route Handlers           │
│  • RAG pipeline          │          │   • Tailwind CSS + shadcn/ui │
│  • Streaming responses   │          └─────────────────────────────┘
└──────┬────────────────┬──┘
       │                │
       ▼                ▼
┌─────────────┐  ┌──────────────────────────┐
│  PostgreSQL │  │   Redis                  │
│  + pgvector │  │   • Celery broker        │
│  • Documents│  │   • Task results         │
│  • Chunks   │  │   • Rate limit state     │
│  • Vectors  │  └──────────────────────────┘
│  • Chats    │
│  • Audit    │         ┌──────────────────┐
└─────────────┘         │  Celery Workers  │
                        │  • Doc chunking  │
       ┌────────────────│  • Embedding gen │
       │                │  • Email sending │
       ▼                └──────────────────┘
┌─────────────────────────────────────────────┐
│              AWS Services                   │
│  ┌──────────┐ ┌────────┐ ┌───────────────┐ │
│  │    S3    │ │OpenAI/ │ │  Marketplace  │ │
│  │(Storage) │ │Bedrock │ │  Metering API │ │
│  └──────────┘ └────────┘ └───────────────┘ │
└─────────────────────────────────────────────┘
```

---

## Features

### Document Management
- Upload PDF, DOCX, TXT, and CSV files (up to 50 MB each)
- Automatic text extraction and semantic chunking (512-token chunks, 50-token overlap)
- Background processing via Celery workers — uploads return instantly
- S3 storage with pre-signed URL downloads
- Per-workspace document quotas enforced at the API layer
- Document status tracking: pending → processing → ready / failed

### AI and Search
- Retrieval-Augmented Generation (RAG) pipeline with source citations
- Semantic search using pgvector IVFFlat index (cosine similarity)
- Provider-agnostic: switch between OpenAI and AWS Bedrock via a single env var
- Streaming chat responses via Server-Sent Events
- Conversation history preserved per chat session
- Token usage tracking and cost estimation per query

### Multi-Tenant Workspaces
- Isolated workspaces with slug-based URLs
- Four membership roles: owner, admin, member, viewer
- Email invitation flow with tokenized links
- Per-workspace plan limits (documents, members, storage)
- Workspace-scoped audit logs for compliance

### Authentication and Security
- JWT access + refresh token pair (30-min access, 7-day refresh)
- bcrypt password hashing via passlib
- Email verification on registration
- Password reset with expiring tokens
- API key management for programmatic access
- Per-route rate limiting (in-memory for dev, Redis-backed in production)

### Admin Platform
- Superuser dashboard endpoints: user management, workspace oversight
- Platform-wide statistics: user count, document count, total tokens, cost
- Aggregate usage metrics filterable by date range and workspace
- Activate / deactivate user accounts without data loss

### AWS Marketplace Integration
- Full SaaS registration flow (token resolution → subscription creation)
- SNS webhook handling for subscribe / unsubscribe lifecycle events
- Entitlement checking via AWS Marketplace Entitlement API
- Usage metering for pay-per-use billing dimensions
- Automatic plan downgrade on subscription cancellation

### Observability
- Structured logging with request context
- Celery Flower dashboard for worker monitoring
- Health check endpoint for load-balancer probes
- Optional Sentry DSN integration for error tracking

---

## Prerequisites

| Tool | Version | Notes |
|------|---------|-------|
| Docker | 24+ | With Docker Compose v2 plugin |
| Node.js | 20+ | For local frontend development |
| Python | 3.12+ | For local backend development |
| AWS CLI | 2.x | For S3 and Marketplace |
| Make | Any | Optional, for convenience commands |

---

## Quick Start

### 1. Clone the repository

```bash
git clone https://github.com/your-org/private-ai-assistant.git
cd private-ai-assistant
```

### 2. Configure environment

```bash
cp .env.example .env
```

Open `.env` and fill in the required values:

```bash
# Minimum required for local development:
SECRET_KEY=<run: python -c "import secrets; print(secrets.token_hex(32))">
OPENAI_API_KEY=sk-...
AWS_ACCESS_KEY_ID=AKIA...
AWS_SECRET_ACCESS_KEY=...
S3_BUCKET_NAME=your-bucket-name
```

### 3. Start all services

```bash
docker compose up --build
```

The first build takes 2-3 minutes. Once running:

| Service | URL |
|---------|-----|
| Frontend | http://localhost:3000 |
| Backend API | http://localhost:8000 |
| API Docs (Swagger) | http://localhost:8000/docs |
| API Docs (ReDoc) | http://localhost:8000/redoc |
| Celery Flower | http://localhost:5555 |

### 4. Run database migrations

In a separate terminal:

```bash
make migrate
# or: docker compose exec backend alembic upgrade head
```

### 5. Create your first admin user

```bash
make create-admin EMAIL=admin@example.com
# or: docker compose exec backend python scripts/create_admin.py admin@example.com
```

---

## Environment Variables

All variables are documented in `.env.example`. Here is a reference for the most critical ones.

### Required

| Variable | Description |
|----------|-------------|
| `SECRET_KEY` | 32+ char random string for JWT signing. Generate with `python -c "import secrets; print(secrets.token_hex(32))"` |
| `DATABASE_URL` | PostgreSQL connection string. Format: `postgresql+asyncpg://user:pass@host:port/db` |
| `OPENAI_API_KEY` | Required when `EMBEDDING_PROVIDER=openai` (default) |
| `AWS_ACCESS_KEY_ID` | AWS credentials for S3 (and optionally Bedrock, Marketplace) |
| `AWS_SECRET_ACCESS_KEY` | AWS secret for the above key |
| `S3_BUCKET_NAME` | Bucket name where uploaded documents are stored |

### Optional and Defaults

| Variable | Default | Description |
|----------|---------|-------------|
| `ENVIRONMENT` | `development` | `development`, `staging`, or `production` |
| `EMBEDDING_PROVIDER` | `openai` | `openai` or `bedrock` |
| `AWS_REGION` | `us-east-1` | AWS region for S3, Bedrock, Marketplace |
| `REDIS_URL` | `redis://redis:6379/0` | Redis connection for Celery broker |
| `EMBEDDING_DIMENSION` | `1536` | Must match model output (text-embedding-3-small = 1536) |
| `CHUNK_SIZE` | `512` | Token size per document chunk |
| `CHUNK_OVERLAP` | `50` | Overlap tokens between adjacent chunks |
| `ACCESS_TOKEN_EXPIRE_MINUTES` | `30` | JWT access token lifetime |
| `REFRESH_TOKEN_EXPIRE_DAYS` | `7` | JWT refresh token lifetime |
| `MAX_UPLOAD_SIZE_MB` | `50` | Maximum file upload size |
| `CORS_ORIGINS` | `http://localhost:3000` | Comma-separated allowed origins |
| `RATE_LIMIT_PER_MINUTE` | `60` | API rate limit per user per minute |

### AI Provider Configuration

Set `EMBEDDING_PROVIDER` and match the corresponding credentials:

```bash
# OpenAI (default)
EMBEDDING_PROVIDER=openai
OPENAI_API_KEY=sk-...
OPENAI_EMBEDDING_MODEL=text-embedding-3-small
OPENAI_CHAT_MODEL=gpt-4o

# AWS Bedrock
EMBEDDING_PROVIDER=bedrock
AWS_ACCESS_KEY_ID=...
AWS_SECRET_ACCESS_KEY=...
AWS_REGION=us-east-1
AWS_BEDROCK_EMBEDDING_MODEL_ID=amazon.titan-embed-text-v2:0
AWS_BEDROCK_MODEL_ID=anthropic.claude-3-5-sonnet-20241022-v2:0
```

---

## AWS Marketplace Deployment

This application is published on the AWS Marketplace as a SaaS subscription. The following describes the integration points.

### Registration Flow

When a customer subscribes on the AWS Marketplace, AWS redirects their browser to your registration URL with a short-lived token:

```
https://your-app.com/marketplace/register?x-amzn-marketplace-token=<TOKEN>
```

Your frontend captures this token and calls the backend registration endpoint, which resolves it to a `CustomerIdentifier` and creates a subscription record.

### Webhook Configuration

AWS Marketplace sends lifecycle events via SNS. Configure an SNS subscription pointing to:

```
https://your-app.com/api/v1/marketplace/webhook
```

Handled events:

| Event | Action |
|-------|--------|
| `subscribe-success` | Activates subscription, upgrades workspace plan |
| `unsubscribe-pending` | Sets `cancel_at_period_end = true` |
| `unsubscribe-success` | Cancels subscription, downgrades to free plan |

### Entitlement Checking

The backend checks active entitlements for a workspace:

```bash
GET /api/v1/marketplace/entitlements/{workspace_id}
Authorization: Bearer <token>
```

### Usage Metering

For pay-per-use dimensions (queries, storage), meter usage with the `MarketplaceService`:

```python
from app.services.marketplace import marketplace_service

await marketplace_service.meter_usage(
    customer_id="customer-identifier",
    dimension="queries",
    quantity=1,
)
```

### Production Deployment on ECS

Full deployment instructions are in `docs/DEPLOYMENT.md`. The short version:

```bash
# 1. Build and push images to ECR
aws ecr get-login-password | docker login --username AWS --password-stdin $ECR_REGISTRY
docker compose -f docker-compose.prod.yml build
docker compose -f docker-compose.prod.yml push

# 2. Update ECS services
aws ecs update-service \
  --cluster $ECS_CLUSTER \
  --service $ECS_SERVICE_BACKEND \
  --force-new-deployment
```

---

## API Reference

The full interactive API documentation is available at `/docs` (Swagger UI) or `/redoc` when the server is running.

### Authentication — `/api/v1/auth`

| Method | Path | Description |
|--------|------|-------------|
| POST | `/auth/register` | Register new user |
| POST | `/auth/login` | Login, receive access + refresh tokens |
| POST | `/auth/refresh` | Refresh access token |
| POST | `/auth/logout` | Invalidate refresh token |
| POST | `/auth/forgot-password` | Send password reset email |
| POST | `/auth/reset-password` | Reset password with token |
| GET | `/auth/verify-email` | Verify email address |

### Users — `/api/v1/users`

| Method | Path | Description |
|--------|------|-------------|
| GET | `/users/me` | Get current user profile |
| PUT | `/users/me` | Update current user profile |
| PUT | `/users/me/password` | Change password |

### Workspaces — `/api/v1/workspaces`

| Method | Path | Description |
|--------|------|-------------|
| POST | `/workspaces` | Create workspace |
| GET | `/workspaces` | List user's workspaces |
| GET | `/workspaces/{id}` | Get workspace details |
| PUT | `/workspaces/{id}` | Update workspace |
| DELETE | `/workspaces/{id}` | Delete workspace |
| POST | `/workspaces/{id}/invite` | Invite member by email |
| GET | `/workspaces/{id}/members` | List members |
| PUT | `/workspaces/{id}/members/{user_id}` | Update member role |
| DELETE | `/workspaces/{id}/members/{user_id}` | Remove member |

### Documents — `/api/v1/documents`

| Method | Path | Description |
|--------|------|-------------|
| POST | `/documents/{workspace_id}` | Upload document (multipart/form-data) |
| GET | `/documents/{workspace_id}` | List workspace documents |
| GET | `/documents/{workspace_id}/{doc_id}` | Get document details |
| DELETE | `/documents/{workspace_id}/{doc_id}` | Delete document |
| GET | `/documents/{workspace_id}/{doc_id}/download` | Get presigned S3 download URL |

### Chats — `/api/v1/chats`

| Method | Path | Description |
|--------|------|-------------|
| POST | `/chats/{workspace_id}` | Create chat session |
| GET | `/chats/{workspace_id}` | List workspace chats |
| GET | `/chats/{workspace_id}/{chat_id}` | Get chat with messages |
| DELETE | `/chats/{workspace_id}/{chat_id}` | Delete chat |
| POST | `/chats/{workspace_id}/{chat_id}/messages` | Send message (RAG + streaming) |

### Embeddings — `/api/v1/embeddings`

| Method | Path | Description | Access |
|--------|------|-------------|--------|
| POST | `/embeddings/generate` | Generate embedding for text | Admin |
| POST | `/embeddings/search` | Semantic search in workspace | Member+ |
| POST | `/embeddings/reindex/{workspace_id}` | Queue full re-embedding | Admin |
| GET | `/embeddings/stats/{workspace_id}` | Embedding coverage stats | Member+ |

### Subscriptions — `/api/v1`

| Method | Path | Description |
|--------|------|-------------|
| GET | `/subscriptions/{workspace_id}` | Get workspace subscription |
| POST | `/subscriptions/{workspace_id}/upgrade` | Upgrade plan |
| POST | `/marketplace/register` | AWS Marketplace SaaS registration |
| POST | `/marketplace/webhook` | SNS lifecycle events |
| GET | `/marketplace/entitlements/{workspace_id}` | Check entitlements |
| GET | `/billing/{workspace_id}/usage` | Current period usage |

### Admin — `/api/v1/admin`

All endpoints require `is_superuser = true`.

| Method | Path | Description |
|--------|------|-------------|
| GET | `/admin/users` | List all users (paginated, searchable) |
| GET | `/admin/users/{id}` | Get user with memberships |
| PUT | `/admin/users/{id}/status` | Toggle user active/inactive |
| DELETE | `/admin/users/{id}` | Delete user |
| GET | `/admin/workspaces` | List all workspaces (paginated) |
| GET | `/admin/workspaces/{id}` | Get workspace with counts |
| DELETE | `/admin/workspaces/{id}` | Delete workspace |
| GET | `/admin/stats` | Platform statistics |
| GET | `/admin/usage` | Aggregate usage metrics |

### Health — `/api/v1/health`

| Method | Path | Description |
|--------|------|-------------|
| GET | `/health` | Service health (DB + Redis probe) |

---

## Security

### Authentication Model

- JWT Bearer tokens with short-lived access (30 min) and long-lived refresh tokens (7 days)
- Each refresh generates a new token pair, invalidating the previous refresh token
- Passwords hashed with bcrypt, minimum work factor 12
- New registrations require email confirmation before login is permitted
- Time-limited password reset tokens (1 hour) sent to verified email address

### Authorization

- All data queries are scoped to `workspace_id` — cross-workspace data access is impossible at the query level
- Four roles (owner, admin, member, viewer) enforced by FastAPI dependency injection
- Admin endpoints require `is_superuser = True`, set directly in the database — not self-assignable via API
- Workspace-scoped API keys with optional scope arrays for programmatic access

### Data Security

- Documents stored in S3 with server-side encryption. Presigned URLs expire in 1 hour
- All production traffic is HTTPS-only, enforced at the Nginx / ALB layer
- All credentials are environment variables — never committed to source control
- Embedding queries are always filtered by `workspace_id` — semantic search cannot leak across tenants

### Rate Limiting

| Scope | Default Limit |
|-------|--------------|
| API requests | 60 per minute per user |
| Document uploads | 10 per hour per user |
| Chat messages | 100 per day per user |

In production, rate limiting state is backed by Redis for accuracy across multiple backend replicas.

### Audit Logging

Every mutating operation writes to the `audit_logs` table with user ID, workspace ID, action string (e.g., `document.upload`), IP address, User-Agent, and UTC timestamp. Audit logs are append-only — no delete endpoint is exposed.

---

## Contributing

### Development Setup

```bash
# Clone and enter the repo
git clone https://github.com/your-org/private-ai-assistant.git
cd private-ai-assistant

# Copy and configure .env
cp .env.example .env

# Start services
docker compose up --build -d

# Run migrations
make migrate

# Watch backend logs
make logs-backend
```

### Code Style

- Backend: ruff for linting and formatting (`make lint`, `make format`)
- Frontend: ESLint + Prettier (`npm run lint`, `npm run format`)
- Pre-commit: install hooks with `pre-commit install`

### Testing

```bash
# Run all backend tests with coverage
make test
# or directly:
docker compose exec backend pytest tests/ -v --cov=app --cov-report=term-missing
```

Tests are organized as:

```
backend/tests/
├── conftest.py           # Fixtures: test DB, async HTTP client
├── api/
│   ├── test_auth.py
│   ├── test_documents.py
│   ├── test_chats.py
│   └── test_workspaces.py
├── services/
│   ├── test_embeddings.py
│   └── test_rag.py
└── utils/
    └── test_validators.py
```

### Creating a Migration

```bash
# After modifying a model file:
make migrate-create MSG="add user avatar column"
# Review the generated file in backend/migrations/versions/
make migrate
```

### Pull Request Checklist

- All tests pass (`make test`)
- Linters pass (`make lint`)
- New endpoints documented in this README
- Environment variables added to `.env.example`
- Database changes include a migration file
- No secrets or credentials in any committed file

---

## Project Structure

```
private-ai-assistant/
├── backend/
│   ├── app/
│   │   ├── api/v1/          # FastAPI route handlers
│   │   │   ├── admin.py
│   │   │   ├── auth.py
│   │   │   ├── chats.py
│   │   │   ├── documents.py
│   │   │   ├── embeddings.py
│   │   │   ├── health.py
│   │   │   ├── subscriptions.py
│   │   │   ├── users.py
│   │   │   └── workspaces.py
│   │   ├── core/            # Config, DB, security, dependencies
│   │   ├── models/          # SQLAlchemy ORM models
│   │   ├── schemas/         # Pydantic request/response schemas
│   │   ├── services/        # Business logic
│   │   │   ├── ai/          # Embeddings, LLM, RAG pipeline
│   │   │   ├── document_processor.py
│   │   │   ├── email_service.py
│   │   │   ├── marketplace.py
│   │   │   └── s3_service.py
│   │   ├── middleware/      # Rate limiting, tenant resolution
│   │   └── main.py
│   ├── migrations/          # Alembic migration files
│   │   └── versions/
│   │       └── 001_initial_schema.py
│   ├── tests/
│   ├── alembic.ini
│   ├── celery_app.py
│   ├── Dockerfile
│   └── requirements.txt
├── frontend/
│   ├── app/                 # Next.js App Router pages and layouts
│   ├── components/          # Shared UI components (shadcn/ui)
│   ├── lib/                 # API client, hooks, utilities
│   ├── Dockerfile
│   ├── next.config.ts
│   └── package.json
├── nginx/
│   ├── Dockerfile
│   └── nginx.conf
├── deployment/
│   ├── deploy.sh
│   └── migrate.sh
├── docs/
│   ├── README.md
│   ├── API.md
│   ├── DEPLOYMENT.md
│   ├── AWS_MARKETPLACE_GUIDE.md
│   └── SECURITY.md
├── .env.example
├── .gitignore
├── docker-compose.yml
├── docker-compose.prod.yml
└── Makefile
```

---

## License

MIT License. Copyright (c) 2024 Private AI Knowledge Assistant.

Permission is hereby granted, free of charge, to any person obtaining a copy of this software and associated documentation files (the "Software"), to deal in the Software without restriction, including without limitation the rights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of the Software, and to permit persons to whom the Software is furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT.
