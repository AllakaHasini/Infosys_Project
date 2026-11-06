"""
AI Risk Scoring Engine (Module 5) and Decision Engine (Module 6).

Implements an explainable, configurable, weighted risk scoring model.

SCORE INTERPRETATION:
- 0–100 represents RISK level, NOT a quality or confidence percentage.
- LOW score (0–30) = LOW RISK → APPROVED. This is the BEST outcome.
- HIGH score (70–100) = HIGH RISK → REJECTED.
- Think of it as a "fraud risk meter": higher = more risky.

IMPORTANT:
- This is a PROTOTYPE model intended to demonstrate the concept of risk scoring.
- It is NOT a validated fraud detection system.
- Weights, thresholds, and signal definitions are illustrative only.
- Missing information is NOT treated as proof of fraud.
- Protected characteristics (race, religion, gender, etc.) are NEVER used.
- All contributing factors are recorded in the decision output.
"""
import logging
from dataclasses import dataclass, field
from app.core.config import get_settings

logger = logging.getLogger(__name__)

MODEL_VERSION = "prototype-v1.1"


@dataclass
class RiskSignals:
    """Input signals for the risk scoring engine."""
    identity_verified: bool = False
    document_suspicious: bool = False
    document_confidence: float = 1.0
    document_available: bool = False
    liveness_passed: bool = False
    liveness_unverified: bool = False  # True ONLY when no image/capture was provided at all
    liveness_confidence: float = 1.0
    duplicate_detected: bool = False
    fields_consistent: bool = True
    provider_simulated: bool = True
    extra_flags: list[str] = field(default_factory=list)


# Default weights — each maps to a maximum risk-point contribution
DEFAULT_WEIGHTS = {
    "identity_not_verified": 35,
    "document_suspicious": 25,
    "liveness_failed": 20,
    "liveness_no_capture": 15,   # lighter penalty when no image was provided at all
    "duplicate_detected": 30,
    "fields_inconsistent": 20,
    "low_document_confidence": 10,
    "low_liveness_confidence": 10,
}


def calculate_risk_score(signals: RiskSignals) -> dict:
    """
    Compute a risk score from 0 (lowest risk) to 100 (highest risk).

    SCORE MEANING:
    - LOW score = LOW RISK = APPROVED (best result for applicant)
    - HIGH score = HIGH RISK = REJECTED
    - Score 0 means every verification passed perfectly.

    Returns:
        dict with score, category, decision, reasons, weights_used, model_note
    """
    settings = get_settings()
    points = 0.0
    reasons = []
    weights = DEFAULT_WEIGHTS.copy()

    # --- Identity verification ---
    if not signals.identity_verified:
        contrib = weights["identity_not_verified"]
        points += contrib
        reasons.append(f"Identity not verified by provider (+{contrib} pts risk)")

    # --- Document analysis ---
    if signals.document_available:
        if signals.document_suspicious:
            contrib = weights["document_suspicious"]
            points += contrib
            reasons.append(f"Document flagged as potentially suspicious (+{contrib} pts risk)")
        if signals.document_confidence < 0.5:
            contrib = weights["low_document_confidence"]
            points += contrib
            reasons.append(f"Low document analysis confidence ({signals.document_confidence:.0%}) (+{contrib} pts risk)")
    else:
        reasons.append("No document provided — document check skipped (no risk added)")

    # --- Liveness ---
    if signals.liveness_unverified:
        # No image was provided at all — lighter penalty
        contrib = weights["liveness_no_capture"]
        points += contrib
        reasons.append(f"No live selfie provided — liveness unchecked (+{contrib} pts risk)")
    elif not signals.liveness_passed:
        # Image was captured but challenge failed or face not detected
        contrib = weights["liveness_failed"]
        points += contrib
        reasons.append(f"Liveness challenge not passed (+{contrib} pts risk)")
    elif signals.liveness_confidence < 0.5:
        # Liveness passed but with low confidence
        contrib = weights["low_liveness_confidence"]
        points += contrib
        reasons.append(f"Low liveness confidence ({signals.liveness_confidence:.0%}) (+{contrib} pts risk)")
    else:
        reasons.append("Liveness check passed ✓ (no risk added)")

    # --- Duplicate detection ---
    if signals.duplicate_detected:
        contrib = weights["duplicate_detected"]
        points += contrib
        reasons.append(f"Potential duplicate application detected (+{contrib} pts risk)")

    # --- Field consistency ---
    if not signals.fields_consistent:
        contrib = weights["fields_inconsistent"]
        points += contrib
        reasons.append(f"Submitted fields appear inconsistent (+{contrib} pts risk)")

    # --- Simulation notice (informational only, no extra points) ---
    if signals.provider_simulated:
        reasons.append(
            "ℹ️ Note: Providers are in sandbox/simulation mode. "
            "Results are not real government verifications."
        )

    # Normalise to 0–100 using only the weights that apply
    max_possible = sum(weights.values())
    score = min(100.0, (points / max_possible) * 100)

    # --- Category and decision ---
    low_t = settings.risk_low_threshold
    med_t = settings.risk_medium_threshold
    high_t = settings.risk_high_threshold

    if score <= low_t:
        category = "LOW"
        decision = "APPROVED"
    elif score <= med_t:
        category = "MEDIUM"
        decision = "MANUAL_REVIEW"
    elif score <= high_t:
        category = "HIGH"
        decision = "MANUAL_REVIEW"
    else:
        category = "VERY_HIGH"
        decision = "REJECTED"

    # Simulated checks escalate to MANUAL_REVIEW only when score is meaningfully above zero.
    # A score of exactly 0 means every signal was verified — do not escalate.
    if signals.provider_simulated and decision == "APPROVED" and score > 0 and score > low_t * 0.8:
        decision = "MANUAL_REVIEW"
        reasons.append("Decision escalated to MANUAL_REVIEW because providers are in sandbox mode")

    return {
        "score": round(score, 2),
        "category": category,
        "decision": decision,
        "reasons": reasons,
        "weights_used": weights,
        "score_interpretation": (
            f"Risk score {score:.1f}/100 — "
            + ("LOW RISK: Applicant meets verification criteria. ✓ APPROVED" if score <= low_t else
               f"{'MEDIUM' if score <= med_t else 'HIGH'} RISK: Further review required.")
        ),
        "model_note": (
            f"Model: {MODEL_VERSION}. "
            "Risk score 0=lowest risk, 100=highest risk. "
            "LOW score = LOW risk = good outcome for applicant. "
            "This is a weighted heuristic prototype, not a validated fraud detection system. "
            "Scores and decisions must be reviewed by qualified personnel before taking action."
        ),
    }


def detect_duplicate(applicant: dict, col, current_user_email: str = None) -> bool:
    """
    Check for existing applications with the same ID number.
    Returns True if a potential duplicate is found from a DIFFERENT user.
    Excludes the current user's own applications to avoid false-positive risk inflation.
    """
    try:
        id_number = applicant.get("id_number")
        if not id_number:
            return False
        query = {
            "id_number": id_number,
            "status": {"$ne": "cancelled"},
        }
        if current_user_email:
            query["created_by"] = {"$ne": current_user_email}
        existing = col.find_one(query)
        return existing is not None
    except Exception:
        return False
