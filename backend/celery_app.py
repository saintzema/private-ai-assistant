"""
Celery application for background task processing.
Tasks: document processing, email sending, usage metering, token cleanup.
"""

import logging
from datetime import timedelta
from typing import Any

from celery import Celery, Task
from celery.signals import task_failure, task_retry, task_success
from celery.utils.log import get_task_logger

logger = get_task_logger(__name__)

# ---------------------------------------------------------------------------
# App configuration
# ---------------------------------------------------------------------------

# Import settings lazily to avoid circular imports at module load time
def get_settings():
    from app.core.config import settings
    return settings


def create_celery_app() -> Celery:
    s = get_settings()
    app = Celery(
        "private_ai",
        broker=s.CELERY_BROKER_URL,
        backend=s.CELERY_RESULT_BACKEND,
    )
    app.conf.update(
        # Serialization
        task_serializer="json",
        accept_content=["json"],
        result_serializer="json",
        # Timezone
        timezone="UTC",
        enable_utc=True,
        # Task behavior
        task_acks_late=True,
        task_reject_on_worker_lost=True,
        task_track_started=True,
        worker_prefetch_multiplier=1,
        # Result backend
        result_expires=86400,  # 24 hours
        result_backend_transport_options={"retry_policy": {"timeout": 5.0}},
        # Routing
        task_routes={
            "celery_app.process_document_task": {"queue": "documents"},
            "celery_app.send_email_task": {"queue": "email"},
            "celery_app.meter_usage_task": {"queue": "default"},
            "celery_app.cleanup_expired_tokens": {"queue": "default"},
        },
        # Beat schedule (periodic tasks)
        beat_schedule={
            "cleanup-expired-tokens": {
                "task": "celery_app.cleanup_expired_tokens",
                "schedule": timedelta(hours=1),
                "options": {"queue": "default"},
            },
            "meter-usage-hourly": {
                "task": "celery_app.meter_all_active_customers",
                "schedule": timedelta(hours=1),
                "options": {"queue": "default"},
            },
        },
    )
    return app


celery_app = create_celery_app()


# ---------------------------------------------------------------------------
# Base task class with retry logic and DB session management
# ---------------------------------------------------------------------------

class BaseTask(Task):
    """Base task that provides a database session and standardized error handling."""

    abstract = True
    _db_session = None

    def get_db_session(self):
        """Get a synchronous database session for Celery tasks."""
        if self._db_session is None:
            from sqlalchemy import create_engine
            from sqlalchemy.orm import sessionmaker
            from app.core.config import settings

            # Use sync engine for Celery (not async)
            sync_url = settings.DATABASE_URL.replace("+asyncpg", "")
            engine = create_engine(sync_url, pool_pre_ping=True, pool_size=5)
            SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
            self._db_session = SessionLocal()
        return self._db_session

    def on_failure(self, exc, task_id, args, kwargs, einfo):
        logger.error(
            "Task failed",
            extra={
                "task_id": task_id,
                "task_name": self.name,
                "exception": str(exc),
                "args": args,
                "kwargs": kwargs,
            },
        )
        if self._db_session:
            self._db_session.rollback()

    def on_success(self, retval, task_id, args, kwargs):
        if self._db_session:
            self._db_session.close()
            self._db_session = None

    def after_return(self, status, retval, task_id, args, kwargs, einfo):
        if self._db_session:
            self._db_session.close()
            self._db_session = None


# ---------------------------------------------------------------------------
# Task: Document processing pipeline
# ---------------------------------------------------------------------------

