"""
Document management endpoints: upload, list, get, delete, status, reprocess.
"""

import logging
from typing import Annotated
from uuid import UUID

from fastapi import (
    APIRouter,
    BackgroundTasks,
    Depends,
    File,
    HTTPException,
    Query,
    UploadFile,
    status,
)
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.dependencies import get_current_active_user, get_workspace_member
from app.middleware.rate_limit import upload_limiter
from app.models.document import Document, DocumentStatus
from app.models.user import User
from app.models.workspace import Workspace
from app.schemas.document import (
    DocumentDownloadResponse,
    DocumentListResponse,
    DocumentResponse,
    DocumentStatusResponse,
    DocumentUploadResponse,
)
from app.services.document_processor import document_processor
from app.services.s3_service import s3_service
from app.utils.validators import sanitize_filename, validate_file_size, validate_file_type

logger = logging.getLogger(__name__)
router = APIRouter()

CurrentUser = Annotated[User, Depends(get_current_active_user)]
_ALLOWED_TYPES = {"pdf", "docx", "txt", "csv"}
_MAX_MB = 50


# ─── List Documents ───────────────────────────────────────────────────────────

@router.get(
    "/{workspace_id}/documents",
    response_model=DocumentListResponse,
    summary="List documents in a workspace",
)
async def list_documents(
    workspace_id: UUID,
    member: Annotated[tuple, Depends(get_workspace_member)],
    db: AsyncSession = Depends(get_db),
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=20, ge=1, le=100),
    status_filter: str | None = Query(default=None, alias="status"),
) -> DocumentListResponse:
    q = select(Document).where(Document.workspace_id == workspace_id)
    if status_filter:
        try:
            q = q.where(Document.status == DocumentStatus(status_filter))
        except ValueError:
            raise HTTPException(status_code=400, detail=f"Invalid status: {status_filter}")

    total_result = await db.execute(select(func.count()).select_from(q.subquery()))
    total = total_result.scalar() or 0

    q = q.order_by(Document.created_at.desc()).offset((page - 1) * page_size).limit(page_size)
    result = await db.execute(q)
    docs = result.scalars().all()

    return DocumentListResponse(
        documents=[DocumentResponse.model_validate(d) for d in docs],
        total=total,
        page=page,
        page_size=page_size,
    )


# ─── Upload ───────────────────────────────────────────────────────────────────

@router.post(
    "/{workspace_id}/documents/upload",
    response_model=DocumentUploadResponse,
    status_code=status.HTTP_202_ACCEPTED,
    summary="Upload a document for processing",
    dependencies=[Depends(upload_limiter)],
)
async def upload_document(
    workspace_id: UUID,
    background_tasks: BackgroundTasks,
    member: Annotated[tuple, Depends(get_workspace_member)],
    file: UploadFile = File(...),
    db: AsyncSession = Depends(get_db),
) -> DocumentUploadResponse:
    current_user, _ = member

    # Validate file type
    if not validate_file_type(file.filename or "", _ALLOWED_TYPES):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Unsupported file type. Allowed: {', '.join(_ALLOWED_TYPES)}",
        )

    file_bytes = await file.read()

    # Validate size
    if not validate_file_size(len(file_bytes), _MAX_MB):
        raise HTTPException(
            status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
            detail=f"File exceeds maximum size of {_MAX_MB} MB",
        )

    # Validate workspace doc limit
    workspace_result = await db.execute(
        select(Workspace).where(Workspace.id == workspace_id)
    )
    workspace = workspace_result.scalar_one_or_none()
    if not workspace:
        raise HTTPException(status_code=404, detail="Workspace not found")

    doc_count = (await db.execute(
        select(func.count(Document.id)).where(Document.workspace_id == workspace_id)
    )).scalar() or 0

    if doc_count >= workspace.max_documents:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Document limit ({workspace.max_documents}) reached for this workspace",
        )

    safe_filename = sanitize_filename(file.filename or "document")
    file_ext = safe_filename.rsplit(".", 1)[-1].lower()
    display_name = safe_filename.rsplit(".", 1)[0]

    # Create DB record first to get an ID
    document = Document(
        workspace_id=workspace_id,
        uploaded_by=current_user.id,
        name=display_name,
        original_filename=file.filename or safe_filename,
        file_type=file_ext,
        file_size=len(file_bytes),
        s3_key="pending",
        status=DocumentStatus.pending,
    )
    db.add(document)
    await db.flush()
    await db.refresh(document)

    # Upload to S3
    try:
        s3_key, presigned_url = await s3_service.upload_file(
            file_bytes=file_bytes,
            filename=safe_filename,
            workspace_id=workspace_id,
            document_id=document.id,
        )
        document.s3_key = s3_key
        document.s3_url = presigned_url
        db.add(document)
        await db.flush()
    except Exception as exc:
        document.status = DocumentStatus.failed
        document.error_message = f"S3 upload failed: {exc}"
        db.add(document)
        await db.flush()
        raise HTTPException(status_code=500, detail="Failed to upload file to storage")

    # Kick off background processing
    background_tasks.add_task(
        document_processor.process_document,
        document.id,
        s3_key,
        file_ext,
    )

    logger.info(
        "Document uploaded: %s (%s) for workspace %s",
        document.id,
        safe_filename,
        workspace_id,
    )
    return DocumentUploadResponse(
        document_id=document.id,
        name=document.name,
        original_filename=document.original_filename,
        status=document.status,
    )


