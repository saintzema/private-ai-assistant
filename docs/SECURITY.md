# Security Architecture

This document describes the security controls implemented in Private AI Knowledge Assistant, including authentication, tenant isolation, encryption, network security, and compliance considerations.

---

## Authentication & Authorization

### JWT Authentication

- **Access tokens**: Short-lived (30 minutes), signed with HS256 using a 256-bit secret
- **Refresh tokens**: Long-lived (7 days), stored server-side in Redis with a revocation list
- **Token rotation**: New refresh token issued on every refresh (prevents refresh token theft)
- **Blacklist**: Revoked tokens stored in Redis until expiry; checked on every authenticated request

```
POST /api/v1/auth/login  →  { access_token, refresh_token, expires_in }
POST /api/v1/auth/refresh  →  { access_token, refresh_token }  (old refresh token invalidated)
POST /api/v1/auth/logout  →  access token blacklisted, refresh token revoked
```

### Role-Based Access Control (RBAC)

Four roles with hierarchical permissions:

| Role | Permissions |
|------|-------------|
| `owner` | Full control: billing, delete workspace, manage members, all data |
| `admin` | Manage members, upload docs, chat, view audit logs |
| `member` | Upload docs (own), chat, view shared docs |
| `viewer` | Chat only, read-only access |

Permissions enforced at the FastAPI dependency level — not just in the frontend.

### Password Security

- Passwords hashed with **bcrypt** (cost factor 12)
- Minimum password requirements: 8+ chars, 1 uppercase, 1 number
- Account lockout after 5 failed attempts (15-minute lockout)
- Password reset via time-limited (1 hour) signed email tokens

---

## Tenant Isolation

Each workspace (tenant) is fully isolated:

- **Database row-level isolation**: All queries filtered by `workspace_id` via SQLAlchemy filter
- **S3 path isolation**: All objects stored under `workspaces/{workspace_id}/...`
- **pgvector isolation**: Embedding queries always include `workspace_id = ?` in WHERE clause
- **No cross-workspace data leakage**: API endpoints reject requests where the authenticated user's workspace differs from the resource's workspace

```sql
-- Every document query includes workspace filter
SELECT * FROM documents 
WHERE workspace_id = :workspace_id 
  AND id = :document_id;

-- Every vector search includes workspace filter
SELECT id, content, 1 - (embedding <=> :query_embedding) AS similarity
FROM document_chunks
WHERE workspace_id = :workspace_id
ORDER BY similarity DESC
LIMIT 10;
```

---

## Data Encryption

### At Rest

| Data | Encryption |
|------|-----------|
| PostgreSQL (RDS) | AES-256 via AWS KMS (storage-level encryption enabled) |
| S3 documents | SSE-KMS (server-side encryption with customer-managed KMS key) |
| ElastiCache Redis | AES-256 at-rest encryption enabled |
| ECS task environment | Secrets pulled from Secrets Manager (never stored in task definition plaintext) |
| Backups | Automated RDS snapshots inherit storage encryption |

### In Transit

| Connection | Encryption |
|-----------|-----------|
| Browser → ALB | TLS 1.3 (ELBSecurityPolicy-TLS13-1-2-2021-06) |
| ALB → ECS | HTTP within VPC (acceptable — VPC is private) |
| ECS → RDS | SSL enforced via `?sslmode=require` in DATABASE_URL |
| ECS → Redis | TLS via `rediss://` URL scheme |
| ECS → S3 | HTTPS (AWS SDK default) |
| ECS → Secrets Manager | HTTPS (AWS SDK default) |

---

## Network Security

### VPC Architecture

```
Internet
    │
    ▼
Internet Gateway
    │
    ▼
Public Subnets (10.0.1.0/24, 10.0.2.0/24)
    │  ALB (internet-facing)
    │  NAT Gateway
    ▼
Private Subnets (10.0.10.0/24, 10.0.11.0/24)
    │  ECS Tasks
    │  RDS
    │  ElastiCache
```

### Security Groups

| Group | Inbound | Outbound |
|-------|---------|---------|
| ALB SG | 80/443 from 0.0.0.0/0 | All to ECS SG |
| ECS SG | 8000, 3000 from ALB SG only | All to RDS SG, Redis SG, internet (via NAT) |
| RDS SG | 5432 from ECS SG only | None |
| Redis SG | 6379 from ECS SG only | None |

No direct internet access to RDS or Redis — all inbound from ECS only.

