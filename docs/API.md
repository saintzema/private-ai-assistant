# API Reference

Base URL: `https://your-domain.com/api/v1`

Interactive documentation: `/docs` (Swagger UI, development only)

---

## Authentication

All endpoints except `/auth/login`, `/auth/register`, `/health`, and `/marketplace/fulfill` require a valid JWT in the Authorization header.

### Headers

```
Authorization: Bearer <access_token>
Content-Type: application/json
X-Request-ID: <optional-uuid>  # For request tracing
```

### Token Format

```json
{
  "access_token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "refresh_token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "token_type": "bearer",
  "expires_in": 1800
}
```

Access tokens expire in 30 minutes. Use the refresh token to get a new access token without re-authenticating.

---

## Auth Endpoints

### POST /auth/register

Register a new user account.

**Request:**
```json
{
  "email": "user@example.com",
  "password": "SecurePassword123",
  "full_name": "Jane Doe",
  "workspace_name": "Acme Corp",
  "marketplace_customer_id": "optional-aws-marketplace-customer-id"
}
```

**Response 201:**
```json
{
  "user": {
    "id": "550e8400-e29b-41d4-a716-446655440000",
    "email": "user@example.com",
    "full_name": "Jane Doe",
    "is_verified": false,
    "created_at": "2024-01-15T12:00:00Z"
  },
  "workspace": {
    "id": "7c9e6679-7425-40de-944b-e07fc1f90ae7",
    "name": "Acme Corp",
    "slug": "acme-corp"
  },
  "message": "Registration successful. Please verify your email."
}
```

**Error 400:** Email already registered, weak password, invalid Marketplace customer ID.

---

### POST /auth/login

Authenticate and receive tokens.

**Request:**
```json
{
  "email": "user@example.com",
  "password": "SecurePassword123"
}
```

**Response 200:**
```json
{
  "access_token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "refresh_token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "token_type": "bearer",
  "expires_in": 1800,
  "user": {
    "id": "550e8400-e29b-41d4-a716-446655440000",
    "email": "user@example.com",
    "full_name": "Jane Doe",
    "role": "owner"
  }
}
```

**Error 401:** Invalid credentials. **Error 423:** Account locked (too many failed attempts).

---

### POST /auth/refresh

Exchange a refresh token for a new access token.

**Request:**
```json
{
  "refresh_token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
}
```

**Response 200:** Same shape as `/auth/login` response (old refresh token is invalidated).

---

### POST /auth/logout

Revoke the current session.

**Headers:** `Authorization: Bearer <access_token>`

**Request:**
```json
{
  "refresh_token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
}
```

**Response 200:**
```json
{ "message": "Logged out successfully" }
```

---

### POST /auth/forgot-password

Trigger password reset email.

**Request:**
```json
{ "email": "user@example.com" }
```

**Response 200:** Always returns 200 (security — does not confirm if email exists).

---

### POST /auth/reset-password

Reset password with the token from the email.

**Request:**
```json
{
  "token": "reset-token-from-email",
  "new_password": "NewSecurePassword456"
}
```

**Response 200:**
```json
{ "message": "Password reset successfully" }
```

---

## User Endpoints

### GET /users/me

Get the authenticated user's profile.

**Response 200:**
```json
{
  "id": "550e8400-e29b-41d4-a716-446655440000",
  "email": "user@example.com",
  "full_name": "Jane Doe",
  "avatar_url": null,
  "is_verified": true,
  "role": "owner",
  "workspace_id": "7c9e6679-7425-40de-944b-e07fc1f90ae7",
  "created_at": "2024-01-15T12:00:00Z",
  "last_login_at": "2024-01-20T09:30:00Z"
}
```

---

### PATCH /users/me

Update the authenticated user's profile.

**Request:**
```json
{
  "full_name": "Jane Smith",
  "avatar_url": "https://example.com/avatar.png"
}
```

**Response 200:** Updated user object.

---

### POST /users/me/change-password

**Request:**
```json
{
  "current_password": "OldPassword123",
  "new_password": "NewPassword456"
}
```

**Response 200:**
```json
{ "message": "Password changed successfully" }
```

---

### GET /users/me/export

Export all user data (GDPR data portability).

**Response 200:** JSON file download containing user profile, documents metadata, and chat history.

---

### DELETE /users/me

Permanently delete the account and all associated data.

**Response 204:** No content.

