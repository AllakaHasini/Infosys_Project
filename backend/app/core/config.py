from functools import lru_cache
from pydantic_settings import BaseSettings, SettingsConfigDict

class Settings(BaseSettings):
    """Application configuration loaded from environment variables / .env file."""

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        case_sensitive=False,
        extra="ignore",
    )

    # Application
    app_name: str = "eKYC Risk Intelligence"
    app_version: str = "1.0.0"
    debug: bool = False
    secret_key: str = "CHANGE_ME_USE_A_LONG_RANDOM_STRING_AT_LEAST_32_CHARS"
    algorithm: str = "HS256"
    access_token_expire_minutes: int = 60

    # MongoDB
    mongodb_uri: str = "mongodb://127.0.0.1:27017"
    mongodb_database: str = "ekyc_risk_intelligence"

    # CORS
    frontend_origin: str = "http://localhost:5173"
    cors_origins: str = "http://localhost:5173,http://127.0.0.1:5173"
    allow_private_network_cors: bool = True

    @property
    def parsed_cors_origins(self) -> list[str]:
        origins: list[str] = []
        if self.frontend_origin and self.frontend_origin.strip():
            origins.append(self.frontend_origin.strip())
        if self.cors_origins:
            for item in self.cors_origins.split(","):
                cleaned = item.strip()
                if cleaned and cleaned not in origins:
                    origins.append(cleaned)
        return origins

    # Admin Seed
    admin_email: str = "admin@ekyc.local"
    admin_password: str = "ChangeMe123!"

    # MOSIP integration (empty = use mock)
    mosip_base_url: str = ""
    mosip_partner_id: str = ""
    mosip_api_key: str = ""

    # eSignet / OIDC (empty = use mock)
    esignet_base_url: str = ""
    esignet_client_id: str = ""
    esignet_client_secret: str = ""
    esignet_redirect_uri: str = "http://localhost:5173/auth/callback"

    # Risk thresholds
    risk_low_threshold: int = 30
    risk_medium_threshold: int = 60
    risk_high_threshold: int = 80

    # Upload
    max_upload_size_mb: int = 10

    # Batch
    max_batch_size: int = 50

    # Liveness Challenge Thresholds
    liveness_head_turn_min_shift_px: float = 6.0
    liveness_static_replay_max_diff: float = 2.0
    liveness_frame_margin: int = 10

@lru_cache()
def get_settings() -> Settings:
    return Settings()
