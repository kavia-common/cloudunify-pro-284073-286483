"""
SQLAlchemy ORM models (tables) for core entities:
- Organization
- User
- Resource

Notes:
- UUID primary keys generated client-side using uuid.uuid4 to avoid requiring DB extensions.
- Timestamp defaults rely on server-side CURRENT_TIMESTAMP where available.
- No column-level unique constraint for users.email to keep index creation idempotent via ensure_schema().
"""
from __future__ import annotations

import uuid
from datetime import datetime

import sqlalchemy as sa
from sqlalchemy import ForeignKey, text
from sqlalchemy.dialects.postgresql import JSONB, UUID as PGUUID
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column


# Naming convention to ensure deterministic constraint/index names across environments
NAMING_CONVENTION = {
    "ix": "ix_%(column_0_label)s",
    "uq": "uq_%(table_name)s_%(column_0_name)s",
    "ck": "ck_%(table_name)s_%(constraint_name)s",
    "fk": "fk_%(table_name)s_%(column_0_name)s_%(referred_table_name)s",
    "pk": "pk_%(table_name)s",
}


class Base(DeclarativeBase):
    """Declarative base with common metadata naming convention."""
    metadata = sa.MetaData(naming_convention=NAMING_CONVENTION)


class Organization(Base):
    """Organization entity."""
    __tablename__ = "organizations"

    id: Mapped[uuid.UUID] = mapped_column(
        PGUUID(as_uuid=True),
        primary_key=True,
        default=uuid.uuid4,
    )
    name: Mapped[str] = mapped_column(sa.String(255), nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        sa.DateTime(timezone=True),
        server_default=text("CURRENT_TIMESTAMP"),
        nullable=False,
    )

    def __repr__(self) -> str:
        return f"Organization(id={self.id!r}, name={self.name!r})"


class User(Base):
    """User entity scoped to an optional Organization."""
    __tablename__ = "users"

    id: Mapped[uuid.UUID] = mapped_column(
        PGUUID(as_uuid=True),
        primary_key=True,
        default=uuid.uuid4,
    )
    email: Mapped[str] = mapped_column(sa.String(320), nullable=False)
    password_hash: Mapped[str] = mapped_column(sa.String(256), nullable=False)
    name: Mapped[str | None] = mapped_column(sa.String(255), nullable=True)
    role: Mapped[str] = mapped_column(sa.String(50), nullable=False, default="user", server_default=text("'user'"))
    organization_id: Mapped[uuid.UUID | None] = mapped_column(
        PGUUID(as_uuid=True),
        ForeignKey("organizations.id", ondelete="SET NULL"),
        nullable=True,
    )
    created_at: Mapped[datetime] = mapped_column(
        sa.DateTime(timezone=True),
        server_default=text("CURRENT_TIMESTAMP"),
        nullable=False,
    )

    def __repr__(self) -> str:
        return f"User(id={self.id!r}, email={self.email!r}, role={self.role!r})"


class Resource(Base):
    """Multi-cloud resource entity."""
    __tablename__ = "resources"

    id: Mapped[uuid.UUID] = mapped_column(
        PGUUID(as_uuid=True),
        primary_key=True,
        default=uuid.uuid4,
    )
    provider: Mapped[str] = mapped_column(sa.String(16), nullable=False)  # "AWS" | "Azure" | "GCP"
    type: Mapped[str] = mapped_column(sa.String(128), nullable=False)
    name: Mapped[str] = mapped_column(sa.String(255), nullable=False)
    tags: Mapped[dict] = mapped_column(JSONB, nullable=False, default=dict)
    cost: Mapped[float] = mapped_column(sa.Numeric(12, 2), nullable=False, default=0)
    status: Mapped[str] = mapped_column(sa.String(32), nullable=False, default="active", server_default=text("'active'"))
    created_at: Mapped[datetime] = mapped_column(
        sa.DateTime(timezone=True),
        server_default=text("CURRENT_TIMESTAMP"),
        nullable=False,
    )

    def __repr__(self) -> str:
        return f"Resource(id={self.id!r}, provider={self.provider!r}, type={self.type!r})"
