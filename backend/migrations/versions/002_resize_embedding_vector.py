"""Resize embedding vector from 1536 (OpenAI) to 768 (Gemini text-embedding-004)

Revision ID: 002
Revises: 001
Create Date: 2026-05-19
"""

from alembic import op

revision = "002"
down_revision = "001"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # pgvector does not allow ALTER COLUMN to change vector dimension — must
    # drop and recreate the column.  Any existing embeddings become invalid
    # after a provider change, so deleting them is correct behaviour.
    op.execute("DROP INDEX IF EXISTS idx_chunks_embedding")
    op.execute("ALTER TABLE document_chunks DROP COLUMN IF EXISTS embedding")
    op.execute("ALTER TABLE document_chunks ADD COLUMN embedding vector(768)")
    # Recreate the IVFFlat index (lists=100 is appropriate for small datasets;
    # increase to 200-400 for larger corpora)
    op.execute(
        """
        CREATE INDEX idx_chunks_embedding
        ON document_chunks
        USING ivfflat (embedding vector_cosine_ops)
        WITH (lists = 100)
        """
    )


def downgrade() -> None:
    op.execute("DROP INDEX IF EXISTS idx_chunks_embedding")
    op.execute("ALTER TABLE document_chunks DROP COLUMN IF EXISTS embedding")
    op.execute("ALTER TABLE document_chunks ADD COLUMN embedding vector(1536)")
    op.execute(
        """
        CREATE INDEX idx_chunks_embedding
        ON document_chunks
        USING ivfflat (embedding vector_cosine_ops)
        WITH (lists = 100)
        """
    )
