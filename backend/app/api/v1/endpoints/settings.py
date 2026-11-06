"""
System settings endpoints.
GET  /api/settings — retrieve current settings
PATCH /api/settings — update configurable settings (admin only)
"""
from fastapi import APIRouter, Depends
from app.schemas.schemas import SystemSettingsResponse, SystemSettingsUpdate
from app.security.auth import require_admin
from app.db.mongodb import system_settings_col, utcnow
from app.core.config import get_settings

router = APIRouter(prefix="/api/settings", tags=["Settings"])


def _get_or_init_settings() -> dict:
    col = system_settings_col()
    doc = col.find_one({"_id": "global"})
    if not doc:
        cfg = get_settings()
        doc = {
            "_id": "global",
            "risk_low_threshold": cfg.risk_low_threshold,
            "risk_medium_threshold": cfg.risk_medium_threshold,
            "risk_high_threshold": cfg.risk_high_threshold,
            "max_batch_size": cfg.max_batch_size,
            "mosip_mode": "mock" if not cfg.mosip_base_url else "real",
            "esignet_mode": "mock" if not cfg.esignet_base_url else "real",
            "liveness_mode": "mock",
        }
        col.insert_one(doc)
    return doc


@router.get("", response_model=SystemSettingsResponse)
def get_system_settings(current_user: dict = Depends(require_admin)):
    doc = _get_or_init_settings()
    return SystemSettingsResponse(**{k: v for k, v in doc.items() if k != "_id"})


@router.patch("", response_model=SystemSettingsResponse)
def update_system_settings(
    update: SystemSettingsUpdate,
    current_user: dict = Depends(require_admin),
):
    col = system_settings_col()
    _get_or_init_settings()
    patch = {k: v for k, v in update.model_dump().items() if v is not None}
    patch["updated_at"] = utcnow()
    col.update_one({"_id": "global"}, {"$set": patch})
    doc = col.find_one({"_id": "global"})
    return SystemSettingsResponse(**{k: v for k, v in doc.items() if k != "_id"})
