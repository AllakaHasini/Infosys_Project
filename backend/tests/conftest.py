"""
Pytest configuration and shared fixtures.
Uses an in-memory or test-isolated MongoDB namespace.
"""
import pytest
from fastapi.testclient import TestClient
from unittest.mock import patch, MagicMock


@pytest.fixture(scope="session")
def mock_mongo():
    """Patch MongoDB so tests don't require a live database."""
    with patch("app.db.mongodb.get_client") as mock_client, \
         patch("app.db.mongodb.check_connection", return_value={"status": "connected"}), \
         patch("app.db.mongodb.create_indexes"):
        mock_db = MagicMock()
        mock_client.return_value.__getitem__.return_value = mock_db
        yield mock_db


@pytest.fixture(scope="session")
def client(mock_mongo):
    import sys, os
    sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
    os.environ.setdefault("SECRET_KEY", "test-secret-key-for-pytest-only")
    os.environ.setdefault("MONGODB_URI", "mongodb://127.0.0.1:27017")
    os.environ.setdefault("MONGODB_DATABASE", "ekyc_test")
    from app.main import app
    with TestClient(app) as c:
        yield c
