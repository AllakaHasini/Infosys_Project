"""
MongoDB connection management.
Provides a centralized, reusable database client with health checks.
"""
import logging
from datetime import timezone, datetime
from pymongo import MongoClient, ASCENDING, DESCENDING
from pymongo.errors import ConnectionFailure, ServerSelectionTimeoutError, PyMongoError, DuplicateKeyError
from app.core.config import get_settings

logger = logging.getLogger(__name__)

_client = None  # type: MongoClient | None
_db = None


def get_client() -> MongoClient:
    """Return the shared MongoClient, initialising it on first call."""
    global _client
    if _client is None:
        settings = get_settings()
        _client = MongoClient(
            settings.mongodb_uri,
            serverSelectionTimeoutMS=5000,
            connectTimeoutMS=5000,
        )
    return _client


def get_db():
    """Return the application database handle."""
    global _db
    if _db is None:
        settings = get_settings()
        _db = get_client()[settings.mongodb_database]
    return _db


def check_connection() -> dict:
    """Ping MongoDB and return a status dict without exposing credentials."""
    try:
        client = get_client()
        client.admin.command("ping")
        settings = get_settings()
        return {
            "status": "connected",
            "database": settings.mongodb_database,
        }
    except (ConnectionFailure, ServerSelectionTimeoutError, PyMongoError) as exc:
        logger.error("MongoDB unavailable: %s", exc)
        return {
            "status": "unavailable",
            "error": "Database connection failed",
        }


def get_collection(name: str):
    """Return a named collection from the application database."""
    return get_db()[name]


# ---------------------------------------------------------------------------
# Convenience accessors
# ---------------------------------------------------------------------------

def users_col():
    return get_collection("users")

def applications_col():
    return get_collection("applications")

def verification_results_col():
    return get_collection("verification_results")

def risk_assessments_col():
    return get_collection("risk_assessments")

def batch_jobs_col():
    return get_collection("batch_jobs")

def audit_logs_col():
    return get_collection("audit_logs")

def system_settings_col():
    return get_collection("system_settings")

def password_reset_otps_col():
    """Collection for OTP-based password reset tokens (prototype: no real email server)."""
    return get_collection("password_reset_otps")


def utcnow() -> datetime:
    """Return the current UTC datetime (timezone-aware)."""
    return datetime.now(timezone.utc)


def _inspect_and_migrate_unique_index(
    col,
    field_name: str,
    sparse: bool = True,
    key_direction: int = ASCENDING,
    dup_id_field: str = "application_id",
    dup_prefix: str = "_DUP_",
):
    """
    Safely and idempotently ensure a unique index exists on `col[field_name]`.
    1. Inspects existing indexes on `col`.
    2. If a non-unique index on the field exists, checks for duplicate records first.
    3. If duplicates exist, identifies and logs them, and disambiguates duplicates
       to preserve all records without deleting user data.
    4. Drops conflicting non-unique index only after duplicates are safely handled.
    5. Creates unique index (idempotently).
    """
    index_info = col.index_information()
    target_key = [(field_name, key_direction)]

    conflicting_index_name = None
    already_unique = False

    for idx_name, idx_spec in index_info.items():
        if idx_spec.get("key") == target_key:
            if idx_spec.get("unique", False):
                already_unique = True
            else:
                conflicting_index_name = idx_name

    # Step 1: Check and report duplicate records if migration is required or uniqueness not established
    if not already_unique or conflicting_index_name:
        dups = list(col.aggregate([
            {"$match": {field_name: {"$exists": True, "$ne": None, "$nin": ["", None]}}},
            {
                "$group": {
                    "_id": f"${field_name}",
                    "count": {"$sum": 1},
                    "docs": {
                        "$push": {
                            "_id": "$_id",
                            "id": f"${dup_id_field}",
                            "created_at": "$created_at",
                        }
                    },
                }
            },
            {"$match": {"count": {"$gt": 1}}},
        ]))

        if dups:
            logger.warning(
                "Found %d duplicate values for '%s' in '%s'. Reporting and preserving records...",
                len(dups), field_name, col.name
            )
            for d in dups:
                val = d["_id"]
                docs = sorted(d["docs"], key=lambda x: str(x.get("created_at") or x["_id"]))
                primary = docs[0]
                secondaries = docs[1:]
                pri_id = primary.get("id") or str(primary["_id"])
                sec_ids = [s.get("id") or str(s["_id"]) for s in secondaries]
                logger.warning(
                    "  [%s] '%s' has %d records. Keeping primary: %s. Preserving %d duplicate records: %s",
                    col.name, val, len(docs), pri_id, len(secondaries), sec_ids
                )
                for s in secondaries:
                    sec_id = s.get("id") or str(s["_id"])
                    orig_field = f"original_{field_name}"
                    col.update_one(
                        {"_id": s["_id"]},
                        {
                            "$set": {
                                orig_field: val,
                                field_name: f"{val}{dup_prefix}{sec_id}",
                                "is_duplicate_record": True,
                            }
                        },
                    )
        else:
            logger.info("No duplicates found for '%s' in '%s'.", field_name, col.name)

    # Step 2: Drop conflicting non-unique index
    if conflicting_index_name:
        logger.info(
            "Dropping conflicting non-unique index '%s' on %s.%s ...",
            conflicting_index_name, col.name, field_name
        )
        col.drop_index(conflicting_index_name)

    # Step 3: Create unique index
    if not already_unique or conflicting_index_name:
        col.create_index(target_key, unique=True, sparse=sparse)
        logger.info("Successfully created unique sparse index on %s.%s", col.name, field_name)
    else:
        logger.debug("Unique index on %s.%s is already active.", col.name, field_name)


