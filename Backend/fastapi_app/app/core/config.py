import os
import re
import glob
from pathlib import Path
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

    # Database
    database_url: str

    @staticmethod
    def _ensure_async_driver(url: str) -> str:
        """
        Ensure the SQLAlchemy URL uses the asyncpg driver for PostgreSQL.
        Converts:
        - postgresql:// -> postgresql+asyncpg://
        - postgres:// -> postgresql+asyncpg://
        - postgresql+psycopg2:// -> postgresql+asyncpg://
        """
        if not url:
            return url
        cleaned = url.strip().strip("'").strip('"')
        # Normalize postgres scheme variants
        if cleaned.startswith("postgres://"):
            cleaned = "postgresql+asyncpg://" + cleaned[len("postgres://") :]
        elif cleaned.startswith("postgresql://"):
            cleaned = "postgresql+asyncpg://" + cleaned[len("postgresql://") :]
        elif cleaned.startswith("postgresql+psycopg2://"):
            cleaned = "postgresql+asyncpg://" + cleaned[len("postgresql+psycopg2://") :]
        return cleaned

    @staticmethod
    def _extract_postgres_url(text: str) -> Optional[str]:
        """
        Extract a PostgreSQL URL from free-form text (e.g., lines like 'psql postgresql://...').
        Returns the first matching URL or None.
        """
        # Simple regex for postgres URLs
        pattern = re.compile(r"(postgres(?:ql)?(?:\+[\w]+)?://[^\s\"']+)")
        match = pattern.search(text)
        if match:
            return match.group(1)
        # Fallback: look for tokens with scheme present
        for token in re.split(r"[\s\"']+", text):
            if token.startswith("postgres://") or token.startswith("postgresql://"):
                return token
        return None

    @staticmethod
    def _read_db_url_from_connection_file() -> Optional[str]:
        """
        Try to find and read a db_connection.txt file and parse a PostgreSQL URL from it.
        Checked locations (in order):
        - DB_CONNECTION_FILE env variable (absolute or relative)
        - Database/db_connection.txt (relative to CWD)
        - ../Database/db_connection.txt, ../../Database/db_connection.txt, ../../../Database/db_connection.txt
        - Glob search near repository root for 'cloudunify-pro-*/Database/db_connection.txt'
        """
        # 1) Explicit path from env
        explicit = os.getenv("DB_CONNECTION_FILE")
        if explicit:
            candidate = Path(explicit).expanduser()
            if candidate.is_file():
                try:
                    return Settings._extract_postgres_url(candidate.read_text())
                except Exception:
                    pass

        # 2) Common relative locations
        relative_candidates = [
            Path("Database/db_connection.txt"),
            Path("../Database/db_connection.txt"),
            Path("../../Database/db_connection.txt"),
            Path("../../../Database/db_connection.txt"),
        ]
        for path in relative_candidates:
            try:
                candidate = path.resolve()
                if candidate.is_file():
                    return Settings._extract_postgres_url(candidate.read_text())
            except Exception:
                continue

        # 3) Broad glob search for sibling workspaces
        try:
            # Walk up a few parents to approximate repository root
            here = Path(__file__).resolve()
            parents = list(here.parents)
            for up in parents[:6]:
                matches = glob.glob(str(up / "cloudunify-pro-*/Database/db_connection.txt"))
                for m in matches:
                    p = Path(m)
                    if p.is_file():
                        return Settings._extract_postgres_url(p.read_text())
        except Exception:
            pass

        return None

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
        - DATABASE_URL (preferred) or read from Database/db_connection.txt
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

        db_url_env = os.getenv("DATABASE_URL", "").strip()
        if not db_url_env:
            # Fallback to connection file
            parsed = Settings._read_db_url_from_connection_file()
            db_url = Settings._ensure_async_driver(parsed or "")
        else:
            db_url = Settings._ensure_async_driver(db_url_env)

        return Settings(
            host=host,
            port=port,
            log_level=log_level,
            node_env=node_env,
            cors_origins=cors_origins,
            preview_mode=preview_mode,
            preview_frame_ancestors=preview_frame_ancestors,
            database_url=db_url,
        )
