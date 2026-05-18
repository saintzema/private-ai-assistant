"""
RAG (Retrieval-Augmented Generation) pipeline.
Handles semantic search, context assembly, reranking, and streaming answer generation.
"""

import logging
from dataclasses import dataclass, field
from typing import AsyncGenerator, Optional
from uuid import UUID

from sqlalchemy import select, text
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.document import Document, DocumentChunk
from app.services.ai.embeddings import embedding_service
from app.services.ai.llm import llm_service

logger = logging.getLogger(__name__)

# Maximum context tokens to send to LLM
_MAX_CONTEXT_TOKENS = 6000
_SYSTEM_PROMPT_TEMPLATE = """\
You are a helpful AI assistant with access to a private knowledge base.
Answer the user's question using ONLY the context documents provided below.
If the answer cannot be found in the context, clearly state that.
Always cite source documents when referencing information.
Be concise, accurate, and helpful.

CONTEXT DOCUMENTS:
{context}
"""


@dataclass
class ChunkResult:
    chunk_id: UUID
    document_id: UUID
    document_name: str
    chunk_index: int
    content: str
    token_count: int
    score: float
    metadata: dict = field(default_factory=dict)


class RAGService:
    """
    Full RAG pipeline:
    1. Embed query
    2. Retrieve top-k chunks via pgvector cosine similarity
    3. (Optional) rerank
    4. Assemble context within token budget
    5. Generate streaming or non-streaming answer
    """

    # ─── Retrieval ────────────────────────────────────────────────────────────

    async def retrieve_context(
        self,
        query: str,
        workspace_id: UUID,
        db: AsyncSession,
        top_k: int = 5,
    ) -> list[ChunkResult]:
        """
        Embed the query and retrieve the top_k most similar chunks
        from the workspace using pgvector cosine similarity.
        """
        query_embedding = await embedding_service.generate_embedding(query)

        # Build a pgvector cosine similarity query
        # 1 - (embedding <=> query_vec) gives cosine similarity (higher = more similar)
        embedding_literal = f"[{','.join(str(x) for x in query_embedding)}]"

        sql = text(
            """
            SELECT
                dc.id          AS chunk_id,
                dc.document_id,
                d.name         AS document_name,
                dc.chunk_index,
                dc.content,
                dc.token_count,
                1 - (dc.embedding <=> :embedding ::vector) AS score
            FROM document_chunks dc
            JOIN documents d ON d.id = dc.document_id
            WHERE dc.workspace_id = :workspace_id
              AND d.status = 'ready'
              AND dc.embedding IS NOT NULL
            ORDER BY dc.embedding <=> :embedding ::vector
            LIMIT :top_k
            """
        )

        result = await db.execute(
            sql,
            {
                "embedding": embedding_literal,
                "workspace_id": str(workspace_id),
                "top_k": top_k,
            },
        )
        rows = result.mappings().all()

        chunks = [
            ChunkResult(
                chunk_id=row["chunk_id"],
                document_id=row["document_id"],
                document_name=row["document_name"],
                chunk_index=row["chunk_index"],
                content=row["content"],
                token_count=row["token_count"],
                score=float(row["score"]),
            )
            for row in rows
        ]

        logger.debug(
            "Retrieved %d chunks for workspace %s (top score=%.3f)",
            len(chunks),
            workspace_id,
            chunks[0].score if chunks else 0,
        )
        return chunks

    # ─── Reranking ────────────────────────────────────────────────────────────

    async def rerank_results(
        self,
        query: str,
        chunks: list[ChunkResult],
    ) -> list[ChunkResult]:
        """
        Simple cross-encoder reranking using keyword overlap scoring.
        Replace with a proper cross-encoder model in production (e.g. Cohere Rerank).
        """
        query_tokens = set(query.lower().split())

        def keyword_score(chunk: ChunkResult) -> float:
            chunk_tokens = set(chunk.content.lower().split())
            overlap = len(query_tokens & chunk_tokens)
            return chunk.score * 0.7 + (overlap / max(len(query_tokens), 1)) * 0.3

        reranked = sorted(chunks, key=keyword_score, reverse=True)
        return reranked

    # ─── Context Assembly ─────────────────────────────────────────────────────

    def _assemble_context(self, chunks: list[ChunkResult]) -> tuple[str, list[ChunkResult]]:
        """
        Assemble context string within the token budget.
        Returns (context_text, selected_chunks).
        """
        total_tokens = 0
        selected: list[ChunkResult] = []
        parts: list[str] = []

        for chunk in chunks:
            if total_tokens + chunk.token_count > _MAX_CONTEXT_TOKENS:
                break
            parts.append(
                f"[Source: {chunk.document_name} | chunk {chunk.chunk_index}]\n{chunk.content}"
            )
            total_tokens += chunk.token_count
            selected.append(chunk)

        return "\n\n---\n\n".join(parts), selected

    # ─── Conversation History ─────────────────────────────────────────────────

    def _build_messages(
        self,
        query: str,
        context: str,
        chat_history: list[dict],
    ) -> list[dict]:
        """Build the messages list for the LLM call."""
        system_prompt = _SYSTEM_PROMPT_TEMPLATE.format(context=context)
        messages = [{"role": "system", "content": system_prompt}]

        # Include last N turns of history (token budget approx)
        for turn in chat_history[-10:]:
            messages.append({"role": turn["role"], "content": turn["content"]})

        messages.append({"role": "user", "content": query})
        return messages

    # ─── Answer Generation ────────────────────────────────────────────────────

    async def generate_answer(
        self,
        query: str,
        context: list[ChunkResult],
        chat_history: list[dict],
        model: Optional[str] = None,
        stream: bool = True,
    ) -> AsyncGenerator[dict, None]:
        """
        Generate a RAG answer, yielding SSE-style event dicts.

        Yields dicts of shape:
            {"type": "sources", "sources": [...]}
            {"type": "content", "content": "...chunk..."}
            {"type": "done", "tokens_used": N}
            {"type": "error", "error": "..."}
        """
        context_text, selected_chunks = self._assemble_context(context)
        messages = self._build_messages(query, context_text, chat_history)

        # Emit sources first
        sources = [
            {
                "document_id": str(c.document_id),
                "chunk_id": str(c.chunk_id),
                "document_name": c.document_name,
                "score": round(c.score, 4),
                "excerpt": c.content[:300] + ("…" if len(c.content) > 300 else ""),
            }
            for c in selected_chunks
        ]
        yield {"type": "sources", "sources": sources}

        total_tokens = 0

        try:
            if stream:
                gen = await llm_service.chat_completion(
                    messages=messages,
                    model=model,
                    stream=True,
                )
                async for chunk_text in gen:  # type: ignore[union-attr]
                    total_tokens += len(chunk_text.split())  # rough estimate
                    yield {"type": "content", "content": chunk_text}
            else:
                content, input_tokens, output_tokens = await llm_service.chat_completion(  # type: ignore[misc]
                    messages=messages,
                    model=model,
                    stream=False,
                )
                total_tokens = input_tokens + output_tokens
                yield {"type": "content", "content": content}

            yield {"type": "done", "tokens_used": total_tokens}

        except Exception as exc:
            logger.exception("RAG generation error: %s", exc)
            yield {"type": "error", "error": str(exc)}

    # ─── Full Pipeline ────────────────────────────────────────────────────────

    async def query(
        self,
        query: str,
        workspace_id: UUID,
        db: AsyncSession,
        chat_history: list[dict] | None = None,
        top_k: int = 5,
        model: Optional[str] = None,
        stream: bool = True,
        rerank: bool = True,
    ) -> AsyncGenerator[dict, None]:
        """
        Full RAG pipeline: retrieve → rerank → generate.
        Yields SSE-style event dicts.
        """
        chunks = await self.retrieve_context(query, workspace_id, db, top_k)

        if not chunks:
            async def _no_context():
                yield {
                    "type": "content",
                    "content": "I couldn't find relevant information in your knowledge base for this question.",
                }
                yield {"type": "done", "tokens_used": 0}
            return _no_context()

        if rerank:
            chunks = await self.rerank_results(query, chunks)

        return self.generate_answer(
            query=query,
            context=chunks,
            chat_history=chat_history or [],
            model=model,
            stream=stream,
        )


# Singleton
rag_service = RAGService()
