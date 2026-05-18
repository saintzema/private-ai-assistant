"""Health check endpoints."""
from fastapi import APIRouter
from fastapi.responses import JSONResponse
from sqlalchemy import text

from app.core.config import settings
from app.core.database import engine

router = APIRouter()


@router.get("/")
async def health():
    return {"status": "ok", "service": settings.APP_NAME, "version": settings.APP_VERSION}


@router.get("/ready")
async def readiness():
    db_ok = False
    try:
        async with engine.connect() as conn:
            await conn.execute(text("SELECT 1"))
        db_ok = True
    except Exception:
        pass

    all_ok = db_ok
    return JSONResponse(
        content={"status": "ready" if all_ok else "not_ready", "database": db_ok},
        status_code=200 if all_ok else 503,
    )
