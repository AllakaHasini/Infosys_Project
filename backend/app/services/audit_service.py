"""
Audit logging service.
Records security and application events to MongoDB.
"""
from __future__ import annotations
import logging
from typing import Optional
from app.db.mongodb import audit_logs_col, utcnow
from app.utils.helpers import serialize_doc

logger = logging.getLogger(__name__)


def log_event(
    event_type: str,
    description: str,
    application_id: Optional[str] = None,
    performed_by: Optional[str] = None,
    metadata: Optional[dict] = None,
):
    """Write an audit event to the audit_logs collection."""
    entry = {
        "event_type": event_type,
        "description": description,
        "application_id": application_id,
        "performed_by": performed_by,
        "metadata": metadata or {},
        "timestamp": utcnow(),
    }
    try:
        audit_logs_col().insert_one(entry)
    except Exception as exc:
        # Audit logging must never crash the main flow
        logger.error("Failed to write audit log: %s", exc)