@celery_app.task(
    bind=True,
    base=BaseTask,
    name="celery_app.process_document_task",
    max_retries=3,
    default_retry_delay=60,
    queue="documents",
    soft_time_limit=300,    # 5 min soft limit
    time_limit=360,         # 6 min hard limit
)
def process_document_task(
    self,
    document_id: str,
    s3_key: str,
    file_type: str,
    workspace_id: str,
) -> dict[str, Any]:
    """
    Full document processing pipeline:
    1. Download from S3
    2. Extract text (PDF, DOCX, etc.)
    3. Chunk into overlapping segments
    4. Generate embeddings via OpenAI / Bedrock
    5. Store chunks + embeddings in PostgreSQL (pgvector)
    6. Update document status to 'ready'

    Returns: {"chunks_created": int, "tokens_used": int}
    """
    from app.core.config import settings
    from app.services.document_service import DocumentProcessor
    from app.utils.aws_helpers import download_from_s3

    logger.info(
        "Starting document processing",
        extra={"document_id": document_id, "s3_key": s3_key, "file_type": file_type},
    )

    db = self.get_db_session()

    try:
        # Update status to 'processing'
        from app.models.document import Document, DocumentStatus
        doc = db.query(Document).filter(Document.id == document_id).first()
        if not doc:
            raise ValueError(f"Document {document_id} not found")

        doc.status = DocumentStatus.PROCESSING
        db.commit()

        # Download file from S3
        file_bytes = download_from_s3(
            bucket=settings.S3_BUCKET_NAME,
            key=s3_key,
        )

        # Process document
        processor = DocumentProcessor(settings=settings)
        result = processor.process(
            document_id=document_id,
            workspace_id=workspace_id,
            file_bytes=file_bytes,
            file_type=file_type,
            db=db,
        )

        # Update document status to 'ready'
        doc.status = DocumentStatus.READY
        doc.chunk_count = result["chunks_created"]
        doc.word_count = result.get("word_count", 0)
        doc.page_count = result.get("page_count", 0)
        doc.processed_at = result["processed_at"]
        db.commit()

        logger.info(
            "Document processed successfully",
            extra={
                "document_id": document_id,
                "chunks_created": result["chunks_created"],
                "tokens_used": result.get("tokens_used", 0),
            },
        )

        return {
            "document_id": document_id,
            "chunks_created": result["chunks_created"],
            "tokens_used": result.get("tokens_used", 0),
        }

    except Exception as exc:
        db.rollback()
        logger.error(
            "Document processing failed",
            extra={"document_id": document_id, "error": str(exc)},
            exc_info=True,
        )

        # Update document status to 'failed'
        try:
            from app.models.document import Document, DocumentStatus
            doc = db.query(Document).filter(Document.id == document_id).first()
            if doc:
                doc.status = DocumentStatus.FAILED
                doc.processing_error = str(exc)[:1000]
                db.commit()
        except Exception:
            db.rollback()

        # Retry with exponential backoff
        try:
            raise self.retry(exc=exc, countdown=60 * (2 ** self.request.retries))
        except self.MaxRetriesExceededError:
            logger.error(
                "Max retries exceeded for document processing",
                extra={"document_id": document_id},
            )
            raise


# ---------------------------------------------------------------------------
# Task: Email sending
# ---------------------------------------------------------------------------

@celery_app.task(
    bind=True,
    name="celery_app.send_email_task",
    max_retries=3,
    default_retry_delay=30,
    queue="email",
    soft_time_limit=30,
    time_limit=60,
)
def send_email_task(
    self,
    to: str,
    subject: str,
    html: str,
    from_email: str = None,
    from_name: str = None,
) -> dict[str, Any]:
    """
    Send an email asynchronously via SMTP.
    Retries up to 3 times with 30-second delays.

    Returns: {"message_id": str, "accepted": bool}
    """
    import smtplib
    from email.mime.multipart import MIMEMultipart
    from email.mime.text import MIMEText
    from app.core.config import settings

    logger.info("Sending email", extra={"to": to, "subject": subject})

    sender_email = from_email or settings.FROM_EMAIL
    sender_name = from_name or settings.APP_NAME

    msg = MIMEMultipart("alternative")
    msg["Subject"] = subject
    msg["From"] = f"{sender_name} <{sender_email}>"
    msg["To"] = to

    # Plain text fallback
    plain_text = html.replace("<br>", "\n").replace("</p>", "\n\n")
    import re
    plain_text = re.sub(r"<[^>]+>", "", plain_text)

    msg.attach(MIMEText(plain_text, "plain"))
    msg.attach(MIMEText(html, "html"))

    try:
        with smtplib.SMTP(settings.SMTP_HOST, int(settings.SMTP_PORT)) as server:
            server.ehlo()
            if settings.SMTP_USE_TLS:
                server.starttls()
                server.ehlo()
            if settings.SMTP_USER and settings.SMTP_PASSWORD:
                server.login(settings.SMTP_USER, settings.SMTP_PASSWORD)
            result = server.sendmail(sender_email, [to], msg.as_string())

        logger.info("Email sent successfully", extra={"to": to})
        return {"accepted": True, "rejected": list(result.keys())}

    except smtplib.SMTPException as exc:
        logger.error("SMTP error", extra={"to": to, "error": str(exc)})
        try:
            raise self.retry(exc=exc, countdown=30 * (self.request.retries + 1))
        except self.MaxRetriesExceededError:
            logger.error("Max email retries exceeded", extra={"to": to})
            raise