### Network ACLs

- Default NACL allows all traffic within VPC subnets
- Custom NACL on public subnets blocks all inbound except 80, 443, and ephemeral ports

---

## IAM Least Privilege

### ECS Task Role (runtime permissions)

```json
{
  "S3": ["s3:GetObject", "s3:PutObject", "s3:DeleteObject", "s3:HeadObject"],
  "S3Bucket": ["s3:ListBucket"],
  "SecretsManager": ["secretsmanager:GetSecretValue"],
  "Marketplace": ["aws-marketplace:ResolveCustomer", "aws-marketplace:GetEntitlements", "aws-marketplace:MeterUsage"],
  "Bedrock": ["bedrock:InvokeModel", "bedrock:InvokeModelWithResponseStream"],
  "CloudWatch": ["cloudwatch:PutMetricData"]
}
```

No `s3:*` wildcards. No `iam:*` permissions. No `ec2:*` permissions.

### ECS Execution Role (pull-time permissions)

```json
{
  "ECR": ["ecr:GetAuthorizationToken", "ecr:BatchGetImage", "ecr:GetDownloadUrlForLayer"],
  "SecretsManager": ["secretsmanager:GetSecretValue"],
  "CloudWatch": ["logs:CreateLogStream", "logs:PutLogEvents"]
}
```

---

## API Security

### Rate Limiting

Implemented at Nginx level (configurable) and FastAPI middleware (Redis-backed):

| Endpoint Class | Limit |
|---------------|-------|
| Auth endpoints (`/auth/*`) | 10 req/min per IP |
| API endpoints (`/api/*`) | 30 req/min per IP |
| File uploads | 5 req/hour per user |
| Chat endpoints | 20 req/min per user |

Rate limit headers returned: `X-RateLimit-Limit`, `X-RateLimit-Remaining`, `X-RateLimit-Reset`.

### Input Validation

- All request bodies validated with Pydantic v2 models
- File uploads validated: MIME type, file extension, magic bytes (not just extension)
- Maximum file size enforced at Nginx (100MB) and FastAPI level (50MB default)
- SQL injection: impossible via SQLAlchemy ORM with parameterized queries
- Path traversal: S3 keys sanitized before storage

### Security Headers

All responses include:

```
Strict-Transport-Security: max-age=63072000; includeSubDomains; preload
X-Content-Type-Options: nosniff
X-Frame-Options: DENY
X-XSS-Protection: 1; mode=block
Referrer-Policy: strict-origin-when-cross-origin
Permissions-Policy: camera=(), microphone=(), geolocation=(), payment=()
Content-Security-Policy: default-src 'self'; ...
X-Request-ID: <uuid>
```

---

## File Upload Security

1. **Size limit**: Nginx enforces 100MB; FastAPI enforces configured `MAX_DOCUMENT_SIZE_MB`
2. **Type validation**: Extension check AND magic byte inspection (python-magic)
3. **Allowed types**: PDF, DOCX, DOC, TXT, MD, CSV, XLSX, PPTX only
4. **Antivirus**: Integrate ClamAV (optional) via Celery task before processing
5. **Storage**: Files stored in S3 with a UUID key — never accessible via public URL
6. **Access**: Files served only via pre-signed S3 URLs with 1-hour expiry
7. **Metadata**: Original filename stored in database; never used in file path

```python
ALLOWED_MIME_TYPES = {
    "application/pdf",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    "application/msword",
    "text/plain",
    "text/markdown",
    "text/csv",
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    "application/vnd.openxmlformats-officedocument.presentationml.presentation",
}

def validate_file_type(file_bytes: bytes, filename: str) -> str:
    """Validate file using magic bytes, not just extension."""
    import magic
    detected_mime = magic.from_buffer(file_bytes[:2048], mime=True)
    if detected_mime not in ALLOWED_MIME_TYPES:
        raise ValueError(f"Unsupported file type: {detected_mime}")
    return detected_mime
```

---

## Audit Logging

All sensitive operations are written to the `audit_logs` table and CloudWatch:

| Event | Logged Fields |
|-------|--------------|
| User login / logout | user_id, ip, user_agent, timestamp, success |
| Document uploaded | user_id, workspace_id, document_id, filename, size |
| Document deleted | user_id, workspace_id, document_id |
| Chat query | user_id, workspace_id, session_id, query_hash (not content) |
| Member added/removed | actor_id, target_user_id, workspace_id, role |
| Subscription change | user_id, old_plan, new_plan, marketplace_customer_id |
| Permission denied | user_id, endpoint, reason |

