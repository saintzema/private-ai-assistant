"""
LLM service supporting OpenAI (gpt-4o, gpt-4o-mini) and AWS Bedrock (Claude 3.5 Sonnet).
Provides both streaming and non-streaming completion interfaces.
"""

import json
import logging
from typing import AsyncGenerator, Optional

from tenacity import (
    retry,
    retry_if_exception_type,
    stop_after_attempt,
    wait_exponential,
)

from app.core.config import settings

logger = logging.getLogger(__name__)

# ─── Cost table (USD per 1K tokens) ──────────────────────────────────────────

_COST_TABLE: dict[str, dict[str, float]] = {
    "gpt-4o": {"input": 0.005, "output": 0.015},
    "gpt-4o-mini": {"input": 0.00015, "output": 0.0006},
    "anthropic.claude-3-5-sonnet-20241022-v2:0": {"input": 0.003, "output": 0.015},
    "anthropic.claude-3-haiku-20240307-v1:0": {"input": 0.00025, "output": 0.00125},
}


def estimate_cost(model: str, input_tokens: int, output_tokens: int) -> float:
    costs = _COST_TABLE.get(model, {"input": 0.002, "output": 0.002})
    return (input_tokens * costs["input"] + output_tokens * costs["output"]) / 1000


class LLMService:
    """
    Provider-agnostic LLM service.
    Provider is selected per-call based on the model name prefix.
    """

    def __init__(self) -> None:
        self._openai_client: Optional[object] = None
        self._bedrock_client: Optional[object] = None

    # ─── Client helpers ───────────────────────────────────────────────────────

    def _get_openai_client(self):
        if self._openai_client is None:
            from openai import AsyncOpenAI
            self._openai_client = AsyncOpenAI(api_key=settings.OPENAI_API_KEY)
        return self._openai_client

    def _get_bedrock_client(self):
        if self._bedrock_client is None:
            import boto3
            self._bedrock_client = boto3.client(
                "bedrock-runtime",
                region_name=settings.AWS_REGION,
                aws_access_key_id=settings.AWS_ACCESS_KEY_ID,
                aws_secret_access_key=settings.AWS_SECRET_ACCESS_KEY,
            )
        return self._bedrock_client

    def _is_bedrock_model(self, model: str) -> bool:
        return "." in model and not model.startswith("gpt")

    def _default_model(self) -> str:
        if settings.EMBEDDING_PROVIDER == "bedrock":
            return settings.AWS_BEDROCK_MODEL_ID
        return settings.OPENAI_CHAT_MODEL

    # ─── OpenAI completion ────────────────────────────────────────────────────

    @retry(
        retry=retry_if_exception_type(Exception),
        wait=wait_exponential(multiplier=1, min=1, max=20),
        stop=stop_after_attempt(3),
        reraise=True,
    )
    async def _openai_completion(
        self,
        messages: list[dict],
        model: str,
        max_tokens: int = 4096,
        temperature: float = 0.7,
    ) -> tuple[str, int, int]:
        """Returns (content, input_tokens, output_tokens)."""
        client = self._get_openai_client()
        response = await client.chat.completions.create(
            model=model,
            messages=messages,
            max_tokens=max_tokens,
            temperature=temperature,
        )
        content = response.choices[0].message.content or ""
        usage = response.usage
        return content, usage.prompt_tokens, usage.completion_tokens

    async def _openai_stream(
        self,
        messages: list[dict],
        model: str,
        max_tokens: int = 4096,
        temperature: float = 0.7,
    ) -> AsyncGenerator[str, None]:
        client = self._get_openai_client()
        stream = await client.chat.completions.create(
            model=model,
            messages=messages,
            max_tokens=max_tokens,
            temperature=temperature,
            stream=True,
        )
        async for chunk in stream:
            delta = chunk.choices[0].delta.content
            if delta:
                yield delta

    # ─── Bedrock completion ───────────────────────────────────────────────────

    @retry(
        retry=retry_if_exception_type(Exception),
        wait=wait_exponential(multiplier=1, min=1, max=20),
        stop=stop_after_attempt(3),
        reraise=True,
    )
    async def _bedrock_completion(
        self,
        messages: list[dict],
        model: str,
        max_tokens: int = 4096,
        temperature: float = 0.7,
        system_prompt: Optional[str] = None,
    ) -> tuple[str, int, int]:
        import asyncio

        client = self._get_bedrock_client()

        # Separate system messages from conversation
        bedrock_messages = []
        sys_content: Optional[str] = system_prompt

        for msg in messages:
            if msg["role"] == "system":
                sys_content = msg["content"]
            else:
                bedrock_messages.append({"role": msg["role"], "content": msg["content"]})

        body: dict = {
            "messages": bedrock_messages,
            "max_tokens": max_tokens,
            "temperature": temperature,
            "anthropic_version": "bedrock-2023-05-31",
        }
        if sys_content:
            body["system"] = sys_content

        loop = asyncio.get_event_loop()
        response = await loop.run_in_executor(
            None,
            lambda: client.invoke_model(
                modelId=model,
                body=json.dumps(body),
                contentType="application/json",
                accept="application/json",
            ),
        )
        result = json.loads(response["body"].read())
        content = result["content"][0]["text"]
        usage = result.get("usage", {})
        return content, usage.get("input_tokens", 0), usage.get("output_tokens", 0)

    async def _bedrock_stream(
        self,
        messages: list[dict],
        model: str,
        max_tokens: int = 4096,
        temperature: float = 0.7,
        system_prompt: Optional[str] = None,
    ) -> AsyncGenerator[str, None]:
        import asyncio

        client = self._get_bedrock_client()
        bedrock_messages = []
        sys_content: Optional[str] = system_prompt

        for msg in messages:
            if msg["role"] == "system":
                sys_content = msg["content"]
            else:
                bedrock_messages.append({"role": msg["role"], "content": msg["content"]})

        body: dict = {
            "messages": bedrock_messages,
            "max_tokens": max_tokens,
            "temperature": temperature,
            "anthropic_version": "bedrock-2023-05-31",
        }
        if sys_content:
            body["system"] = sys_content

        loop = asyncio.get_event_loop()
        response = await loop.run_in_executor(
            None,
            lambda: client.invoke_model_with_response_stream(
                modelId=model,
                body=json.dumps(body),
                contentType="application/json",
                accept="application/json",
            ),
        )

        for event in response["body"]:
            chunk = json.loads(event["chunk"]["bytes"])
            if chunk.get("type") == "content_block_delta":
                delta = chunk.get("delta", {})
                if delta.get("type") == "text_delta":
                    yield delta.get("text", "")

    # ─── Public API ───────────────────────────────────────────────────────────

    async def chat_completion(
        self,
        messages: list[dict],
        model: Optional[str] = None,
        stream: bool = False,
        max_tokens: int = 4096,
        temperature: float = 0.7,
        system_prompt: Optional[str] = None,
    ) -> tuple[str, int, int] | AsyncGenerator[str, None]:
        """
        Generate a chat completion.

        Args:
            messages: List of {"role": ..., "content": ...} dicts.
            model: Model identifier. Defaults to config default.
            stream: If True, returns an AsyncGenerator of text chunks.
            max_tokens: Maximum tokens in the response.
            temperature: Sampling temperature.
            system_prompt: Optional system instruction (Bedrock-style).

        Returns:
            If stream=False: (content, input_tokens, output_tokens) tuple.
            If stream=True: AsyncGenerator yielding text chunks.
        """
        resolved_model = model or self._default_model()
        logger.debug("chat_completion model=%s stream=%s", resolved_model, stream)

        if self._is_bedrock_model(resolved_model):
            if stream:
                return self._bedrock_stream(
                    messages, resolved_model, max_tokens, temperature, system_prompt
                )
            return await self._bedrock_completion(
                messages, resolved_model, max_tokens, temperature, system_prompt
            )
        else:
            if system_prompt:
                messages = [{"role": "system", "content": system_prompt}] + [
                    m for m in messages if m.get("role") != "system"
                ]
            if stream:
                return self._openai_stream(messages, resolved_model, max_tokens, temperature)
            return await self._openai_completion(
                messages, resolved_model, max_tokens, temperature
            )

    async def stream_completion(
        self,
        messages: list[dict],
        model: Optional[str] = None,
        max_tokens: int = 4096,
        temperature: float = 0.7,
        system_prompt: Optional[str] = None,
    ) -> AsyncGenerator[str, None]:
        """Convenience wrapper — always streams."""
        result = await self.chat_completion(
            messages=messages,
            model=model,
            stream=True,
            max_tokens=max_tokens,
            temperature=temperature,
            system_prompt=system_prompt,
        )
        return result  # type: ignore[return-value]

    def estimate_cost(self, model: str, input_tokens: int, output_tokens: int) -> float:
        return estimate_cost(model, input_tokens, output_tokens)

    def build_system_prompt(self, context_docs: str) -> str:
        return (
            "You are a helpful AI assistant with access to a private knowledge base.\n"
            "Answer questions using ONLY the context provided below.\n"
            "If the answer is not in the context, say so honestly.\n"
            "Always cite the source documents by name when possible.\n\n"
            f"CONTEXT:\n{context_docs}"
        )


# Singleton
llm_service = LLMService()
