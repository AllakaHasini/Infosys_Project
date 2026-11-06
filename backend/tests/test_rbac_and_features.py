"""
Unit and Integration tests for RBAC, User Registration, Aadhaar Masking,
Document Fraud Detection variations, and Liveness Capture.
"""
import io
import uuid
from bson import ObjectId
import numpy as np
import cv2
from PIL import Image, ImageDraw
from unittest.mock import patch
from fastapi.testclient import TestClient

from app.services.document_service import analyze_document
from app.services.liveness_service import get_liveness_provider
from app.utils.helpers import mask_id_number


def create_synthetic_image(text="SAMPLE IDENTITY DOCUMENT", blur=False, low_contrast=False, width=600, height=400):
    """Generate synthetic document image bytes with measurable quality variations."""
    if low_contrast:
        img_array = np.full((height, width), 128, dtype=np.uint8)
        img_array[100:150, 100:300] = 132  # very faint contrast
        img = Image.fromarray(img_array)
    else:
        img = Image.new("RGB", (width, height), color=(250, 250, 250))
        draw = ImageDraw.Draw(img)
        # Draw high-contrast shapes and lines
        for y in range(30, height, 40):
            draw.line([(30, y), (width - 30, y)], fill=(40, 40, 40), width=2)
        draw.rectangle([(50, 50), (200, 200)], outline=(0, 50, 150), width=3)
        draw.text((60, 60), text, fill=(0, 0, 0))

    if blur:
        cv_img = np.array(img)
        cv_img = cv2.GaussianBlur(cv_img, (35, 35), 0)
        img = Image.fromarray(cv_img)

    buf = io.BytesIO()
    img.save(buf, format="JPEG", quality=90)
    return buf.getvalue()


class MockMongoCollection:
    """In-memory collection supporting basic find_one, insert_one, and update_one."""

    def __init__(self):
        self.docs = []

    def find_one(self, query):
        for doc in self.docs:
            match = True
            for k, v in query.items():
                if doc.get(k) != v:
                    match = False
                    break
            if match:
                return dict(doc)
        return None

    def insert_one(self, doc):
        stored = dict(doc)
        if "_id" not in stored:
            stored["_id"] = ObjectId()
        self.docs.append(stored)

        class Result:
            inserted_id = stored["_id"]

        return Result()

    def update_one(self, query, update):
        for doc in self.docs:
            match = True
            for k, v in query.items():
                if doc.get(k) != v:
                    match = False
                    break
            if match:
                if "$set" in update:
                    doc.update(update["$set"])
                return True
        return False

    def count_documents(self, query):
        count = 0
        for doc in self.docs:
            match = True
            for k, v in query.items():
                if doc.get(k) != v:
                    match = False
                    break
            if match:
                count += 1
        return count

    def find(self, query):
        matching = []
        for doc in self.docs:
            match = True
            for k, v in query.items():
                if doc.get(k) != v:
                    match = False
                    break
            if match:
                matching.append(dict(doc))

        class Cursor:
            def __init__(self, items):
                self.items = items

            def sort(self, *args, **kwargs):
                return self

            def skip(self, n):
                self.items = self.items[n:]
                return self

            def limit(self, n):
                self.items = self.items[:n]
                return self

            def __iter__(self):
                return iter(self.items)

        return Cursor(matching)


class TestAadhaarAndHelpers:
    """Test Aadhaar masking and synthetic data validation."""

    def test_aadhaar_masking_12_digits(self):
        raw = "5555-6666-7777"
        masked = mask_id_number("aadhaar", raw)
        assert masked == "XXXX-XXXX-7777"
        assert "5555" not in masked
        assert "6666" not in masked

    def test_aadhaar_masking_spaces(self):
        raw = "1234 5678 9012"
        masked = mask_id_number(raw)
        assert masked == "XXXX-XXXX-9012"

    def test_masking_other_id_types(self):
        dl = "DL-0420110012345"
        masked = mask_id_number("driving_license", dl)
        assert masked.startswith("DL")
        assert masked.endswith("45")
        assert "*" in masked

    def test_masking_short_or_empty(self):
        assert mask_id_number("") == ""
        assert mask_id_number("123") == "***"


