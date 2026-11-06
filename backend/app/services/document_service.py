"""
Document Fraud Detection Service (Module 2).

Performs image preprocessing, quality evaluation, heuristic tamper checks,
SHA-256 duplicate detection, and optional OCR on uploaded identity documents.

IMPORTANT LIMITATIONS:
- These are measurable heuristic and quality checks, not forensic authentication.
- A passing result does NOT definitively prove the document is genuine.
- A flagged result indicates visual anomalies for human review, NOT confirmed fraud.
- Protected characteristics and sensitive attributes are never used.
- Full Aadhaar numbers are masked in all previews, responses, and logs.
"""
from __future__ import annotations
import io
import re
import hashlib
import logging
from typing import Optional

import numpy as np

from app.db.mongodb import applications_col
from app.utils.helpers import mask_id_number

logger = logging.getLogger(__name__)

# Optional heavy dependencies with graceful fallback
try:
    from PIL import Image, ImageStat, ImageEnhance
    PIL_AVAILABLE = True
except ImportError:
    PIL_AVAILABLE = False
    logger.warning("Pillow not available — document image checks disabled.")

try:
    import cv2
    CV2_AVAILABLE = True
except ImportError:
    CV2_AVAILABLE = False
    logger.warning("OpenCV not available — some document checks disabled.")

try:
    import pytesseract
    OCR_AVAILABLE = True
except ImportError:
    OCR_AVAILABLE = False
    logger.info("pytesseract not available — OCR extraction disabled.")


def compute_file_hash(file_bytes: bytes) -> str:
    """Generate SHA-256 cryptographic hash of document bytes."""
    return hashlib.sha256(file_bytes).hexdigest()


def mask_aadhaar_in_text(text: str) -> str:
    """Mask any 12-digit Aadhaar patterns in extracted OCR text."""
    if not text:
        return ""
    # Matches 12 digits with or without spaces/dashes (e.g., 1234 5678 9012 or 1234-5678-9012)
    def repl(m):
        raw = re.sub(r"[\s-]", "", m.group(0))
        return f"XXXX-XXXX-{raw[-4:]}"

    pattern = r"\b\d{4}[\s-]?\d{4}[\s-]?\d{4}\b"
    return re.sub(pattern, repl, text)


def perform_ela_check(img: Image.Image) -> float:
    """
    Error Level Analysis (ELA) heuristic proxy.
    Saves image at 90% JPEG quality, computes difference from original,
    and returns the relative mean anomaly variance.
    """
    try:
        buf = io.BytesIO()
        rgb_img = img.convert("RGB")
        rgb_img.save(buf, "JPEG", quality=90)
        buf.seek(0)
        recompressed = Image.open(buf)

        diff = np.abs(np.array(rgb_img, dtype=np.float32) - np.array(recompressed, dtype=np.float32))
        return float(np.mean(diff))
    except Exception as exc:
        logger.debug("ELA check error: %s", exc)
        return 0.0


