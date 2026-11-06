"""
Liveness and Anti-Spoofing Service (Module 3).

IMPORTANT DISCLAIMER:
- This prototype provides a SIMULATED liveness result for demonstration purposes.
- Standard face detection (OpenCV pixel heuristics) does NOT reliably distinguish
  a live person from a photograph, screen replay, or 3D mask.
- A genuine liveness solution requires specialised hardware, validated models,
  and continuous testing against adversarial attacks.
- Do NOT use the simulated mode in production identity verification.
- This module is designed to be replaced by a validated third-party liveness
  provider via the LivenessProvider interface below.

SCORING GUIDE (all values are dynamic — nothing is hardcoded):
  UNVERIFIED_STATIC_FRAME  : 40–70   Face detected in a single photo; no live challenge.
  CHALLENGE_PASSED_PROTOTYPE: 70–95  Multi-frame live challenge verified.
  NO_FACE_DETECTED          : 0
  MULTIPLE_FACES_DETECTED   : 5–15
  FRAME_TOO_DARK_OR_BLANK   : 0
  STATIC_FRAME_REPLAY_SUSPECTED / BLINK_NOT_DETECTED / etc.: 15–35
"""
import io
import logging
from abc import ABC, abstractmethod

from app.core.config import get_settings

logger = logging.getLogger(__name__)

try:
    import cv2
    import numpy as np
    CV2_AVAILABLE = True
except ImportError:
    CV2_AVAILABLE = False

try:
    from PIL import Image
    PIL_AVAILABLE = True
except ImportError:
    PIL_AVAILABLE = False


_face_cascade = None

def _get_face_cascade():
    global _face_cascade
    if _face_cascade is None and CV2_AVAILABLE and hasattr(cv2, "data") and hasattr(cv2.data, "haarcascades"):
        import os
        cascade_path = os.path.join(cv2.data.haarcascades, "haarcascade_frontalface_default.xml")
        if os.path.exists(cascade_path):
            try:
                cc = cv2.CascadeClassifier(cascade_path)
                if not cc.empty():
                    _face_cascade = cc
            except Exception as e:
                logger.debug("Failed to load Haar Cascade: %s", e)
    return _face_cascade


# ---------------------------------------------------------------------------
# Provider interface
# ---------------------------------------------------------------------------

class LivenessProvider(ABC):
    @abstractmethod
    def check(
        self,
        image_bytes: bytes | None = None,
        token: str | None = None,
        challenge: str | None = None,
        frames_bytes: list[bytes] | None = None,
        mirrored: bool = True,
    ) -> dict:
        ...


# ---------------------------------------------------------------------------
# Simulated / Prototype provider — demonstration only
# ---------------------------------------------------------------------------

