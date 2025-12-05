"""
Organization endpoints:
- GET /organizations
"""
from __future__ import annotations

from typing import List

from fastapi import APIRouter, Depends
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.security import require_jwt_claims
from app.db.session import get_session
from app.models.schemas import OrganizationOut
from app.models.tables import Organization

router = APIRouter(tags=["Organizations"])


# PUBLIC_INTERFACE
@router.get(
    "/organizations",
    response_model=List[OrganizationOut],
    summary="List all organizations",
    description="Returns all organizations ordered by name.",
    responses={200: {"description": "List of organizations"}, 401: {"description": "Unauthorized"}},
)
async def list_organizations(
    _: dict = Depends(require_jwt_claims),
    session: AsyncSession = Depends(get_session),
) -> List[OrganizationOut]:
    """List organizations (auth required)."""
    stmt = select(Organization).order_by(Organization.name.asc())
    res = await session.execute(stmt)
    orgs = res.scalars().all()
    return [OrganizationOut.model_validate(o) for o in orgs]
