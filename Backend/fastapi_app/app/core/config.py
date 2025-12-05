import os
from dataclasses import dataclass
from typing import List, Optional, Union


def _parse_bool(value: Optional[str]) -> bool:
    """Parse environment boolean values safely."""
    if value is None:
        return False
    return str(value).strip().lower() in {"1", "true", "yes", "y", "on"}


def _parse_cors_origins(raw: Optional[str]) -> Union[str, List[str]]:
    """
    Parse CORS origins from environment variable.

    - If raw is "*" or empty, return "*" to signal any origin.
    - Otherwise, split by comma and trim, ignoring empty entries.
    """
    if not raw:
        return "*"
    if raw.strip() == "*":
        return "*"
    return [part.strip() for part in raw.split(",") if part.strip()]


@dataclass(frozen=True)
class Settings:
    """
    PUBLIC_INTERFACE
    Environment-driven settings for the FastAPI app.

    This class intentionally avoids loading .env files directly. Values are
    read from the process environment to comply with environment-based configuration.
    """

    host: str
    port: int
    log_level: str
    node_env: str

    cors_origins: Union[str, List[str]]
    preview_mode: bool
    preview_frame_ancestors: str

    @staticmethod
    def load() -> "Settings":
        """
        Load settings from environment variables.

        - HOST (default: 0.0.0.0)
        - PORT (default: 3001)
        - LOG_LEVEL or REACT_APP_LOG_LEVEL (default: info)
        - NODE_ENV (default: development)
        - CORS_ORIGIN (default: *)
        - PREVIEW_MODE (default: false)
        - PREVIEW_FRAME_ANCESTORS (default: "'self' https://*.cloud.kavia.ai")
        """
        host = os.getenv("HOST", "0.0.0.0")
        port_raw = os.getenv("PORT", "3001") or "3001"
        try:
            port = int(port_raw)
            if not (0 < port <= 65535):
                port = 3001
        except ValueError:
            port = 3001

        log_level = os.getenv("REACT_APP_LOG_LEVEL") or os.getenv("LOG_LEVEL", "info")
        node_env = os.getenv("NODE_ENV", "development")

        cors_origins = _parse_cors_origins(os.getenv("CORS_ORIGIN", "*"))

        preview_mode = _parse_bool(os.getenv("PREVIEW_MODE"))
        preview_frame_ancestors = os.getenv(
            "PREVIEW_FRAME_ANCESTORS", "'self' https://*.cloud.kavia.ai"
        )

        return Settings(
            host=host,
            port=port,
            log_level=log_level,
            node_env=node_env,
            cors_origins=cors_origins,
            preview_mode=preview_mode,
            preview_frame_ancestors=preview_frame_ancestors,
        )
