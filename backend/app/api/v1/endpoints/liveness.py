"""
Liveness check endpoint.
POST /api/liveness/check — execute the configured liveness provider.
Supports both multipart/form-data and JSON base64 webcam frames.
"""
import base64
from typing import Optional
from fastapi import APIRouter, Depends, Request, HTTPException
from app.schemas.schemas import LivenessCheckResponse
from app.security.auth import get_current_user
from app.services.liveness_service import get_liveness_provider
from app.core.config import get_settings

router = APIRouter(prefix="/api/liveness", tags=["Liveness"])


@router.post("/check", response_model=LivenessCheckResponse)
async def liveness_check(
    request: Request,
    current_user: dict = Depends(get_current_user),
):
    settings = get_settings()
    max_bytes = settings.max_upload_size_mb * 1024 * 1024
    image_bytes = None
    liveness_token = None
    application_id = None

    content_type = request.headers.get("content-type", "")
    challenge = None
    frames_bytes = None

    mirrored = True
    if "application/json" in content_type:
        try:
            body = await request.json()
        except Exception:
            body = {}
        application_id = body.get("application_id")
        liveness_token = body.get("liveness_token")
        challenge = body.get("challenge")
        mirrored = body.get("mirrored", True)
        frames = body.get("frames")

        if frames and isinstance(frames, list):
            frames_bytes = []
            for f in frames:
                if isinstance(f, str):
                    if "," in f:
                        f = f.split(",", 1)[1]
                    try:
                        frames_bytes.append(base64.b64decode(f))
                    except Exception:
                        pass

        img_b64 = body.get("image_base64") or body.get("image")
        if img_b64 and isinstance(img_b64, str):
            if "," in img_b64:
                img_b64 = img_b64.split(",", 1)[1]
            try:
                image_bytes = base64.b64decode(img_b64)
            except Exception:
                raise HTTPException(status_code=400, detail="Invalid base64 image data")
    elif "multipart/form-data" in content_type:
        form = await request.form()
        application_id = form.get("application_id")
        liveness_token = form.get("liveness_token")
        challenge = form.get("challenge")
        mirrored = form.get("mirrored", "true").lower() in ("true", "1")
        file_obj = form.get("image")
        if file_obj and hasattr(file_obj, "read"):
            image_bytes = await file_obj.read()

    if image_bytes and len(image_bytes) > max_bytes:
        raise HTTPException(status_code=413, detail="Image exceeds allowed size limit")

    provider = get_liveness_provider()
    result = provider.check(
        image_bytes=image_bytes,
        token=liveness_token,
        challenge=challenge,
        frames_bytes=frames_bytes,
        mirrored=mirrored,
    )
    result["application_id"] = application_id
    return LivenessCheckResponse(**result)
