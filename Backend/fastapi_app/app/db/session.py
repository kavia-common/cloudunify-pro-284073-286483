"""
Async SQLAlchemy session and engine configuration.

This module provides:
- Async engine using asyncpg
- Async sessionmaker factory
- Dependency to acquire/release AsyncSession per request
- Utility to obtain the engine (singleton)

Environment configuration:
- DATABASE_URL is preferred
- If absent, Settings will attempt to read Database/db_connection.txt and parse the PostgreSQL URL
"""
from __future__ import annotations

import asyncio
from typing import AsyncGenerator, Optional

from sqlalchemy.ext.asyncio import AsyncEngine, AsyncSession, async_sessionmaker, create_async_engine

from app.core.config import Settings

# Lazily-initialized engine singleton for the app lifetime
_engine: Optional[AsyncEngine] = None
_session_factory: Optional[async_sessionmaker[AsyncSession]] = None


def _get_or_create_engine() -> AsyncEngine:
    """
    Create (if necessary) and return a global AsyncEngine instance.

    Uses the database URL from Settings with asyncpg driver enforced.
    """
    global _engine, _session_factory
    if _engine is None:
        settings = Settings.load()
        db_url = settings.database_url
        if not db_url:
            raise RuntimeError("Database URL could not be resolved. Set DATABASE_URL or ensure Database/db_connection.txt is accessible.")
        _engine = create_async_engine(
            db_url,
            pool_pre_ping=True,
            future=True,
        )
        _session_factory = async_sessionmaker(
            bind=_engine,
            autoflush=False,
            expire_on_commit=False,
            class_=AsyncSession,
        )
    return _engine


# PUBLIC_INTERFACE
def get_engine() -> AsyncEngine:
    """Return the AsyncEngine singleton instance for database operations."""
    return _get_or_create_engine()


# PUBLIC_INTERFACE
async def get_session() -> AsyncGenerator[AsyncSession, None]:
    """
    Yield an AsyncSession tied to the async engine.

    Ensures proper cleanup after request scope ends.
    """
    global _session_factory
    if _session_factory is None:
        _get_or_create_engine()
    assert _session_factory is not None

    session: AsyncSession = _session_factory()
    try:
        yield session
        # Note: commit management is left to the caller for explicit control.
    finally:
        # Close the session gracefully in async context.
        await session.close()