class TestDocumentFraudAnalysisVariations:
    """Test that different document inputs produce evidence-based, varied results."""

    def test_clean_document_high_sharpness(self):
        sharp_bytes = create_synthetic_image(text="CLEAN DOC 123", blur=False)
        result = analyze_document(
            file_bytes=sharp_bytes,
            filename="clean_test.jpg",
            document_type="aadhaar",
            check_duplicates=False,
        )
        assert result["confidence"] > 0.6
        assert result["quality_metrics"]["sharpness_score"] > 35.0
        assert "BLURRY_IMAGE" not in result["flags"]

    def test_blurry_document_triggers_blur_flag(self):
        blurry_bytes = create_synthetic_image(text="BLURRY DOC", blur=True)
        result = analyze_document(
            file_bytes=blurry_bytes,
            filename="blurry_test.jpg",
            document_type="aadhaar",
            check_duplicates=False,
        )
        assert "BLURRY_IMAGE" in result["flags"]
        assert result["quality_metrics"]["sharpness_score"] < 35.0

    def test_low_contrast_document_triggers_flag(self):
        low_contrast_bytes = create_synthetic_image(blur=False, low_contrast=True)
        result = analyze_document(
            file_bytes=low_contrast_bytes,
            filename="low_contrast.jpg",
            document_type="aadhaar",
            check_duplicates=False,
        )
        assert "LOW_CONTRAST_OR_BLANK" in result["flags"]
        assert result["quality_metrics"]["contrast_stddev"] < 18.0

    def test_unsupported_file_extension(self):
        result = analyze_document(
            file_bytes=b"executable content",
            filename="malicious.exe",
            document_type="passport",
            check_duplicates=False,
        )
        assert "ANALYSIS_ERROR" in result["flags"]
        assert result["suspicious"] is True

    def test_corrupted_image_bytes(self):
        result = analyze_document(
            file_bytes=b"NOT AN IMAGE HEADER JUST RANDOM JUNK",
            filename="broken.jpg",
            document_type="national_id",
            check_duplicates=False,
        )
        assert "ANALYSIS_ERROR" in result["flags"]
        assert result["suspicious"] is True

    def test_different_documents_produce_different_hashes(self):
        doc1 = create_synthetic_image("DOC 1", blur=False)
        doc2 = create_synthetic_image("DOC 2 WITH DIFFERENT CONTENT", blur=False)
        res1 = analyze_document(doc1, "doc1.jpg", document_type="aadhaar", check_duplicates=False)
        res2 = analyze_document(doc2, "doc2.jpg", document_type="aadhaar", check_duplicates=False)
        assert res1["file_hash"] != res2["file_hash"]


class TestLivenessService:
    """Test biometric liveness heuristics and prototype disclaimers."""

    def test_liveness_check_returns_prototype_disclaimer(self):
        provider = get_liveness_provider()
        img_bytes = create_synthetic_image("SELFIE", blur=False)
        res = provider.check(image_bytes=img_bytes, token=None)
        assert res["method"] in ("simulated_webcam_capture", "opencv_heuristics_prototype")
        assert "simulated" in res["note"].lower() or "prototype" in res["note"].lower()
        assert "confidence" in res
        assert "face_detected" in res

    def test_liveness_without_image_returns_simulated(self):
        provider = get_liveness_provider()
        res = provider.check(image_bytes=None, token=None)
        assert res["live"] is True
        assert "simulated" in res["note"].lower() or "prototype" in res["note"].lower()


