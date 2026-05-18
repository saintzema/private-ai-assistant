# AWS Marketplace Integration Guide

This guide walks you through integrating Private AI Knowledge Assistant with AWS Marketplace as a SaaS product, including the full token validation flow, metering API setup, and production checklist.

---

## Overview of AWS Marketplace SaaS Integration

AWS Marketplace SaaS products use a three-part integration:

1. **Fulfillment** — AWS sends a registration token to your SaaS URL when a customer subscribes
2. **Entitlement** — your app checks what the customer is entitled to (plan, limits)
3. **Metering** — your app reports usage to AWS so the customer is billed correctly

```
Customer subscribes on Marketplace
           │
           ▼
AWS sends POST to your SaaS URL with registration token
           │
           ▼
Your app calls ResolveCustomer(token) → gets CustomerIdentifier
           │
           ▼
Your app creates/activates customer account
           │
           ▼
Customer uses your product
           │
           ▼
Your app calls MeterUsage() hourly with actual usage
```

---

## Prerequisites

- AWS Seller account approved in AWS Marketplace Management Portal (AMMP)
- Product listing created and in "Limited" state (not yet published)
- AWS CLI with seller permissions
- Your SaaS application deployed with a public HTTPS endpoint
- Secrets Manager secret containing `AWS_MARKETPLACE_PRODUCT_CODE`

---

## Step 1: Create Marketplace Listing

