"""
Database bootstrap utilities.

ensure_schema():
- Creates tables using SQLAlchemy metadata.create_all (idempotent)
- Creates indexes using explicit CREATE [UNIQUE] INDEX IF NOT EXISTS statements
- Skips initialization when no database configuration is present (non-blocking startup)
"""
from __future__ import annotations

from typing import List

from loguru import logger
from sqlalchemy.ext.asyncio import AsyncConnection

from app.core.config import Settings
from app.db.session import get_engine
from app.models.tables import Base


def _index_statements() -> List[str]:
    """Return idempotent index creation statements."""
    return [
        # Users: enforce unique email
        "CREATE UNIQUE INDEX IF NOT EXISTS ix_users_email ON users (email)",
        # Users: organization lookup
        "CREATE INDEX IF NOT EXISTS ix_users_org_id ON users (organization_id)",
        # Organizations: name lookup
        "CREATE INDEX IF NOT EXISTS ix_organizations_name ON organizations (name)",
        # Resources: common filters
        "CREATE INDEX IF NOT EXISTS ix_resources_provider ON resources (provider)",
        "CREATE INDEX IF NOT EXISTS ix_resources_status ON resources (status)",
        # JSONB GIN index for tags
        "CREATE INDEX IF NOT EXISTS ix_resources_tags_gin ON resources USING GIN (tags)",
    ]


# PUBLIC_INTERFACE
async def ensure_schema() -> None:
    """
    Ensure database schema exists and required indexes are present.

    Behavior:
    - If no database configuration is detected (DATABASE_URL/DB_CONNECTION_FILE), startup is NOT blocked;
      the function logs a warning and returns immediately.
    - If a database is configured but unreachable, logs a warning and returns without raising to keep the app healthy.

    Uses metadata.create_all() via async connection, then creates indexes individually.
    """
    settings = Settings.load()
    if not settings.database_url:
        logger.warning(
            "Database URL not configured; skipping schema initialization. "
            "Set DATABASE_URL or DB_CONNECTION_FILE to enable database features."
        )
        return

    try:
        engine = get_engine()
        async with engine.begin() as conn:  # type: AsyncConnection
            await conn.run_sync(Base.metadata.create_all)
            for stmt in _index_statements():
                await conn.exec_driver_sql(stmt)
        logger.info("Database schema ensured successfully.")
    except Exception as exc:
        logger.warning(
            f"Skipping schema initialization due to database error: {exc}"
        )
        # Intentionally swallow errors to keep app startup non-blocking
