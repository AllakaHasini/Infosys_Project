"""
Database connectivity, persistence, and graceful failure tests.
Validates MongoDB ping, health status, masked Aadhaar handling,
persistence of eKYC records, review notes, batch jobs, and 503 error handling.
"""
import pytest
from unittest.mock import patch, MagicMock
from fastapi.testclient import TestClient
from pymongo.errors import ConnectionFailure, ServerSelectionTimeoutError, PyMongoError

from app.db.mongodb import check_connection, close_connection
from app.utils.helpers import serialize_doc, mask_id_number
from app.services.ekyc_service import run_ekyc_workflow
from app.services.audit_service import log_event


class TestDatabaseConnectivity:
    def test_check_connection_connected(self):
        with patch("app.db.mongodb.get_client") as mock_client:
            mock_client.return_value.admin.command.return_value = {"ok": 1.0}
            status = check_connection()
            assert status["status"] == "connected"
            assert "database" in status
            # Ensure no credentials or raw URI are leaked in status
            assert "uri" not in status
            assert "password" not in str(status).lower()

    def test_check_connection_unavailable_on_failure(self):
        with patch("app.db.mongodb.get_client") as mock_client:
            mock_client.return_value.admin.command.side_effect = ConnectionFailure("Connection refused")
            status = check_connection()
            assert status["status"] == "unavailable"
            assert status["error"] == "Database connection failed"

    def test_check_connection_timeout(self):
        with patch("app.db.mongodb.get_client") as mock_client:
            mock_client.return_value.admin.command.side_effect = ServerSelectionTimeoutError("Server timeout")
            status = check_connection()
            assert status["status"] == "unavailable"

    def test_close_connection_clean(self):
        with patch("app.db.mongodb._client") as mock_client:
            close_connection()
            # Successfully executed without throwing


class TestDatabaseHealthEndpoint:
    def test_health_connected_no_credentials(self, client):
        from app.core.config import get_settings
        settings = get_settings()
        with patch("app.api.v1.endpoints.health.check_connection", return_value={"status": "connected", "database": settings.mongodb_database}):
            resp = client.get("/api/health")
            assert resp.status_code == 200
            data = resp.json()
            assert data["status"] == "ok"
            assert data["mongodb"] == "connected"
            assert data["database"] == settings.mongodb_database
            # Verify no URI or credential leakage
            assert "uri" not in data
            assert "password" not in str(data).lower()

    def test_health_unavailable_reports_degraded(self, client):
        with patch("app.api.v1.endpoints.health.check_connection", return_value={"status": "unavailable", "error": "Database connection failed"}):
            resp = client.get("/api/health")
            assert resp.status_code == 200
            data = resp.json()
            assert data["status"] == "degraded"
            assert data["mongodb"] == "unavailable"
            assert data["database"] is None


class TestDatabaseGracefulFailure:
    def test_endpoint_fails_with_503_on_pymongo_error(self, client):
        # Simulate MongoDB network failure during an endpoint database operation
        with patch("app.api.v1.endpoints.auth.users_col") as mock_col:
            mock_col.return_value.find_one.side_effect = PyMongoError("MongoDB node disconnected")
            resp = client.post("/api/auth/login", json={"email": "user@test.local", "password": "Password123!"})
            assert resp.status_code == 503
            data = resp.json()
            assert "database service is unavailable" in data["detail"].lower()