def analyze_document(
    file_bytes: bytes,
    filename: str,
    applicant: Optional[dict] = None,
    document_type: str = "unknown",
    check_duplicates: bool = True,
) -> dict:
    """
    Analyze an uploaded document file and return an explainable, structured result.

    Args:
        file_bytes: Raw bytes of the uploaded file.
        filename: Original filename (used for extension detection).
        applicant: Optional dict of applicant fields for cross-matching.
        document_type: Selected document type (passport, national_id, aadhaar, etc.).
        check_duplicates: Whether to verify SHA-256 hash against MongoDB.

    Returns:
        Dict with risk_score, risk_category, suspicious, confidence, flags, reasons,
        quality_metrics, extracted_fields, file_hash, note, limitations.
    """
    flags: list[str] = []
    reasons: list[str] = []
    extracted_fields: dict = {}
    quality_metrics: dict = {}
    raw_risk_points = 0.0

    # 1. File Type and Size Validation
    allowed_ext = {".jpg", ".jpeg", ".png", ".pdf"}
    ext = "." + filename.rsplit(".", 1)[-1].lower() if "." in filename else ""
    if ext not in allowed_ext:
        return _error_result(document_type, f"Unsupported file type '{ext}'. Allowed: JPG, PNG, PDF.")

    file_size_kb = round(len(file_bytes) / 1024, 2)
    quality_metrics["file_size_kb"] = file_size_kb

    if len(file_bytes) > 10 * 1024 * 1024:
        flags.append("FILE_TOO_LARGE")
        reasons.append(f"File size ({file_size_kb} KB) exceeds maximum allowed 10 MB limit.")
        raw_risk_points += 20

    if len(file_bytes) < 1024:
        flags.append("FILE_CORRUPTED_OR_EMPTY")
        reasons.append("File is under 1 KB and appears corrupted or empty.")
        raw_risk_points += 45

    # 2. Cryptographic SHA-256 Hash & Duplicate Detection
    file_hash = compute_file_hash(file_bytes)
    quality_metrics["sha256_hash"] = file_hash

    if check_duplicates:
        try:
            col = applications_col()
            existing_match = col.find_one({"doc_hash": file_hash})
            if existing_match:
                flags.append("DUPLICATE_DOCUMENT_UPLOAD")
                prev_id = existing_match.get("application_id", "prior record")
                reasons.append(f"Identical document file hash was previously submitted for {prev_id}.")
                raw_risk_points += 35
        except Exception as exc:
            logger.debug("Duplicate check skipped due to DB lookup error: %s", exc)

    # 3. PDF Format Handling
    if ext == ".pdf":
        extracted_fields["format"] = "PDF"
        is_valid_pdf = file_bytes.startswith(b"%PDF-")
        if not is_valid_pdf:
            flags.append("INVALID_PDF_HEADER")
            reasons.append("File does not contain a valid %PDF- magic header.")
            raw_risk_points += 40

        score = min(100.0, raw_risk_points)
        cat = _classify_score(score)
        return {
            "document_type": document_type,
            "suspicious": score >= 40.0,
            "risk_score": round(score, 1),
            "risk_category": cat,
            "confidence": 0.85 if score < 40 else 0.50,
            "flags": flags,
            "reasons": reasons if reasons else ["PDF structure verified. File hash recorded."],
            "quality_metrics": quality_metrics,
            "extracted_fields": extracted_fields,
            "file_hash": file_hash,
            "note": "PDF document analyzed for format validity and cryptographic uniqueness.",
            "limitations": "Direct pixel-level image heuristics are not applied to PDF containers.",
            "simulated": False,
        }

    # 4. Image Preprocessing & Dimensional Analysis
    if not PIL_AVAILABLE:
        return _error_result(document_type, "Pillow library is not installed on the server.")

    try:
        img = Image.open(io.BytesIO(file_bytes))
        img.verify()
        # Re-open after verify() because verify can close image stream
        img = Image.open(io.BytesIO(file_bytes))
    except Exception as exc:
        return _error_result(document_type, f"Cannot parse image: {exc}")

    w, h = img.size
    quality_metrics["width"] = w
    quality_metrics["height"] = h
    quality_metrics["mode"] = img.mode
    aspect_ratio = round(w / max(h, 1), 2)
    quality_metrics["aspect_ratio"] = aspect_ratio

    # Dimension heuristics
    if w < 250 or h < 150:
        flags.append("LOW_RESOLUTION")
        reasons.append(f"Image resolution ({w}x{h}) is too low for reliable OCR and security pattern verification.")
        raw_risk_points += 25
    elif w > 8500 or h > 8500:
        flags.append("ABNORMALLY_LARGE_IMAGE")
        reasons.append(f"Image dimensions ({w}x{h}) are unusually large.")
        raw_risk_points += 10

    # Aspect ratio check for ID cards (Aadhaar / Driving License / National ID typically 1.3 to 1.8)
    if document_type in ("national_id", "aadhaar", "driving_license"):
        if aspect_ratio < 0.4 or aspect_ratio > 3.0:
            flags.append("IRREGULAR_ASPECT_RATIO")
            reasons.append(f"Aspect ratio ({aspect_ratio}) does not match standard ID card format.")
            raw_risk_points += 15

    # 5. Statistical Visual Quality Checks (Brightness, Contrast)
    try:
        rgb_img = img.convert("RGB")
        stat = ImageStat.Stat(rgb_img)
        mean_brightness = sum(stat.mean) / 3.0
        contrast_stddev = sum(stat.stddev) / 3.0
        quality_metrics["mean_brightness"] = round(mean_brightness, 1)
        quality_metrics["contrast_stddev"] = round(contrast_stddev, 1)

        if mean_brightness < 30:
            flags.append("IMAGE_TOO_DARK")
            reasons.append(f"Mean brightness ({mean_brightness:.1f}/255) is severely underexposed.")
            raw_risk_points += 20
        elif mean_brightness > 235:
            flags.append("IMAGE_TOO_BRIGHT")
            reasons.append(f"Mean brightness ({mean_brightness:.1f}/255) is washed out or overexposed.")
            raw_risk_points += 20

        if contrast_stddev < 18:
            flags.append("LOW_CONTRAST_OR_BLANK")
            reasons.append("Image exhibits flat contrast; text or security features may be unreadable.")
            raw_risk_points += 25
    except Exception as exc:
        logger.debug("Visual stat check error: %s", exc)

    # 6. OpenCV Measurable Quality Checks (Sharpness, Edges, ELA)
    if CV2_AVAILABLE:
        try:
            img_np = np.array(rgb_img)
            gray = cv2.cvtColor(img_np, cv2.COLOR_RGB2GRAY)

            # Sharpness via Laplacian variance
            lap_var = float(cv2.Laplacian(gray, cv2.CV_64F).var())
            quality_metrics["sharpness_score"] = round(lap_var, 2)

            if lap_var < 35.0:
                flags.append("BLURRY_IMAGE")
                reasons.append(f"Sharpness index ({lap_var:.1f}) indicates blur; fine security patterns are obscured.")
                raw_risk_points += 25
            elif lap_var < 75.0:
                flags.append("MILD_BLUR")
                reasons.append(f"Sharpness index ({lap_var:.1f}) is below optimal clarity threshold (75.0).")
                raw_risk_points += 10
            elif lap_var > 1800.0:
                flags.append("HIGH_FREQUENCY_NOISE")
                reasons.append("Unusually high noise variance detected; may indicate digital sharpening or compression artifacts.")
                raw_risk_points += 10

            # Edge density via Canny
            edges = cv2.Canny(gray, 100, 200)
            edge_density = float(np.count_nonzero(edges)) / float(w * h)
            quality_metrics["edge_density"] = round(edge_density, 4)

            if edge_density < 0.012:
                flags.append("LOW_EDGE_CONTENT")
                reasons.append("Very low edge details detected; possible placeholder, blank scan, or blank background.")
                raw_risk_points += 20
            elif edge_density > 0.24:
                flags.append("HIGH_EDGE_DENSITY_COMPOSITE")
                reasons.append("High edge density suggests composite editing or severe compression noise.")
                raw_risk_points += 15

            # ELA compression anomaly
            ela_score = perform_ela_check(img)
            quality_metrics["ela_anomaly_score"] = round(ela_score, 2)
            if ela_score > 12.0:
                flags.append("COMPRESSION_INCONSISTENCY")
                reasons.append("Error level analysis indicates inconsistent compression levels across image regions.")
                raw_risk_points += 15

        except Exception as exc:
            logger.debug("OpenCV checks error: %s", exc)

    # 7. OCR Text Extraction & Cross-Verification (Interface)
    if OCR_AVAILABLE:
        try:
            ocr_text = pytesseract.image_to_string(rgb_img)
            sanitized_preview = mask_aadhaar_in_text(ocr_text[:300])
            extracted_fields["ocr_preview"] = sanitized_preview
            extracted_fields["ocr_status"] = "extracted"

            # Check for Aadhaar format if applicable
            if document_type in ("aadhaar", "aadhaar_card"):
                aadhaar_matches = re.findall(r"\b\d{4}[\s-]?\d{4}[\s-]?\d{4}\b", ocr_text)
                if aadhaar_matches:
                    extracted_fields["aadhaar_detected"] = True
                    extracted_fields["masked_detected_aadhaar"] = mask_id_number("aadhaar", aadhaar_matches[0])
                else:
                    extracted_fields["aadhaar_detected"] = False

            # Cross-reference with applicant full name if provided
            if applicant and applicant.get("full_name"):
                name_tokens = applicant["full_name"].strip().lower().split()
                ocr_lower = ocr_text.lower()
                matched_tokens = [tok for tok in name_tokens if len(tok) >= 3 and tok in ocr_lower]
                match_ratio = len(matched_tokens) / max(len([t for t in name_tokens if len(t) >= 3]), 1)
                extracted_fields["name_token_match_ratio"] = round(match_ratio, 2)

                if match_ratio < 0.4 and len(ocr_text.strip()) > 30:
                    flags.append("NAME_MISMATCH_IN_DOCUMENT")
                    reasons.append("Applicant name tokens not detected in document OCR text.")
                    raw_risk_points += 20
        except Exception as exc:
            logger.debug("OCR execution error: %s", exc)
            extracted_fields["ocr_status"] = "OCR engine encountered error or is unconfigured on host."
    else:
        extracted_fields["ocr_status"] = "pytesseract not configured. Image quality analysis applied."

    # 8. Compute Final Document Risk Score and Confidence
    # Baseline confidence starts at 1.0 and is reduced by flags and measured heuristics
    final_risk_score = min(100.0, max(0.0, raw_risk_points))
    confidence = max(0.2, min(1.0, 1.0 - (final_risk_score / 120.0)))
    category = _classify_score(final_risk_score)
    suspicious = final_risk_score >= 35.0
    quality_score = round(max(0.0, 100.0 - final_risk_score), 1)

    if not reasons:
        reasons.append("Document image passed baseline visual quality and dimension standards.")

    measured_metrics = {
        "sharpness": quality_metrics.get("sharpness_score"),
        "contrast": quality_metrics.get("contrast_stddev"),
        "brightness": quality_metrics.get("mean_brightness"),
        "edge_density": quality_metrics.get("edge_density"),
        "ela_anomaly": quality_metrics.get("ela_anomaly_score"),
        "aspect_ratio": quality_metrics.get("aspect_ratio"),
        "file_size_kb": quality_metrics.get("file_size_kb"),
    }

    limitations_text = (
        "Heuristic image processing is a preliminary filter, NOT forensic authentication. "
        "A high risk score flags the document for manual review rather than definitive fraud."
    )

    return {
        "document_type": document_type,
        "suspicious": suspicious,
        "suspicious_detected": suspicious,
        "risk_score": round(final_risk_score, 1),
        "quality_score": quality_score,
        "risk_category": category,
        "confidence": round(confidence, 2),
        "flags": flags,
        "reasons": reasons,
        "quality_metrics": quality_metrics,
        "measured_metrics": measured_metrics,
        "extracted_fields": extracted_fields,
        "file_hash": file_hash,
        "duplicate_detected": "DUPLICATE_DOCUMENT_UPLOAD" in flags,
        "note": (
            "Evidence-based heuristic document quality check. "
            "Measurable metrics include sharpness, contrast, edge density, and cryptographic uniqueness."
        ),
        "limitations": limitations_text,
        "analysis_limitations": limitations_text,
        "simulated": False,
    }


def _classify_score(score: float) -> str:
    if score < 25.0:
        return "LOW"
    elif score < 50.0:
        return "MEDIUM"
    elif score < 75.0:
        return "HIGH"
    return "CRITICAL"


def _error_result(document_type: str, error_message: str) -> dict:
    return {
        "document_type": document_type,
        "suspicious": True,
        "suspicious_detected": True,
        "risk_score": 90.0,
        "quality_score": 10.0,
        "risk_category": "CRITICAL",
        "confidence": 0.0,
        "flags": ["ANALYSIS_ERROR"],
        "reasons": [error_message],
        "quality_metrics": {},
        "measured_metrics": {},
        "extracted_fields": {"error": error_message},
        "file_hash": None,
        "duplicate_detected": False,
        "note": error_message,
        "limitations": "Analysis could not complete due to input or processing failure.",
        "analysis_limitations": "Analysis could not complete due to input or processing failure.",
        "simulated": False,
    }
