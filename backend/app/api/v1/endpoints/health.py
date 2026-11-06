"""
Health check endpoint.
GET /api/health — returns application and MongoDB status.
"""
from fastapi import APIRouter
from app.db.mongodb import check_connection
from app.core.config import get_settings

router = APIRouter(prefix="/api", tags=["Health"])


@router.get("/health")
def health_check():
    settings = get_settings()
    db_status = check_connection()
    is_connected = db_status.get("status") == "connected"
    return {
        "app": settings.app_name,
        "version": settings.app_version,
        "status": "ok" if is_connected else "degraded",
        "mongodb": db_status.get("status", "unavailable"),
        "database": settings.mongodb_database if is_connected else None,
        "debug": settings.debug,
    }
