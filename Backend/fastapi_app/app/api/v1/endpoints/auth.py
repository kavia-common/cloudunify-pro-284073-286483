"""
Auth endpoints: login to obtain JWT.

Route:
- POST /auth/login

Behavior:
- Verify user email/password using passlib bcrypt against users.password_hash
- Return { token, user }
- If JWT is not configured (JWT_SECRET unset), return 503 (auth disabled)
"""
from __future__ import annotations

from typing import Any, Dict, Optional

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from passlib.context import CryptContext

from app.db.session import get_session
from app.models.schemas import UserOut
from app.models.tables import User
from app.core.security import create_jwt

router = APIRouter(tags=["Auth"])

_pwd_ctx = CryptContext(schemes=["bcrypt"], deprecated="auto")


class LoginRequest(BaseModel):
    """Login request body."""

    email: str = Field(..., description="User email address (lowercased for lookup)")
    password: str = Field(..., description="User password")


class LoginResponse(BaseModel):
    """Login response with JWT and user profile."""

    token: str = Field(..., description="Signed JWT token")
    user: UserOut


async def _get_user_by_email(session: AsyncSession, email: str) -> Optional[User]:
    stmt = select(User).where(User.email == email)
    res = await session.execute(stmt)
    return res.scalars().first()


def _safe_lower(s: str) -> str:
    return (s or "").strip().lower()


# PUBLIC_INTERFACE
@router.post(
    "/auth/login",
    response_model=LoginResponse,
    summary="Authenticate user and return JWT token.",
    description="Verifies credentials and issues a signed JWT token on success.",
    responses={
        200: {"description": "Successful login"},
        401: {"description": "Invalid credentials"},
        503: {"description": "Authentication disabled (missing JWT_SECRET)"},
    },
)
async def login(payload: LoginRequest, session: AsyncSession = Depends(get_session)) -> LoginResponse:
    """Authenticate a user using email and password, returning a JWT and user profile."""
    # Ensure JWT is configured before proceeding
    from os import getenv

    if not (getenv("JWT_SECRET") and getenv("JWT_SECRET").strip()):
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Login is disabled because JWT_SECRET is not configured.",
        )

    email = _safe_lower(payload.email)
    user = await _get_user_by_email(session, email)
    if not user or not user.password_hash:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid email or password")

    ok = False
    try:
        ok = _pwd_ctx.verify(payload.password, user.password_hash)
    except Exception:
        ok = False

    if not ok:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid email or password")

    user_out = UserOut.model_validate(user)
    token = create_jwt(
        {
            "id": user_out.id,
            "email": user_out.email,
            "role": user_out.role,
            "organizationId": user_out.organization_id,
        }
    )
    return LoginResponse(token=token, user=user_out)