1. Log in to [AWS Marketplace Management Portal](https://aws.amazon.com/marketplace/management/)
2. Navigate to **Products** → **SaaS**
3. Click **Create SaaS product**
4. Fill in:
   - **Product title**: Private AI Knowledge Assistant
   - **Short description**: Secure AI knowledge base for your private documents
   - **Pricing model**: SaaS Subscriptions (or Contracts + Subscriptions for enterprise)
5. Define pricing dimensions:
   - `queries` — per 1,000 AI queries
   - `storage_gb` — per GB of document storage
   - `users` — per active user per month
6. Save as draft — you'll get a **Product Code** (e.g., `prod-abc123xyz`)
7. Store the Product Code in Secrets Manager:

```bash
aws secretsmanager put-secret-value \
  --secret-id private-ai/production \
  --secret-string '{"AWS_MARKETPLACE_PRODUCT_CODE": "prod-abc123xyz"}'
```

---

## Step 2: Configure SaaS Fulfillment URL

In AMMP, set your **SaaS URL** (Fulfillment URL) to:

```
https://your-domain.com/api/v1/marketplace/fulfill
```

AWS will POST to this URL with a `x-amzn-marketplace-token` header when a customer subscribes or changes their plan.

**Your endpoint must:**
- Respond with HTTP 200 within 15 seconds
- Redirect the customer to your registration page after token resolution
- Be accessible from AWS IP ranges (no IP allowlisting on this endpoint)

---

## Step 3: Token Validation Flow

```
AWS Marketplace                  Your SaaS App                    Customer
     │                                │                               │
     │  POST /api/v1/marketplace/     │                               │
     │  fulfill                       │                               │
     │  x-amzn-marketplace-token: T  │                               │
     │──────────────────────────────►│                               │
     │                                │                               │
     │                                │  ResolveCustomer(token=T)    │
     │                                │─────────────────────────────►│AWS API
     │                                │                               │
     │                                │  CustomerIdentifier: CID     │
     │                                │◄─────────────────────────────│
     │                                │                               │
     │                                │  Store CID, create account    │
     │                                │  or activate existing         │
     │                                │                               │
     │  200 OK                        │                               │
     │◄──────────────────────────────│                               │
     │                                │                               │
     │                                │  Redirect to /register?cid=CID│
     │                                │──────────────────────────────►│
```

### ResolveCustomer API call

```python
import boto3
from botocore.exceptions import ClientError

def resolve_marketplace_customer(token: str) -> dict:
    """
    Resolve a marketplace registration token to a CustomerIdentifier.
    Must be called within 60 minutes of token issuance.
    """
    client = boto3.client(
        "marketplace-metering",
        region_name="us-east-1"  # Always us-east-1 for Marketplace
    )
    try:
        response = client.resolve_customer(RegistrationToken=token)
        return {
            "customer_identifier": response["CustomerIdentifier"],
            "product_code": response["ProductCode"],
            "customer_aws_account_id": response.get("CustomerAWSAccountId"),
        }
    except ClientError as e:
        error_code = e.response["Error"]["Code"]
        if error_code == "ExpiredTokenException":
            raise ValueError("Marketplace registration token has expired (>60 min)")
        elif error_code == "InvalidTokenException":
            raise ValueError("Invalid marketplace registration token")
        else:
            raise RuntimeError(f"AWS Marketplace error: {error_code}: {e}")
```

### FastAPI fulfillment endpoint

```python
from fastapi import APIRouter, Header, HTTPException, Request
from fastapi.responses import RedirectResponse

router = APIRouter(prefix="/marketplace", tags=["marketplace"])

@router.post("/fulfill")
async def marketplace_fulfill(
    request: Request,
    x_amzn_marketplace_token: str = Header(None, alias="x-amzn-marketplace-token"),
):
    """
    AWS Marketplace calls this URL after a customer subscribes.
    Resolves the token and redirects customer to registration.
    """
    if not x_amzn_marketplace_token:
        raise HTTPException(status_code=400, detail="Missing marketplace token")

    try:
        customer_info = resolve_marketplace_customer(x_amzn_marketplace_token)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except RuntimeError as e:
        raise HTTPException(status_code=502, detail=str(e))

    customer_id = customer_info["customer_identifier"]

    # Idempotently create or activate the customer record
    await upsert_marketplace_customer(customer_id, customer_info)

    # Redirect to registration/login page
    return RedirectResponse(
        url=f"/register?marketplace_customer_id={customer_id}&source=aws_marketplace",
        status_code=302,
    )
```

---

## Step 4: Customer Registration Flow

After token resolution, redirect the customer to your registration page:

```
/register?marketplace_customer_id=<CID>&source=aws_marketplace
```

Your registration page should:
1. Pre-populate the form with `marketplace_customer_id`
2. Let the customer set their name, email, and password
3. On submit, call `POST /api/v1/auth/register` with the `marketplace_customer_id` included
4. Your backend associates the user account with the Marketplace customer record

```python
async def upsert_marketplace_customer(
    customer_identifier: str,
    customer_info: dict,
    db: AsyncSession,
) -> MarketplaceCustomer:
    """Create or update a Marketplace customer record."""
    existing = await db.execute(
        select(MarketplaceCustomer).where(
            MarketplaceCustomer.customer_identifier == customer_identifier
        )
    )
    customer = existing.scalar_one_or_none()

    if customer is None:
        customer = MarketplaceCustomer(
            customer_identifier=customer_identifier,
            product_code=customer_info["product_code"],
            aws_account_id=customer_info.get("customer_aws_account_id"),
            status="pending_registration",
        )
        db.add(customer)
    else:
        customer.status = "active"
        customer.updated_at = datetime.utcnow()

    await db.commit()
    await db.refresh(customer)
    return customer
```

---

## Step 5: Metering API Setup

AWS Marketplace bills your customers based on usage you report. You must call `MeterUsage` at least once per hour for each active customer per dimension.

**Metering rules:**
- Call within the same UTC hour the usage occurred
- AWS deduplicates calls with the same `UsageAllocationTag` within an hour
- Maximum 25 usage allocations per `MeterUsage` call
- Minimum quantity: 1 (cannot meter 0 — just omit the call)

```python
import boto3
from datetime import datetime, timezone
from botocore.exceptions import ClientError

def meter_usage(
    customer_identifier: str,
    product_code: str,
    dimension: str,  # e.g., "queries", "storage_gb", "users"
    quantity: int,
    timestamp: datetime = None,
) -> str:
    """
    Report metered usage to AWS Marketplace.
    Returns the MeteringRecordId for audit purposes.
    Must be called with the same CustomerIdentifier from ResolveCustomer.
    """
    if quantity <= 0:
        return None  # Nothing to meter

    client = boto3.client("marketplace-metering", region_name="us-east-1")
    ts = timestamp or datetime.now(timezone.utc)

    try:
        response = client.meter_usage(
            ProductCode=product_code,
            Timestamp=ts,
            UsageDimension=dimension,
            UsageQuantity=quantity,
            DryRun=False,
        )
        return response["MeteringRecordId"]
    except ClientError as e:
        error_code = e.response["Error"]["Code"]
        if error_code == "DuplicateRequestException":
            # Idempotent: already metered for this hour
            return "duplicate"
        elif error_code == "CustomerNotSubscribedException":
            # Customer cancelled — disable their account
            raise SubscriptionExpiredError(customer_identifier)
        elif error_code == "ThrottlingException":
            raise RetryableError("Marketplace metering throttled — will retry")
        else:
            raise RuntimeError(f"Metering failed: {error_code}: {e}")
```

---

## Step 6: Entitlement Check Implementation

Use `GetEntitlements` to verify what a customer is entitled to before granting access.

```python
def get_customer_entitlements(
    customer_identifier: str,
    product_code: str,
) -> list[dict]:
    """
    Get the current entitlements for a Marketplace customer.
    Returns a list of active entitlements.
    """
    client = boto3.client("marketplace-entitlement", region_name="us-east-1")

    try:
        response = client.get_entitlements(
            ProductCode=product_code,
            Filter={"CUSTOMER_IDENTIFIER": [customer_identifier]},
        )
        entitlements = response.get("Entitlements", [])

        # Filter to only active (non-expired) entitlements
        now = datetime.now(timezone.utc)
        active = [
            {
                "dimension": e["Dimension"],
                "value": e.get("Value", {}).get("IntegerValue", 0),
                "expires_at": e.get("ExpirationDate"),
            }
            for e in entitlements
            if not e.get("ExpirationDate") or e["ExpirationDate"] > now
        ]
        return active

    except ClientError as e:
        raise RuntimeError(f"Entitlement check failed: {e.response['Error']['Code']}")


def check_customer_subscribed(customer_identifier: str, product_code: str) -> bool:
    """
    Quick check: is this customer still subscribed?
    Cache this result for up to 15 minutes to avoid throttling.
    """
    entitlements = get_customer_entitlements(customer_identifier, product_code)
    return len(entitlements) > 0
```

### Middleware integration

```python
from functools import lru_cache
import time

# Cache entitlement checks for 15 minutes (900s)
_entitlement_cache: dict[str, tuple[bool, float]] = {}

def is_entitled(customer_identifier: str) -> bool:
    cached = _entitlement_cache.get(customer_identifier)
    if cached and (time.time() - cached[1]) < 900:
        return cached[0]

    result = check_customer_subscribed(
        customer_identifier,
        settings.AWS_MARKETPLACE_PRODUCT_CODE,
    )
    _entitlement_cache[customer_identifier] = (result, time.time())
    return result
```

---

## Step 7: Testing with AWS Marketplace Test Tool

Use the AWS Marketplace Metering service's built-in test mode:

```bash
# Test ResolveCustomer with a fake token
aws marketplace-metering resolve-customer \
  --registration-token "FAKE_TOKEN_FOR_TESTING" \
  --region us-east-1

# Test MeterUsage with DryRun=true (doesn't bill)
aws marketplace-metering meter-usage \
  --product-code "prod-abc123xyz" \
  --timestamp "$(date -u +%Y-%m-%dT%H:%M:%SZ)" \
  --usage-dimension "queries" \
  --usage-quantity 100 \
  --dry-run \
  --region us-east-1

# Test GetEntitlements
aws marketplace-entitlement get-entitlements \
  --product-code "prod-abc123xyz" \
  --filter CUSTOMER_IDENTIFIER=test-customer-123 \
  --region us-east-1
```

**AWS Marketplace Sandbox:**
AWS provides a sandbox environment for end-to-end testing before going live. Contact your AWS Marketplace PDM for sandbox access.

---

## Troubleshooting

| Error | Cause | Fix |
|-------|-------|-----|
| `ExpiredTokenException` | Token older than 60 min | Customer must re-subscribe; token is one-time use |
| `InvalidTokenException` | Malformed or already used token | Log token, check for double-submission |
| `CustomerNotSubscribedException` | Customer cancelled | Disable account, send cancellation email |
| `DuplicateRequestException` | Same hour, same dimension | Idempotent — safe to ignore, usage already recorded |
| `ThrottlingException` | Too many Metering API calls | Implement exponential backoff, cache results |
| `InvalidProductCodeException` | Wrong product code env var | Check `AWS_MARKETPLACE_PRODUCT_CODE` in Secrets Manager |
| `DisabledApiException` | Product not published yet | Complete Marketplace listing review |

---

## Production Checklist

- [ ] Product listing approved in AWS Marketplace Management Portal
- [ ] SaaS fulfillment URL configured and publicly accessible
- [ ] `AWS_MARKETPLACE_PRODUCT_CODE` stored in Secrets Manager
- [ ] IAM task role has `aws-marketplace:ResolveCustomer`, `GetEntitlements`, `MeterUsage` permissions
- [ ] `/api/v1/marketplace/fulfill` endpoint returns 200 within 15 seconds
- [ ] ResolveCustomer called within 60 seconds of receiving token
- [ ] Metering called at least once per hour per active customer
- [ ] DuplicateRequestException handled gracefully (idempotent)
- [ ] CustomerNotSubscribedException triggers account suspension flow
- [ ] Entitlement checks cached (max 15 min) to avoid throttling
- [ ] Metering failures queued to Celery for retry (max 3 retries)
- [ ] All metering events written to audit log
- [ ] End-to-end tested in AWS Marketplace sandbox
- [ ] CloudWatch alarm on Marketplace API errors > 1% error rate
- [ ] SNS notification on CustomerNotSubscribedException events