---

## Workspace Endpoints

### GET /workspaces/me

Get the current workspace details.

**Response 200:**
```json
{
  "id": "7c9e6679-7425-40de-944b-e07fc1f90ae7",
  "name": "Acme Corp",
  "slug": "acme-corp",
  "plan": "professional",
  "document_count": 47,
  "storage_used_mb": 1240,
  "storage_limit_mb": 10240,
  "member_count": 8,
  "member_limit": 25,
  "created_at": "2024-01-15T12:00:00Z"
}
```

---

### GET /workspaces/me/members

List workspace members. Requires `admin` or `owner` role.

**Query params:** `page=1&page_size=20`

**Response 200:**
```json
{
  "members": [
    {
      "id": "550e8400-e29b-41d4-a716-446655440000",
      "email": "user@example.com",
      "full_name": "Jane Doe",
      "role": "owner",
      "joined_at": "2024-01-15T12:00:00Z",
      "last_active_at": "2024-01-20T09:30:00Z"
    }
  ],
  "total": 8,
  "page": 1,
  "page_size": 20
}
```

---

### POST /workspaces/me/members/invite

Invite a new member by email.

**Request:**
```json
{
  "email": "newmember@example.com",
  "role": "member"
}
```

**Response 201:**
```json
{
  "invitation_id": "inv-abc123",
  "email": "newmember@example.com",
  "expires_at": "2024-01-22T12:00:00Z"
}
```

---

### PATCH /workspaces/me/members/{user_id}

Change a member's role.

**Request:**
```json
{ "role": "admin" }
```

**Response 200:** Updated member object.

---

### DELETE /workspaces/me/members/{user_id}

Remove a member from the workspace.

**Response 204:** No content.

---

## Document Endpoints

### POST /documents/upload

Upload a document for processing. Multipart form data.

**Request:** `Content-Type: multipart/form-data`

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `file` | File | Yes | Document file (PDF, DOCX, TXT, etc.) |
| `title` | string | No | Display title (defaults to filename) |
| `description` | string | No | Optional description |
| `tags` | string[] | No | Comma-separated tags |

**Response 202:**
```json
{
  "document_id": "doc-7c9e6679-7425",
  "title": "Q4 Financial Report.pdf",
  "status": "processing",
  "file_size_mb": 2.4,
  "message": "Document uploaded successfully. Processing will begin shortly.",
  "task_id": "celery-task-abc123"
}
```

Processing is asynchronous. Poll `GET /documents/{id}` for status.

---

### GET /documents

List documents in the workspace.

**Query params:**
- `page=1` — page number
- `page_size=20` — items per page (max 100)
- `status=ready` — filter by status: `processing`, `ready`, `failed`
- `search=financial` — full-text search on title/description
- `tag=finance` — filter by tag

**Response 200:**
```json
{
  "documents": [
    {
      "id": "doc-7c9e6679-7425",
      "title": "Q4 Financial Report.pdf",
      "description": "",
      "status": "ready",
      "file_type": "pdf",
      "file_size_mb": 2.4,
      "chunk_count": 47,
      "tags": ["finance", "q4-2024"],
      "uploaded_by": {
        "id": "550e8400-e29b-41d4-a716-446655440000",
        "full_name": "Jane Doe"
      },
      "created_at": "2024-01-20T10:00:00Z",
      "processed_at": "2024-01-20T10:02:30Z"
    }
  ],
  "total": 47,
  "page": 1,
  "page_size": 20
}
```

---

### GET /documents/{document_id}

Get a single document with processing status.

**Response 200:**
```json
{
  "id": "doc-7c9e6679-7425",
  "title": "Q4 Financial Report.pdf",
  "status": "ready",
  "processing_error": null,
  "chunk_count": 47,
  "page_count": 12,
  "word_count": 8420,
  "download_url": "https://s3.../presigned-url?expires=3600",
  "created_at": "2024-01-20T10:00:00Z"
}
```

---

### PATCH /documents/{document_id}

Update document metadata.

**Request:**
```json
{
  "title": "Q4 2024 Financial Report — Final",
  "description": "Approved version",
  "tags": ["finance", "q4-2024", "approved"]
}
```

**Response 200:** Updated document object.

---

### DELETE /documents/{document_id}

Delete a document and all its embeddings.

**Response 204:** No content.

---

### GET /documents/{document_id}/download

