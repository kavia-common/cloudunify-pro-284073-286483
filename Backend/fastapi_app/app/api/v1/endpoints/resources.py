"""
Resource endpoints:
- GET /resources with provider/status filters and pagination
"""
from __future__ import annotations

from typing import List, Optional

from fastapi import APIRouter, Depends, Query
from sqlalchemy import Select, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.security import require_jwt_claims
from app.db.session import get_session
from app.models.schemas import ResourceOut
from app.models.tables import Resource

router = APIRouter(tags=["Resources"])


# PUBLIC_INTERFACE
@router.get(
    "/resources",
    response_model=List[ResourceOut],
    summary="List all resources across clouds",
    description="Supports optional filtering by provider and status. Pagination via page & pageSize (defaults: 1, 50).",
    responses={200: {"description": "List of resources"}, 401: {"description": "Unauthorized"}},
)
async def list_resources(
    provider: Optional[str] = Query(default=None, description="Cloud provider (AWS|Azure|GCP)"),
    status: Optional[str] = Query(default=None, description="Resource status"),
    page: int = Query(default=1, ge=1, description="Page number (1-based)"),
    page_size: int = Query(default=50, ge=1, le=200, alias="pageSize", description="Page size"),
    _: dict = Depends(require_jwt_claims),
    session: AsyncSession = Depends(get_session),
) -> List[ResourceOut]:
    """List resources with filters and pagination."""
    stmt: Select = select(Resource)
    if provider:
        stmt = stmt.where(Resource.provider == provider)
    if status:
        stmt = stmt.where(Resource.status == status)

    stmt = stmt.order_by(Resource.created_at.desc(), Resource.name.asc())
    offset = (page - 1) * page_size
    stmt = stmt.offset(offset).limit(page_size)

    res = await session.execute(stmt)
    resources = res.scalars().all()
    return [ResourceOut.model_validate(r) for r in resources]
