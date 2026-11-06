"""
MOSIP Integration Adapter.

This module provides a provider interface for MOSIP identity verification (IDA).
When MOSIP_BASE_URL is not configured it automatically uses the MockMosipProvider,
which clearly labels all responses as simulated.

Official MOSIP Documentation references:
- https://docs.mosip.io/
- https://docs.mosip.io/1.2.0/integrations/mosip-token-seeder
- https://docs.mosip.io/1.2.0/modules/id-authentication

IMPORTANT: A simulated result is NOT equivalent to a real MOSIP verification.
Never report simulated responses as genuine MOSIP verification.
"""
from __future__ import annotations
import logging
import hashlib
import uuid
from abc import ABC, abstractmethod
from datetime import datetime, timezone
from typing import Optional
import urllib.request
import urllib.error
import json

from app.core.config import get_settings

logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# Provider interface
# ---------------------------------------------------------------------------

class MosipProvider(ABC):
    @abstractmethod
    def verify_identity(self, applicant: dict) -> dict:
        """Verify applicant demographic identity against MOSIP IDA."""
        ...

    @abstractmethod
    def get_transaction_status(self, transaction_id: str) -> dict:
        """Query verification transaction status."""
        ...


# ---------------------------------------------------------------------------
# Mock provider — for local development and demonstration only
# ---------------------------------------------------------------------------

class MockMosipProvider(MosipProvider):
    """
    Simulated MOSIP verification for local sandbox and testing.
    Clearly labeled as simulated prototype mode.
    """

    def verify_identity(self, applicant: dict) -> dict:
        name: str = applicant.get("full_name", "")
        id_number: str = applicant.get("id_number", "")
        dob: str = applicant.get("date_of_birth", "")
        txn_id = "MOSIP-MOCK-" + uuid.uuid4().hex[:12].upper()

        # Deterministic simulation based on input
        checksum = int(hashlib.md5((name + id_number + dob).encode()).hexdigest(), 16)
        verified = checksum % 10 > 1  # ~80 % pass rate in simulation

        return {
            "provider": "MOCK_MOSIP",
            "verified": verified,
            "match_score": 0.88 if verified else 0.25,
            "transaction_id": txn_id,
            "timestamp": datetime.now(timezone.utc).isoformat(),
            "simulated": True,
            "status": "SUCCESS" if verified else "FAILED",
            "note": (
                "SIMULATED response — not a real MOSIP verification. "
                "Configure MOSIP_BASE_URL, MOSIP_PARTNER_ID, and MOSIP_API_KEY in backend/.env to connect to real MOSIP services."
            ),
        }

    def get_transaction_status(self, transaction_id: str) -> dict:
        return {
            "provider": "MOCK_MOSIP",
            "transaction_id": transaction_id,
            "status": "COMPLETED",
            "simulated": True,
            "note": "Simulated transaction status lookup.",
        }


# ---------------------------------------------------------------------------
# Real MOSIP Provider
# ---------------------------------------------------------------------------

class RealMosipProvider(MosipProvider):
    """
    Genuine MOSIP IDA Integration.
    Connects to MOSIP Identity Authentication endpoint as documented in:
    https://docs.mosip.io/1.2.0/modules/id-authentication
    """

    def __init__(self):
        settings = get_settings()
        self.base_url = settings.mosip_base_url.rstrip("/") if settings.mosip_base_url else ""
        self.partner_id = settings.mosip_partner_id
        self.api_key = settings.mosip_api_key

    def verify_identity(self, applicant: dict) -> dict:
        if not self.base_url:
            raise ValueError("MOSIP_BASE_URL is not configured in environment.")

        txn_id = "MOSIP-TXN-" + uuid.uuid4().hex[:12].upper()
        now_iso = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%S.%f")[:-3] + "Z"

        url = f"{self.base_url}/idauthentication/v1/auth/{self.partner_id}"
        payload = {
            "id": "mosip.identity.auth",
            "version": "1.0",
            "requestTime": now_iso,
            "transactionID": txn_id,
            "request": {
                "individualId": applicant.get("id_number", ""),
                "individualIdType": "UIN" if applicant.get("id_type") == "aadhaar" else "VID",
                "demographics": {
                    "name": [{"language": "eng", "value": applicant.get("full_name", "")}],
                    "dob": applicant.get("date_of_birth", ""),
                    "gender": [{"language": "eng", "value": applicant.get("gender", "")}],
                },
            },
        }

        req = urllib.request.Request(
            url,
            data=json.dumps(payload).encode("utf-8"),
            headers={
                "Content-Type": "application/json",
                "Authorization": f"Bearer {self.api_key}",
                "X-Partner-ID": self.partner_id,
            },
            method="POST",
        )

        try:
            with urllib.request.urlopen(req, timeout=10.0) as resp:
                data = json.loads(resp.read().decode("utf-8"))
                auth_status = data.get("response", {}).get("authStatus", False)
                return {
                    "provider": "REAL_MOSIP",
                    "verified": bool(auth_status),
                    "match_score": 1.0 if auth_status else 0.0,
                    "transaction_id": txn_id,
                    "timestamp": now_iso,
                    "simulated": False,
                    "status": "SUCCESS" if auth_status else "FAILED",
                    "note": "Verified via live MOSIP IDA service.",
                }
        except urllib.error.HTTPError as exc:
            error_body = exc.read().decode("utf-8") if exc.fp else ""
            logger.error("MOSIP IDA HTTP error: %s (%s)", exc.code, error_body)
            return {
                "provider": "REAL_MOSIP",
                "verified": False,
                "match_score": 0.0,
                "transaction_id": txn_id,
                "timestamp": now_iso,
                "simulated": False,
                "status": "ERROR",
                "note": f"MOSIP IDA error (HTTP {exc.code}): {error_body[:200]}",
            }
        except Exception as exc:
            logger.error("MOSIP IDA connection failure: %s", exc)
            return {
                "provider": "REAL_MOSIP",
                "verified": False,
                "match_score": 0.0,
                "transaction_id": txn_id,
                "timestamp": now_iso,
                "simulated": False,
                "status": "CONNECTION_FAILED",
                "note": f"Could not connect to MOSIP cluster at {self.base_url}: {str(exc)}",
            }

    def get_transaction_status(self, transaction_id: str) -> dict:
        return {
            "provider": "REAL_MOSIP",
            "transaction_id": transaction_id,
            "status": "QUERY_PENDING",
            "simulated": False,
            "note": "Live transaction lookup interface.",
        }


# ---------------------------------------------------------------------------
# Factory
# ---------------------------------------------------------------------------

def get_mosip_provider() -> MosipProvider:
    settings = get_settings()
    if settings.mosip_base_url and settings.mosip_partner_id:
        return RealMosipProvider()
    return MockMosipProvider()
