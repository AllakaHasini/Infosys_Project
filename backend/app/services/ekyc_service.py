"""
eKYC Orchestration Service.
Coordinates identity verification, document analysis, liveness,
risk scoring, and database persistence for a single application.
"""
from __future__ import annotations
import logging
from datetime import timezone, datetime
from typing import Optional

from fastapi import HTTPException, status

import re
from app.db.mongodb import (
    applications_col, users_col, verification_results_col,
    risk_assessments_col, utcnow,
)
from app.utils.helpers import new_application_id, serialize_doc, mask_id_number
from app.integrations.mosip.provider import get_mosip_provider
from app.integrations.esignet.provider import get_esignet_provider
from app.services.liveness_service import get_liveness_provider
from app.services.document_service import analyze_document
from app.ai.risk_engine import RiskSignals, calculate_risk_score, detect_duplicate
from app.services.audit_service import log_event
from pymongo.errors import DuplicateKeyError

logger = logging.getLogger(__name__)

ALREADY_REGISTERED_DETAIL = "Already Registered! This phone number or ID is already associated with an existing account."


def _normalize_phone(phone: str | None) -> str:
    if not phone:
        return ""
    digits = re.sub(r"\D", "", phone)
    if len(digits) > 10 and digits.startswith("91"):
        return digits[-10:]
    return digits


def _normalize_id(id_num: str | None) -> str:
    if not id_num:
        return ""
    return re.sub(r"[\s-]", "", id_num).upper()


def _check_duplicate_registration(applicant: dict, current_user_email: str = "") -> None:
    """
    Raise HTTP 409 if the applicant's phone number or ID number is already
    associated with a DIFFERENT completed eKYC application.

    Phone number is no longer stored on user accounts (it is only collected
    during eKYC), so phone uniqueness is enforced only against the applications
    collection.  ID numbers are checked against both collections (applications
    and users) to catch any legacy records.
    """
    raw_id = (applicant.get("id_number") or "").strip()
    norm_id = _normalize_id(raw_id)

    raw_phone = (applicant.get("phone") or "").strip()
    norm_phone = _normalize_phone(raw_phone)

    a_col = applications_col()
    u_col = users_col()

    # ── ID number uniqueness ─────────────────────────────────────────────────
    if raw_id or norm_id:
        id_query = [v for v in [raw_id, norm_id] if v]

        # Check applications (block any existing app with same ID, even by same user)
        res_a = a_col.find_one({
            "$or": [
                {"id_number": {"$in": id_query}},
                {"id_number_normalized": norm_id},
            ],
            "status": {"$ne": "cancelled"},
        })
        if isinstance(res_a, dict):
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail=ALREADY_REGISTERED_DETAIL,
            )

        # Check users collection for legacy/admin-added ID records
        # Resolve the current user so we can skip their own record
        current_user_doc = u_col.find_one({"email": current_user_email.lower().strip()}) if current_user_email else None
        current_user_id_str = str(current_user_doc.get("_id", "")) if current_user_doc else ""

        res_u = u_col.find_one({
            "$or": [
                {"id_number": {"$in": id_query}},
                {"id_number_normalized": norm_id},
            ],
        })
        if isinstance(res_u, dict):
            if current_user_id_str and str(res_u.get("_id", "unknown")) == current_user_id_str:
                pass  # Same user's own record — allowed
            elif current_user_email and res_u.get("email", "").lower() == current_user_email.lower():
                pass  # Same user matched by email — allowed
            else:
                raise HTTPException(
                    status_code=status.HTTP_409_CONFLICT,
                    detail=ALREADY_REGISTERED_DETAIL,
                )

    # ── Phone number uniqueness ──────────────────────────────────────────────
    # Phone is ONLY stored on eKYC applications now (not on user accounts).
    # Block if another user's application already uses this phone number.
    if raw_phone or norm_phone:
        phone_query = [v for v in [raw_phone, norm_phone] if v]
        res_ap = a_col.find_one({
            "$or": [
                {"applicant_phone": {"$in": phone_query}},
                {"applicant_phone_normalized": norm_phone},
            ],
            "status": {"$ne": "cancelled"},
            # Only block if it was submitted by a different user
            "created_by": {"$ne": current_user_email} if current_user_email else {"$exists": True},
        })
        if isinstance(res_ap, dict):
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail=ALREADY_REGISTERED_DETAIL,
            )