Get a pre-signed S3 URL to download the original file.

**Response 200:**
```json
{
  "download_url": "https://s3.amazonaws.com/bucket/...?AWSAccessKeyId=...&Expires=1705748400&Signature=...",
  "expires_at": "2024-01-20T11:00:00Z"
}
```

---

## Chat Endpoints

### POST /chat/sessions

Create a new chat session.

**Request:**
```json
{
  "title": "Q4 revenue analysis",
  "document_ids": ["doc-7c9e6679-7425", "doc-abc123"],
  "settings": {
    "model": "gpt-4o-mini",
    "temperature": 0.7,
    "max_tokens": 2048,
    "top_k_documents": 5
  }
}
```

**Response 201:**
```json
{
  "session_id": "sess-550e8400-e29b",
  "title": "Q4 revenue analysis",
  "created_at": "2024-01-20T10:00:00Z"
}
```

---

### GET /chat/sessions

List chat sessions for the current user.

**Query params:** `page=1&page_size=20`

**Response 200:**
```json
{
  "sessions": [
    {
      "session_id": "sess-550e8400-e29b",
      "title": "Q4 revenue analysis",
      "message_count": 12,
      "last_message_at": "2024-01-20T10:45:00Z",
      "created_at": "2024-01-20T10:00:00Z"
    }
  ],
  "total": 24
}
```

---

### GET /chat/sessions/{session_id}

Get chat session with full message history.

**Response 200:**
```json
{
  "session_id": "sess-550e8400-e29b",
  "title": "Q4 revenue analysis",
  "messages": [
    {
      "id": "msg-001",
      "role": "user",
      "content": "What was total revenue in Q4?",
      "created_at": "2024-01-20T10:00:10Z"
    },
    {
      "id": "msg-002",
      "role": "assistant",
      "content": "Based on the Q4 Financial Report, total revenue was $42.3M...",
      "sources": [
        {
          "document_id": "doc-7c9e6679-7425",
          "document_title": "Q4 Financial Report.pdf",
          "chunk_text": "Total revenue for Q4 2024 was $42.3 million...",
          "page_number": 3,
          "similarity_score": 0.94
        }
      ],
      "created_at": "2024-01-20T10:00:12Z",
      "tokens_used": 847
    }
  ]
}
```

---

### POST /chat/sessions/{session_id}/messages

Send a message and get a complete (non-streaming) response.

**Request:**
```json
{
  "content": "What was total revenue in Q4?",
  "document_filter_ids": ["doc-7c9e6679-7425"]
}
```

**Response 200:** Message object with `role: "assistant"`, `content`, and `sources`.

---

### GET /chat/sessions/{session_id}/stream

**Streaming endpoint (SSE).** Send a message and receive a streaming response.

**Query params:** `message=What+was+total+revenue+in+Q4%3F`

**Response:** `Content-Type: text/event-stream`

```
event: message_start
data: {"message_id": "msg-003", "session_id": "sess-550e8400-e29b"}

event: content_delta
data: {"delta": "Based on"}

event: content_delta
data: {"delta": " the Q4 Financial"}

event: content_delta
data: {"delta": " Report,"}

event: sources
data: {"sources": [{"document_id": "doc-7c9e6679-7425", "page_number": 3, "similarity_score": 0.94}]}

event: message_end
data: {"message_id": "msg-003", "tokens_used": 847, "finish_reason": "stop"}
```

**Consuming SSE in JavaScript:**
```javascript
const evtSource = new EventSource(
  `/api/v1/chat/sessions/${sessionId}/stream?message=${encodeURIComponent(message)}`,
  { withCredentials: true }
)

evtSource.addEventListener("content_delta", (e) => {
  const { delta } = JSON.parse(e.data)
  appendToChat(delta)
})

evtSource.addEventListener("message_end", (e) => {
  evtSource.close()
})
```

---

### DELETE /chat/sessions/{session_id}

Delete a chat session and all its messages.

**Response 204:** No content.

---

## Admin Endpoints

These endpoints require `owner` role and system admin privileges.

### GET /admin/stats

System-wide statistics.

**Response 200:**
```json
{
  "total_workspaces": 142,
  "total_users": 893,
  "total_documents": 12847,
  "total_queries_today": 4521,
  "storage_used_gb": 48.7
}
```

---

### GET /admin/workspaces

List all workspaces (paginated).

