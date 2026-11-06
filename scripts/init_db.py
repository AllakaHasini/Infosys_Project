"""
Database Initialization Script.
Creates all required MongoDB indexes and optionally seeds a default admin user.

Usage:
    cd backend
    python -m scripts.init_db
or:
    python scripts/init_db.py

Environment variables required:
    MONGODB_URI, MONGODB_DATABASE, ADMIN_EMAIL, ADMIN_PASSWORD
"""
import os
import sys
import logging
from pathlib import Path

# Add backend to sys.path so app imports work
sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "backend"))

from dotenv import load_dotenv
load_dotenv(Path(__file__).resolve().parent.parent / "backend" / ".env")

from app.db.mongodb import check_connection, create_indexes, users_col, applications_col, system_settings_col, get_db
from app.security.auth import hash_password
from app.core.config import get_settings

logging.basicConfig(level=logging.INFO, format="%(levelname)s | %(message)s")
logger = logging.getLogger(__name__)


def init():
    settings = get_settings()
    logger.info("Connecting to MongoDB database '%s' …", settings.mongodb_database)

    status = check_connection()
    if status["status"] != "connected":
        logger.error("Cannot connect to MongoDB: %s", status.get("error"))
        logger.error("Start MongoDB first:  net start MongoDB  (Windows)")
        sys.exit(1)

    logger.info("Creating and verifying indexes …")
    create_indexes()

    # Report collection stats and active unique indexes
    db = get_db()
    logger.info("--- Verified Active Indexes ---")
    for col_name in ["users", "applications", "password_reset_otps"]:
        col = db[col_name]
        indices = col.index_information()
        idx_summaries = []
        for name, spec in indices.items():
            key_repr = ", ".join(f"{k}:{d}" for k, d in spec.get("key", []))
            u_flag = " [UNIQUE]" if spec.get("unique") else ""
            s_flag = " [SPARSE]" if spec.get("sparse") else ""
            idx_summaries.append(f"{name} ({key_repr}{u_flag}{s_flag})")
        logger.info("  %s (%d documents):", col_name, col.count_documents({}))
        for s in idx_summaries:
            logger.info("    - %s", s)

    # Create default admin if not exists
    col = users_col()
    if not col.find_one({"email": settings.admin_email}):
        col.insert_one({
            "email": settings.admin_email,
            "hashed_password": hash_password(settings.admin_password),
            "role": "admin",
            "full_name": "System Administrator",
            "created_at": __import__("datetime").datetime.now(__import__("datetime").timezone.utc),
        })
        logger.info("Admin user created: %s", settings.admin_email)
    else:
        logger.info("Admin user already exists: %s", settings.admin_email)

    # Init system settings document
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
        logger.info("System settings initialized.")

    logger.info("✅  Database initialization complete.")
    logger.info("    Database : %s", settings.mongodb_database)
    logger.info("    Admin    : %s", settings.admin_email)


if __name__ == "__main__":
    init()
