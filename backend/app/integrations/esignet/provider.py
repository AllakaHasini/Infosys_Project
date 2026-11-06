"""
eSignet / OIDC Authentication Adapter.

Provides OIDC-compliant authentication integration for MOSIP eSignet.
Reference:
- https://github.com/mosip/esignet
- https://docs.esignet.io/

If credentials or staging services are unavailable, retains a clearly labelled mock provider.
Never reports simulated responses as genuine eSignet authentication.
"""
from __future__ import annotations
import logging
import hashlib
import uuid
from abc import ABC, abstractmethod
from typing import Optional
from datetime import datetime, timezone
import urllib.request
import urllib.parse
import urllib.error
import json

from app.core.config import get_settings

logger = logging.getLogger(__name__)


class ESignetProvider(ABC):
    @abstractmethod
    def authenticate(self, token: str | None) -> dict:
        """Authenticate token / code and return claims."""
        ...

    @abstractmethod
    def get_authorization_url(self) -> str:
        """Construct OIDC Authorization Request URL."""
        ...

    @abstractmethod
    def exchange_code_for_token(self, code: str) -> dict:
        """Exchange auth code for ID token and access token."""
        ...


class MockESignetProvider(ESignetProvider):
    """
    Simulated eSignet authentication for local demonstration and testing.
    This is NOT a real OIDC authentication flow.
    """

    def authenticate(self, token: Optional[str]) -> dict:
        txn_id = "ESIGNET-MOCK-" + uuid.uuid4().hex[:12].upper()
        return {
            "provider": "MOCK_ESIGNET",
            "authenticated": True,
            "subject": "MOCK_SUB_" + (token[:8] if token else "DEMO"),
            "transaction_id": txn_id,
            "timestamp": datetime.now(timezone.utc).isoformat(),
            "simulated": True,
            "claims": {
                "name": "Synthetic eSignet User",
                "email": "esignet.demo@example.test",
                "phone_number": "+91 99999 00000",
            },
            "note": (
                "SIMULATED eSignet authentication. "
                "Configure ESIGNET_BASE_URL, ESIGNET_CLIENT_ID, and ESIGNET_CLIENT_SECRET for genuine OIDC authentication."
            ),
        }

    def get_authorization_url(self) -> str:
        return "http://localhost:5173/auth/mock-callback?code=MOCK_CODE"

    def exchange_code_for_token(self, code: str) -> dict:
        return {
            "access_token": "mock_esignet_access_token_" + uuid.uuid4().hex[:8],
            "id_token": "mock_esignet_id_token_" + uuid.uuid4().hex[:8],
            "token_type": "Bearer",
            "expires_in": 3600,
            "simulated": True,
        }


class RealESignetProvider(ESignetProvider):
    """
    Genuine eSignet OIDC integration.
    """

    def __init__(self):
        settings = get_settings()
        self.base_url = settings.esignet_base_url.rstrip("/") if settings.esignet_base_url else ""
        self.client_id = settings.esignet_client_id
        self.client_secret = settings.esignet_client_secret
        self.redirect_uri = settings.esignet_redirect_uri

    def get_authorization_url(self) -> str:
        state = uuid.uuid4().hex
        nonce = uuid.uuid4().hex
        params = {
            "client_id": self.client_id,
            "response_type": "code",
            "scope": "openid profile email",
            "redirect_uri": self.redirect_uri,
            "state": state,
            "nonce": nonce,
        }
        return f"{self.base_url}/authorize?{urllib.parse.urlencode(params)}"

    def exchange_code_for_token(self, code: str) -> dict:
        if not self.base_url:
            raise ValueError("ESIGNET_BASE_URL is not configured.")

        url = f"{self.base_url}/oauth/v2/token"
        data = urllib.parse.urlencode({
            "grant_type": "authorization_code",
            "code": code,
            "redirect_uri": self.redirect_uri,
            "client_id": self.client_id,
            "client_secret": self.client_secret,
        }).encode("utf-8")

        req = urllib.request.Request(
            url,
            data=data,
            headers={"Content-Type": "application/x-www-form-urlencoded"},
            method="POST",
        )
        try:
            with urllib.request.urlopen(req, timeout=10.0) as resp:
                return json.loads(resp.read().decode("utf-8"))
        except Exception as exc:
            logger.error("eSignet token exchange error: %s", exc)
            return {"error": str(exc), "simulated": False}

    def authenticate(self, token: str | None) -> dict:
        if not token or not self.base_url:
            return {
                "provider": "REAL_ESIGNET",
                "authenticated": False,
                "error": "No token provided or ESIGNET_BASE_URL not configured.",
                "simulated": False,
            }

        url = f"{self.base_url}/oidc/userinfo"
        req = urllib.request.Request(
            url,
            headers={"Authorization": f"Bearer {token}"},
            method="GET",
        )
        try:
            with urllib.request.urlopen(req, timeout=10.0) as resp:
                claims = json.loads(resp.read().decode("utf-8"))
                return {
                    "provider": "REAL_ESIGNET",
                    "authenticated": True,
                    "subject": claims.get("sub"),
                    "claims": claims,
                    "simulated": False,
                    "note": "Authenticated via genuine eSignet OIDC provider.",
                }
        except Exception as exc:
            logger.error("eSignet userinfo error: %s", exc)
            return {
                "provider": "REAL_ESIGNET",
                "authenticated": False,
                "error": str(exc),
                "simulated": False,
            }


def get_esignet_provider() -> ESignetProvider:
    settings = get_settings()
    if settings.esignet_base_url and settings.esignet_client_id:
        return RealESignetProvider()
    return MockESignetProvider()
