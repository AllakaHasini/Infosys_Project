"""
Authentication endpoints.
POST /api/auth/login             — returns a JWT access token.
POST /api/auth/register          — registers a new normal user or admin.
GET  /api/auth/me                — returns current authenticated user profile.
POST /api/auth/forgot-password   — generates OTP and returns it (prototype: simulated email).
POST /api/auth/verify-otp        — validates OTP, returns a short-lived reset_token.
POST /api/auth/reset-password    — uses reset_token to update the password.
"""
import random
import re
import string
from datetime import timedelta

from fastapi import APIRouter, Depends, HTTPException, status
from app.schemas.schemas import (
    LoginRequest, RegisterRequest, TokenResponse,
    ForgotPasswordRequest, ForgotPasswordResponse,
    VerifyOTPRequest, VerifyOTPResponse,
    ResetPasswordRequest,
)
from app.db.mongodb import users_col, applications_col, password_reset_otps_col, utcnow
from app.security.auth import (
    verify_password, hash_password,
    create_access_token, decode_token, get_current_user,
)
from app.services.audit_service import log_event
from jose import JWTError
from pymongo.errors import DuplicateKeyError

router = APIRouter(prefix="/api/auth", tags=["Authentication"])

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


def _is_phone_or_id_registered(phone: str | None, id_number: str | None) -> bool:
    """
    Check across both users and applications collections to prevent duplicate
    registration of any phone number or identity number (Aadhaar, PAN, etc.).
    """
    norm_phone = _normalize_phone(phone)
    norm_id = _normalize_id(id_number)

    u_col = users_col()
    a_col = applications_col()

    if norm_phone:
        # Check users collection
        if isinstance(u_col.find_one({
            "$or": [
                {"phone": phone},
                {"phone_normalized": norm_phone},
                {"phone": {"$regex": f"{norm_phone}$"}},
            ]
        }), dict):
            return True
        # Check applications collection
        if isinstance(a_col.find_one({
            "$or": [
                {"applicant_phone": phone},
                {"applicant_phone_normalized": norm_phone},
                {"applicant_phone": {"$regex": f"{norm_phone}$"}},
            ],
            "status": {"$ne": "cancelled"},
        }), dict):
            return True

    if norm_id:
        # Check users collection
        if isinstance(u_col.find_one({
            "$or": [
                {"id_number": id_number},
                {"id_number_normalized": norm_id},
            ]
        }), dict):
            return True
        # Check applications collection
        if isinstance(a_col.find_one({
            "$or": [
                {"id_number": id_number},
                {"id_number_normalized": norm_id},
            ],
            "status": {"$ne": "cancelled"},
        }), dict):
            return True

    return False


# ---------------------------------------------------------------------------
# Register
# ---------------------------------------------------------------------------

@router.post("/register", response_model=TokenResponse, status_code=status.HTTP_201_CREATED)
def register(req: RegisterRequest):
    col = users_col()
    clean_email = req.email.strip().lower()

    # Duplicate email check
    if col.find_one({"email": clean_email}):
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=ALREADY_REGISTERED_DETAIL,
        )

    # Phone is no longer collected at registration — it is gathered during eKYC.
    # Only email uniqueness is enforced here; phone/ID uniqueness is enforced in eKYC.
    assigned_role = "user"
    user_doc = {
        "email": clean_email,
        "hashed_password": hash_password(req.password),
        "full_name": req.full_name.strip(),
        "role": assigned_role,
        "created_at": utcnow(),
    }

    try:
        res = col.insert_one(user_doc)
    except DuplicateKeyError:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=ALREADY_REGISTERED_DETAIL,
        )
    user_id = str(res.inserted_id)

    token = create_access_token({
        "sub": clean_email,
        "role": assigned_role,
        "uid": user_id,
    })
    log_event("AUTH_REGISTER", f"User registered: {clean_email} ({assigned_role})", performed_by=clean_email)

    return TokenResponse(
        access_token=token,
        token_type="bearer",
        user_email=clean_email,
        role=assigned_role,
        full_name=user_doc["full_name"],
        user_id=user_id,
    )


# ---------------------------------------------------------------------------
# Login
# ---------------------------------------------------------------------------

