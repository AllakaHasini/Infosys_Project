"""
Risk scoring endpoint.
POST /api/risk/score — compute a risk score from provided signals.

In the standalone Risk Score Calculator, the user manually specifies whether
liveness passed or not. We honour that signal directly:
- liveness_unverified is False (the user has explicitly stated the liveness outcome)
- liveness_passed reflects the user's input
- document_available is derived from whether document_confidence < 1.0 or document_suspicious is True
  (the user is exercising the calculator, so if they set suspicious=False and confidence=1.0,
  it means they intend a clean document scenario — keep document_available=True but
  do NOT add low-confidence penalty when confidence >= 0.5)

This ensures the score can reach 0 (LOW risk) when all conditions are satisfied,
and 100 (VERY HIGH risk) when all risk factors are maximally bad.
"""
from fastapi import APIRouter, Depends
from app.schemas.schemas import RiskScoreRequest, RiskScoreResponse
from app.security.auth import get_current_user
from app.ai.risk_engine import RiskSignals, calculate_risk_score

router = APIRouter(prefix="/api/risk", tags=["Risk"])


@router.post("/score", response_model=RiskScoreResponse)
def score_risk(req: RiskScoreRequest, current_user: dict = Depends(get_current_user)):
    # In the standalone Risk Score Calculator the user is manually specifying
    # each signal. liveness_unverified must be False so that the liveness
    # penalty is applied only when liveness_passed=False, never double-counted.
    # In the standalone calculator the user explicitly sets liveness_passed.
    # liveness_unverified must be False so the engine uses liveness_passed correctly.
    signals = RiskSignals(
        identity_verified=req.identity_verified,
        document_suspicious=req.document_suspicious,
        document_confidence=req.document_confidence,
        document_available=True,
        liveness_passed=req.liveness_passed,
        liveness_unverified=False,   # user explicitly controls liveness_passed
        liveness_confidence=req.liveness_confidence,
        duplicate_detected=req.duplicate_detected,
        fields_consistent=req.fields_consistent,
        provider_simulated=req.provider_simulated,
    )
    result = calculate_risk_score(signals)
    result["application_id"] = req.application_id
    return RiskScoreResponse(**result)