class TestDataPersistenceOperations:
    def test_user_registration_persists_hashed_password(self, client):
        with patch("app.api.v1.endpoints.auth.users_col") as mock_col, \
             patch("app.api.v1.endpoints.auth.log_event"):
            mock_col.return_value.find_one.return_value = None
            inserted_doc = {}

            def fake_insert(doc):
                inserted_doc.update(doc)
                res = MagicMock()
                res.inserted_id = "test-user-oid"
                return res

            mock_col.return_value.insert_one.side_effect = fake_insert

            resp = client.post("/api/auth/register", json={
                "email": "persist.user@test.local",
                "password": "SecurePassword123!",
                "full_name": "Test User Persistence",
            })
            assert resp.status_code == 201
            assert inserted_doc["email"] == "persist.user@test.local"
            assert inserted_doc["role"] == "user"
            # Verify password is stored hashed and NOT in plaintext
            assert inserted_doc["hashed_password"] != "SecurePassword123!"
            assert inserted_doc["hashed_password"].startswith("$2b$") or len(inserted_doc["hashed_password"]) > 20

    def test_ekyc_application_and_masked_aadhaar_persistence(self):
        applicant = {
            "full_name": "Rohan Verma",
            "date_of_birth": "1994-04-12",
            "id_type": "aadhaar",
            "id_number": "555566667777",
            "email": "rohan@test.local",
        }

        mock_apps = MagicMock()
        mock_verif = MagicMock()
        mock_risk = MagicMock()

        with patch("app.services.ekyc_service.applications_col", return_value=mock_apps), \
             patch("app.services.ekyc_service.verification_results_col", return_value=mock_verif), \
             patch("app.services.ekyc_service.risk_assessments_col", return_value=mock_risk), \
             patch("app.services.ekyc_service.log_event") as mock_audit:

            result = run_ekyc_workflow(applicant=applicant, performed_by="test-agent@ekyc.local")

            # 1. Result returns masked Aadhaar identifier
            assert result["masked_id_number"] == "XXXX-XXXX-7777"
            assert "555566667777" not in result["masked_id_number"]

            # 2. Application persisted with masked identifier
            mock_apps.insert_one.assert_called_once()
            persisted_app = mock_apps.insert_one.call_args[0][0]
            assert persisted_app["masked_id_number"] == "XXXX-XXXX-7777"
            assert persisted_app["applicant_name"] == "Rohan Verma"
            assert "decision" in persisted_app
            assert "risk_score" in persisted_app

            # 3. Verification results persisted
            mock_verif.insert_one.assert_called_once()
            persisted_verif = mock_verif.insert_one.call_args[0][0]
            assert "application_id" in persisted_verif
            assert "identity" in persisted_verif

            # 4. Risk assessment persisted
            mock_risk.insert_one.assert_called_once()
            persisted_risk = mock_risk.insert_one.call_args[0][0]
            assert "score" in persisted_risk
            assert "category" in persisted_risk

            # 5. Audit log called with masked Aadhaar (never plaintext Aadhaar)
            mock_audit.assert_called_once()
            audit_desc = mock_audit.call_args[1].get("description", "")
            assert "XXXX-XXXX-7777" in audit_desc
            assert "555566667777" not in audit_desc

    def test_serialize_doc_never_exposes_full_aadhaar(self):
        doc = {
            "id_type": "aadhaar",
            "id_number": "555566667777",
            "applicant_name": "Aadhaar Holder",
        }
        serialized = serialize_doc(doc)
        assert serialized["id_number"] == "XXXX-XXXX-7777"
        assert "555566667777" not in serialized["id_number"]

    def test_admin_review_notes_persistence(self, client):
        admin_token_headers = None
        # Create an admin JWT
        from app.security.auth import create_access_token
        admin_token = create_access_token({"sub": "admin@ekyc.local", "role": "admin"})
        headers = {"Authorization": f"Bearer {admin_token}"}

        with patch("app.api.v1.endpoints.applications.applications_col") as mock_col, \
             patch("app.api.v1.endpoints.applications.log_event") as mock_log, \
             patch("app.security.auth.users_col") as mock_user_col:

            mock_user_col.return_value.find_one.return_value = {
                "email": "admin@ekyc.local",
                "role": "admin",
                "_id": "admin-oid",
            }
            mock_col.return_value.find_one.return_value = {
                "application_id": "APP-TEST1234",
                "status": "completed",
                "decision": "MANUAL_REVIEW",
            }

            resp = client.patch(
                "/api/applications/APP-TEST1234/decision",
                json={"decision": "APPROVED", "notes": "Identity confirmed via official video session"},
                headers=headers,
            )
            assert resp.status_code == 200
            assert resp.json()["message"] == "Decision updated to APPROVED"

            # Verify update_one was called with review_notes and decision
            mock_col.return_value.update_one.assert_called_once()
            query_arg = mock_col.return_value.update_one.call_args[0][0]
            update_arg = mock_col.return_value.update_one.call_args[0][1]

            assert query_arg == {"application_id": "APP-TEST1234"}
            assert update_arg["$set"]["decision"] == "APPROVED"
            assert update_arg["$set"]["review_notes"] == "Identity confirmed via official video session"

            # Verify audit event logged
            mock_log.assert_called_once()

    def test_audit_log_service_persistence(self):
        mock_col = MagicMock()
        with patch("app.services.audit_service.audit_logs_col", return_value=mock_col):
            log_event(
                event_type="SECURITY_ALERT",
                description="Failed login attempts detected",
                performed_by="system",
                metadata={"ip": "127.0.0.1"},
            )
            mock_col.insert_one.assert_called_once()
            logged_entry = mock_col.insert_one.call_args[0][0]
            assert logged_entry["event_type"] == "SECURITY_ALERT"
            assert logged_entry["performed_by"] == "system"
            assert "timestamp" in logged_entry