@router.post("/login", response_model=TokenResponse)
def login(req: LoginRequest):
    clean_email = req.email.strip().lower()
    user = users_col().find_one({"email": clean_email})
    if not user or not verify_password(req.password, user.get("hashed_password", "")):
        # Generic error — do not reveal which field is wrong
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid credentials",
        )
    role = user.get("role", "user")
    user_id = str(user.get("_id", ""))
    token = create_access_token({
        "sub": user["email"],
        "role": role,
        "uid": user_id,
    })
    log_event("AUTH_LOGIN", f"Login: {user['email']}", performed_by=user["email"])
    return TokenResponse(
        access_token=token,
        token_type="bearer",
        user_email=user["email"],
        role=role,
        full_name=user.get("full_name", user["email"]),
        user_id=user_id,
    )


# ---------------------------------------------------------------------------
# Me
# ---------------------------------------------------------------------------

@router.get("/me")
def get_me(current_user: dict = Depends(get_current_user)):
    return {
        "email": current_user["email"],
        "full_name": current_user.get("full_name", current_user["email"]),
        "role": current_user.get("role", "user"),
        "user_id": str(current_user.get("_id", "")),
    }


# ---------------------------------------------------------------------------
# Forgot Password — Step 1: generate & return OTP (prototype: no real email)
# ---------------------------------------------------------------------------

def _generate_otp(length: int = 6) -> str:
    return "".join(random.choices(string.digits, k=length))


@router.post("/forgot-password", response_model=ForgotPasswordResponse)
def forgot_password(req: ForgotPasswordRequest):
    clean_email = req.email.strip().lower()

    # Always return a success-looking response to prevent user enumeration
    user = users_col().find_one({"email": clean_email})

    if user:
        otp = _generate_otp()
        expires_at = utcnow() + timedelta(minutes=10)

        otps_col = password_reset_otps_col()
        # Invalidate any previous OTPs for this email
        otps_col.delete_many({"email": clean_email})
        otps_col.insert_one({
            "email": clean_email,
            "otp": otp,
            "expires_at": expires_at,
            "used": False,
        })
        log_event(
            "AUTH_FORGOT_PASSWORD",
            f"Password reset OTP generated for {clean_email}",
            performed_by=clean_email,
        )
    else:
        # Still return a plausible OTP hint to avoid user enumeration,
        # but it will never validate since no DB entry was created.
        otp = _generate_otp()

    return ForgotPasswordResponse(
        message=(
            "If that email is registered, an OTP has been sent. "
            "Since this is a prototype system (no real email server), "
            "the OTP is returned directly below."
        ),
        otp_hint=otp,
    )


# ---------------------------------------------------------------------------
# Verify OTP — Step 2: validate OTP, return short-lived reset_token
# ---------------------------------------------------------------------------

@router.post("/verify-otp", response_model=VerifyOTPResponse)
def verify_otp(req: VerifyOTPRequest):
    clean_email = req.email.strip().lower()
    otps_col = password_reset_otps_col()

    record = otps_col.find_one({
        "email": clean_email,
        "used": False,
    })

    now = utcnow()

    if not record:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid or expired OTP. Please request a new code.",
        )

    if record.get("expires_at") and record["expires_at"] < now:
        otps_col.delete_one({"_id": record["_id"]})
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="OTP has expired. Please request a new password reset.",
        )

    if record.get("otp") != req.otp.strip():
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Incorrect OTP. Please check the 6-digit code and try again.",
        )

    # Mark OTP as used
    otps_col.update_one({"_id": record["_id"]}, {"$set": {"used": True}})

    # Issue a short-lived (15 min) reset token
    reset_token = create_access_token(
        {"sub": clean_email, "purpose": "password_reset"},
        expires_delta=timedelta(minutes=15),
    )
    return VerifyOTPResponse(valid=True, reset_token=reset_token, message="OTP verified successfully.")


# ---------------------------------------------------------------------------
# Reset Password — Step 3: use reset_token to set a new password
# ---------------------------------------------------------------------------

@router.post("/reset-password")
def reset_password(req: ResetPasswordRequest):
    try:
        payload = decode_token(req.reset_token)
    except JWTError:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid or expired reset token.",
        )

    if payload.get("purpose") != "password_reset":
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid token purpose.",
        )

    clean_email = payload.get("sub", "").strip().lower()
    if not clean_email:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Malformed reset token.",
        )

    col = users_col()
    user = col.find_one({"email": clean_email})
    if not user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Account not found.",
        )

    new_hashed = hash_password(req.new_password)
    col.update_one({"email": clean_email}, {"$set": {"hashed_password": new_hashed}})
    log_event(
        "AUTH_RESET_PASSWORD",
        f"Password reset successfully for {clean_email}",
        performed_by=clean_email,
    )
    return {"ok": True, "message": "Password has been reset successfully. Please log in with your new password."}