---

### PATCH /admin/workspaces/{workspace_id}

Update workspace settings (plan, limits).

---

### GET /admin/audit-logs

View audit logs across all workspaces.

**Query params:** `workspace_id`, `user_id`, `event_type`, `from`, `to`, `page`, `page_size`

---

## Subscription / Marketplace Endpoints

### POST /marketplace/fulfill

AWS Marketplace fulfillment webhook. Called by AWS when a customer subscribes.

**Headers:** `x-amzn-marketplace-token: <token>`

**Response 302:** Redirect to registration page.

---

### GET /subscriptions/me

Get the current subscription details.

**Response 200:**
```json
{
  "plan": "professional",
  "status": "active",
  "marketplace_customer_id": "aws-customer-abc123",
  "entitlements": [
    { "dimension": "queries", "limit": 10000, "used_this_month": 4521 },
    { "dimension": "storage_gb", "limit": 10, "used_gb": 4.87 },
    { "dimension": "users", "limit": 25, "active_users": 8 }
  ],
  "billing_period_start": "2024-01-01T00:00:00Z",
  "billing_period_end": "2024-01-31T23:59:59Z",
  "next_billing_date": "2024-02-01T00:00:00Z"
}
```

---

## Error Codes and Handling

All errors follow this shape:

```json
{
  "detail": "Human-readable error message",
  "error_code": "DOCUMENT_NOT_FOUND",
  "request_id": "req-550e8400-e29b-41d4"
}
```

| HTTP Status | Error Code | Description |
|-------------|-----------|-------------|
| 400 | `VALIDATION_ERROR` | Request body failed validation |
| 400 | `INVALID_FILE_TYPE` | Unsupported file type |
| 400 | `FILE_TOO_LARGE` | Exceeds size limit |
| 401 | `UNAUTHORIZED` | Missing or invalid token |
| 401 | `TOKEN_EXPIRED` | Access token expired (refresh it) |
| 403 | `FORBIDDEN` | Insufficient role permissions |
| 404 | `NOT_FOUND` | Resource not found |
| 409 | `CONFLICT` | Resource already exists |
| 422 | `UNPROCESSABLE_ENTITY` | Semantic validation error |
| 423 | `ACCOUNT_LOCKED` | Too many failed login attempts |
| 429 | `RATE_LIMIT_EXCEEDED` | Too many requests |
| 500 | `INTERNAL_ERROR` | Server error (check logs) |
| 502 | `UPSTREAM_ERROR` | OpenAI / AWS API error |
| 503 | `SERVICE_UNAVAILABLE` | Database or Redis unavailable |

---

## Rate Limits

| Endpoint | Limit | Window |
|----------|-------|--------|
| Auth endpoints | 10 requests | 1 minute |
| General API | 30 requests | 1 minute |
| File uploads | 5 requests | 1 hour |
| Chat messages | 20 requests | 1 minute |

When rate limited, the response includes:
```
HTTP/1.1 429 Too Many Requests
X-RateLimit-Limit: 30
X-RateLimit-Remaining: 0
X-RateLimit-Reset: 1705748460
Retry-After: 37
```

---

## Streaming (SSE) Documentation

The chat streaming endpoint uses [Server-Sent Events (SSE)](https://developer.mozilla.org/en-US/docs/Web/API/Server-sent_events).

### Event Types

| Event | Payload | Description |
|-------|---------|-------------|
| `message_start` | `{message_id, session_id}` | Stream begins |
| `content_delta` | `{delta: string}` | Incremental text chunk |
| `sources` | `{sources: Source[]}` | Retrieved document chunks (sent before first delta) |
| `message_end` | `{message_id, tokens_used, finish_reason}` | Stream complete |
| `error` | `{error_code, detail}` | Stream error (connection should close) |

### Connection Management

- Connections auto-close after `message_end`
- Idle timeout: 60 seconds (Nginx proxy_read_timeout)
- Reconnect: SSE clients auto-reconnect; use `Last-Event-ID` header to resume
- Keep-alive: Server sends `: keep-alive` comment every 15 seconds

### Authentication for SSE

SSE connections use the same `Authorization: Bearer <token>` header. For browser EventSource (which cannot set headers), use the `token` query parameter:

```
GET /api/v1/chat/sessions/{id}/stream?message=...&token=<access_token>
```

The token query parameter is validated identically to the Authorization header.