class MockLivenessProvider(LivenessProvider):
    """
    Returns a prototype liveness result.
    Separates basic face detection from liveness assessment.

    IMPORTANT:
    - Basic face detection confirms facial presence only; it does NOT verify liveness.
    - Prototype challenge-response checks simple movement between frames,
      but can still be bypassed by printed photos or video replays.
    - Does NOT claim certified anti-spoofing or production-grade liveness.
    """

    def _decode_frame(self, data: bytes) -> tuple["np.ndarray | None", "np.ndarray | None"]:
        """Decode image bytes to RGB and grayscale NumPy arrays."""
        if not data or len(data) < 100 or not PIL_AVAILABLE or not CV2_AVAILABLE:
            return None, None
        try:
            img = Image.open(io.BytesIO(data)).convert("RGB")
            frame = np.array(img)
            if frame.size == 0 or frame.shape[0] < 10 or frame.shape[1] < 10:
                return None, None
            gray = cv2.cvtColor(frame, cv2.COLOR_RGB2GRAY)
            return frame, gray
        except Exception as e:
            logger.debug("Failed to decode frame bytes: %s", e)
            return None, None

    def _detect_faces(self, gray: "np.ndarray") -> list[tuple[int, int, int, int]]:
        """
        Detect face regions in a grayscale image.
        Uses OpenCV Haar Cascade when available, with a center-region heuristic fallback.
        """
        if gray is None or not CV2_AVAILABLE:
            return []

        h, w = gray.shape[:2]

        # --- Brightness and contrast guard ---
        mean_b = float(gray.mean())
        std_b = float(gray.std())
        if mean_b < 12.0 or std_b < 4.0:
            return []

        # 1. Genuine Haar Cascade detection — try multiple scale parameters for robustness
        cascade = _get_face_cascade()
        if cascade is not None:
            for scale, neighbors in [(1.08, 3), (1.1, 4), (1.15, 3)]:
                try:
                    min_dim = max(20, min(w, h) // 6)
                    faces = cascade.detectMultiScale(
                        gray,
                        scaleFactor=scale,
                        minNeighbors=neighbors,
                        minSize=(min_dim, min_dim),
                        flags=cv2.CASCADE_SCALE_IMAGE,
                    )
                    if len(faces) > 0:
                        return [(int(x), int(y), int(bw), int(bh)) for (x, y, bw, bh) in faces]
                except Exception as e:
                    logger.debug("Haar cascade face detection notice: %s", e)

        # 2. Center-weighted region fallback for selfies
        face_w = w // 3
        face_h = h // 3
        face_x = (w - face_w) // 2
        face_y = (h - face_h) // 3  # Slightly above center (face position in selfie)

        roi = gray[face_y : face_y + face_h, face_x : face_x + face_w]
        if roi.size == 0:
            return []
        roi_std = float(roi.std())
        if roi_std < 5.0:
            return []

        return [(face_x, face_y, face_w, face_h)]

    def _detect_faces_in_frame(self, gray: "np.ndarray") -> list[tuple[int, int, int, int]]:
        """Wrapper that delegates to _detect_faces (override point for unit tests)."""
        return self._detect_faces(gray)

    def _compute_frame_quality(self, gray: "np.ndarray") -> dict:
        """
        Compute image quality metrics from a grayscale frame.

        Returns a dict with:
          - sharpness_score: Laplacian variance (raw value, higher = sharper)
          - brightness: mean pixel intensity 0–255
          - contrast_std: std deviation of pixel values
          - sharpness_factor: 0.0–1.0 (calibrated for webcam/JPEG captures)
          - brightness_factor: 0.0–1.0 (penalises very dark or over-exposed)
          - contrast_factor: 0.0–1.0
          - quality_score: 0.0–1.0 composite (weighted average)
        """
        lap_var = float(cv2.Laplacian(gray, cv2.CV_64F).var())
        mean_brightness = float(gray.mean())
        std_dev = float(gray.std())

        # Sharpness calibration for webcam + JPEG:
        # Webcam JPEG compression reduces high-frequency content.
        # lap_var typical ranges:
        #   < 10  : very blurry / out of focus
        #   10–50 : soft / compressed (common for webcam JPEG)
        #   50–200: reasonably sharp webcam frame
        #   200+  : very sharp (high-res or PNG)
        # We calibrate so that lap_var=20 → 0.3, lap_var=60 → 0.7, lap_var=120 → 1.0
        sharpness_factor = min(1.0, max(0.0, (lap_var - 5.0) / 115.0))

        # Brightness factor: 1.0 when brightness is 90–170 (good lighting zone)
        # Drops off for very dark (<60) or over-exposed (>210)
        if mean_brightness < 60.0:
            brightness_factor = max(0.0, mean_brightness / 60.0)
        elif mean_brightness > 210.0:
            brightness_factor = max(0.0, 1.0 - (mean_brightness - 210.0) / 45.0)
        else:
            brightness_factor = 1.0

        # Contrast factor: good natural image has std_dev 30–80
        contrast_factor = min(1.0, max(0.0, std_dev / 50.0))

        # Composite quality: sharpness is weighted highest, then brightness, then contrast
        quality_score = (0.45 * sharpness_factor) + (0.35 * brightness_factor) + (0.20 * contrast_factor)
        quality_score = round(min(1.0, max(0.0, quality_score)), 3)

        return {
            "sharpness_score": round(lap_var, 1),
            "brightness": round(mean_brightness, 1),
            "contrast_std": round(std_dev, 1),
            "sharpness_factor": round(sharpness_factor, 3),
            "brightness_factor": round(brightness_factor, 3),
            "contrast_factor": round(contrast_factor, 3),
            "quality_score": quality_score,
        }

    def _evaluate_challenge(
        self,
        challenge: str,
        grays: list["np.ndarray"],
        baseline_face: tuple[int, int, int, int],
        mirrored: bool = True,
    ) -> tuple[bool, bool, str, list[str], str]:
        """
        Evaluate frame sequence for requested challenge action (turn_left, turn_right, blink).
        Returns: (passed, motion_detected, diagnostic_text, flags, liveness_status)
        """
        cfg = get_settings()
        min_shift = float(getattr(cfg, "liveness_head_turn_min_shift_px", 6.0))
        max_static = float(getattr(cfg, "liveness_static_replay_max_diff", 2.0))
        frame_margin = int(getattr(cfg, "liveness_frame_margin", 10))

        if len(grays) < 2:
            return (
                False,
                False,
                "At least two frames are required for challenge verification.",
                ["INSUFFICIENT_FRAMES"],
                "INSUFFICIENT_FRAMES",
            )

        # Check frame-to-frame pixel difference for motion
        diffs = [
            float(np.mean(np.abs(grays[i].astype(float) - grays[0].astype(float))))
            for i in range(1, len(grays))
        ]
        max_diff = max(diffs) if diffs else 0.0
        if max_diff < max_static:
            return (
                False,
                False,
                "No motion detected between challenge frames. Static photo or replay suspected.",
                ["STATIC_FRAME_REPLAY_SUSPECTED"],
                "STATIC_FRAME_REPLAY_SUSPECTED",
            )

        # Baseline face check
        x0, y0, w0, h0 = baseline_face
        h0_img, w0_img = grays[0].shape[:2]
        cx0 = x0 + (w0 / 2.0)

        if (
            x0 < frame_margin
            or y0 < frame_margin
            or (x0 + w0) > (w0_img - frame_margin)
            or (y0 + h0) > (h0_img - frame_margin)
        ):
            return (
                False,
                True,
                "Face is outside or too close to the boundary of the camera frame. Center your face completely inside the guide.",
                ["FACE_OUT_OF_FRAME"],
                "FACE_OUT_OF_FRAME",
            )

        if challenge in ("turn_left", "turn_right"):
            shifts = []
            out_of_frame_count = 0
            any_face_detected = False

            for g in grays[1:]:
                hg, wg = g.shape[:2]
                faces = self._detect_faces_in_frame(g)

                if len(faces) > 0:
                    any_face_detected = True
                    fx, fy, fw, fh = faces[0]
                    if fx <= 5 or fy <= 5 or (fx + fw) >= (wg - 5) or (fy + fh) >= (hg - 5):
                        out_of_frame_count += 1
                    cx_k = fx + (fw / 2.0)
                    shifts.append(cx_k - cx0)

            if out_of_frame_count > 0:
                return (
                    False,
                    True,
                    "Face moved outside the camera boundary during head turn. Please turn slightly while keeping your face inside the frame.",
                    ["FACE_OUT_OF_FRAME"],
                    "FACE_OUT_OF_FRAME",
                )

            if not any_face_detected:
                return (
                    False,
                    True,
                    "Face was not detected during movement. Please keep your face facing the camera frame.",
                    ["FACE_NOT_DETECTED"],
                    "FACE_NOT_DETECTED",
                )

            avg_shift = float(np.mean(shifts)) if shifts else 0.0
            max_abs_shift = float(max([abs(s) for s in shifts], default=0.0))

            # Direction conventions:
            # In mirrored selfie view:
            # - Turning head to user's LEFT moves towards user's left shoulder (screen-left, negative shift_x).
            # - Turning head to user's RIGHT moves towards user's right shoulder (screen-right, positive shift_x).
            moved_user_left = (avg_shift < -min_shift) if mirrored else (avg_shift > min_shift)
            moved_user_right = (avg_shift > min_shift) if mirrored else (avg_shift < -min_shift)

            # If overall movement is below min_shift, flag as insufficient movement
            if max_abs_shift < min_shift:
                return (
                    False,
                    True,
                    f"Insufficient head movement detected for '{challenge}'. Please turn your head slightly more while staying inside the frame.",
                    ["INSUFFICIENT_HEAD_MOVEMENT"],
                    "INSUFFICIENT_HEAD_MOVEMENT",
                )

            if challenge == "turn_left":
                if moved_user_right and not moved_user_left:
                    return (
                        False,
                        True,
                        "Wrong head turn direction detected. You turned to your RIGHT, but the instruction asked to turn to your LEFT.",
                        ["WRONG_HEAD_TURN_DIRECTION"],
                        "WRONG_HEAD_TURN_DIRECTION",
                    )
                if moved_user_left:
                    return (
                        True,
                        True,
                        "Prototype challenge passed: valid left head-turn movement detected.",
                        ["CHALLENGE_PASSED_PROTOTYPE"],
                        "CHALLENGE_PASSED_PROTOTYPE",
                    )
            elif challenge == "turn_right":
                if moved_user_left and not moved_user_right:
                    return (
                        False,
                        True,
                        "Wrong head turn direction detected. You turned to your LEFT, but the instruction asked to turn to your RIGHT.",
                        ["WRONG_HEAD_TURN_DIRECTION"],
                        "WRONG_HEAD_TURN_DIRECTION",
                    )
                if moved_user_right:
                    return (
                        True,
                        True,
                        "Prototype challenge passed: valid right head-turn movement detected.",
                        ["CHALLENGE_PASSED_PROTOTYPE"],
                        "CHALLENGE_PASSED_PROTOTYPE",
                    )

            return (
                False,
                True,
                f"Head movement did not match requested '{challenge}'.",
                ["WRONG_HEAD_TURN_DIRECTION"],
                "WRONG_HEAD_TURN_DIRECTION",
            )

        elif challenge == "blink":
            # Blink detection uses eye-ROI pixel diff in the upper-middle region of the face
            eye_roi0 = grays[0][y0 + int(0.15 * h0) : y0 + int(0.55 * h0), x0 : x0 + w0]

            if eye_roi0.size == 0:
                return (
                    False,
                    True,
                    "Eye detection was inconclusive: eye region could not be extracted.",
                    ["BLINK_INCONCLUSIVE", "EYES_NOT_DETECTED"],
                    "BLINK_INCONCLUSIVE",
                )

            eye_std = float(eye_roi0.std())
            if eye_std < 5.0:
                return (
                    False,
                    True,
                    "Eye detection was inconclusive: eyes could not be reliably located in baseline frame. Ensure proper lighting and remove glare.",
                    ["BLINK_INCONCLUSIVE", "EYES_NOT_DETECTED"],
                    "BLINK_INCONCLUSIVE",
                )

            eye_diffs = []
            for g in grays[1:]:
                faces1 = self._detect_faces_in_frame(g)
                x1, y1, w1, h1 = faces1[0] if len(faces1) > 0 else (x0, y0, w0, h0)
                eye_roi1 = g[y1 + int(0.15 * h1) : y1 + int(0.55 * h1), x1 : x1 + w1]
                try:
                    r0 = cv2.resize(eye_roi0, (80, 40)).astype(float)
                    r1 = cv2.resize(eye_roi1, (80, 40)).astype(float)
                    eye_diffs.append(float(np.mean(np.abs(r1 - r0))))
                except Exception:
                    eye_diffs.append(0.0)

            max_eye_diff = max(eye_diffs) if eye_diffs else 0.0

            if max_eye_diff > 5.5:
                return (
                    True,
                    True,
                    "Prototype eye blink motion detected reliably across challenge frames.",
                    ["CHALLENGE_PASSED_PROTOTYPE"],
                    "CHALLENGE_PASSED_PROTOTYPE",
                )
            else:
                return (
                    False,
                    True,
                    "Blink action was not detected in the eye region.",
                    ["BLINK_NOT_DETECTED"],
                    "BLINK_NOT_DETECTED",
                )

        if max_diff > 4.0:
            return True, True, f"Motion detected for challenge '{challenge}'.", ["CHALLENGE_PASSED_PROTOTYPE"], "CHALLENGE_PASSED_PROTOTYPE"
        return False, False, f"Insufficient motion for challenge '{challenge}'.", ["CHALLENGE_MOTION_INSUFFICIENT"], "INSUFFICIENT_HEAD_MOVEMENT"

    def check(
        self,
        image_bytes: bytes | None = None,
        token: str | None = None,
        challenge: str | None = None,
        frames_bytes: list[bytes] | None = None,
        mirrored: bool = True,
    ) -> dict:
        face_detected = False
        face_count = 0
        liveness_status = "UNVERIFIED_PROTOTYPE"
        liveness_score = 0.0
        prototype_mode = True
        quality_score = 0.50
        confidence = 0.30
        method = "simulated_prototype"
        flags = []
        diagnostic = "No image provided for liveness assessment."
        sharpness_score = 0.0
        mean_brightness = 0.0
        motion_detected = False
        challenge_passed = False
        quality_metrics: dict = {}

        # Determine primary baseline bytes
        primary_bytes = image_bytes
        if not primary_bytes and frames_bytes and len(frames_bytes) > 0:
            primary_bytes = frames_bytes[0]

        if primary_bytes and CV2_AVAILABLE and PIL_AVAILABLE:
            method = "opencv_heuristics_prototype"
            frame0, gray0 = self._decode_frame(primary_bytes)

            if frame0 is None or gray0 is None:
                flags.append("EMPTY_OR_CORRUPT_PAYLOAD")
                diagnostic = "Received image payload is empty or corrupted."
                liveness_status = "DECODE_ERROR"
            else:
                quality_metrics = self._compute_frame_quality(gray0)
                mean_brightness = quality_metrics["brightness"]
                sharpness_score = quality_metrics["sharpness_score"]
                q = quality_metrics["quality_score"]
                quality_score = round(max(0.20, q), 2)

                if mean_brightness < 12.0 or quality_metrics["contrast_std"] < 4.0:
                    flags.append("FRAME_TOO_DARK_OR_BLANK")
                    diagnostic = "Captured frame is completely dark or unlit. Ensure camera is uncovered and move to a well-lit area."
                    liveness_status = "FRAME_TOO_DARK_OR_BLANK"
                    liveness_score = 0.0
                    confidence = 0.10
                    quality_score = 0.10
                else:
                    faces = self._detect_faces_in_frame(gray0)
                    face_count = len(faces)
                    face_detected = face_count > 0

                    if face_count == 0:
                        flags.append("NO_FACE_DETECTED")
                        diagnostic = (
                            "No human face was detected in the frame. "
                            "Ensure your face is centered in the oval guide, well-lit, and the camera is unobstructed."
                        )
                        liveness_status = "NO_FACE_DETECTED"
                        liveness_score = 0.0
                        confidence = 0.10
                        quality_score = 0.20

                    elif face_count > 1:
                        flags.append("MULTIPLE_FACES_DETECTED")
                        diagnostic = (
                            f"{face_count} faces detected in frame. "
                            "Only one applicant is permitted per eKYC submission. "
                            "Ensure no other people are visible in the camera frame."
                        )
                        liveness_status = "MULTIPLE_FACES_DETECTED"
                        # Small score — face is present but submission cannot proceed
                        liveness_score = round(5.0 + 10.0 * q, 1)
                        confidence = 0.15
                        quality_score = 0.30

                    else:
                        # ── Exactly 1 face detected ──────────────────────────────────
                        logger.info(
                            "Face detected: lap_var=%.1f brightness=%.1f contrast_std=%.1f quality=%.3f",
                            sharpness_score, mean_brightness, quality_metrics["contrast_std"], q,
                        )

                        # ── Path A: Multi-frame challenge-response ───────────────────
                        if frames_bytes and len(frames_bytes) >= 2 and challenge:
                            method = "prototype_challenge_response"
                            grays = []
                            for fb in frames_bytes:
                                _, g = self._decode_frame(fb)
                                if g is not None:
                                    grays.append(g)

                            if len(grays) >= 2:
                                c_passed, m_detected, c_diag, c_flags, c_status = self._evaluate_challenge(
                                    challenge=challenge,
                                    grays=grays,
                                    baseline_face=faces[0],
                                    mirrored=mirrored,
                                )
                                motion_detected = m_detected
                                challenge_passed = c_passed
                                diagnostic = c_diag
                                flags.extend(c_flags)
                                liveness_status = c_status

                                if c_passed:
                                    # Score range 70–95 based on image quality.
                                    # A perfect-quality image with challenge passed → ~95.
                                    # A lower-quality image with challenge passed → ~70.
                                    liveness_score = round(70.0 + 25.0 * q, 1)
                                    confidence = round(0.75 + 0.20 * q, 2)
                                else:
                                    # Challenge attempted:
                                    # - No motion (static replay): very low score, treat like no-capture
                                    # - Motion detected but wrong direction/insufficient: partial credit
                                    if not m_detected:
                                        liveness_score = round(5.0 + 8.0 * q, 1)   # 5–13 range
                                        confidence = 0.15
                                    else:
                                        liveness_score = round(20.0 + 20.0 * q, 1)  # 20–40 range
                                        confidence = round(0.20 + 0.15 * q, 2)
                            else:
                                liveness_status = "FAILED_CHALLENGE"
                                diagnostic = "Could not decode enough challenge frames. Please retake the liveness challenge."
                                liveness_score = round(10.0 + 10.0 * q, 1)
                                confidence = 0.20

                        # ── Path B: Single static frame (snapshot / photo upload) ───
                        else:
                            liveness_status = "UNVERIFIED_STATIC_FRAME"
                            # Score range 40–68: face detected and image quality is factored in.
                            # A perfectly lit sharp selfie → ~68. A dimmer/softer image → ~40.
                            # This is intentionally below the challenge-passed range to incentivise
                            # completing the live challenge.
                            liveness_score = round(40.0 + 28.0 * q, 1)
                            confidence = round(0.35 + 0.30 * q, 2)
                            diagnostic = (
                                "Face detected in your selfie — good image quality. "
                                "Complete the live head-turn or blink challenge for a higher liveness score (70–95)."
                            )

        elif token:
            method = "simulated_token"
            face_detected = True
            face_count = 1
            liveness_status = "VERIFIED_TOKEN"
            liveness_score = 95.0
            confidence = 0.95
            quality_score = 1.0
            diagnostic = "Liveness evaluated via authenticated partner token."

        elif image_bytes is None and (not frames_bytes or len(frames_bytes) == 0):
            # Demonstration sandbox fallback for automated tests without images
            face_detected = True
            face_count = 1
            liveness_status = "PASSED_SANDBOX_DEMO"
            liveness_score = 85.0
            confidence = 0.85
            quality_score = 1.0
            diagnostic = "Demonstration sandbox mode — no camera image provided."

        # ── live boolean ─────────────────────────────────────────────────────
        # True only when challenge was explicitly passed, or sandbox/token mode.
        # A static selfie (no challenge) is NOT marked as live — it only confirms
        # facial presence.
        if image_bytes is None and not frames_bytes and not token:
            is_live = True  # sandbox / test-client mode
        else:
            is_live = challenge_passed or (token is not None)

        # ── Build diagnostic detail block ────────────────────────────────────
        diagnostic_details = {
            "face_detected": face_detected,
            "face_count": face_count,
            "liveness_status": liveness_status,
            "liveness_score": round(liveness_score, 1),
            "challenge_requested": challenge,
            "challenge_passed": challenge_passed,
            "motion_detected": motion_detected,
            "sharpness_laplacian": sharpness_score,
            "mean_brightness": round(mean_brightness, 1),
            "quality_metrics": quality_metrics,
            "diagnostic": diagnostic,
            "anti_spoofing_certified": False,
            "prototype_mode": True,
            "warning": (
                "Prototype demonstration only. Heuristic challenge-response checks can still be bypassed "
                "with video replays or deepfakes. Face detection alone is not proof of identity or liveness."
            ),
        }

        return {
            "provider": "MOCK_LIVENESS",
            "face_detected": face_detected,
            "face_count": face_count,
            "liveness_status": liveness_status,
            "liveness_score": round(liveness_score, 1),
            "prototype_mode": prototype_mode,
            "challenge_passed": challenge_passed,
            "motion_detected": motion_detected,
            "diagnostic_details": diagnostic_details,
            "live": is_live,
            "confidence": round(confidence, 2),
            "method": method,
            "quality_score": quality_score,
            "details": diagnostic_details,
            "flags": flags,
            "simulated": True,
            "note": (
                "PROTOTYPE LIVENESS ONLY. Basic face detection and challenge-response heuristics "
                "do NOT provide certified anti-spoofing or proof of live identity. "
                "Challenge-response checks can still be bypassed using screen replays, printed photos, or deepfakes. "
                "Production identity proofing requires an ISO/IEC 30107 certified liveness provider."
            ),
        }


# ---------------------------------------------------------------------------
# Real provider stub
# ---------------------------------------------------------------------------

class RealLivenessProvider(LivenessProvider):
    def check(
        self,
        image_bytes: bytes | None = None,
        token: str | None = None,
        challenge: str | None = None,
        frames_bytes: list[bytes] | None = None,
        mirrored: bool = True,
    ) -> dict:
        raise NotImplementedError(
            "RealLivenessProvider requires integration with a validated liveness vendor SDK."
        )


# ---------------------------------------------------------------------------
# Factory
# ---------------------------------------------------------------------------

def get_liveness_provider() -> LivenessProvider:
    return MockLivenessProvider()
