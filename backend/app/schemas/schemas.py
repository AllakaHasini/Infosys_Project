"""
Pydantic schemas — requests and responses for the eKYC API.
"""
from __future__ import annotations
from datetime import datetime
from typing import Any, Optional
from pydantic import BaseModel, EmailStr, Field


# ── Helpers ──────────────────────────────────────────────────────────────────

class OKResponse(BaseModel):
    ok: bool = True
    message: str = "Success"


# ── Auth ─────────────────────────────────────────────────────────────────────

class RegisterRequest(BaseModel):
    email: str = Field(min_length=3, max_length=120)
    password: str = Field(min_length=6, max_length=100)
    full_name: str = Field(min_length=2, max_length=120)
    role: Optional[str] = Field(default="user", pattern="^(user|admin)$")
    # Phone is no longer collected at registration — it is gathered during eKYC verification.


class LoginRequest(BaseModel):
    email: str = Field(min_length=3, max_length=120)
    password: str = Field(min_length=6)


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user_email: str
    role: str
    full_name: Optional[str] = None
    user_id: Optional[str] = None


# ── Forgot Password / OTP / Reset ─────────────────────────────────────────────

class ForgotPasswordRequest(BaseModel):
    email: str = Field(min_length=3, max_length=120)


class ForgotPasswordResponse(BaseModel):
    message: str
    otp_hint: str  # Prototype: return OTP in response (simulated email)


class VerifyOTPRequest(BaseModel):
    email: str = Field(min_length=3, max_length=120)
    otp: str = Field(min_length=6, max_length=6)


class VerifyOTPResponse(BaseModel):
    valid: bool
    reset_token: Optional[str] = None
    message: str


class ResetPasswordRequest(BaseModel):
    reset_token: str
    new_password: str = Field(min_length=6, max_length=100)


# ── eKYC Verify ──────────────────────────────────────────────────────────────

class ApplicantInfo(BaseModel):
    full_name: str = Field(min_length=2, max_length=120)
    date_of_birth: str  # YYYY-MM-DD
    gender: str = Field(pattern="^(male|female|other)$")
    nationality: str = Field(min_length=2, max_length=60)
    id_type: str = Field(pattern="^(passport|national_id|driving_license|voter_id|aadhaar|pan)$")
    id_number: str = Field(min_length=3, max_length=50)
    email: Optional[str] = Field(default=None, max_length=120)
    phone: str = Field(min_length=7, max_length=20)
    address: Optional[str] = None


class EKYCVerifyRequest(BaseModel):
    applicant: ApplicantInfo
    mosip_token: Optional[str] = None        # real MOSIP token when available
    esignet_token: Optional[str] = None      # real eSignet token when available
    liveness_token: Optional[str] = None     # from a real liveness provider
    document_base64: Optional[str] = None    # uploaded document file base64
    document_front_base64: Optional[str] = None # alias for front document
    document_back_base64: Optional[str] = None # back-side of document (for Aadhaar)
    document_filename: Optional[str] = None
    live_capture_base64: Optional[str] = None # captured live camera frame base64
    live_challenge: Optional[str] = None # "turn_left" | "turn_right" | "blink"
    live_challenge_frames: Optional[list[str]] = None # sequence of captured frames for challenge verification


class EKYCVerifyResponse(BaseModel):
    application_id: str
    status: str
    decision: str
    risk_score: float
    risk_category: str
    risk_reasons: list[str]
    identity_result: dict
    document_result: Optional[dict] = None
    liveness_result: dict
    cross_reference: Optional[dict] = None
    created_at: datetime
    simulated: bool
    masked_id_number: Optional[str] = None
    created_by: Optional[str] = None


# ── Document ─────────────────────────────────────────────────────────────────

class DocumentAnalysisResponse(BaseModel):
    application_id: Optional[str] = None
    document_type: str
    suspicious: bool
    suspicious_detected: Optional[bool] = None
    risk_score: float = 0.0
    quality_score: Optional[float] = None
    risk_category: str = "LOW"
    confidence: float = 1.0
    flags: list[str] = []
    reasons: list[str] = []
    quality_metrics: dict = {}
    measured_metrics: Optional[dict] = None
    extracted_fields: dict = {}
    file_hash: Optional[str] = None
    duplicate_detected: Optional[bool] = None
    note: str
    limitations: str = "Heuristic visual analysis prototype. Not forensic authentication."
    analysis_limitations: Optional[str] = None
    simulated: bool = False


# ── Liveness ─────────────────────────────────────────────────────────────────

class LivenessCheckRequest(BaseModel):
    image_base64: Optional[str] = None
    challenge: Optional[str] = None  # "turn_left" | "turn_right" | "blink"
    frames: Optional[list[str]] = None  # sequence of base64 frames for challenge-response
    mirrored: Optional[bool] = True      # Front camera preview is mirrored from user perspective
    application_id: Optional[str] = None
    liveness_token: Optional[str] = None


