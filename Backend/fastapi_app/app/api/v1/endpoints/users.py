"""
Users endpoints:
- GET /users/me: current authenticated user profile
- GET /users: list users (optional orgId filter, defaults to claim's organizationId)
"""
from __future__ import annotations

from typing import List, Optional
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import Select, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.session import get_session
from app.models.schemas import UserOut
from app.models.tables import User
from app.core.security import require_jwt_claims

router = APIRouter(tags=["Users"])


async def _get_user_by_id(session: AsyncSession, user_id: UUID) -> Optional[User]:
    stmt: Select = select(User).where(User.id == user_id)
    res = await session.execute(stmt)
    return res.scalars().first()


# PUBLIC_INTERFACE
@router.get(
    "/users/me",
    response_model=UserOut,
    summary="Get current authenticated user profile.",
    description="Returns the profile for the user identified by the JWT 'sub' claim.",
    responses={200: {"description": "User profile"}, 401: {"description": "Unauthorized"}},
)
async def get_me(
    claims: dict = Depends(require_jwt_claims),
    session: AsyncSession = Depends(get_session),
) -> UserOut:
    """Return the currently authenticated user's profile."""
    sub = claims.get("sub")
    if not sub:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Missing subject in token")
    user = await _get_user_by_id(session, UUID(str(sub)))
    if not user:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")
    return UserOut.model_validate(user)


# PUBLIC_INTERFACE
@router.get(
    "/users",
    response_model=List[UserOut],
    summary="List all users in the organization",
    description="Lists users. If 'orgId' is not provided, defaults to the token's organizationId claim when present.",
    responses={200: {"description": "List of users"}, 401: {"description": "Unauthorized"}},
)
async def list_users(
    org_id: Optional[UUID] = Query(default=None, alias="orgId", description="Organization ID filter"),
    claims: dict = Depends(require_jwt_claims),
    session: AsyncSession = Depends(get_session),
) -> List[UserOut]:
    """List users with optional orgId filter. Defaults to claims.organizationId if available."""
    effective_org = org_id or (claims.get("organizationId") if claims else None)

    stmt: Select = select(User)
    if effective_org:
        stmt = stmt.where(User.organization_id == UUID(str(effective_org)))
    # Order similar to legacy implementation
    stmt = stmt.order_by(User.created_at.desc(), User.email.asc())

    res = await session.execute(stmt)
    users = res.scalars().all()
    return [UserOut.model_validate(u) for u in users]
