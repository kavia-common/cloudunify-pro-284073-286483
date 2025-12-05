"""
Pydantic models for API schemas with camelCase aliases.

These models are designed for public API responses (exclude sensitive fields
such as password_hash). Uses from_attributes=True for ORM compatibility.
"""
from __future__ import annotations

from datetime import datetime
from typing import Any, Dict, Optional
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field


def _to_camel(s: str) -> str:
    parts = s.split("_")
    return parts[0] + "".join(word.capitalize() for word in parts[1:])


class BaseOut(BaseModel):
    """Base model enabling ORM deserialization and camelCase serialization."""
    model_config = ConfigDict(from_attributes=True, populate_by_name=True, alias_generator=_to_camel)


# PUBLIC_INTERFACE
class OrganizationOut(BaseOut):
    """Public schema for Organization records."""
    id: UUID
    name: str
    created_at: datetime = Field(..., alias="createdAt")


# PUBLIC_INTERFACE
class UserOut(BaseOut):
    """Public schema for User records (password hash is excluded)."""
    id: UUID
    email: str
    name: Optional[str] = None
    role: str = "user"
    organization_id: Optional[UUID] = Field(default=None, alias="organizationId")
    created_at: datetime = Field(..., alias="createdAt")


# PUBLIC_INTERFACE
class ResourceOut(BaseOut):
    """Public schema for Resource records."""
    id: UUID
    provider: str
    type: str
    name: str
    tags: Dict[str, Any]
    cost: float
    status: str
    created_at: datetime = Field(..., alias="createdAt")
