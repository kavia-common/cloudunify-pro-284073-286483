"""
Security utilities: JWT creation/verification and FastAPI dependencies.

Reads configuration from environment variables (do not hardcode):
- JWT_SECRET (required)
- JWT_EXPIRES_IN (default: "1h", supports formats like "3600s", "15m", "2h", "7d")
- JWT_ISSUER (default: "cloudunify-pro")
- JWT_AUDIENCE (default: "cloudunify-pro-frontend")
- JWT_ALG (default: "HS256")

Provides:
- create_jwt(payload)
- decode_jwt(token)
- require_jwt_claims dependency (403/401/503 handling)
"""
from __future__ import annotations

import os
import re
from datetime import datetime, timedelta, timezone
from typing import Any, Dict, Optional

import jwt
from fastapi import Depends, HTTPException, Request, status


def _now_utc() -> datetime:
    return datetime.now(timezone.utc)


def _parse_expires_in(s: Optional[str]) -> timedelta:
    """
    Parse a human-friendly duration string into a timedelta.
    Supports:
      - "3600" (seconds)
      - "3600s"
      - "15m"
      - "2h"
      - "7d"
    Defaults to 1 hour on invalid/missing input.
    """
    if not s:
        return timedelta(hours=1)
    s = str(s).strip().lower()
    m = re.match(r"^\s*(\d+)\s*([smhd])?\s*$", s)
    if not m:
        return timedelta(hours=1)
    value = int(m.group(1))
    unit = m.group(2) or "s"
    if unit == "s":
        return timedelta(seconds=value)
    if unit == "m":
        return timedelta(minutes=value)
    if unit == "h":
        return timedelta(hours=value)
    if unit == "d":
        return timedelta(days=value)
    return timedelta(hours=1)


def _get_jwt_config() -> Dict[str, str]:
    secret = os.getenv("JWT_SECRET", "")
    issuer = os.getenv("JWT_ISSUER", "cloudunify-pro")
    audience = os.getenv("JWT_AUDIENCE", "cloudunify-pro-frontend")
    alg = os.getenv("JWT_ALG", "HS256")
    expires = os.getenv("JWT_EXPIRES_IN", "1h")
    return {
        "secret": secret,
        "issuer": issuer,
        "audience": audience,
        "algorithm": alg,
        "expires_in": expires,
    }


# PUBLIC_INTERFACE
def create_jwt(user_payload: Dict[str, Any]) -> str:
    """Create a JWT for the given user payload with standard claims."""
    cfg = _get_jwt_config()
    secret = cfg["secret"]
    if not secret:
        raise RuntimeError("JWT_SECRET is not configured")

    now = _now_utc()
    exp = now + _parse_expires_in(cfg["expires_in"])
    payload = {
        "sub": str(user_payload.get("id")),
        "email": user_payload.get("email"),
        "role": user_payload.get("role"),
        "organizationId": (
            str(user_payload.get("organizationId")) if user_payload.get("organizationId") else None
        ),
        "iat": int(now.timestamp()),
        "exp": int(exp.timestamp()),
        "iss": cfg["issuer"],
        "aud": cfg["audience"],
    }
    token = jwt.encode(payload, secret, algorithm=cfg["algorithm"])
    return token


# PUBLIC_INTERFACE
def decode_jwt(token: str) -> Dict[str, Any]:
    """Decode and validate a JWT and return the claims dictionary."""
    cfg = _get_jwt_config()
    secret = cfg["secret"]
    if not secret:
        raise RuntimeError("JWT_SECRET is not configured")
    try:
        claims = jwt.decode(
            token,
            secret,
            algorithms=[cfg["algorithm"]],
            audience=cfg["audience"],
            issuer=cfg["issuer"],
            options={"require": ["exp", "iss", "aud", "iat", "sub"]},
        )
        return claims  # type: ignore[return-value]
    except jwt.ExpiredSignatureError:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Token expired",
        )
    except jwt.InvalidTokenError:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid token",
        )


def _extract_bearer_token_from_request(request: Request) -> Optional[str]:
    auth = request.headers.get("Authorization") or request.headers.get("authorization")
    if not auth:
        return None
    parts = auth.split()
    if len(parts) != 2:
        return None
    scheme, token = parts
    if scheme.lower() != "bearer":
        return None
    return token


# PUBLIC_INTERFACE
async def require_jwt_claims(request: Request) -> Dict[str, Any]:
    """
    FastAPI dependency that requires a valid JWT.
    - Returns decoded claims on success.
    - If JWT_SECRET missing, returns 503 to align with legacy behavior.
    - Otherwise, returns 401 for missing/invalid/expired tokens.
    """
    cfg = _get_jwt_config()
    if not cfg["secret"]:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Authentication is not configured. Set JWT_SECRET environment variable.",
        )

    token = _extract_bearer_token_from_request(request)
    if not token:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Missing Authorization header",
        )
    return decode_jwt(token)
