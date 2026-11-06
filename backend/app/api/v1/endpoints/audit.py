"""
Audit logs endpoint.
GET /api/audit-logs — paginated audit records (admin only).
"""
from fastapi import APIRouter, Depends, Query
from app.schemas.schemas import AuditLogListResponse, AuditLogEntry
from app.security.auth import require_admin
from app.db.mongodb import audit_logs_col
from app.utils.helpers import paginate

router = APIRouter(prefix="/api/audit-logs", tags=["Audit"])


@router.get("", response_model=AuditLogListResponse)
def get_audit_logs(
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    event_type: str = Query(None),
    application_id: str = Query(None),
    current_user: dict = Depends(require_admin),
):
    query: dict = {}
    if event_type:
        query["event_type"] = event_type
    if application_id:
        query["application_id"] = application_id

    items, total = paginate(audit_logs_col(), query, page, page_size, sort_field="timestamp")
    entries = []
    for item in items:
        entries.append(AuditLogEntry(
            id=item.get("id", ""),
            event_type=item.get("event_type", ""),
            application_id=item.get("application_id"),
            performed_by=item.get("performed_by"),
            description=item.get("description", ""),
            timestamp=item.get("timestamp"),
            metadata=item.get("metadata"),
        ))
    return AuditLogListResponse(items=entries, total=total, page=page, page_size=page_size)
