"""
Database bootstrap utilities.

ensure_schema():
- Creates tables using SQLAlchemy metadata.create_all (idempotent)
- Creates indexes using explicit CREATE [UNIQUE] INDEX IF NOT EXISTS statements
"""
from __future__ import annotations

from typing import List

from sqlalchemy.ext.asyncio import AsyncConnection

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

    Uses metadata.create_all() via async connection, then creates indexes individually.
    """
    engine = get_engine()
    async with engine.begin() as conn:  # type: AsyncConnection
        await conn.run_sync(Base.metadata.create_all)
        for stmt in _index_statements():
            await conn.exec_driver_sql(stmt)