# ---------------------------------------------------------------------------
# Task: AWS Marketplace usage metering
# ---------------------------------------------------------------------------

@celery_app.task(
    bind=True,
    name="celery_app.meter_usage_task",
    max_retries=5,
    default_retry_delay=120,
    queue="default",
    soft_time_limit=30,
    time_limit=60,
)
def meter_usage_task(
    self,
    customer_identifier: str,
    dimension: str,
    quantity: int,
    workspace_id: str = None,
) -> dict[str, Any]:
    """
    Report usage to AWS Marketplace Metering Service.
    Retries on throttling with exponential backoff.
    Handles DuplicateRequestException idempotently.

    Returns: {"metering_record_id": str, "status": str}
    """
    from app.core.config import settings
    from app.utils.aws_helpers import get_boto3_client

    if quantity <= 0:
        logger.debug(
            "Skipping zero-quantity metering",
            extra={"customer_identifier": customer_identifier, "dimension": dimension},
        )
        return {"status": "skipped", "reason": "zero_quantity"}

    if not settings.AWS_MARKETPLACE_PRODUCT_CODE:
        logger.warning("AWS_MARKETPLACE_PRODUCT_CODE not configured, skipping metering")
        return {"status": "skipped", "reason": "not_configured"}

    logger.info(
        "Reporting usage to Marketplace",
        extra={
            "customer_identifier": customer_identifier,
            "dimension": dimension,
            "quantity": quantity,
        },
    )

    from datetime import datetime, timezone
    from botocore.exceptions import ClientError

    client = get_boto3_client("marketplace-metering", region_name="us-east-1")

    try:
        response = client.meter_usage(
            ProductCode=settings.AWS_MARKETPLACE_PRODUCT_CODE,
            Timestamp=datetime.now(timezone.utc),
            UsageDimension=dimension,
            UsageQuantity=quantity,
            DryRun=False,
        )
        record_id = response["MeteringRecordId"]
        logger.info(
            "Usage metered successfully",
            extra={"record_id": record_id, "customer": customer_identifier},
        )
        return {"metering_record_id": record_id, "status": "success"}

    except ClientError as e:
        error_code = e.response["Error"]["Code"]

        if error_code == "DuplicateRequestException":
            logger.info("Duplicate metering request (already recorded)", extra={"customer": customer_identifier})
            return {"status": "duplicate", "metering_record_id": None}

        elif error_code == "CustomerNotSubscribedException":
            logger.warning(
                "Customer not subscribed — disabling account",
                extra={"customer": customer_identifier},
            )
            # Trigger account suspension asynchronously
            suspend_marketplace_customer.delay(customer_identifier)
            return {"status": "not_subscribed"}

        elif error_code == "ThrottlingException":
            backoff = 120 * (2 ** self.request.retries)
            logger.warning(
                "Marketplace metering throttled, retrying",
                extra={"retry_in": backoff},
            )
            raise self.retry(exc=e, countdown=backoff)

        else:
            logger.error(
                "Marketplace metering error",
                extra={"error_code": error_code, "error": str(e)},
            )
            raise self.retry(exc=e, countdown=120 * (self.request.retries + 1))


# ---------------------------------------------------------------------------
# Task: Suspend a Marketplace customer
# ---------------------------------------------------------------------------