def run_ekyc_workflow(
    applicant: dict,
    mosip_token: Optional[str] = None,
    esignet_token: Optional[str] = None,
    liveness_token: Optional[str] = None,
    document_result: Optional[dict] = None,
    document_bytes: Optional[bytes] = None,
    document_filename: Optional[str] = None,
    document_back_bytes: Optional[bytes] = None,
    document_back_filename: Optional[str] = None,
    live_capture_bytes: Optional[bytes] = None,
    live_challenge: Optional[str] = None,
    live_challenge_frames_bytes: Optional[list[bytes]] = None,
    performed_by: str = "system",
    created_by: Optional[str] = None,
    current_user_email: Optional[str] = None,
) -> dict:
    """
    Execute the full eKYC workflow for a single applicant.
    Returns a complete result dict that is also persisted to MongoDB.
    """
    col = applications_col()
    app_id = new_application_id()
    now = utcnow()
    user_email = created_by or performed_by or "system"

    # 0. Duplicate phone/ID check — reject before any processing
    # Pass current_user_email so the user's own registered phone is not blocked
    _check_duplicate_registration(applicant, current_user_email=current_user_email or user_email)

    # 1. Identity verification via MOSIP adapter
    mosip_provider = get_mosip_provider()
    identity_result = mosip_provider.verify_identity(applicant)

    # 2. Document Analysis (front and optional back)
    if document_bytes and not document_result:
        try:
            document_result = analyze_document(
                file_bytes=document_bytes,
                filename=document_filename or "document.png",
                applicant=applicant,
                document_type=applicant.get("id_type", "unknown"),
            )
            # Analyze back side if provided (e.g. for Aadhaar card address/QR)
            if document_back_bytes:
                try:
                    back_res = analyze_document(
                        file_bytes=document_back_bytes,
                        filename=document_back_filename or "back_document.png",
                        applicant=applicant,
                        document_type=applicant.get("id_type", "unknown"),
                    )
                    document_result["back_document"] = back_res
                    if back_res.get("suspicious"):
                        document_result["suspicious"] = True
                        document_result["suspicious_detected"] = True
                    for flag in back_res.get("flags", []):
                        if flag not in document_result["flags"]:
                            document_result["flags"].append(f"BACK_{flag}")
                    for reason in back_res.get("reasons", []):
                        if reason not in document_result["reasons"]:
                            document_result["reasons"].append(f"Back side: {reason}")
                except Exception as b_exc:
                    logger.warning("Back document analysis error: %s", b_exc)
        except Exception as exc:
            logger.error("Document analysis error in eKYC workflow: %s", exc)
            document_result = {
                "document_type": applicant.get("id_type", "unknown"),
                "suspicious": False,
                "suspicious_detected": False,
                "confidence": 0.5,
                "flags": ["ANALYSIS_ERROR"],
                "reasons": [str(exc)],
                "simulated": False,
            }

    # 3. Liveness check with optional live camera capture bytes and challenge frames
    liveness_provider = get_liveness_provider()
    liveness_result = liveness_provider.check(
        image_bytes=live_capture_bytes,
        token=liveness_token,
        challenge=live_challenge,
        frames_bytes=live_challenge_frames_bytes,
    )

    # 4. Duplicate detection
    duplicate = detect_duplicate(applicant, col, current_user_email=current_user_email or user_email)

    # 5. Build explainable signals & field consistency check
    doc_suspicious = False
    doc_conf = 1.0
    fields_consistent = True

    if document_result:
        doc_suspicious = bool(document_result.get("suspicious", False))
        doc_conf = float(document_result.get("confidence", 1.0))
        doc_flags = document_result.get("flags", [])
        if "NAME_MISMATCH_IN_DOCUMENT" in doc_flags or "ID_NUMBER_MISMATCH" in doc_flags:
            fields_consistent = False

    is_live = bool(liveness_result.get("live", False))
    liveness_status = liveness_result.get("liveness_status", "")
    liveness_score = float(liveness_result.get("liveness_score", 0.0))
    liveness_confidence = float(liveness_result.get("confidence", 0.5))

    # capture_provided: True when any image, frames, or token were submitted
    capture_provided = bool(
        live_capture_bytes
        or (live_challenge_frames_bytes and len(live_challenge_frames_bytes) > 0)
        or liveness_token
    )

    # challenge_attempted: True when multi-frame challenge frames were sent
    challenge_attempted = bool(
        live_challenge
        and live_challenge_frames_bytes
        and len(live_challenge_frames_bytes) >= 2
    )

    # liveness_unverified: only mark unverified if no capture was provided at all.
    # If the user DID provide a selfie (even static), do NOT penalise with liveness_unverified.
    # The liveness_failed weight covers the case when challenge was attempted but failed.
    liveness_unverified = not capture_provided

    signals = RiskSignals(
        identity_verified=identity_result.get("verified", False),
        document_suspicious=doc_suspicious,
        document_confidence=doc_conf,
        document_available=document_result is not None,
        liveness_passed=is_live,
        liveness_unverified=liveness_unverified,
        liveness_confidence=liveness_confidence,
        duplicate_detected=duplicate,
        fields_consistent=fields_consistent,
        provider_simulated=identity_result.get("simulated", True),
    )

    # 6. Risk scoring and decision recommendation
    risk = calculate_risk_score(signals)

    # 7. Mask sensitive ID (Aadhaar masked as XXXX-XXXX-1234)
    id_type = applicant.get("id_type", "")
    raw_id = applicant.get("id_number", "")
    masked_id = mask_id_number(id_type, raw_id)
    doc_hash = document_result.get("file_hash") if document_result else None

    # 8. Cross-reference verification transparency reporting
    cross_reference = {
        "status": "VERIFIED_MOSIP" if not identity_result.get("simulated") else "NOT_CONFIGURED",
        "provider": identity_result.get("provider", "NONE"),
        "sources_checked": ["MOSIP_IDA"] if not identity_result.get("simulated") else [],
        "external_databases": {
            "uidai_cidr": "UNAVAILABLE",
            "digilocker_direct": "UNAVAILABLE",
        },
        "fields_cross_checked": {
            "full_name": bool(applicant.get("full_name")),
            "date_of_birth": bool(applicant.get("date_of_birth")),
            "id_number": bool(applicant.get("id_number")),
        },
        "note": (
            "Direct government registry cross-reference (e.g. UIDAI CIDR) is not configured in this environment. "
            "In accordance with official privacy standards, external verification is not fabricated."
        ) if identity_result.get("simulated") else "Demographic cross-reference verified with MOSIP IDA.",
    }

    # 9. Persist application document
    app_doc = {
        "application_id": app_id,
        "applicant_name": applicant.get("full_name", ""),
        "applicant_email": applicant.get("email", ""),
        "applicant_phone": applicant.get("phone", ""),
        "applicant_phone_normalized": _normalize_phone(applicant.get("phone")),
        "id_type": id_type,
        "id_number": raw_id,
        "id_number_normalized": _normalize_id(raw_id),
        "masked_id_number": masked_id,
        "doc_hash": doc_hash,
        "status": "completed",
        "decision": risk["decision"],
        "risk_score": risk["score"],
        "risk_category": risk["category"],
        "identity_result": identity_result,
        "document_result": document_result,
        "liveness_result": liveness_result,
        "cross_reference": cross_reference,
        "simulated": signals.provider_simulated,
        "created_by": user_email,
        "created_at": now,
        "updated_at": now,
    }
    try:
        applications_col().insert_one(app_doc)
    except DuplicateKeyError:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=ALREADY_REGISTERED_DETAIL,
        )

    # 10. Persist verification results
    verification_results_col().insert_one({
        "application_id": app_id,
        "identity": identity_result,
        "document": document_result,
        "liveness": liveness_result,
        "cross_reference": cross_reference,
        "doc_hash": doc_hash,
        "created_by": user_email,
        "created_at": now,
    })

    # 11. Persist risk assessment
    risk_assessments_col().insert_one({
        "application_id": app_id,
        "score": risk["score"],
        "category": risk["category"],
        "decision": risk["decision"],
        "reasons": risk["reasons"],
        "weights_used": risk["weights_used"],
        "model_note": risk["model_note"],
        "created_by": user_email,
        "created_at": now,
    })

    # 12. Audit event
    log_event(
        event_type="EKYC_VERIFICATION",
        description=f"eKYC verification completed for {masked_id}. Decision: {risk['decision']}",
        application_id=app_id,
        performed_by=user_email,
        metadata={"risk_score": risk["score"], "simulated": signals.provider_simulated},
    )

    return {
        "application_id": app_id,
        "status": "completed",
        "decision": risk["decision"],
        "risk_score": risk["score"],
        "risk_category": risk["category"],
        "risk_reasons": risk["reasons"],
        "identity_result": identity_result,
        "document_result": document_result,
        "liveness_result": liveness_result,
        "cross_reference": cross_reference,
        "created_at": now,
        "simulated": signals.provider_simulated,
        "masked_id_number": masked_id,
        "created_by": user_email,
    }
