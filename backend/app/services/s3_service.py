"""
AWS S3 service for document storage.
Supports upload, presigned URL generation, download, and deletion.
"""

import logging
import mimetypes
from typing import Optional
from uuid import UUID

import boto3
from botocore.exceptions import ClientError

from app.core.config import settings

logger = logging.getLogger(__name__)


class S3Service:
    """
    Async-friendly wrapper around boto3 S3 operations.
    All blocking boto3 calls are offloaded to a thread executor.
    """

    def __init__(self) -> None:
        self._client: Optional[object] = None

    def _get_client(self):
        if self._client is None:
            self._client = boto3.client(
                "s3",
                region_name=settings.AWS_REGION,
                aws_access_key_id=settings.AWS_ACCESS_KEY_ID,
                aws_secret_access_key=settings.AWS_SECRET_ACCESS_KEY,
            )
        return self._client

    def _build_s3_key(
        self,
        workspace_id: UUID,
        document_id: UUID,
        filename: str,
    ) -> str:
        """Construct a deterministic S3 key for a document."""
        return f"workspaces/{workspace_id}/documents/{document_id}/{filename}"

    async def _run_in_executor(self, fn):
        """Execute a blocking boto3 call in the default thread pool."""
        import asyncio
        loop = asyncio.get_event_loop()
        return await loop.run_in_executor(None, fn)

    # ─── Upload ───────────────────────────────────────────────────────────────

    async def upload_file(
        self,
        file_bytes: bytes,
        filename: str,
        workspace_id: UUID,
        document_id: UUID,
        content_type: Optional[str] = None,
    ) -> tuple[str, str]:
        """
        Upload file bytes to S3.

        Returns:
            (s3_key, presigned_download_url)
        """
        s3_key = self._build_s3_key(workspace_id, document_id, filename)

        if content_type is None:
            content_type, _ = mimetypes.guess_type(filename)
            content_type = content_type or "application/octet-stream"

        client = self._get_client()
        file_size = len(file_bytes)

        if file_size > 100 * 1024 * 1024:  # > 100 MB → multipart
            await self._multipart_upload(client, file_bytes, s3_key, content_type)
        else:
            await self._run_in_executor(
                lambda: client.put_object(
                    Bucket=settings.S3_BUCKET_NAME,
                    Key=s3_key,
                    Body=file_bytes,
                    ContentType=content_type,
                )
            )

        presigned_url = await self.get_presigned_url(s3_key)
        logger.info("Uploaded %s to s3://%s/%s", filename, settings.S3_BUCKET_NAME, s3_key)
        return s3_key, presigned_url

    async def _multipart_upload(
        self,
        client,
        file_bytes: bytes,
        s3_key: str,
        content_type: str,
        part_size: int = 10 * 1024 * 1024,  # 10 MB
    ) -> None:
        """Perform a multipart upload for large files."""
        mpu = await self._run_in_executor(
            lambda: client.create_multipart_upload(
                Bucket=settings.S3_BUCKET_NAME,
                Key=s3_key,
                ContentType=content_type,
            )
        )
        upload_id = mpu["UploadId"]
        parts = []

        try:
            for i, offset in enumerate(range(0, len(file_bytes), part_size), start=1):
                chunk = file_bytes[offset : offset + part_size]
                part_num = i

                response = await self._run_in_executor(
                    lambda: client.upload_part(
                        Bucket=settings.S3_BUCKET_NAME,
                        Key=s3_key,
                        PartNumber=part_num,
                        UploadId=upload_id,
                        Body=chunk,
                    )
                )
                parts.append({"PartNumber": part_num, "ETag": response["ETag"]})

            await self._run_in_executor(
                lambda: client.complete_multipart_upload(
                    Bucket=settings.S3_BUCKET_NAME,
                    Key=s3_key,
                    UploadId=upload_id,
                    MultipartUpload={"Parts": parts},
                )
            )
        except Exception:
            await self._run_in_executor(
                lambda: client.abort_multipart_upload(
                    Bucket=settings.S3_BUCKET_NAME,
                    Key=s3_key,
                    UploadId=upload_id,
                )
            )
            raise

    # ─── Presigned URL ────────────────────────────────────────────────────────

    async def get_presigned_url(
        self,
        s3_key: str,
        expiry: int = None,
    ) -> str:
        """Generate a presigned GET URL for the given S3 key."""
        expiry = expiry or settings.S3_PRESIGNED_URL_EXPIRY
        client = self._get_client()

        url = await self._run_in_executor(
            lambda: client.generate_presigned_url(
                "get_object",
                Params={"Bucket": settings.S3_BUCKET_NAME, "Key": s3_key},
                ExpiresIn=expiry,
            )
        )
        return url

    # ─── Download ─────────────────────────────────────────────────────────────

    async def download_file(self, s3_key: str) -> bytes:
        """Download and return the raw bytes of an S3 object."""
        client = self._get_client()
        try:
            response = await self._run_in_executor(
                lambda: client.get_object(Bucket=settings.S3_BUCKET_NAME, Key=s3_key)
            )
            return response["Body"].read()
        except ClientError as exc:
            error_code = exc.response["Error"]["Code"]
            if error_code == "NoSuchKey":
                raise FileNotFoundError(f"S3 key not found: {s3_key}") from exc
            raise

    # ─── Delete ───────────────────────────────────────────────────────────────

    async def delete_file(self, s3_key: str) -> None:
        """Delete an object from S3."""
        client = self._get_client()
        try:
            await self._run_in_executor(
                lambda: client.delete_object(Bucket=settings.S3_BUCKET_NAME, Key=s3_key)
            )
            logger.info("Deleted s3://%s/%s", settings.S3_BUCKET_NAME, s3_key)
        except ClientError as exc:
            logger.warning("Failed to delete s3 key %s: %s", s3_key, exc)
            raise

    # ─── Utilities ────────────────────────────────────────────────────────────

    async def file_exists(self, s3_key: str) -> bool:
        """Return True if the S3 key exists."""
        client = self._get_client()
        try:
            await self._run_in_executor(
                lambda: client.head_object(Bucket=settings.S3_BUCKET_NAME, Key=s3_key)
            )
            return True
        except ClientError:
            return False


# Singleton
s3_service = S3Service()
