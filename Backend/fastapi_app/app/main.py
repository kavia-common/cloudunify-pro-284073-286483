"""
CloudUnify Pro FastAPI Application.

This module exposes the FastAPI app instance and configures:
- App metadata and OpenAPI tags
- CORS with env-driven origins (CORS_ORIGIN; defaults to Frontend origin)
- Preview embedding headers (PREVIEW_MODE):
  - If true: CSP frame-ancestors 'self' https://*.cloud.kavia.ai; remove X-Frame-Options
  - If false: X-Frame-Options DENY and CSP frame-ancestors 'none'
- Global error handlers with consistent JSON shape
- Loguru logging integration with uvicorn and redaction of Authorization headers

Docs:
- Swagger UI: /docs
- OpenAPI JSON: /openapi.json
"""
from typing import List, Union

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from .api.v1.endpoints.health import router as health_router
from .api.v1.endpoints.auth import router as auth_router
from .api.v1.endpoints.users import router as users_router
from .api.v1.endpoints.organizations import router as orgs_router
from .api.v1.endpoints.resources import router as resources_router
from .api.v1.endpoints.seed import router as seed_router
from .core.config import Settings
from .core.middleware import PreviewEmbeddingHeadersMiddleware, RequestLoggingMiddleware
from .core.errors import register_exception_handlers
from .core.logging import configure_logging


def _resolve_cors_list(cors_origins: Union[str, List[str]]) -> List[str]:
    """
    Normalize CORS origins to a list acceptable by CORSMiddleware.

    CORSMiddleware handles ["*"] to mean allow-all when allow_credentials=False.
    """
    if cors_origins == "*":
        return ["*"]
    return list(cors_origins)


# PUBLIC_INTERFACE
def create_app() -> FastAPI:
    """
    Create and configure the FastAPI application instance.

    Returns:
        FastAPI: Configured application with CORS, preview middleware, and error handlers enabled as per env.
    """
    settings = Settings.load()

    # Configure logging first so that subsequent imports/middlewares log via Loguru.
    configure_logging(settings.log_level)

    openapi_tags = [
        {"name": "Health", "description": "Health and status endpoints"},
        {"name": "Auth", "description": "Authentication endpoints"},
        {"name": "Users", "description": "User endpoints"},
        {"name": "Organizations", "description": "Organization endpoints"},
        {"name": "Resources", "description": "Multi-cloud resources"},
        {"name": "Seed", "description": "Internal endpoints for loading mock data into the database"},
    ]

    app = FastAPI(
        title="CloudUnify Pro REST API (FastAPI)",
        description="FastAPI-based backend scaffold for CloudUnify Pro migration.",
        version="1.0.0",
        openapi_tags=openapi_tags,
        docs_url="/docs",
        redoc_url=None,
        openapi_url="/openapi.json",
    )

    # Global error handlers
    register_exception_handlers(app)

    # Request logging (Authorization header redaction)
    app.add_middleware(RequestLoggingMiddleware, enabled=True)

    # CORS configuration
    app.add_middleware(
        CORSMiddleware,
        allow_origins=_resolve_cors_list(settings.cors_origins),
        allow_credentials=False,  # Safe with wildcard origins
        allow_methods=["GET", "POST", "PUT", "DELETE", "PATCH", "OPTIONS"],
        allow_headers=["Authorization", "Content-Type"],
        expose_headers=["Content-Length", "Content-Type"],
        max_age=600,
    )

    # Preview embedding headers
    app.add_middleware(
        PreviewEmbeddingHeadersMiddleware,
        enabled=settings.preview_mode,
        frame_ancestors=settings.preview_frame_ancestors,
    )

    # Routers (preserve public paths with no global prefix)
    app.include_router(health_router, prefix="")
    app.include_router(auth_router, prefix="")
    app.include_router(users_router, prefix="")
    app.include_router(orgs_router, prefix="")
    app.include_router(resources_router, prefix="")
    app.include_router(seed_router, prefix="")

    # Startup hook to ensure schema is initialized
    from .db.init_db import ensure_schema

    @app.on_event("startup")
    async def _on_startup():
        await ensure_schema()

    return app


# Expose default app instance for ASGI servers (uvicorn/gunicorn)
app = create_app()
