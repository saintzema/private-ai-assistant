# Deployment Guide

Complete guide for deploying Private AI Knowledge Assistant from local development through production on AWS ECS Fargate.

---

## Local Development

### Prerequisites

- Docker Desktop 4.x+ with Docker Compose v2+
- Git
- Python 3.12+ (optional — for running backend tests locally without Docker)
- Node.js 20+ (optional — for running frontend locally without Docker)

### Setup

```bash
# Clone repository
git clone https://github.com/yourorg/private-ai-assistant.git
cd private-ai-assistant

# Copy and configure environment variables
cp .env.example .env
# Edit .env: set OPENAI_API_KEY and generate a SECRET_KEY

# Generate development SSL certificates
chmod +x nginx/ssl/generate-certs.sh
bash nginx/ssl/generate-certs.sh

# Start all services
docker compose up --build -d

# Run database migrations
docker compose exec backend alembic upgrade head

# Verify services are healthy
docker compose ps
```

### Service URLs (local)

| Service | URL | Credentials |
|---------|-----|-------------|
| Application | https://localhost | - |
| API | https://localhost/api/v1 | - |
| Swagger UI | http://localhost:8000/docs | - |
| Flower (Celery) | http://localhost:5555 | admin / admin |
| Database | localhost:5432 | postgres / postgres |
| Redis | localhost:6379 | - |

### Common development commands

```bash
# View logs for a specific service
docker compose logs -f backend

# Restart a single service after code changes (backend has hot reload)
docker compose restart celery

# Open a shell in the backend container
docker compose exec backend bash

# Run tests
docker compose exec backend pytest -v --cov=app

# Create a new database migration after changing models
docker compose exec backend alembic revision --autogenerate -m "add_new_column"

# Apply pending migrations
docker compose exec backend alembic upgrade head

# Roll back last migration
docker compose exec backend alembic downgrade -1

# Open PostgreSQL shell
docker compose exec db psql -U postgres -d private_ai
```

---

## Docker Compose Setup

### Development configuration

The default `docker-compose.yml` includes:
- Hot reload for both backend (uvicorn `--reload`) and frontend (`npm run dev`)
- Source code mounted as volumes
- Ports exposed on localhost for direct access
- Self-signed SSL via nginx
- Flower UI for Celery monitoring

### Production Docker Compose

For single-server production deployments (not recommended — use ECS Fargate instead):

```bash
docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d
```

The production override:
- Removes source volume mounts (uses built images)
- Applies memory/CPU resource limits
- Configures AWS CloudWatch logging driver
- Removes development ports (only 80/443 exposed)
- Runs uvicorn with 4 workers

---

## AWS ECS Fargate Deployment

### Architecture

```
Route 53 → ACM Certificate → ALB (HTTPS) → ECS Fargate Tasks
                                              ├── Backend (FastAPI :8000)
                                              └── Frontend (Next.js :3000)
```

ECS tasks connect to:
- RDS PostgreSQL 16 (private subnet)
- ElastiCache Redis (private subnet)
- S3 (via VPC endpoint or NAT Gateway)
- Secrets Manager (via VPC endpoint or NAT Gateway)

### Step-by-Step AWS Deployment

#### 1. Prerequisites

```bash
# Install AWS CLI v2
brew install awscli  # macOS

# Install required tools
brew install jq

# Configure AWS credentials
aws configure
# or: aws sso login --profile your-profile

# Verify access
aws sts get-caller-identity
```

#### 2. Deploy CloudFormation infrastructure

```bash
cd deployment/cloudformation

# Create the stack (first time)
aws cloudformation create-stack \
  --stack-name private-ai-production \
  --template-body file://infrastructure.yaml \
  --parameters \
    ParameterKey=Environment,ParameterValue=production \
    ParameterKey=DBPassword,ParameterValue="YourStrongDBPassword123!" \
    ParameterKey=SecretKey,ParameterValue="$(python3 -c 'import secrets; print(secrets.token_hex(32))')" \
    ParameterKey=OpenAIApiKey,ParameterValue="sk-your-openai-key" \
    ParameterKey=DomainName,ParameterValue="app.yourdomain.com" \
    ParameterKey=CertificateArn,ParameterValue="arn:aws:acm:us-east-1:123456789012:certificate/..." \
    ParameterKey=BackendImage,ParameterValue="123456789012.dkr.ecr.us-east-1.amazonaws.com/private-ai-backend:latest" \
    ParameterKey=FrontendImage,ParameterValue="123456789012.dkr.ecr.us-east-1.amazonaws.com/private-ai-frontend:latest" \
  --capabilities CAPABILITY_NAMED_IAM \
  --region us-east-1

# Monitor creation progress
aws cloudformation wait stack-create-complete \
  --stack-name private-ai-production \
  --region us-east-1

# Get outputs
aws cloudformation describe-stacks \
  --stack-name private-ai-production \
  --query 'Stacks[0].Outputs' \
  --output table
```

#### 3. Build and push Docker images

