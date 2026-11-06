"""
Batch verification endpoint.
POST /api/batch/verify — submit a batch of onboarding records.
GET  /api/batch/{batch_id} — check batch job status.
"""
import threading
from fastapi import APIRouter, Depends, HTTPException
from app.schemas.schemas import BatchVerifyRequest, BatchStatusResponse
from app.security.auth import require_admin
from app.db.mongodb import batch_jobs_col, utcnow
from app.utils.helpers import new_batch_id, serialize_doc
from app.services.ekyc_service import run_ekyc_workflow
from app.core.config import get_settings

router = APIRouter(prefix="/api/batch", tags=["Batch"])


def _process_batch(batch_id: str, records: list, performed_by: str):
    """Run batch verification in a background thread."""
    col = batch_jobs_col()
    approved = manual = rejected = errors = 0
    processed = 0

    for record in records:
        try:
            result = run_ekyc_workflow(
                applicant=record["applicant"],
                performed_by=performed_by,
            )
            decision = result.get("decision", "MANUAL_REVIEW")
            if decision == "APPROVED":
                approved += 1
            elif decision == "REJECTED":
                rejected += 1
            else:
                manual += 1
        except Exception:
            errors += 1
        processed += 1
        col.update_one(
            {"batch_id": batch_id},
            {"$set": {"processed": processed, "approved": approved,
                      "manual_review": manual, "rejected": rejected, "errors": errors}},
        )

    col.update_one(
        {"batch_id": batch_id},
        {"$set": {"status": "completed", "completed_at": utcnow()}},
    )


@router.post("/verify", response_model=BatchStatusResponse)
def batch_verify(req: BatchVerifyRequest, current_user: dict = Depends(require_admin)):
    settings = get_settings()
    if len(req.records) > settings.max_batch_size:
        raise HTTPException(
            status_code=400,
            detail=f"Batch exceeds maximum of {settings.max_batch_size} records",
        )

    batch_id = new_batch_id()
    now = utcnow()
    job = {
        "batch_id": batch_id,
        "label": req.label,
        "status": "processing",
        "total": len(req.records),
        "processed": 0,
        "approved": 0,
        "manual_review": 0,
        "rejected": 0,
        "errors": 0,
        "created_at": now,
        "completed_at": None,
    }
    batch_jobs_col().insert_one(job)

    records = [r.model_dump() for r in req.records]
    thread = threading.Thread(
        target=_process_batch,
        args=(batch_id, records, current_user.get("email", "api")),
        daemon=True,
    )
    thread.start()

    return BatchStatusResponse(**{k: v for k, v in job.items() if k != "_id"})


@router.get("/{batch_id}", response_model=BatchStatusResponse)
def get_batch_status(batch_id: str, current_user: dict = Depends(require_admin)):
    job = batch_jobs_col().find_one({"batch_id": batch_id})
    if not job:
        raise HTTPException(status_code=404, detail="Batch job not found")
    s = serialize_doc(job)
    return BatchStatusResponse(
        batch_id=s["batch_id"],
        label=s.get("label", ""),
        status=s["status"],
        total=s["total"],
        processed=s["processed"],
        approved=s["approved"],
        manual_review=s["manual_review"],
        rejected=s["rejected"],
        errors=s["errors"],
        created_at=s["created_at"],
        completed_at=s.get("completed_at"),
    )


@router.get("", response_model=list[BatchStatusResponse])
def list_batches(current_user: dict = Depends(require_admin)):
    """List recent batch verification jobs for administrators."""
    cursor = batch_jobs_col().find().sort("created_at", -1).limit(25)
    return [
        BatchStatusResponse(
            batch_id=s["batch_id"],
            label=s.get("label", ""),
            status=s["status"],
            total=s["total"],
            processed=s["processed"],
            approved=s["approved"],
            manual_review=s["manual_review"],
            rejected=s["rejected"],
            errors=s["errors"],
            created_at=s["created_at"],
            completed_at=s.get("completed_at"),
        )
        for s in [serialize_doc(doc) for doc in cursor]
    ]
