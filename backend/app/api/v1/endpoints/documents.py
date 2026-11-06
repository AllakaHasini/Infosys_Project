"""
Document analysis endpoint.
POST /api/documents/analyze — analyze an uploaded identity document.
"""
import io
from fastapi import APIRouter, Depends, File, Form, UploadFile, HTTPException, status
from app.schemas.schemas import DocumentAnalysisResponse
from app.security.auth import get_current_user
from app.services.document_service import analyze_document
from app.core.config import get_settings

router = APIRouter(prefix="/api/documents", tags=["Documents"])

ALLOWED_CONTENT_TYPES = {
    "image/jpeg", "image/png", "image/jpg", "application/pdf"
}


import json

@router.post("/analyze", response_model=DocumentAnalysisResponse)
async def analyze_doc(
    file: UploadFile = File(...),
    document_type: str = Form(default="unknown"),
    application_id: str = Form(default=None),
    applicant_name: str = Form(default=None),
    applicant_json: str = Form(default=None),
    current_user: dict = Depends(get_current_user),
):
    settings = get_settings()
    max_bytes = settings.max_upload_size_mb * 1024 * 1024

    if file.content_type not in ALLOWED_CONTENT_TYPES:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Unsupported file type: {file.content_type}",
        )

    file_bytes = await file.read()
    if len(file_bytes) > max_bytes:
        raise HTTPException(
            status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
            detail=f"File exceeds maximum allowed size of {settings.max_upload_size_mb} MB",
        )

    applicant = None
    if applicant_json:
        try:
            applicant = json.loads(applicant_json)
        except Exception:
            pass
    elif applicant_name:
        applicant = {"full_name": applicant_name}

    result = analyze_document(
        file_bytes=file_bytes,
        filename=file.filename or "upload",
        applicant=applicant,
        document_type=document_type,
    )
    result["application_id"] = application_id
    return DocumentAnalysisResponse(**result)