class LivenessCheckResponse(BaseModel):
    application_id: Optional[str] = None
    provider: Optional[str] = "MOCK_LIVENESS"
    face_detected: bool = False
    face_count: int = 0
    liveness_status: str = "UNVERIFIED_PROTOTYPE"  # UNVERIFIED_PROTOTYPE | PASSED_PROTOTYPE_CHALLENGE | FAILED_CHALLENGE | NO_FACE_DETECTED
    liveness_score: float = 0.0  # Separate from face detection: 0 to 100 (prototype capped)
    prototype_mode: bool = True
    diagnostic_details: dict = {}
    live: bool = False
    confidence: float = 0.5
    method: str = "simulated"
    quality_score: float = 1.0
    details: Optional[dict] = None
    flags: list[str] = []
    note: str = ""
    simulated: bool = True


# ── Risk ─────────────────────────────────────────────────────────────────────

class RiskScoreRequest(BaseModel):
    application_id: Optional[str] = None
    identity_verified: bool = False
    document_suspicious: bool = False
    document_confidence: float = 1.0
    liveness_passed: bool = False
    liveness_confidence: float = 1.0
    duplicate_detected: bool = False
    fields_consistent: bool = True
    provider_simulated: bool = True


class RiskScoreResponse(BaseModel):
    application_id: Optional[str] = None
    score: float
    category: str
    decision: str
    reasons: list[str]
    weights_used: dict
    model_note: str


# ── Applications ─────────────────────────────────────────────────────────────

class ApplicationSummary(BaseModel):
    application_id: str
    applicant_name: str
    status: str
    decision: str
    risk_score: Optional[float] = None
    risk_category: Optional[str] = None
    created_at: datetime
    updated_at: Optional[datetime] = None
    created_by: Optional[str] = None
    masked_id_number: Optional[str] = None


class ApplicationDetail(ApplicationSummary):
    applicant_email: Optional[str] = None
    applicant_phone: Optional[str] = None
    id_type: Optional[str] = None
    identity_result: Optional[dict] = None
    document_result: Optional[dict] = None
    liveness_result: Optional[dict] = None
    cross_reference: Optional[dict] = None
    risk_assessment: Optional[dict] = None
    simulated: bool = True
    review_notes: Optional[str] = None


class DecisionUpdateRequest(BaseModel):
    decision: str = Field(pattern="^(APPROVED|MANUAL_REVIEW|REJECTED)$")
    notes: Optional[str] = None


class ApplicationListResponse(BaseModel):
    items: list[ApplicationSummary]
    total: int
    page: int
    page_size: int


# ── Dashboard ─────────────────────────────────────────────────────────────────

class DashboardSummary(BaseModel):
    total_applications: int
    approved: int
    manual_review: int
    rejected: int
    pending: int
    avg_risk_score: float
    risk_distribution: dict[str, int]
    recent_applications: list[ApplicationSummary]
    note: str
    latest_application: Optional[dict] = None


# ── Audit Logs ───────────────────────────────────────────────────────────────

class AuditLogEntry(BaseModel):
    id: str
    event_type: str
    application_id: Optional[str] = None
    performed_by: Optional[str] = None
    description: str
    timestamp: datetime
    metadata: Optional[dict] = None


class AuditLogListResponse(BaseModel):
    items: list[AuditLogEntry]
    total: int
    page: int
    page_size: int


# ── Batch ────────────────────────────────────────────────────────────────────

class BatchRecord(BaseModel):
    applicant: ApplicantInfo


class BatchVerifyRequest(BaseModel):
    records: list[BatchRecord] = Field(min_length=1)
    label: Optional[str] = "batch-job"


class BatchStatusResponse(BaseModel):
    batch_id: str
    label: str
    status: str
    total: int
    processed: int
    approved: int
    manual_review: int
    rejected: int
    errors: int
    created_at: datetime
    completed_at: Optional[datetime] = None


# ── Settings ─────────────────────────────────────────────────────────────────

class SystemSettingsResponse(BaseModel):
    risk_low_threshold: int
    risk_medium_threshold: int
    risk_high_threshold: int
    max_batch_size: int
    mosip_mode: str      # "mock" or "real"
    esignet_mode: str    # "mock" or "real"
    liveness_mode: str   # "mock" or "real"


class SystemSettingsUpdate(BaseModel):
    risk_low_threshold: Optional[int] = Field(None, ge=0, le=100)
    risk_medium_threshold: Optional[int] = Field(None, ge=0, le=100)
    risk_high_threshold: Optional[int] = Field(None, ge=0, le=100)
    mosip_mode: Optional[str] = Field(None, pattern="^(mock|real)$")
    esignet_mode: Optional[str] = Field(None, pattern="^(mock|real)$")
    liveness_mode: Optional[str] = Field(None, pattern="^(mock|real)$")
