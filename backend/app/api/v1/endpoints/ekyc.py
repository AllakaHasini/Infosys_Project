"""
eKYC verification endpoint.
POST /api/ekyc/verify — runs the complete eKYC workflow with document and liveness analysis.
"""
import base64
from fastapi import APIRouter, Depends, HTTPException, status
from app.schemas.schemas import EKYCVerifyRequest, EKYCVerifyResponse
from app.security.auth import get_current_user
from app.services.ekyc_service import run_ekyc_workflow

router = APIRouter(prefix="/api/ekyc", tags=["eKYC"])


@router.post("/verify", response_model=EKYCVerifyResponse)
def verify_ekyc(req: EKYCVerifyRequest, current_user: dict = Depends(get_current_user)):
    user_email = str(current_user.get("email") or "api")

    # Decode front document if base64 provided
    doc_bytes = None
    raw_front = req.document_base64 or req.document_front_base64
    if raw_front:
        if "," in raw_front:
            raw_front = raw_front.split(",", 1)[1]
        try:
            doc_bytes = base64.b64decode(raw_front)
        except Exception:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid document_base64 encoding")

    # Decode back document if base64 provided (e.g. for Aadhaar back side)
    back_bytes = None
    if req.document_back_base64:
        raw_back = req.document_back_base64
        if "," in raw_back:
            raw_back = raw_back.split(",", 1)[1]
        try:
            back_bytes = base64.b64decode(raw_back)
        except Exception:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid document_back_base64 encoding")

    # Decode live camera frame if base64 provided
    live_bytes = None
    if req.live_capture_base64:
        raw_live_b64 = req.live_capture_base64
        if "," in raw_live_b64:
            raw_live_b64 = raw_live_b64.split(",", 1)[1]
        try:
            live_bytes = base64.b64decode(raw_live_b64)
        except Exception:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid live_capture_base64 encoding")

    # Decode challenge frames if provided
    challenge_frames_bytes = None
    if req.live_challenge_frames and isinstance(req.live_challenge_frames, list):
        challenge_frames_bytes = []
        for cf in req.live_challenge_frames:
            if isinstance(cf, str):
                if "," in cf:
                    cf = cf.split(",", 1)[1]
                try:
                    challenge_frames_bytes.append(base64.b64decode(cf))
                except Exception:
                    pass

    result = run_ekyc_workflow(
        applicant=req.applicant.model_dump(),
        mosip_token=req.mosip_token,
        esignet_token=req.esignet_token,
        liveness_token=req.liveness_token,
        document_bytes=doc_bytes,
        document_filename=req.document_filename or "front_document.png",
        document_back_bytes=back_bytes,
        document_back_filename="back_document.png" if back_bytes else None,
        live_capture_bytes=live_bytes,
        live_challenge=req.live_challenge,
        live_challenge_frames_bytes=challenge_frames_bytes,
        performed_by=user_email,
        created_by=user_email,
        current_user_email=user_email,
    )
    return EKYCVerifyResponse(**result)
