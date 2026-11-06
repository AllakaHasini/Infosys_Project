"""
eKYC Risk Intelligence — FastAPI Application Entry Point
"""
import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from app.core.config import get_settings
from app.db.mongodb import create_indexes, close_connection, check_connection

from pymongo.errors import PyMongoError

# Routers
from app.api.v1.endpoints.health import router as health_router
from app.api.v1.endpoints.auth import router as auth_router
from app.api.v1.endpoints.ekyc import router as ekyc_router
from app.api.v1.endpoints.documents import router as documents_router
from app.api.v1.endpoints.liveness import router as liveness_router
from app.api.v1.endpoints.risk import router as risk_router
from app.api.v1.endpoints.applications import router as applications_router
from app.api.v1.endpoints.dashboard import router as dashboard_router
from app.api.v1.endpoints.audit import router as audit_router
from app.api.v1.endpoints.batch import router as batch_router
from app.api.v1.endpoints.settings import router as settings_router

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s | %(levelname)s | %(name)s | %(message)s",
)
logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Start-up and shut-down lifecycle."""
    settings = get_settings()
    logger.info("Starting %s v%s …", settings.app_name, settings.app_version)

    db_status = check_connection()
    if db_status["status"] != "connected":
        logger.error(
            "❌  MongoDB is NOT reachable.\n"
            "    Database: %s\n"
            "    Please verify MongoDB is running.\n"
            "    Windows: net start MongoDB\n"
            "    Status: %s",
            settings.mongodb_database,
            db_status.get("error", "unknown"),
        )
    else:
        logger.info("✅  MongoDB connected. Database: %s", settings.mongodb_database)
        try:
            create_indexes()
        except Exception as exc:
            logger.warning("Index initialization notice: %s", exc)

        # Auto-seed admin account if missing (prevents HTTP 500 on first login)
        try:
            from app.db.mongodb import users_col, system_settings_col, utcnow
            from app.security.auth import hash_password as _hash_pw
            col = users_col()
            if not col.find_one({"email": settings.admin_email}):
                col.insert_one({
                    "email": settings.admin_email,
                    "hashed_password": _hash_pw(settings.admin_password),
                    "role": "admin",
                    "full_name": "System Administrator",
                    "created_at": utcnow(),
                })
                logger.info("✅  Admin account auto-seeded: %s", settings.admin_email)
            else:
                logger.info("ℹ️   Admin account already exists: %s", settings.admin_email)

            # Init system settings if missing
            sc = system_settings_col()
            if not sc.find_one({"_id": "global"}):
                sc.insert_one({
                    "_id": "global",
                    "risk_low_threshold": settings.risk_low_threshold,
                    "risk_medium_threshold": settings.risk_medium_threshold,
                    "risk_high_threshold": settings.risk_high_threshold,
                    "max_batch_size": settings.max_batch_size,
                    "mosip_mode": "mock",
                    "esignet_mode": "mock",
                    "liveness_mode": "mock",
                })
                logger.info("✅  System settings initialized.")
        except Exception as seed_exc:
            logger.warning("Admin/settings auto-seed notice: %s", seed_exc)

    yield  # Application runs here

    logger.info("Shutting down …")
    close_connection()



settings = get_settings()

app = FastAPI(
    title=settings.app_name,
    version=settings.app_version,
    description=(
        "AI-Powered eKYC & Risk Intelligence on MOSIP — "
        "Infosys Internship Project. "
        "Prototype only — not for production use."
    ),
    docs_url="/docs",
    redoc_url="/redoc",
    lifespan=lifespan,
)

# CORS — configure explicitly permitted development/production origins
cors_regex = None
if settings.debug or settings.allow_private_network_cors:
    cors_regex = r"^https?://(localhost|127\.0\.0\.1|192\.168\.\d+\.\d+|10\.\d+\.\d+\.\d+|172\.(1[6-9]|2\d|3[0-1])\.\d+\.\d+)(:\d+)?$"

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.parsed_cors_origins,
    allow_origin_regex=cors_regex,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Register routers
for router in [
    health_router, auth_router, ekyc_router, documents_router,
    liveness_router, risk_router, applications_router, dashboard_router,
    audit_router, batch_router, settings_router,
]:
    app.include_router(router)


@app.exception_handler(PyMongoError)
async def mongodb_exception_handler(request, exc: PyMongoError):
    logger.error("Database operation failed: %s", exc)
    return JSONResponse(
        status_code=503,
        content={"detail": "Database service is unavailable. Please ensure MongoDB is running."},
    )


@app.exception_handler(Exception)
async def generic_exception_handler(request, exc):
    logger.exception("Unhandled exception: %s", exc)
    return JSONResponse(
        status_code=500,
        content={"detail": "An internal error occurred. Check server logs."},
    )