```bash
# Get ECR registry URL from CloudFormation outputs
ECR_REGISTRY=$(aws cloudformation describe-stacks \
  --stack-name private-ai-production \
  --query 'Stacks[0].Outputs[?OutputKey==`BackendECRRepoURI`].OutputValue' \
  --output text | sed 's|/private-ai-backend||')

# Set environment variables
export AWS_REGION=us-east-1
export ECR_REGISTRY="${ECR_REGISTRY}"
export ECS_CLUSTER=private-ai-production

# Run deployment script
chmod +x deployment/deploy.sh
./deployment/deploy.sh prod
```

#### 4. Run database migrations

```bash
chmod +x deployment/migrate.sh
./deployment/migrate.sh prod
```

#### 5. Enable pgvector extension

The initial migration should handle this, but verify:

```bash
./deployment/migrate.sh prod --revision head
```

If pgvector isn't installed on RDS, connect to the database and run:
```sql
CREATE EXTENSION IF NOT EXISTS vector;
```

---

## RDS Setup

### Instance configuration

The CloudFormation template creates:
- Engine: PostgreSQL 16.3
- Instance: `db.t3.medium` (2 vCPU, 4 GB RAM) — upgrade to `db.r6g.large` for production load
- Storage: 50 GB gp3, auto-scaling to 500 GB
- Multi-AZ: enabled in production
- Automated backups: 7-day retention
- Encryption: AES-256 via AWS KMS

### Connecting to RDS

RDS is in a private subnet and not directly accessible from the internet. To connect for maintenance:

**Option 1: AWS Systems Manager Session Manager (recommended)**
```bash
# Start a port-forwarding session to RDS through a bastion ECS task
aws ssm start-session \
  --target <ecs-task-id> \
  --document-name AWS-StartPortForwardingSessionToRemoteHost \
  --parameters '{"host":["rds-endpoint.xxx.rds.amazonaws.com"],"portNumber":["5432"],"localPortNumber":["5432"]}'

# Connect via local client
psql -h localhost -p 5432 -U dbadmin -d private_ai
```

**Option 2: One-off ECS task with psql**
```bash
aws ecs run-task \
  --cluster private-ai-production \
  --task-definition private-ai-assistant \
  --overrides '{"containerOverrides":[{"name":"backend","command":["psql","$DATABASE_URL","-c","\\l"]}]}'
```

### Monitoring RDS

- **Enhanced Monitoring**: 60-second intervals (enabled in production)
- **Performance Insights**: Enabled in production — view at RDS console
- **CloudWatch Alarms**: CPU > 80%, free storage < 10 GB, connections > 80% of max

---

## S3 Configuration

### Bucket structure

```
s3://private-ai-production-documents-{account_id}/
├── workspaces/
│   └── {workspace_id}/
│       └── documents/
│           └── {document_id}/
│               └── original.pdf
└── temp/
    └── {upload_id}/  (cleaned up after processing)
```

### CORS configuration

The CloudFormation template configures CORS for pre-signed URL uploads directly from the browser. If you need to update:

```bash
aws s3api put-bucket-cors \
  --bucket private-ai-production-documents-123456789012 \
  --cors-configuration '{
    "CORSRules": [{
      "AllowedHeaders": ["*"],
      "AllowedMethods": ["GET", "PUT", "POST"],
      "AllowedOrigins": ["https://app.yourdomain.com"],
      "ExposeHeaders": ["ETag"],
      "MaxAgeSeconds": 3600
    }]
  }'
```

### Lifecycle rules

- Incomplete multipart uploads: deleted after 7 days
- Previous object versions: moved to STANDARD_IA after 30 days, deleted after 90 days

---

## Environment Variables Reference

See `.env.example` for the complete list. Key production variables:

| Variable | Source | Notes |
|----------|--------|-------|
| `DATABASE_URL` | Secrets Manager | Auto-generated from RDS endpoint |
| `SECRET_KEY` | Secrets Manager | Generate once, never rotate without invalidating all sessions |
| `OPENAI_API_KEY` | Secrets Manager | |
| `REDIS_URL` | Secrets Manager | Uses `rediss://` (TLS) in production |
| `S3_BUCKET_NAME` | CloudFormation output | |
| `AWS_MARKETPLACE_PRODUCT_CODE` | Secrets Manager | Set after Marketplace listing approved |
| `ENVIRONMENT` | ECS task definition | `production` |

---

## SSL/TLS Configuration

### Production (ACM + ALB)

1. Request a certificate in ACM:
```bash
aws acm request-certificate \
  --domain-name app.yourdomain.com \
  --validation-method DNS \
  --region us-east-1
```

2. Add the DNS validation CNAME record to your domain (Route 53 or external DNS)

3. Wait for validation:
```bash
aws acm wait certificate-validated \
  --certificate-arn arn:aws:acm:us-east-1:123456789012:certificate/...
```

4. Pass the ARN to CloudFormation as `CertificateArn`

### Local development (self-signed)

```bash
bash nginx/ssl/generate-certs.sh
```

Browsers will show a security warning for self-signed certs. Accept the exception for local development.