def create_indexes():
    """Create required indexes on all collections idempotently."""
    db = get_db()

    logger.info("Inspecting and creating MongoDB indexes...")

    # 1. users: unique email and id_number only.
    #    Phone is NO LONGER stored on user accounts — it is collected only during eKYC.
    #    We drop the old phone/phone_number unique indexes if they exist (they are now obsolete).
    _inspect_and_migrate_unique_index(db["users"], "email", sparse=False, dup_id_field="email")
    _inspect_and_migrate_unique_index(db["users"], "id_number", sparse=True, dup_id_field="email")

    # Drop legacy phone indexes on users if they still exist (idempotent — no-op if already gone)
    _drop_index_if_exists(db["users"], "phone")
    _drop_index_if_exists(db["users"], "phone_number")

    # 2. applications: unique application_id and id_number only.
    #    applicant_phone is NOT unique at the DB level because the same user may
    #    submit multiple eKYC applications with the same phone number.
    #    Phone-uniqueness across DIFFERENT users is enforced in application logic
    #    (_check_duplicate_registration in ekyc_service.py).
    _inspect_and_migrate_unique_index(db["applications"], "application_id", sparse=False, dup_id_field="application_id")
    _inspect_and_migrate_unique_index(db["applications"], "id_number", sparse=True, dup_id_field="application_id")

    # Drop the legacy unique index on applicant_phone if it still exists —
    # it would block the same user from resubmitting with the same phone.
    _drop_index_if_exists(db["applications"], "applicant_phone")

    # Keep a non-unique index on applicant_phone for query performance
    db["applications"].create_index([("applicant_phone", ASCENDING)])

    # Standard query indexes on applications
    db["applications"].create_index([("status", ASCENDING)])
    db["applications"].create_index([("created_at", DESCENDING)])
    db["applications"].create_index([("applicant_email", ASCENDING)])
    db["applications"].create_index([("created_by_user_id", ASCENDING)])

    # 3. verification_results
    db["verification_results"].create_index([("application_id", ASCENDING)])

    # 4. risk_assessments
    db["risk_assessments"].create_index([("application_id", ASCENDING)])

    # 5. batch_jobs
    _inspect_and_migrate_unique_index(db["batch_jobs"], "batch_id", sparse=False, dup_id_field="batch_id")
    db["batch_jobs"].create_index([("created_at", DESCENDING)])

    # 6. audit_logs
    db["audit_logs"].create_index([("application_id", ASCENDING)])
    db["audit_logs"].create_index([("timestamp", DESCENDING)])
    db["audit_logs"].create_index([("event_type", ASCENDING)])

    # 7. password_reset_otps: auto-expire documents after they are used / expired
    db["password_reset_otps"].create_index([("email", ASCENDING)])
    db["password_reset_otps"].create_index(
        [("expires_at", ASCENDING)],
        expireAfterSeconds=0,  # TTL index — MongoDB removes docs when expires_at passes
    )

    logger.info("MongoDB indexes verified and ready.")


def _drop_index_if_exists(col, field_name: str, key_direction: int = ASCENDING) -> None:
    """
    Drop any index on `field_name` in `col` if one exists.
    Safe to call even if the index does not exist — no-op in that case.
    """
    target_key = [(field_name, key_direction)]
    index_info = col.index_information()
    for idx_name, idx_spec in index_info.items():
        if idx_spec.get("key") == target_key:
            logger.info("Dropping obsolete index '%s' on %s.%s ...", idx_name, col.name, field_name)
            col.drop_index(idx_name)
            return
    logger.debug("No index to drop for %s.%s — already absent.", col.name, field_name)


def close_connection():
    """Close the MongoDB client — call on application shutdown."""
    global _client, _db
    if _client:
        _client.close()
        _client = None
        _db = None
        logger.info("MongoDB connection closed.")