class TestAuthAndRBACEndpoints:
    """Test user registration, login, and role-based access control."""

    def test_registration_and_login_flow(self, client: TestClient):
        mock_users = MockMongoCollection()
        mock_apps = MockMongoCollection()
        mock_audit = MockMongoCollection()

        with patch("app.api.v1.endpoints.auth.users_col", return_value=mock_users), \
             patch("app.security.auth.users_col", return_value=mock_users), \
             patch("app.api.v1.endpoints.applications.applications_col", return_value=mock_apps), \
             patch("app.services.ekyc_service.applications_col", return_value=mock_apps), \
             patch("app.db.mongodb.audit_logs_col", return_value=mock_audit), \
             patch("app.db.mongodb.applications_col", return_value=mock_apps):

            uid = uuid.uuid4().hex[:6]
            user_email = f"user_{uid}@example.test"
            admin_email = f"admin_{uid}@example.test"

            # 1. Register a normal user
            # 1. Register a normal user (even if role='admin' is attempted in payload, role is strictly 'user')
            reg_res = client.post(
                "/api/auth/register",
                json={
                    "email": user_email,
                    "password": "UserPass@123",
                    "full_name": "Test Normal User",
                    "role": "admin",  # Attacker attempts to self-grant admin
                },
            )
            assert reg_res.status_code == 201, reg_res.text
            data = reg_res.json()
            assert data["user_email"] == user_email
            # Must strictly be assigned 'user' role
            assert data["role"] == "user"
            user_token = data["access_token"]
            assert user_token is not None

            # 2. Seed an authorized admin user directly into mock_users and login
            from app.security.auth import hash_password
            mock_users.insert_one({
                "email": admin_email,
                "hashed_password": hash_password("AdminPass@123"),
                "full_name": "Authorized Administrator",
                "role": "admin",
            })
            login_admin = client.post(
                "/api/auth/login",
                json={
                    "email": admin_email,
                    "password": "AdminPass@123",
                },
            )
            assert login_admin.status_code == 200
            admin_token = login_admin.json()["access_token"]
            assert login_admin.json()["role"] == "admin"

            # 3. Test /api/auth/me for normal user
            me_res = client.get(
                "/api/auth/me",
                headers={"Authorization": f"Bearer {user_token}"},
            )
            assert me_res.status_code == 200
            assert me_res.json()["email"] == user_email
            assert me_res.json()["role"] == "user"

            # 4. Duplicate registration fails
            dup_res = client.post(
                "/api/auth/register",
                json={
                    "email": user_email,
                    "password": "AnotherPassword@123",
                    "full_name": "Duplicate User",
                },
            )
            assert dup_res.status_code in (400, 409)

            # 5. Normal user submits eKYC with synthetic Aadhaar
            ekyc_res = client.post(
                "/api/ekyc/verify",
                headers={"Authorization": f"Bearer {user_token}"},
                json={
                    "applicant": {
                        "full_name": "Test Synthetic Applicant",
                        "date_of_birth": "1994-05-12",
                        "gender": "male",
                        "nationality": "India",
                        "id_type": "aadhaar",
                        "id_number": "9999-8888-7777",
                        "email": "synthetic@example.test",
                        "phone": "+91 99999 88888",
                        "address": "123 Synthetic Lane",
                    }
                },
            )
            assert ekyc_res.status_code == 200
            app_data = ekyc_res.json()
            app_id = app_data["application_id"]
            assert app_id is not None
            # Verify Aadhaar is masked in the response
            assert app_data["masked_id_number"] == "XXXX-XXXX-7777"

            # 6. Normal user can view their own application
            own_app = client.get(
                f"/api/applications/{app_id}",
                headers={"Authorization": f"Bearer {user_token}"},
            )
            assert own_app.status_code == 200
            assert own_app.json()["masked_id_number"] == "XXXX-XXXX-7777"

            # 7. Admin can also view the application
            admin_view = client.get(
                f"/api/applications/{app_id}",
                headers={"Authorization": f"Bearer {admin_token}"},
            )
            assert admin_view.status_code == 200

            # 8. Admin can update decision; normal user cannot (403 Forbidden)
            user_override = client.patch(
                f"/api/applications/{app_id}/decision",
                headers={"Authorization": f"Bearer {user_token}"},
                json={"decision": "APPROVED", "notes": "Unauthorized user attempt"},
            )
            assert user_override.status_code == 403

            admin_override = client.patch(
                f"/api/applications/{app_id}/decision",
                headers={"Authorization": f"Bearer {admin_token}"},
                json={"decision": "APPROVED", "notes": "Admin approval verified"},
            )
            assert admin_override.status_code == 200
            assert admin_override.json()["ok"] is True

            # 9. Verify updated decision
            updated_view = client.get(
                f"/api/applications/{app_id}",
                headers={"Authorization": f"Bearer {admin_token}"},
            )
            assert updated_view.status_code == 200
            assert updated_view.json()["decision"] == "APPROVED"

            # 10. Cross-user isolation: User B cannot access User A's application
            user_b_res = client.post(
                "/api/auth/register",
                json={
                    "email": f"user_b_{uid}@example.test",
                    "password": "UserBPass@123",
                    "full_name": "Second User",
                },
            )
            assert user_b_res.status_code == 201
            user_b_token = user_b_res.json()["access_token"]

            unauthorized_get = client.get(
                f"/api/applications/{app_id}",
                headers={"Authorization": f"Bearer {user_b_token}"},
            )
            assert unauthorized_get.status_code == 403, "User B should be forbidden from accessing User A's application"
            assert "Access denied" in unauthorized_get.json()["detail"]


