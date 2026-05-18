"""
API v1 router aggregation.
All sub-routers are imported and included here.
"""

from fastapi import APIRouter

from app.api.v1 import (
    auth,
    users,
    workspaces,
    documents,
    chats,
    admin,
    subscriptions,
    embeddings,
)

router = APIRouter()

router.include_router(auth.router, prefix="/auth", tags=["Authentication"])
router.include_router(users.router, prefix="/users", tags=["Users"])
router.include_router(workspaces.router, prefix="/workspaces", tags=["Workspaces"])
router.include_router(documents.router, prefix="/workspaces", tags=["Documents"])
router.include_router(chats.router, prefix="/workspaces", tags=["Chats"])
router.include_router(admin.router, prefix="/admin", tags=["Admin"])
router.include_router(subscriptions.router, prefix="", tags=["Subscriptions & Marketplace"])
router.include_router(embeddings.router, prefix="/embeddings", tags=["Embeddings"])