Audit logs are append-only — no UPDATE or DELETE operations permitted on this table.

---

## Compliance Considerations

### SOC 2 Type II

Controls relevant to SOC 2 already implemented:
- **CC6.1** — Access control via RBAC
- **CC6.2** — Prior to access, authenticated via JWT
- **CC6.3** — Least-privilege IAM roles
- **CC6.6** — Network security groups restricting access
- **CC6.7** — Encryption at rest and in transit
- **CC7.2** — CloudWatch monitoring and alerts
- **A1.2** — ECS auto-scaling for availability

Still required for full SOC 2:
- Annual penetration testing
- Formal incident response plan
- Security awareness training records
- Vendor risk assessments

### GDPR

- **Data residency**: All data stays in your chosen AWS region
- **Right to erasure**: `DELETE /api/v1/users/{id}` cascades to all user data
- **Data portability**: `GET /api/v1/users/me/export` returns all user data as JSON
- **Processing records**: Audit log serves as processing activity record
- **DPA**: AWS provides a Data Processing Agreement under their BAA/DPA program

---

## Security Checklist for Production

### Infrastructure
- [ ] RDS encryption enabled (storage + transit)
- [ ] S3 bucket blocks all public access
- [ ] S3 bucket policy denies unencrypted uploads
- [ ] ElastiCache encryption at rest and in transit enabled
- [ ] VPC has no direct internet routes to private subnets
- [ ] Security groups follow least-privilege (no 0.0.0.0/0 inbound except ALB)
- [ ] ALB access logs enabled and stored in S3
- [ ] CloudTrail enabled for all AWS API calls
- [ ] AWS Config rules monitoring for security drift
- [ ] GuardDuty enabled for threat detection

### Application
- [ ] `SECRET_KEY` is 32+ chars, randomly generated, stored in Secrets Manager
- [ ] `POSTGRES_PASSWORD` is 16+ chars, no special chars that break connection strings
- [ ] All secrets sourced from Secrets Manager (not environment variables in prod)
- [ ] CORS origins restricted to your domain(s)
- [ ] Debug mode disabled (`ENVIRONMENT=production`)
- [ ] Swagger UI disabled in production (`docs_url=None`)
- [ ] Rate limiting enabled (`ENABLE_RATE_LIMITING=true`)
- [ ] Email verification enabled (`ENABLE_EMAIL_VERIFICATION=true`)
- [ ] Audit logging enabled (`ENABLE_AUDIT_LOGGING=true`)

### Access
- [ ] No IAM users with console access for production workloads
- [ ] MFA enabled on AWS root account and all IAM users
- [ ] No long-lived AWS access keys stored in application
- [ ] ECS task role has only necessary permissions (review before go-live)

---

## Incident Response

### Detection

1. CloudWatch Alarms on:
   - Authentication failure rate > 50/min → SNS alert
   - API error rate > 5% → SNS alert
   - ECS task crash loop → SNS alert
   - Marketplace metering failures → SNS alert

2. GuardDuty findings → EventBridge → SNS → PagerDuty (or similar)

### Response Steps

1. **Contain**: Revoke affected tokens, disable compromised accounts
2. **Assess**: Review CloudWatch logs, audit log, GuardDuty findings
3. **Eradicate**: Rotate secrets, redeploy if code is compromised
4. **Recover**: Restore from last known-good state
5. **Document**: Incident report within 72 hours

### Secret Rotation

```bash
# Rotate SECRET_KEY (all active sessions will be invalidated)
NEW_KEY=$(python -c "import secrets; print(secrets.token_hex(32))")
aws secretsmanager put-secret-value \
  --secret-id private-ai/production \
  --secret-string "{\"SECRET_KEY\": \"$NEW_KEY\"}"
# Redeploy ECS service to pick up new secret
./deployment/deploy.sh prod
```

---

## Vulnerability Disclosure

If you discover a security vulnerability, please report it responsibly:

- **Email**: security@yourorganization.com
- **PGP key**: Available at https://yourorganization.com/.well-known/security.txt
- **Response time**: We acknowledge within 24 hours and provide a fix timeline within 72 hours
- **Scope**: Application code, infrastructure configuration, API endpoints
- **Out of scope**: Social engineering, physical attacks, third-party services

We do not pursue legal action against researchers who follow responsible disclosure guidelines.