---

## Domain Setup

### Route 53

```bash
# Get ALB DNS name from CloudFormation
ALB_DNS=$(aws cloudformation describe-stacks \
  --stack-name private-ai-production \
  --query 'Stacks[0].Outputs[?OutputKey==`ALBDNSName`].OutputValue' \
  --output text)

# Create A record (alias) pointing to ALB
aws route53 change-resource-record-sets \
  --hosted-zone-id YOUR_HOSTED_ZONE_ID \
  --change-batch "{
    \"Changes\": [{
      \"Action\": \"UPSERT\",
      \"ResourceRecordSet\": {
        \"Name\": \"app.yourdomain.com\",
        \"Type\": \"A\",
        \"AliasTarget\": {
          \"HostedZoneId\": \"Z35SXDOTRQ7X7K\",
          \"DNSName\": \"${ALB_DNS}\",
          \"EvaluateTargetHealth\": true
        }
      }
    }]
  }"
```

The hosted zone ID `Z35SXDOTRQ7X7K` is for ALBs in us-east-1. See AWS docs for other regions.

---

## Monitoring and Alerting

### CloudWatch Dashboards

Create a dashboard with these key metrics:

```bash
aws cloudwatch put-dashboard \
  --dashboard-name PrivateAI-Production \
  --dashboard-body file://deployment/cloudwatch-dashboard.json
```

Key metrics to monitor:

| Metric | Namespace | Alarm threshold |
|--------|-----------|----------------|
| CPU Utilization | AWS/ECS | > 80% for 5 min |
| Memory Utilization | AWS/ECS | > 85% for 5 min |
| Request count | AWS/ApplicationELB | — |
| 5XX errors | AWS/ApplicationELB | > 1% of requests |
| Response time (p99) | AWS/ApplicationELB | > 5 seconds |
| RDS CPU | AWS/RDS | > 80% |
| RDS Free Storage | AWS/RDS | < 5 GB |
| Redis Memory | AWS/ElastiCache | > 80% |

### CloudWatch Alarms

```bash
# 5XX error rate alarm
aws cloudwatch put-metric-alarm \
  --alarm-name private-ai-5xx-rate \
  --metric-name HTTPCode_Target_5XX_Count \
  --namespace AWS/ApplicationELB \
  --statistic Sum \
  --period 300 \
  --threshold 10 \
  --comparison-operator GreaterThanThreshold \
  --evaluation-periods 2 \
  --alarm-actions arn:aws:sns:us-east-1:123456789012:private-ai-alerts
```

---

## Backup Strategy

### Database (RDS)

- **Automated backups**: Daily snapshots, retained for 7 days (production)
- **Manual snapshots**: Create before major deployments
- **Point-in-time recovery**: Enabled, restore to any second within the retention window

```bash
# Create manual snapshot before deployment
aws rds create-db-snapshot \
  --db-instance-identifier private-ai-production-db \
  --db-snapshot-identifier "pre-deploy-$(date +%Y%m%d-%H%M%S)"
```

### S3 Documents

- **Versioning**: Enabled — previous versions retained for 90 days
- **Replication**: Optional — enable S3 Cross-Region Replication for disaster recovery

### Application State

ECS tasks are stateless. All state is in RDS, Redis, and S3.

---

## Scaling Considerations

### ECS Auto Scaling

The CloudFormation template configures:
- **Scale out**: CPU > 70% or Memory > 80% → add tasks
- **Scale in**: After 5-minute cooldown when metrics drop
- **Min tasks**: 2 (configured via `DesiredCount` parameter)
- **Max tasks**: 10

### Database Scaling

- **Vertical**: Upgrade instance class (requires ~1 minute failover with Multi-AZ)
- **Read replicas**: Add RDS Read Replica for read-heavy workloads
- **Connection pooling**: pgBouncer recommended if connections exceed RDS limit

### Redis Scaling

- **Vertical**: Upgrade cache node type
- **Cluster mode**: Enable ElastiCache cluster mode for horizontal scaling

---

## Cost Estimates

Approximate monthly costs (us-east-1, 2024 pricing):

| Service | Configuration | Est. Monthly Cost |
|---------|--------------|------------------|
| ECS Fargate | 2 tasks × 2 vCPU × 4 GB, 24/7 | ~$140 |
| RDS PostgreSQL | db.t3.medium, Multi-AZ, 50 GB | ~$90 |
| ElastiCache Redis | cache.t3.micro | ~$15 |
| ALB | 1 ALB + processing | ~$25 |
| S3 | 50 GB storage + requests | ~$5 |
| NAT Gateway | 1 gateway | ~$35 |
| CloudWatch | Logs + metrics | ~$10 |
| ECR | Image storage | ~$5 |
| Data Transfer | ~50 GB/month | ~$4 |
| **Total** | | **~$329/month** |

Reduce costs by:
- Using FARGATE_SPOT for Celery workers (~70% cheaper)
- Sizing down RDS to `db.t3.small` for low traffic (`~$45/month`)
- Using single-AZ RDS in non-production environments