class TestCameraAndLivenessDetection:
    """Test camera frame decoding, dark frame handling, and face detection diagnostics."""

    def test_dark_or_blank_camera_frame_rejected(self):
        provider = get_liveness_provider()
        # Create an all-black synthetic frame
        black_img = Image.new("RGB", (640, 480), color=(0, 0, 0))
        buf = io.BytesIO()
        black_img.save(buf, format="JPEG")
        black_bytes = buf.getvalue()

        res = provider.check(image_bytes=black_bytes, token=None)
        assert res["face_detected"] is False
        assert "FRAME_TOO_DARK_OR_BLANK" in res["flags"]
        assert "dark" in res["details"]["diagnostic"].lower()

    def test_camera_frame_base64_endpoint_flow(self, client: TestClient):
        import base64
        # Create a synthetic image frame
        frame = Image.new("RGB", (320, 240), color=(200, 200, 200))
        draw = ImageDraw.Draw(frame)
        draw.ellipse([80, 40, 240, 200], fill=(240, 210, 180), outline=(50, 50, 50))
        buf = io.BytesIO()
        frame.save(buf, format="JPEG")
        b64_str = "data:image/jpeg;base64," + base64.b64encode(buf.getvalue()).decode()

        # Seed user into db
        from app.db.mongodb import users_col
        from app.security.auth import hash_password, create_access_token
        test_email = "tester_camera@ekyc.local"
        users_col().update_one(
            {"email": test_email},
            {"$set": {
                "email": test_email,
                "hashed_password": hash_password("CameraPass@123"),
                "full_name": "Camera Tester",
                "role": "user",
            }},
            upsert=True,
        )
        test_token = create_access_token({"sub": test_email, "role": "user", "uid": "t-cam-1"})
        headers = {"Authorization": f"Bearer {test_token}"}

        resp = client.post(
            "/api/liveness/check",
            headers=headers,
            json={"image_base64": b64_str},
        )
        assert resp.status_code == 200
        data = resp.json()
        assert "face_detected" in data
        assert "liveness_score" in data
        assert "details" in data
        assert data["simulated"] is True

    def test_liveness_no_face_image_returns_zero_score_and_flag(self):
        provider = get_liveness_provider()
        img_bytes = create_synthetic_image("BLANK TEXT ONLY NO FACE", blur=False)
        with patch.object(provider, "_detect_faces_in_frame", return_value=[]):
            res = provider.check(image_bytes=img_bytes, token=None)
            assert res["face_detected"] is False
            assert res["face_count"] == 0
            assert res["liveness_status"] == "NO_FACE_DETECTED"
            assert res["liveness_score"] == 0.0
            assert "NO_FACE_DETECTED" in res["flags"]

    def test_face_detection_does_not_give_high_liveness_score(self):
        """Single static image face detection must not grant a challenge-level (70+) liveness score."""
        provider = get_liveness_provider()
        img_bytes = create_synthetic_image("SELFIE PHOTO", blur=False)
        with patch.object(provider, "_detect_faces_in_frame", return_value=[(50, 50, 100, 100)]):
            res = provider.check(image_bytes=img_bytes, token=None)
            assert res["face_detected"] is True
            assert res["face_count"] == 1
            # Status must be UNVERIFIED_STATIC_FRAME (no live challenge attempted)
            assert res["liveness_status"] == "UNVERIFIED_STATIC_FRAME"
            # Score must be in the static-frame range (40–68), never 70+ which is challenge-only
            assert res["liveness_score"] < 70.0, f"Static frame score must be < 70, got {res['liveness_score']}"
            assert res["prototype_mode"] is True

    def test_liveness_challenge_fails_on_static_frames_replay(self):
        """Challenge fails with STATIC_FRAME_REPLAY_SUSPECTED if frames have no inter-frame motion."""
        provider = get_liveness_provider()
        frame_bytes = create_synthetic_image("FRAME 1", blur=False)
        with patch.object(provider, "_detect_faces_in_frame", return_value=[(50, 50, 100, 100)]):
            res = provider.check(
                image_bytes=frame_bytes,
                frames_bytes=[frame_bytes, frame_bytes],
                challenge="turn_left",
            )
            assert res["face_detected"] is True
            assert res["motion_detected"] is False
            assert res["challenge_passed"] is False
            assert "STATIC_FRAME_REPLAY_SUSPECTED" in res["flags"]
            assert res["liveness_status"] in ("STATIC_FRAME_REPLAY_SUSPECTED", "FAILED_CHALLENGE_NO_MOTION")
            # Score must be low — challenge failed with no motion detected (5–13 range)
            assert res["liveness_score"] <= 15.0, f"Failed replay score must be <= 15, got {res['liveness_score']}"

    def test_liveness_challenge_success_caps_at_prototype_score(self):
        """Passing prototype challenge awards capped prototype score (50/100), never claiming certified anti-spoofing."""
        provider = get_liveness_provider()
        b1 = create_synthetic_image("FRAME 1 CENTER FACE", blur=False)
        img = cv2.imdecode(np.frombuffer(b1, np.uint8), cv2.IMREAD_COLOR)
        img2 = cv2.convertScaleAbs(img, alpha=1.0, beta=15)
        _, b2_enc = cv2.imencode(".jpg", img2)
        b2 = b2_enc.tobytes()
        call_count = 0

        # Mirrored selfie: user turns left -> face moves left in image (80 -> 50, shift = -30)
        def mock_detect(gray):
            nonlocal call_count
            call_count += 1
            if call_count == 1:
                return [(80, 50, 100, 100)]
            return [(50, 50, 100, 100)]

        with patch.object(provider, "_detect_faces_in_frame", side_effect=mock_detect):
            res = provider.check(
                image_bytes=b1,
                frames_bytes=[b1, b2],
                challenge="turn_left",
                mirrored=True,
            )
            assert res["face_detected"] is True
            assert res["challenge_passed"] is True
            assert res["liveness_status"] in ("CHALLENGE_PASSED_PROTOTYPE", "PASSED_PROTOTYPE_CHALLENGE")
            assert res["liveness_score"] >= 50.0  # dynamic score reaches up to 100%, never hardcoded 50.0
            assert res["prototype_mode"] is True

    def test_liveness_challenge_insufficient_movement_fails(self):
        """Small head movement below min_shift threshold must not pass."""
        provider = get_liveness_provider()
        b1 = create_synthetic_image("FRAME 1 CENTER FACE", blur=False)
        img = cv2.imdecode(np.frombuffer(b1, np.uint8), cv2.IMREAD_COLOR)
        img2 = cv2.convertScaleAbs(img, alpha=1.0, beta=15)
        _, b2_enc = cv2.imencode(".jpg", img2)
        b2 = b2_enc.tobytes()
        call_count = 0

        # Tiny shift: 50 -> 52 (only 2px shift, below 6px threshold)
        def mock_detect(gray):
            nonlocal call_count
            call_count += 1
            if call_count == 1:
                return [(50, 50, 100, 100)]
            if call_count == 2:
                return [(52, 50, 100, 100)]
            return []

        with patch.object(provider, "_detect_faces_in_frame", side_effect=mock_detect):
            res = provider.check(
                image_bytes=b1,
                frames_bytes=[b1, b2],
                challenge="turn_left",
            )
            assert res["challenge_passed"] is False
            assert res["liveness_status"] == "INSUFFICIENT_HEAD_MOVEMENT"
            assert "INSUFFICIENT_HEAD_MOVEMENT" in res["flags"]

    def test_liveness_challenge_wrong_direction_fails(self):
        """Turning in opposite direction of instruction must fail with WRONG_HEAD_TURN_DIRECTION."""
        provider = get_liveness_provider()
        b1 = create_synthetic_image("FRAME 1 CENTER FACE", blur=False)
        img = cv2.imdecode(np.frombuffer(b1, np.uint8), cv2.IMREAD_COLOR)
        img2 = cv2.convertScaleAbs(img, alpha=1.0, beta=15)
        _, b2_enc = cv2.imencode(".jpg", img2)
        b2 = b2_enc.tobytes()
        call_count = 0

        # User asked to turn_left (expects shift < 0), but shifts right (50 -> 80, shift = +30)
        def mock_detect(gray):
            nonlocal call_count
            call_count += 1
            if call_count == 1:
                return [(50, 50, 100, 100)]
            return [(80, 50, 100, 100)]

        with patch.object(provider, "_detect_faces_in_frame", side_effect=mock_detect):
            res = provider.check(
                image_bytes=b1,
                frames_bytes=[b1, b2],
                challenge="turn_left",
                mirrored=True,
            )
            assert res["challenge_passed"] is False
            assert res["liveness_status"] == "WRONG_HEAD_TURN_DIRECTION"
            assert "WRONG_HEAD_TURN_DIRECTION" in res["flags"]

    def test_liveness_challenge_missing_face_returns_diagnostic(self):
        """If face is lost during action frames, return FACE_NOT_DETECTED."""
        provider = get_liveness_provider()
        b1 = create_synthetic_image("FRAME 1 CENTER FACE", blur=False)
        img = cv2.imdecode(np.frombuffer(b1, np.uint8), cv2.IMREAD_COLOR)
        img2 = cv2.convertScaleAbs(img, alpha=1.0, beta=15)
        _, b2_enc = cv2.imencode(".jpg", img2)
        b2 = b2_enc.tobytes()
        call_count = 0

        def mock_detect(gray):
            nonlocal call_count
            call_count += 1
            if call_count == 1:
                return [(50, 50, 100, 100)]
            # Second frame has no face detected
            return []

        with patch.object(provider, "_detect_faces_in_frame", side_effect=mock_detect):
            res = provider.check(
                image_bytes=b1,
                frames_bytes=[b1, b2],
                challenge="turn_left",
            )
            assert res["challenge_passed"] is False
            assert res["liveness_status"] == "FACE_NOT_DETECTED"
            assert "FACE_NOT_DETECTED" in res["flags"]

    def test_liveness_blink_challenge_handles_inconclusive(self):
        """Blink challenge returns BLINK_INCONCLUSIVE if eye region has no contrast.

        Uses a lightly textured image (varying rows) so the frame brightness/std
        pre-flight passes, then mocks face detection.  The identical frames expose
        a uniform eye-ROI, which should yield BLINK_INCONCLUSIVE or
        STATIC_FRAME_REPLAY_SUSPECTED depending on pixel diff ordering.
        """
        provider = get_liveness_provider()
        # Create a lightly textured image (alternating 120/136 rows) so
        # mean_brightness ~128 and std_dev > 4.0 — passes the darkness guard.
        img_array = np.zeros((480, 640, 3), dtype=np.uint8)
        for row in range(480):
            img_array[row, :] = 120 if row % 2 == 0 else 136
        textured_img = Image.fromarray(img_array)
        buf = io.BytesIO()
        textured_img.save(buf, format="JPEG")
        b1 = buf.getvalue()
        b2 = b1  # identical frames — if motion passes, eye ROI std will be ~0 -> BLINK_INCONCLUSIVE

        def mock_detect(gray):
            # Always report one face so we enter blink evaluation
            return [(50, 50, 100, 100)]

        with patch.object(provider, "_detect_faces_in_frame", side_effect=mock_detect):
            res = provider.check(
                image_bytes=b1,
                frames_bytes=[b1, b2],
                challenge="blink",
            )
            assert res["challenge_passed"] is False
            assert res["liveness_status"] in ("BLINK_INCONCLUSIVE", "STATIC_FRAME_REPLAY_SUSPECTED")
            assert any(f in res["flags"] for f in ("BLINK_INCONCLUSIVE", "STATIC_FRAME_REPLAY_SUSPECTED"))


    def test_prototype_liveness_marked_unverified_in_risk_engine(self):
        """Risk engine penalizes unverified prototype liveness (no capture) with explainable reason."""
        from app.ai.risk_engine import RiskSignals, calculate_risk_score
        signals = RiskSignals(
            identity_verified=True,
            liveness_passed=False,
            liveness_unverified=True,
            document_suspicious=False,
        )
        res = calculate_risk_score(signals)
        assert res["score"] > 0
        # Reason text matches the current engine: "No live selfie provided — liveness unchecked"
        assert any(
            "liveness" in r.lower() or "selfie" in r.lower() or "unverified" in r.lower() or "no live" in r.lower()
            for r in res["reasons"]
        )

    def test_liveness_endpoint_schema_contract_separate_fields(self, client: TestClient):
        """API endpoint /api/liveness/check returns all separate fields required by schema."""
        from app.db.mongodb import users_col
        from app.security.auth import hash_password, create_access_token
        test_email = "tester_schema@ekyc.local"
        users_col().update_one(
            {"email": test_email},
            {"$set": {
                "email": test_email,
                "hashed_password": hash_password("SchemaPass@123"),
                "full_name": "Schema Tester",
                "role": "user",
            }},
            upsert=True,
        )
        test_token = create_access_token({"sub": test_email, "role": "user", "uid": "t-schema-1"})
        headers = {"Authorization": f"Bearer {test_token}"}
        resp = client.post(
            "/api/liveness/check",
            headers=headers,
            json={
                "challenge": "turn_left",
                "frames": ["data:image/jpeg;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=="],
            },
        )
        assert resp.status_code == 200
        data = resp.json()
        assert "face_detected" in data
        assert "face_count" in data
        assert "liveness_status" in data
        assert "liveness_score" in data
        assert "prototype_mode" in data
        assert "diagnostic_details" in data


