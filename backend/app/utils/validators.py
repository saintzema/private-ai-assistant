"""
Input validation and sanitization utilities.
"""

import hashlib
import re
import secrets
import string
import unicodedata
from pathlib import Path
from typing import Optional

# ─── File Validation ──────────────────────────────────────────────────────────

_ALLOWED_EXTENSIONS = {"pdf", "docx", "txt", "csv"}
_DANGEROUS_CHARS_RE = re.compile(r'[<>:"/\\|?*\x00-\x1f]')


def validate_file_type(filename: str, allowed_types: Optional[set[str]] = None) -> bool:
    """
    Return True if the file extension is in the allowed set.

    Args:
        filename: Original filename (e.g. "report.pdf").
        allowed_types: Set of allowed lowercase extensions without dots.
                       Defaults to {pdf, docx, txt, csv}.
    """
    if allowed_types is None:
        allowed_types = _ALLOWED_EXTENSIONS
    suffix = Path(filename).suffix.lstrip(".").lower()
    return suffix in allowed_types


def validate_file_size(size_bytes: int, max_mb: int) -> bool:
    """Return True if size_bytes is within the max_mb limit."""
    return size_bytes <= max_mb * 1024 * 1024


def sanitize_filename(filename: str) -> str:
    """
    Remove or replace dangerous characters from a filename.
    Preserves the file extension and limits total length.
    """
    # Normalize unicode
    filename = unicodedata.normalize("NFKD", filename)
    filename = filename.encode("ascii", "ignore").decode("ascii")

    # Split name and extension
    p = Path(filename)
    stem = p.stem
    suffix = p.suffix

    # Remove dangerous characters
    stem = _DANGEROUS_CHARS_RE.sub("_", stem)
    stem = re.sub(r"\s+", "_", stem)
    stem = re.sub(r"_+", "_", stem).strip("_")

    # Limit length
    stem = stem[:200] or "document"
    suffix = suffix[:10]

    return f"{stem}{suffix}"


# ─── Email Validation ──────────────────────────────────────────────────────────

_EMAIL_RE = re.compile(
    r"^[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}$"
)


def validate_email(email: str) -> bool:
    """Basic RFC-5321-ish email format check."""
    return bool(_EMAIL_RE.match(email.strip()))


# ─── Token Generation ─────────────────────────────────────────────────────────

def generate_secure_token(nbytes: int = 32) -> str:
    """
    Generate a URL-safe secure random token.
    Default 32 bytes → 43-character base64url string.
    """
    return secrets.token_urlsafe(nbytes)


def generate_api_key() -> tuple[str, str]:
    """
    Generate a new API key.

    Returns:
        (raw_key, hashed_key)
        raw_key is shown to the user exactly once;
        hashed_key is stored in the database.

    Format: pk_live_<32 random hex chars>
    """
    raw_secret = secrets.token_hex(32)
    raw_key = f"pk_live_{raw_secret}"
    hashed_key = hashlib.sha256(raw_key.encode()).hexdigest()
    return raw_key, hashed_key


def hash_api_key(raw_key: str) -> str:
    """Hash a raw API key for database lookup."""
    return hashlib.sha256(raw_key.encode()).hexdigest()


def get_api_key_prefix(raw_key: str) -> str:
    """Return the display prefix (first 12 characters) of the raw key."""
    return raw_key[:12]


# ─── Slug Validation ──────────────────────────────────────────────────────────

_SLUG_RE = re.compile(r"^[a-z0-9][a-z0-9\-]{1,98}[a-z0-9]$")


def validate_slug(slug: str) -> bool:
    """Return True if the slug matches the allowed pattern."""
    return bool(_SLUG_RE.match(slug))


def slugify(text: str) -> str:
    """Convert arbitrary text to a URL-safe slug."""
    text = unicodedata.normalize("NFKD", text)
    text = text.encode("ascii", "ignore").decode("ascii")
    text = text.lower()
    text = re.sub(r"[^a-z0-9\s-]", "", text)
    text = re.sub(r"[\s_]+", "-", text)
    text = re.sub(r"-+", "-", text).strip("-")
    return text[:100] or "workspace"
