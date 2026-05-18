"""
AWS Marketplace SaaS integration service.
Handles customer resolution, entitlement checks, and usage metering.
"""

import logging
from typing import Any, Optional

import boto3
from botocore.exceptions import ClientError

from app.core.config import settings

logger = logging.getLogger(__name__)


class MarketplaceService:
    """
    Wraps the AWS Marketplace Metering and Entitlement APIs.
    All boto3 calls are offloaded to a thread executor for async compatibility.
    """

    def __init__(self) -> None:
        self._metering_client: Optional[object] = None
        self._entitlement_client: Optional[object] = None

    async def _run(self, fn):
        import asyncio
        loop = asyncio.get_event_loop()
        return await loop.run_in_executor(None, fn)

    def _get_metering_client(self):
        if self._metering_client is None:
            self._metering_client = boto3.client(
                "marketplace-metering",
                region_name=settings.AWS_MARKETPLACE_REGION,
                aws_access_key_id=settings.AWS_ACCESS_KEY_ID,
                aws_secret_access_key=settings.AWS_SECRET_ACCESS_KEY,
            )
        return self._metering_client

    def _get_entitlement_client(self):
        if self._entitlement_client is None:
            self._entitlement_client = boto3.client(
                "marketplace-entitlement",
                region_name=settings.AWS_MARKETPLACE_REGION,
                aws_access_key_id=settings.AWS_ACCESS_KEY_ID,
                aws_secret_access_key=settings.AWS_SECRET_ACCESS_KEY,
            )
        return self._entitlement_client

    # ─── Customer Resolution ──────────────────────────────────────────────────

    async def resolve_customer(self, token: str) -> dict[str, Any]:
        """
        Resolve a marketplace registration token to a CustomerIdentifier.

        Called during the SaaS registration flow when AWS redirects the buyer
        to your registration page with x-amzn-marketplace-token.

        Returns dict with CustomerIdentifier, ProductCode, CustomerAWSAccountId.
        """
        client = self._get_metering_client()
        try:
            response = await self._run(
                lambda: client.resolve_customer(RegistrationToken=token)
            )
            logger.info(
                "Resolved marketplace customer: %s",
                response.get("CustomerIdentifier"),
            )
            return {
                "customer_id": response["CustomerIdentifier"],
                "product_code": response["ProductCode"],
                "customer_aws_account_id": response.get("CustomerAWSAccountId"),
            }
        except ClientError as exc:
            logger.error("Failed to resolve marketplace customer: %s", exc)
            raise ValueError(f"Invalid marketplace token: {exc}") from exc

    # ─── Entitlement Check ────────────────────────────────────────────────────

    async def get_entitlements(self, customer_id: str) -> dict[str, Any]:
        """
        Retrieve active entitlements for a customer.

        Returns dict of dimension → {value, expiration_date}.
        """
        if not settings.AWS_MARKETPLACE_PRODUCT_CODE:
            logger.warning("AWS_MARKETPLACE_PRODUCT_CODE not set — skipping entitlement check")
            return {}

        client = self._get_entitlement_client()
        try:
            response = await self._run(
                lambda: client.get_entitlements(
                    ProductCode=settings.AWS_MARKETPLACE_PRODUCT_CODE,
                    Filter={"CUSTOMER_IDENTIFIER": [customer_id]},
                )
            )

            entitlements: dict[str, Any] = {}
            for e in response.get("Entitlements", []):
                dimension = e["Dimension"]
                value = e.get("Value", {})
                entitlements[dimension] = {
                    "value": (
                        value.get("IntegerValue")
                        or value.get("DoubleValue")
                        or value.get("StringValue")
                        or value.get("BooleanValue")
                    ),
                    "expiration_date": e.get("ExpirationDate"),
                }

            logger.debug("Entitlements for %s: %s", customer_id, entitlements)
            return entitlements

        except ClientError as exc:
            logger.error("Failed to get entitlements for %s: %s", customer_id, exc)
            raise

    # ─── Usage Metering ───────────────────────────────────────────────────────

    async def meter_usage(
        self,
        customer_id: str,
        dimension: str,
        quantity: int,
        dry_run: bool = False,
    ) -> str:
        """
        Report metered usage to AWS Marketplace.

        Args:
            customer_id: The CustomerIdentifier from resolve_customer.
            dimension: Usage dimension (must match your listing configuration).
            quantity: Number of units consumed.
            dry_run: If True, validates without recording.

        Returns:
            MeteringRecordId string.
        """
        from datetime import datetime, timezone

        if not settings.AWS_MARKETPLACE_PRODUCT_CODE:
            logger.warning("Skipping meter_usage — product code not configured")
            return "DRY_RUN_NO_PRODUCT_CODE"

        client = self._get_metering_client()
        try:
            response = await self._run(
                lambda: client.meter_usage(
                    ProductCode=settings.AWS_MARKETPLACE_PRODUCT_CODE,
                    Timestamp=datetime.now(timezone.utc),
                    UsageDimension=dimension,
                    UsageQuantity=quantity,
                    DryRun=dry_run,
                )
            )
            record_id = response.get("MeteringRecordId", "")
            logger.info(
                "Metered usage: customer=%s dimension=%s qty=%d record=%s",
                customer_id,
                dimension,
                quantity,
                record_id,
            )
            return record_id
        except ClientError as exc:
            logger.error("Metering failed for %s: %s", customer_id, exc)
            raise

    # ─── Subscription Verification ────────────────────────────────────────────

    async def verify_subscription(self, customer_id: str) -> bool:
        """
        Verify that a customer has an active subscription by checking
        whether they have any non-expired entitlements.
        """
        try:
            entitlements = await self.get_entitlements(customer_id)
            if not entitlements:
                return False

            from datetime import datetime, timezone

            now = datetime.now(timezone.utc)
            for _, data in entitlements.items():
                exp = data.get("expiration_date")
                if exp is None or exp > now:
                    return True

            return False
        except Exception as exc:
            logger.warning("verify_subscription failed for %s: %s", customer_id, exc)
            return False


# Singleton
marketplace_service = MarketplaceService()
