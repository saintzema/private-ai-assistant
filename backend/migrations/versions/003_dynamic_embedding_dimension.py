"""Resize embedding column to whatever EMBEDDING_DIMENSION is set to in .env

This migration is idempotent: it reads the target dimension from the environment
and only performs DDL if the current column dimension differs.  Running
`alembic upgrade head` after `make use-gemini`, `make use-bedrock`, or
`make use-openai` will apply the correct dimension automatically.

Revision ID: 003
Revises: 002
Create Date: 2026-05-19
"""

import os

from alembic import op
from sqlalchemy import text

revision = "003"
down_revision = "002"
branch_labels = None
depends_on = None

_DEFAULT_DIM = 768  # Gemini text-embedding-004


def _target_dim() -> int:
    raw = os.getenv("EMBEDDING_DIMENSION", str(_DEFAULT_DIM))
    try:
        return int(raw)
    except ValueError:
        return _DEFAULT_DIM


def _current_dim(conn) -> int | None:
    """Return the current vector dimension of document_chunks.embedding, or None."""
    row = conn.execute(
        text(
            """
            SELECT atttypmod
            FROM pg_attribute
            JOIN pg_class ON pg_class.oid = pg_attribute.attrelid
            WHERE pg_class.relname = 'document_chunks'
              AND pg_attribute.attname = 'embedding'
              AND NOT pg_attribute.attisdropped
            """
        )
    ).fetchone()
    if row is None:
        return None
    # atttypmod for vector(n) encodes n directly
    return row[0] if row[0] > 0 else None


def upgrade() -> None:
    conn = op.get_bind()
    target = _target_dim()
    current = _current_dim(conn)

    if current == target:
        print(f"  Embedding column is already vector({target}), nothing to do.")
        return

    print(f"  Resizing embedding column: vector({current}) → vector({target})")
    op.execute("DROP INDEX IF EXISTS idx_chunks_embedding")
    op.execute("ALTER TABLE document_chunks DROP COLUMN IF EXISTS embedding")
    op.execute(f"ALTER TABLE document_chunks ADD COLUMN embedding vector({target})")
    op.execute(
        f"""
        CREATE INDEX idx_chunks_embedding
        ON document_chunks
        USING ivfflat (embedding vector_cosine_ops)
        WITH (lists = 100)
        """
    )
    # Invalidate existing chunks — their stored embeddings are now the wrong dim
    conn.execute(text("DELETE FROM document_chunks WHERE embedding IS NULL"))
    print(f"  Done. Re-upload documents to regenerate embeddings at {target} dims.")


def downgrade() -> None:
    # Downgrade is identical to upgrade: just re-read the env.
    # Callers are expected to set EMBEDDING_DIMENSION before downgrading.
    upgrade()