# ─── Get Single Document ──────────────────────────────────────────────────────

@router.get(
    "/{workspace_id}/documents/{doc_id}",
    response_model=DocumentResponse,
    summary="Get document details",
)
async def get_document(
    workspace_id: UUID,
    doc_id: UUID,
    member: Annotated[tuple, Depends(get_workspace_member)],
    db: AsyncSession = Depends(get_db),
) -> DocumentResponse:
    result = await db.execute(
        select(Document).where(
            Document.id == doc_id,
            Document.workspace_id == workspace_id,
        )
    )
    doc = result.scalar_one_or_none()
    if not doc:
        raise HTTPException(status_code=404, detail="Document not found")
    return DocumentResponse.model_validate(doc)


# ─── Delete ───────────────────────────────────────────────────────────────────

@router.delete(
    "/{workspace_id}/documents/{doc_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="Delete a document",
)
async def delete_document(
    workspace_id: UUID,
    doc_id: UUID,
    member: Annotated[tuple, Depends(get_workspace_member)],
    db: AsyncSession = Depends(get_db),
) -> None:
    result = await db.execute(
        select(Document).where(
            Document.id == doc_id,
            Document.workspace_id == workspace_id,
        )
    )
    doc = result.scalar_one_or_none()
    if not doc:
        raise HTTPException(status_code=404, detail="Document not found")

    # Delete from S3 (best-effort)
    try:
        await s3_service.delete_file(doc.s3_key)
    except Exception as exc:
        logger.warning("S3 deletion failed for %s: %s", doc.s3_key, exc)

    await db.delete(doc)
    await db.flush()


# ─── Status ───────────────────────────────────────────────────────────────────

@router.get(
    "/{workspace_id}/documents/{doc_id}/status",
    response_model=DocumentStatusResponse,
    summary="Get document processing status",
)
async def get_document_status(
    workspace_id: UUID,
    doc_id: UUID,
    member: Annotated[tuple, Depends(get_workspace_member)],
    db: AsyncSession = Depends(get_db),
) -> DocumentStatusResponse:
    result = await db.execute(
        select(Document).where(
            Document.id == doc_id,
            Document.workspace_id == workspace_id,
        )
    )
    doc = result.scalar_one_or_none()
    if not doc:
        raise HTTPException(status_code=404, detail="Document not found")

    return DocumentStatusResponse(
        document_id=doc.id,
        status=doc.status,
        chunk_count=doc.chunk_count,
        error_message=doc.error_message,
        updated_at=doc.updated_at,
    )


# ─── Download (Presigned URL) ─────────────────────────────────────────────────

@router.get(
    "/{workspace_id}/documents/{doc_id}/download",
    response_model=DocumentDownloadResponse,
    summary="Get a presigned download URL",
)
async def download_document(
    workspace_id: UUID,
    doc_id: UUID,
    member: Annotated[tuple, Depends(get_workspace_member)],
    db: AsyncSession = Depends(get_db),
) -> DocumentDownloadResponse:
    result = await db.execute(
        select(Document).where(
            Document.id == doc_id,
            Document.workspace_id == workspace_id,
        )
    )
    doc = result.scalar_one_or_none()
    if not doc:
        raise HTTPException(status_code=404, detail="Document not found")

    presigned_url = await s3_service.get_presigned_url(doc.s3_key, expiry=3600)
    return DocumentDownloadResponse(
        document_id=doc.id,
        presigned_url=presigned_url,
        expires_in=3600,
    )


# ─── Reprocess ────────────────────────────────────────────────────────────────

@router.post(
    "/{workspace_id}/documents/{doc_id}/reprocess",
    summary="Reprocess a document (re-extract and re-embed)",
    dependencies=[Depends(upload_limiter)],
)
async def reprocess_document(
    workspace_id: UUID,
    doc_id: UUID,
    background_tasks: BackgroundTasks,
    member: Annotated[tuple, Depends(get_workspace_member)],
    db: AsyncSession = Depends(get_db),
) -> dict:
    result = await db.execute(
        select(Document).where(
            Document.id == doc_id,
            Document.workspace_id == workspace_id,
        )
    )
    doc = result.scalar_one_or_none()
    if not doc:
        raise HTTPException(status_code=404, detail="Document not found")

    if doc.status == DocumentStatus.processing:
        raise HTTPException(status_code=400, detail="Document is already being processed")

    doc.status = DocumentStatus.pending
    doc.error_message = None
    db.add(doc)
    await db.flush()

    background_tasks.add_task(
        document_processor.process_document,
        doc.id,
        doc.s3_key,
        doc.file_type.value,
    )

    return {"message": "Document queued for reprocessing", "document_id": str(doc.id)}
