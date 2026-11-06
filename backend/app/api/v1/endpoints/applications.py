"""
Applications endpoints with Role-Based Access Control (RBAC).
Normal users can view their own applications only.
Administrators can view all applications and update decisions.
"""
from fastapi import APIRouter, Depends, HTTPException, Query, status
from app.schemas.schemas import (
    ApplicationListResponse, ApplicationDetail, ApplicationSummary,
    DecisionUpdateRequest, OKResponse,
)
from app.security.auth import get_current_user, require_admin
from app.db.mongodb import applications_col, risk_assessments_col, verification_results_col, utcnow
from app.utils.helpers import paginate, serialize_doc, mask_id_number
from app.services.audit_service import log_event

router = APIRouter(prefix="/api/applications", tags=["Applications"])


@router.get("", response_model=ApplicationListResponse)
def list_applications(
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    status_filter: str = Query(None, alias="status"),
    decision: str = Query(None),
    risk_category: str = Query(None),
    date_from: str = Query(None),
    date_to: str = Query(None),
    search: str = Query(None),
    current_user: dict = Depends(get_current_user),
):
    user_role = current_user.get("role", "user")
    user_email = current_user.get("email")

    conditions = []
    # Enforce RBAC: Non-admin users can ONLY list their own applications
    if user_role not in ("admin", "superadmin"):
        conditions.append({"$or": [{"created_by": user_email}, {"applicant_email": user_email}]})

    import re

    if status_filter:
        escaped_status = re.escape(status_filter.strip())
        conditions.append({"$or": [
            {"status": {"$regex": f"^{escaped_status}$", "$options": "i"}},
            {"decision": {"$regex": f"^{escaped_status}$", "$options": "i"}},
        ]})
    if decision:
        escaped_dec = re.escape(decision.strip())
        conditions.append({"decision": {"$regex": f"^{escaped_dec}$", "$options": "i"}})
    if risk_category:
        conditions.append({"risk_category": risk_category.strip().upper()})
    if date_from:
        conditions.append({"created_at": {"$gte": date_from}})
    if date_to:
        to_bound = date_to + "T23:59:59.999999" if "T" not in date_to else date_to
        conditions.append({"created_at": {"$lte": to_bound}})

    if search:
        escaped_search = re.escape(search.strip())
        conditions.append({"$or": [
            {"applicant_name": {"$regex": escaped_search, "$options": "i"}},
            {"application_id": {"$regex": escaped_search, "$options": "i"}},
        ]})

    query: dict = {"$and": conditions} if len(conditions) > 1 else (conditions[0] if conditions else {})

    items, total = paginate(applications_col(), query, page, page_size)
    summaries = []
    for item in items:
        id_type = item.get("id_type")
        raw_id = item.get("id_number", "")
        masked_id = item.get("masked_id_number") or mask_id_number(id_type, raw_id)

        summaries.append(ApplicationSummary(
            application_id=item.get("application_id", ""),
            applicant_name=item.get("applicant_name", ""),
            status=item.get("status", ""),
            decision=item.get("decision", "PENDING"),
            risk_score=item.get("risk_score"),
            risk_category=item.get("risk_category"),
            created_at=item.get("created_at"),
            updated_at=item.get("updated_at"),
            created_by=item.get("created_by"),
            masked_id_number=masked_id,
        ))
    return ApplicationListResponse(items=summaries, total=total, page=page, page_size=page_size)


@router.get("/{application_id}", response_model=ApplicationDetail)
def get_application(application_id: str, current_user: dict = Depends(get_current_user)):
    doc = applications_col().find_one({"application_id": application_id})
    if not doc:
        raise HTTPException(status_code=404, detail="Application not found")

    user_role = current_user.get("role", "user")
    user_email = current_user.get("email")

    # RBAC Ownership check: non-admin users cannot access other users' applications
    if user_role not in ("admin", "superadmin"):
        created_by = doc.get("created_by")
        applicant_email = doc.get("applicant_email")
        if created_by != user_email and applicant_email != user_email:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Access denied: You can only view your own applications.",
            )

    s = serialize_doc(doc)
    risk = risk_assessments_col().find_one({"application_id": application_id})
    masked_id = s.get("masked_id_number") or mask_id_number(s.get("id_type"), s.get("id_number"))

    app_id_val = s.get("application_id") or (doc.get("application_id") if isinstance(doc, dict) else None) or application_id

    return ApplicationDetail(
        application_id=app_id_val,
        applicant_name=s.get("applicant_name", ""),
        applicant_email=s.get("applicant_email"),
        applicant_phone=s.get("applicant_phone"),
        id_type=s.get("id_type"),
        status=s.get("status", ""),
        decision=s.get("decision", "PENDING"),
        risk_score=s.get("risk_score"),
        risk_category=s.get("risk_category"),
        identity_result=s.get("identity_result"),
        document_result=s.get("document_result"),
        liveness_result=s.get("liveness_result"),
        cross_reference=s.get("cross_reference"),
        risk_assessment=serialize_doc(risk) if risk else None,
        simulated=s.get("simulated", True),
        created_at=s.get("created_at") or utcnow(),
        updated_at=s.get("updated_at"),
        created_by=s.get("created_by") or user_email,
        masked_id_number=masked_id,
        # Conceal reviewer notes from non-admin applicants
        review_notes=s.get("review_notes") if user_role in ("admin", "superadmin") else None,
    )


