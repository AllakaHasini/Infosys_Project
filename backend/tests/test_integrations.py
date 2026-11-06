"""
Tests for MOSIP and eSignet mock providers.
"""
import pytest
import sys, os
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
os.environ.setdefault("SECRET_KEY", "test-secret-key-for-pytest-only")

from app.integrations.mosip.provider import MockMosipProvider, get_mosip_provider
from app.integrations.esignet.provider import MockESignetProvider, get_esignet_provider


class TestMockMosipProvider:
    def setup_method(self):
        self.provider = MockMosipProvider()

    def test_returns_dict(self):
        result = self.provider.verify_identity({"full_name": "Test User", "id_number": "T001", "date_of_birth": "1990-01-01"})
        assert isinstance(result, dict)

    def test_simulated_flag_true(self):
        result = self.provider.verify_identity({"full_name": "Test", "id_number": "X", "date_of_birth": "2000-01-01"})
        assert result["simulated"] is True

    def test_provider_label(self):
        result = self.provider.verify_identity({"full_name": "Test", "id_number": "X", "date_of_birth": "2000-01-01"})
        assert result["provider"] == "MOCK_MOSIP"

    def test_has_transaction_id(self):
        result = self.provider.verify_identity({"full_name": "Test", "id_number": "X", "date_of_birth": "2000-01-01"})
        assert "transaction_id" in result

    def test_deterministic(self):
        applicant = {"full_name": "Alice Test", "id_number": "DEMO123", "date_of_birth": "1985-05-05"}
        r1 = self.provider.verify_identity(applicant)
        r2 = self.provider.verify_identity(applicant)
        assert r1["verified"] == r2["verified"]

    def test_factory_returns_mock_by_default(self):
        p = get_mosip_provider()
        assert isinstance(p, MockMosipProvider)


class TestMockESignetProvider:
    def setup_method(self):
        self.provider = MockESignetProvider()

    def test_authenticate_returns_dict(self):
        result = self.provider.authenticate(None)
        assert isinstance(result, dict)

    def test_simulated_flag(self):
        result = self.provider.authenticate("some-token")
        assert result["simulated"] is True

    def test_authenticated_true(self):
        result = self.provider.authenticate(None)
        assert result["authenticated"] is True

    def test_factory_returns_mock(self):
        p = get_esignet_provider()
        assert isinstance(p, MockESignetProvider)