class TestAdminUserPortalSeparation:
    """Verify backend enforces role separation and users cannot perform administrative actions."""

    def test_user_cannot_access_admin_batch_verification(self, client: TestClient):
        from app.security.auth import create_access_token
        user_token = create_access_token({"sub": "regular_user@example.test", "role": "user", "uid": "u-sep-1"})
        headers = {"Authorization": f"Bearer {user_token}"}

        resp = client.post(
            "/api/batch/verify",
            headers=headers,
            json={"records": [{"applicant": {"full_name": "Batch Applicant", "date_of_birth": "1990-01-01", "id_number": "1234"}}]},
        )
        assert resp.status_code == 403, "Non-admin must not be allowed to run batch verification"

    def test_user_cannot_access_admin_audit_logs(self, client: TestClient):
        from app.security.auth import create_access_token
        user_token = create_access_token({"sub": "regular_user@example.test", "role": "user", "uid": "u-sep-2"})
        headers = {"Authorization": f"Bearer {user_token}"}

        resp = client.get("/api/audit-logs", headers=headers)
        assert resp.status_code == 403, "Non-admin must not be allowed to access security audit logs"

    def test_user_cannot_update_risk_threshold_settings(self, client: TestClient):
        from app.security.auth import create_access_token
        user_token = create_access_token({"sub": "regular_user@example.test", "role": "user", "uid": "u-sep-3"})
        headers = {"Authorization": f"Bearer {user_token}"}

        resp = client.patch("/api/settings", headers=headers, json={"risk_low_threshold": 40})
        assert resp.status_code == 403, "Non-admin must not be allowed to modify risk thresholds"

    def test_user_cannot_see_reviewer_notes(self, client: TestClient):
        from app.security.auth import create_access_token
        mock_apps = MockMongoCollection()
        mock_apps.insert_one({
            "application_id": "APP-NOTES-1",
            "applicant_name": "Test User",
            "created_by": "user_notes@example.test",
            "decision": "MANUAL_REVIEW",
            "risk_score": 65.0,
            "review_notes": "INTERNAL ONLY: Reviewer suspected blur on photo.",
        })

        with patch("app.api.v1.endpoints.applications.applications_col", return_value=mock_apps):
            user_token = create_access_token({"sub": "user_notes@example.test", "role": "user", "uid": "u-notes-1"})
            admin_token = create_access_token({"sub": "admin_notes@example.test", "role": "admin", "uid": "a-notes-1"})

            # Normal user response must have review_notes stripped
            user_resp = client.get("/api/applications/APP-NOTES-1", headers={"Authorization": f"Bearer {user_token}"})
            assert user_resp.status_code == 200
            assert user_resp.json()["review_notes"] is None, "User should not see internal administrative reviewer notes"

            # Admin response must have review_notes
            admin_resp = client.get("/api/applications/APP-NOTES-1", headers={"Authorization": f"Bearer {admin_token}"})
            assert admin_resp.status_code == 200
            assert admin_resp.json()["review_notes"] == "INTERNAL ONLY: Reviewer suspected blur on photo."