@router.get("/{application_id}/report")
def get_report(application_id: str, current_user: dict = Depends(get_current_user)):
    doc = applications_col().find_one({"application_id": application_id})
    if not doc:
        raise HTTPException(status_code=404, detail="Application not found")

    user_role = current_user.get("role", "user")
    user_email = current_user.get("email")

    if user_role not in ("admin", "superadmin"):
        if doc.get("created_by") != user_email and doc.get("applicant_email") != user_email:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Access denied: You can only view reports for your own applications.",
            )

    s = serialize_doc(doc)
    s["masked_id_number"] = mask_id_number(s.get("id_type"), s.get("id_number"))
    # Never expose unmasked raw ID in reports
    s["id_number"] = s["masked_id_number"]
    if user_role not in ("admin", "superadmin"):
        s.pop("review_notes", None)

    risk = risk_assessments_col().find_one({"application_id": application_id})
    return {
        "application": s,
        "risk_assessment": serialize_doc(risk) if risk else None,
        "report_generated_at": utcnow().isoformat(),
        "note": "This report is generated from prototype data and is for demonstration purposes only.",
    }


@router.patch("/{application_id}/decision", response_model=OKResponse)
def update_decision(
    application_id: str,
    req: DecisionUpdateRequest,
    current_user: dict = Depends(require_admin),
):
    doc = applications_col().find_one({"application_id": application_id})
    if not doc:
        raise HTTPException(status_code=404, detail="Application not found")

    applications_col().update_one(
        {"application_id": application_id},
        {"$set": {"decision": req.decision, "review_notes": req.notes, "updated_at": utcnow()}},
    )
    log_event(
        event_type="MANUAL_DECISION",
        description=f"Decision updated to {req.decision} by {current_user.get('email')}",
        application_id=application_id,
        performed_by=current_user.get("email"),
        metadata={"notes": req.notes},
    )
    return OKResponse(message=f"Decision updated to {req.decision}")


@router.delete("/{application_id}")
def delete_application(
    application_id: str,
    current_user: dict = Depends(require_admin),
):
    """Admin-only: delete an application and its associated records."""
    col = applications_col()
    doc = col.find_one({"application_id": application_id})
    if not doc:
        raise HTTPException(status_code=404, detail="Application not found")

    # Capture metadata before deletion for audit log
    applicant_name = doc.get("applicant_name", "Unknown")
    applicant_email = doc.get("applicant_email", "Unknown")

    # Delete from applications collection
    col.delete_one({"application_id": application_id})

    # Delete associated risk assessments (best-effort)
    try:
        risk_col = risk_assessments_col()
        risk_col.delete_many({"application_id": application_id})
    except Exception:
        pass

    # Delete associated verification results (best-effort)
    try:
        ver_col = verification_results_col()
        ver_col.delete_many({"application_id": application_id})
    except Exception:
        pass

    # Audit log
    log_event(
        event_type="APPLICATION_DELETED",
        description=f"Application {application_id} deleted by admin",
        application_id=application_id,
        performed_by=current_user.get("email", "unknown"),
        metadata={
            "applicant_name": applicant_name,
            "applicant_email": applicant_email,
            "deleted_by_email": current_user.get("email"),
            "deleted_by_role": current_user.get("role"),
        },
    )
    return {"message": f"Application {application_id} deleted successfully", "application_id": application_id}


@router.get("/{application_id}/images")
def get_application_images(
    application_id: str,
    current_user: dict = Depends(require_admin),
):
    """Admin-only: retrieve uploaded document/selfie images for an application."""
    col = applications_col()
    doc = col.find_one({"application_id": application_id})
    if not doc:
        raise HTTPException(status_code=404, detail="Application not found")

    # Extract all base64 image fields — adapt field names based on what's actually stored
    image_field_names = [
        "document_base64",
        "document_front_base64",
        "document_back_base64",
        "live_capture_base64",
        "selfie_base64",
        "face_image_base64",
        "id_document_base64",
    ]

    images = {}
    for field in image_field_names:
        val = doc.get(field)
        if val and isinstance(val, str) and len(val) > 50:
            images[field] = val

    # Audit log
    log_event(
        event_type="ADMIN_IMAGE_ACCESS",
        description=f"Admin accessed images for application {application_id}",
        application_id=application_id,
        performed_by=current_user.get("email", "unknown"),
        metadata={"fields_accessed": list(images.keys())},
    )

    return {
        "application_id": application_id,
        "image_count": len(images),
        "images": images,
    }
