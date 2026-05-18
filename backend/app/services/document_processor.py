"""
Document processing service: text extraction, chunking, and embedding storage.
Supports PDF, DOCX, TXT, and CSV files.
"""

import io
import logging
import re
from typing import Optional
from uuid import UUID

from sqlalchemy import update
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import AsyncSessionLocal
from app.models.document import Document, DocumentChunk, DocumentStatus
from app.services.ai.embeddings import embedding_service
from app.services.s3_service import s3_service

logger = logging.getLogger(__name__)


class DocumentProcessor:
    """
    Handles the full document processing pipeline:
    1. Download from S3
    2. Extract text based on file type
    3. Chunk text with sentence-aware sliding window
    4. Generate embeddings and store chunks in DB
    """

    # ─── Text Extraction ──────────────────────────────────────────────────────

    def extract_text_pdf(self, file_bytes: bytes) -> str:
        """Extract text from PDF using pypdf."""
        from pypdf import PdfReader

        reader = PdfReader(io.BytesIO(file_bytes))
        pages: list[str] = []
        for page in reader.pages:
            text = page.extract_text() or ""
            pages.append(text)
        return "\n\n".join(pages)

    def extract_text_docx(self, file_bytes: bytes) -> str:
        """Extract text from DOCX using python-docx."""
        from docx import Document as DocxDocument

        doc = DocxDocument(io.BytesIO(file_bytes))
        paragraphs = [para.text for para in doc.paragraphs if para.text.strip()]
        return "\n\n".join(paragraphs)

    def extract_text_txt(self, file_bytes: bytes) -> str:
        """Extract text from plain text file."""
        for encoding in ("utf-8", "latin-1", "cp1252"):
            try:
                return file_bytes.decode(encoding)
            except UnicodeDecodeError:
                continue
        return file_bytes.decode("utf-8", errors="replace")

    def extract_text_csv(self, file_bytes: bytes) -> str:
        """Extract text from CSV using pandas — converts rows to readable sentences."""
        import pandas as pd

        try:
            df = pd.read_csv(io.BytesIO(file_bytes))
        except Exception:
            df = pd.read_csv(io.BytesIO(file_bytes), sep=None, engine="python")

        lines: list[str] = [", ".join(str(col) for col in df.columns)]
        for _, row in df.iterrows():
            lines.append(", ".join(f"{col}: {val}" for col, val in row.items()))
        return "\n".join(lines)

    def _extract_text(self, file_bytes: bytes, file_type: str) -> str:
        extractors = {
            "pdf": self.extract_text_pdf,
            "docx": self.extract_text_docx,
            "txt": self.extract_text_txt,
            "csv": self.extract_text_csv,
        }
        extractor = extractors.get(file_type.lower())
        if not extractor:
            raise ValueError(f"Unsupported file type: {file_type}")
        return extractor(file_bytes)

    # ─── Chunking ─────────────────────────────────────────────────────────────

    def chunk_text(
        self,
        text: str,
        chunk_size: int = 512,
        overlap: int = 50,
    ) -> list[str]:
        """
        Sentence-aware sliding window chunking.

        Splits text into sentences first, then groups sentences into chunks
        of approximately chunk_size tokens, with overlap tokens of lookback.
        """
        # Normalize whitespace
        text = re.sub(r"\s+", " ", text).strip()
        if not text:
            return []

        # Split into sentences using simple rules
        sentence_endings = re.compile(r"(?<=[.!?])\s+")
        sentences = sentence_endings.split(text)
        sentences = [s.strip() for s in sentences if s.strip()]

        if not sentences:
            return []

        # Approximate token count (1 token ≈ 4 chars)
        def approx_tokens(s: str) -> int:
            return max(1, len(s) // 4)

        chunks: list[str] = []
        current_sentences: list[str] = []
        current_tokens = 0

        for sentence in sentences:
            sentence_tokens = approx_tokens(sentence)

            if current_tokens + sentence_tokens > chunk_size and current_sentences:
                # Emit current chunk
                chunks.append(" ".join(current_sentences))

                # Keep overlap: backtrack sentences until we are within overlap budget
                overlap_sentences: list[str] = []
                overlap_tokens = 0
                for s in reversed(current_sentences):
                    st = approx_tokens(s)
                    if overlap_tokens + st > overlap:
                        break
                    overlap_sentences.insert(0, s)
                    overlap_tokens += st

                current_sentences = overlap_sentences
                current_tokens = overlap_tokens

            current_sentences.append(sentence)
            current_tokens += sentence_tokens

        if current_sentences:
            chunks.append(" ".join(current_sentences))

        return chunks

    # ─── Embedding Storage ────────────────────────────────────────────────────

    async def store_chunks_with_embeddings(
        self,
        document_id: UUID,
        workspace_id: UUID,
        chunks: list[str],
        db: AsyncSession,
    ) -> int:
        """
        Generate embeddings for all chunks and persist them to the DB.
        Returns the number of chunks stored.
        """
        if not chunks:
            return 0

        logger.info(
            "Generating embeddings for %d chunks (document=%s)", len(chunks), document_id
        )
        embeddings = await embedding_service.generate_embeddings_batch(chunks)

        chunk_objects = []
        for idx, (content, embedding) in enumerate(zip(chunks, embeddings)):
            token_count = embedding_service.count_tokens(content)
            chunk_obj = DocumentChunk(
                document_id=document_id,
                workspace_id=workspace_id,
                chunk_index=idx,
                content=content,
                token_count=token_count,
                embedding=embedding,
                metadata_={"chunk_index": idx, "total_chunks": len(chunks)},
            )
            chunk_objects.append(chunk_obj)

        db.add_all(chunk_objects)
        await db.flush()
        logger.info("Stored %d chunks for document %s", len(chunk_objects), document_id)
        return len(chunk_objects)

    # ─── Main Pipeline ────────────────────────────────────────────────────────

    async def process_document(
        self,
        document_id: UUID,
        s3_key: str,
        file_type: str,
    ) -> None:
        """
        Full processing pipeline run as a background task.
        Opens its own DB session so it can run independently of the request session.
        """
        async with AsyncSessionLocal() as db:
            try:
                # Mark as processing
                await db.execute(
                    update(Document)
                    .where(Document.id == document_id)
                    .values(status=DocumentStatus.processing)
                )
                await db.commit()

                logger.info("Processing document %s (%s) from s3://%s", document_id, file_type, s3_key)

                # 1. Download from S3
                file_bytes = await s3_service.download_file(s3_key)

                # 2. Extract text
                text = self._extract_text(file_bytes, file_type)
                if not text.strip():
                    raise ValueError("Document appears to be empty or unreadable")

                # 3. Get workspace_id from DB
                from sqlalchemy import select as sa_select
                result = await db.execute(
                    sa_select(Document.workspace_id).where(Document.id == document_id)
                )
                workspace_id: Optional[UUID] = result.scalar_one_or_none()
                if workspace_id is None:
                    raise ValueError(f"Document {document_id} not found in database")

                # 4. Chunk
                chunks = self.chunk_text(text)
                logger.info("Document %s split into %d chunks", document_id, len(chunks))

                # 5. Delete existing chunks (in case of reprocessing)
                from sqlalchemy import delete as sa_delete
                await db.execute(
                    sa_delete(DocumentChunk).where(DocumentChunk.document_id == document_id)
                )

                # 6. Store with embeddings
                chunk_count = await self.store_chunks_with_embeddings(
                    document_id=document_id,
                    workspace_id=workspace_id,
                    chunks=chunks,
                    db=db,
                )

                # 7. Mark as ready
                await db.execute(
                    update(Document)
                    .where(Document.id == document_id)
                    .values(status=DocumentStatus.ready, chunk_count=chunk_count, error_message=None)
                )
                await db.commit()
                logger.info("Document %s processed successfully (%d chunks)", document_id, chunk_count)

            except Exception as exc:
                logger.exception("Failed to process document %s: %s", document_id, exc)
                try:
                    await db.rollback()
                    await db.execute(
                        update(Document)
                        .where(Document.id == document_id)
                        .values(status=DocumentStatus.failed, error_message=str(exc)[:2000])
                    )
                    await db.commit()
                except Exception as inner_exc:
                    logger.error("Failed to mark document as failed: %s", inner_exc)


# Singleton
document_processor = DocumentProcessor()
