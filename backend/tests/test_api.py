"""
API integration tests — health, auth, and application endpoints.
"""
import pytest
import sys, os
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from unittest.mock import patch, MagicMock
from fastapi.testclient import TestClient

os.environ["SECRET_KEY"] = "test-secret-for-api-tests"
os.environ["MONGODB_URI"] = "mongodb://127.0.0.1:27017"
os.environ["MONGODB_DATABASE"] = "ekyc_test"
os.environ["ADMIN_EMAIL"] = "test@ekyc.local"
os.environ["ADMIN_PASSWORD"] = "TestPass123"


def make_client():
    with patch("app.db.mongodb.get_client") as mc, \
         patch("app.db.mongodb.check_connection", return_value={"status": "connected"}), \
         patch("app.db.mongodb.create_indexes"):
        mock_db = MagicMock()
        mc.return_value.__getitem__.return_value = mock_db
        from app.main import app
        return TestClient(app), mock_db


class TestHealthEndpoint:
    def test_health_returns_200(self):
        with patch("app.api.v1.endpoints.health.check_connection", return_value={"status": "connected"}), \
             patch("app.db.mongodb.get_client"), \
             patch("app.db.mongodb.create_indexes"):
            from app.main import app
            with TestClient(app) as c:
                resp = c.get("/api/health")
        assert resp.status_code == 200
        data = resp.json()
        assert "status" in data
        assert "mongodb" in data

    def test_health_mongodb_degraded(self):
        with patch("app.api.v1.endpoints.health.check_connection", return_value={"status": "unavailable", "error": "refused"}), \
             patch("app.db.mongodb.get_client"), \
             patch("app.db.mongodb.create_indexes"):
            from app.main import app
            with TestClient(app) as c:
                resp = c.get("/api/health")
        assert resp.status_code == 200
        data = resp.json()
        assert data["mongodb"] == "unavailable"
        assert data["status"] == "degraded"


class TestAuthEndpoint:
    def test_login_invalid_credentials_401(self):
        with patch("app.db.mongodb.check_connection", return_value={"status": "connected"}), \
             patch("app.db.mongodb.get_client"), \
             patch("app.db.mongodb.create_indexes"), \
             patch("app.api.v1.endpoints.auth.users_col") as mock_col:
            mock_col.return_value.find_one.return_value = None
            from app.main import app
            with TestClient(app) as c:
                resp = c.post("/api/auth/login", json={"email": "bad@x.com", "password": "wrongpass"})
        assert resp.status_code == 401

    def test_login_valid_returns_token(self):
        from app.security.auth import hash_password
        hashed = hash_password("TestPass123")
        with patch("app.db.mongodb.check_connection", return_value={"status": "connected"}), \
             patch("app.db.mongodb.get_client"), \
             patch("app.db.mongodb.create_indexes"), \
             patch("app.api.v1.endpoints.auth.users_col") as mock_col, \
             patch("app.api.v1.endpoints.auth.log_event"):
            mock_col.return_value.find_one.return_value = {
                "email": "admin@ekyc.local", "hashed_password": hashed, "role": "admin"
            }
            from app.main import app
            with TestClient(app) as c:
                resp = c.post("/api/auth/login",
                              json={"email": "admin@ekyc.local", "password": "TestPass123"})
        assert resp.status_code == 200
        assert "access_token" in resp.json()


class TestApplicationsEndpoint:
    def test_list_applications_requires_auth(self):
        with patch("app.db.mongodb.check_connection", return_value={"status": "connected"}), \
             patch("app.db.mongodb.get_client"), \
             patch("app.db.mongodb.create_indexes"):
            from app.main import app
            with TestClient(app) as c:
                resp = c.get("/api/applications")
        assert resp.status_code == 401

    def test_audit_logs_requires_admin(self):
        with patch("app.db.mongodb.check_connection", return_value={"status": "connected"}), \
             patch("app.db.mongodb.get_client"), \
             patch("app.db.mongodb.create_indexes"):
            from app.main import app
            with TestClient(app) as c:
                resp = c.get("/api/audit-logs")
        assert resp.status_code == 401
