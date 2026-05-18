"""
Pagination utilities: Paginator class, paginate() helper, and PaginatedResponse schema.
"""

import math
from typing import Any, Generic, Sequence, TypeVar

from fastapi import Query
from pydantic import BaseModel, Field

T = TypeVar("T")

# Default limits
DEFAULT_PAGE_SIZE = 20
MAX_PAGE_SIZE = 100


class PaginationParams(BaseModel):
    """Query parameter schema for pagination."""
    page: int = Field(default=1, ge=1, description="1-based page number")
    page_size: int = Field(
        default=DEFAULT_PAGE_SIZE,
        ge=1,
        le=MAX_PAGE_SIZE,
        description="Number of items per page",
    )

    @property
    def offset(self) -> int:
        return (self.page - 1) * self.page_size

    @property
    def limit(self) -> int:
        return self.page_size


class PaginatedResponse(BaseModel, Generic[T]):
    """Generic paginated response wrapper."""
    items: list[T]
    total: int
    page: int
    page_size: int
    total_pages: int
    has_next: bool
    has_previous: bool

    model_config = {"arbitrary_types_allowed": True}


class Paginator:
    """
    Helper that computes pagination metadata from raw query results.
    """

    def __init__(self, page: int, page_size: int, total: int) -> None:
        self.page = max(1, page)
        self.page_size = min(max(1, page_size), MAX_PAGE_SIZE)
        self.total = total

    @property
    def total_pages(self) -> int:
        return math.ceil(self.total / self.page_size) if self.page_size else 0

    @property
    def offset(self) -> int:
        return (self.page - 1) * self.page_size

    @property
    def limit(self) -> int:
        return self.page_size

    @property
    def has_next(self) -> bool:
        return self.page < self.total_pages

    @property
    def has_previous(self) -> bool:
        return self.page > 1

    def paginate(self, items: Sequence[Any]) -> PaginatedResponse:
        return PaginatedResponse(
            items=list(items),
            total=self.total,
            page=self.page,
            page_size=self.page_size,
            total_pages=self.total_pages,
            has_next=self.has_next,
            has_previous=self.has_previous,
        )


def paginate(
    items: Sequence[Any],
    total: int,
    page: int,
    page_size: int,
) -> PaginatedResponse:
    """Convenience function for building a PaginatedResponse."""
    paginator = Paginator(page=page, page_size=page_size, total=total)
    return paginator.paginate(items)


# FastAPI query param dependency
def pagination_params(
    page: int = Query(default=1, ge=1, description="Page number (1-based)"),
    page_size: int = Query(
        default=DEFAULT_PAGE_SIZE,
        ge=1,
        le=MAX_PAGE_SIZE,
        alias="page_size",
        description="Items per page",
    ),
) -> PaginationParams:
    return PaginationParams(page=page, page_size=page_size)
