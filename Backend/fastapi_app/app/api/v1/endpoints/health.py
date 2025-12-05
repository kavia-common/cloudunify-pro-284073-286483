from datetime import datetime, timezone
import os
from typing import Literal

from fastapi import APIRouter
from pydantic import BaseModel, Field

router = APIRouter(tags=["Health"])


class HealthResponse(BaseModel):
    """Response model for health endpoints."""

    status: Literal["ok"] = Field("ok", description="Overall service health indicator")
    message: str = Field("Service is healthy", description="Human-readable status")
    timestamp: str = Field(..., description="Current timestamp in ISO 8601 format")
    environment: str = Field(..., description="Current runtime environment (NODE_ENV)")


# PUBLIC_INTERFACE
@router.get(
    "/",
    response_model=HealthResponse,
    summary="Health endpoint",
    description="Returns a simple health object with status, message, current timestamp, and NODE_ENV.",
    operation_id="get_root_health",
)
def get_root() -> HealthResponse:
    """
    Returns service health status at the root path.

    Useful for quick checks and as a default landing response.
    """
    env = os.getenv("NODE_ENV", "development")
    return HealthResponse(
        timestamp=datetime.now(timezone.utc).isoformat(),
        environment=env,
    )


# PUBLIC_INTERFACE
@router.get(
    "/healthz",
    response_model=HealthResponse,
    summary="Health check (healthz)",
    description="Kubernetes-style health probe endpoint.",
    operation_id="get_healthz",
)
def get_healthz() -> HealthResponse:
    """Health probe endpoint commonly used by orchestrators."""
    env = os.getenv("NODE_ENV", "development")
    return HealthResponse(
        timestamp=datetime.now(timezone.utc).isoformat(),
        environment=env,
    )


# PUBLIC_INTERFACE
@router.get(
    "/health",
    response_model=HealthResponse,
    summary="Health check (health)",
    description="Alternative health probe endpoint.",
    operation_id="get_health",
)
def get_health() -> HealthResponse:
    """Alternative health probe endpoint."""
    env = os.getenv("NODE_ENV", "development")
    return HealthResponse(
        timestamp=datetime.now(timezone.utc).isoformat(),
        environment=env,
    )