@celery_app.task(
    bind=True,
    base=BaseTask,
    name="celery_app.suspend_marketplace_customer",
    max_retries=3,
    queue="default",
)
def suspend_marketplace_customer(self, customer_identifier: str) -> dict[str, Any]:
    """Suspend a customer's account when their Marketplace subscription expires."""
    from app.models.workspace import Workspace
    from app.models.subscription import MarketplaceSubscription, SubscriptionStatus

    db = self.get_db_session()
    try:
        sub = (
            db.query(MarketplaceSubscription)
            .filter(MarketplaceSubscription.customer_identifier == customer_identifier)
            .first()
        )
        if sub:
            sub.status = SubscriptionStatus.SUSPENDED
            db.commit()
            logger.info(
                "Customer account suspended",
                extra={"customer_identifier": customer_identifier},
            )

        # Send suspension notification email
        if sub and sub.workspace and sub.workspace.owner_email:
            send_email_task.delay(
                to=sub.workspace.owner_email,
                subject="Your Private AI subscription has ended",
                html="<p>Your AWS Marketplace subscription has ended. Please renew to continue using Private AI.</p>",
            )

        return {"status": "suspended", "customer_identifier": customer_identifier}
    except Exception as exc:
        db.rollback()
        raise self.retry(exc=exc)


# ---------------------------------------------------------------------------
# Task: Meter all active customers (periodic)
# ---------------------------------------------------------------------------

@celery_app.task(
    bind=True,
    base=BaseTask,
    name="celery_app.meter_all_active_customers",
    queue="default",
    soft_time_limit=300,
)
def meter_all_active_customers(self) -> dict[str, Any]:
    """
    Periodic task: collect and report usage for all active Marketplace customers.
    Called every hour by Celery Beat.
    """
    from app.models.subscription import MarketplaceSubscription, SubscriptionStatus
    from app.services.usage_service import UsageCollector

    db = self.get_db_session()
    try:
        active_subs = (
            db.query(MarketplaceSubscription)
            .filter(MarketplaceSubscription.status == SubscriptionStatus.ACTIVE)
            .all()
        )

        metered = 0
        for sub in active_subs:
            collector = UsageCollector(db=db, subscription=sub)
            usage = collector.collect_hourly_usage()

            for dimension, quantity in usage.items():
                if quantity > 0:
                    meter_usage_task.delay(
                        customer_identifier=sub.customer_identifier,
                        dimension=dimension,
                        quantity=quantity,
                        workspace_id=str(sub.workspace_id),
                    )
                    metered += 1

        logger.info(
            "Hourly metering dispatched",
            extra={"customers": len(active_subs), "metering_tasks": metered},
        )
        return {"customers_processed": len(active_subs), "metering_tasks_queued": metered}
    except Exception as exc:
        db.rollback()
        logger.error("Hourly metering failed", exc_info=True)
        raise


# ---------------------------------------------------------------------------
# Task: Clean up expired JWT blacklist entries (periodic)
# ---------------------------------------------------------------------------

@celery_app.task(
    name="celery_app.cleanup_expired_tokens",
    queue="default",
    soft_time_limit=60,
)
def cleanup_expired_tokens() -> dict[str, Any]:
    """
    Periodic task: remove expired tokens from the Redis blacklist.
    Redis TTL handles expiry automatically for individual keys, but this
    cleans up any stale set members.
    Called every hour by Celery Beat.
    """
    import redis as redis_lib
    from app.core.config import settings

    client = redis_lib.from_url(settings.REDIS_URL, decode_responses=True)
    pattern = "token_blacklist:*"
    cursor = 0
    deleted = 0

    while True:
        cursor, keys = client.scan(cursor=cursor, match=pattern, count=100)
        for key in keys:
            ttl = client.ttl(key)
            if ttl == -1:  # No TTL set — shouldn't happen, but clean up
                client.delete(key)
                deleted += 1
        if cursor == 0:
            break

    logger.info("Token blacklist cleanup complete", extra={"deleted": deleted})
    return {"deleted_entries": deleted}


# ---------------------------------------------------------------------------
# Signal handlers for monitoring
# ---------------------------------------------------------------------------

@task_failure.connect
def on_task_failure(sender=None, task_id=None, exception=None, **kwargs):
    logger.error(
        "Celery task failed",
        extra={"task_id": task_id, "task_name": sender.name if sender else "unknown", "exception": str(exception)},
    )


@task_retry.connect
def on_task_retry(sender=None, reason=None, **kwargs):
    logger.warning(
        "Celery task retrying",
        extra={"task_name": sender.name if sender else "unknown", "reason": str(reason)},
    )


@task_success.connect
def on_task_success(sender=None, result=None, **kwargs):
    logger.debug(
        "Celery task succeeded",
        extra={"task_name": sender.name if sender else "unknown"},
    )
