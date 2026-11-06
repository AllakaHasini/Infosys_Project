"""
Dashboard summary endpoint with role-based data partitioning.
Normal users see their personal verification statistics and history.
Administrators see overall platform-wide metrics.
"""
from fastapi import APIRouter, Depends
from app.schemas.schemas import DashboardSummary, ApplicationSummary
from app.security.auth import get_current_user
from app.db.mongodb import applications_col, risk_assessments_col
from app.utils.helpers import serialize_doc, mask_id_number

router = APIRouter(prefix="/api/dashboard", tags=["Dashboard"])


@router.get("/summary", response_model=DashboardSummary)
def dashboard_summary(current_user: dict = Depends(get_current_user)):
    col = applications_col()
    user_role = current_user.get("role", "user")
    user_email = current_user.get("email")

    base_query: dict = {}
    if user_role != "admin":
        base_query = {"$or": [{"created_by": user_email}, {"applicant_email": user_email}]}

    total = col.count_documents(base_query)
    approved = col.count_documents({**base_query, "decision": "APPROVED"})
    manual = col.count_documents({**base_query, "decision": "MANUAL_REVIEW"})
    rejected = col.count_documents({**base_query, "decision": "REJECTED"})
    pending = col.count_documents({**base_query, "decision": {"$nin": ["APPROVED", "MANUAL_REVIEW", "REJECTED"]}})

    # Average risk score
    pipeline = []
    if base_query:
        pipeline.append({"$match": base_query})
    pipeline.append({"$group": {"_id": None, "avg_score": {"$avg": "$risk_score"}}})
    avg_result = list(col.aggregate(pipeline))
    avg_score = round(avg_result[0]["avg_score"], 2) if avg_result else 0.0

    # Risk distribution
    risk_dist = {
        "LOW": col.count_documents({**base_query, "risk_category": "LOW"}),
        "MEDIUM": col.count_documents({**base_query, "risk_category": "MEDIUM"}),
        "HIGH": col.count_documents({**base_query, "risk_category": "HIGH"}),
        "VERY_HIGH": col.count_documents({**base_query, "risk_category": "VERY_HIGH"}),
    }

    # Recent 5 applications
    recent_docs = list(col.find(base_query).sort("created_at", -1).limit(5))
    recent = []
    for d in recent_docs:
        s = serialize_doc(d)
        masked_id = s.get("masked_id_number") or mask_id_number(s.get("id_type"), s.get("id_number"))
        recent.append(ApplicationSummary(
            application_id=s.get("application_id", ""),
            applicant_name=s.get("applicant_name", ""),
            status=s.get("status", ""),
            decision=s.get("decision", "PENDING"),
            risk_score=s.get("risk_score"),
            risk_category=s.get("risk_category"),
            created_at=s.get("created_at"),
            updated_at=s.get("updated_at"),
            created_by=s.get("created_by"),
            masked_id_number=masked_id,
        ))

    latest_application = None
    if recent_docs:
        latest_doc = recent_docs[0]
        s_latest = serialize_doc(latest_doc)
        masked_id = s_latest.get("masked_id_number") or mask_id_number(s_latest.get("id_type"), s_latest.get("id_number"))
        risk_doc = risk_assessments_col().find_one({"application_id": s_latest.get("application_id")})
        risk_ser = serialize_doc(risk_doc) if risk_doc else {}
        reasons = risk_ser.get("reasons") or s_latest.get("risk_reasons") or []

        latest_application = {
            "application_id": s_latest.get("application_id", ""),
            "applicant_name": s_latest.get("applicant_name", ""),
            "status": s_latest.get("status", ""),
            "decision": s_latest.get("decision", "PENDING"),
            "risk_score": s_latest.get("risk_score"),
            "risk_category": s_latest.get("risk_category"),
            "risk_reasons": reasons,
            "document_result": s_latest.get("document_result"),
            "liveness_result": s_latest.get("liveness_result"),
            "simulated": s_latest.get("simulated", True),
            "created_at": s_latest.get("created_at"),
            "masked_id_number": masked_id,
        }

    note = (
        "Personal eKYC dashboard — displaying your submitted applications."
        if user_role != "admin"
        else "Enterprise administrative overview — live platform analytics from MongoDB."
    )

    return DashboardSummary(
        total_applications=total,
        approved=approved,
        manual_review=manual,
        rejected=rejected,
        pending=pending,
        avg_risk_score=avg_score,
        risk_distribution=risk_dist,
        recent_applications=recent,
        latest_application=latest_application,
        note=note,
    )
