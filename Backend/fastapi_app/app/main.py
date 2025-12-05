"""
CloudUnify Pro FastAPI Application.

This module exposes the FastAPI app instance and configures:
- App metadata and OpenAPI tags
- CORS with env-driven origins (CORS_ORIGIN)
- Preview embedding headers (PREVIEW_MODE true):
  - CSP frame-ancestors 'self' https://*.cloud.kavia.ai
  - COEP/COOP relaxed for embedded contexts

Docs:
- Swagger UI: /docs
- OpenAPI JSON: /openapi.json
"""
from typing import List, Union

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from .api.v1.endpoints.health import router as health_router
from .core.config import Settings
from .core.middleware import PreviewEmbeddingHeadersMiddleware


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
        FastAPI: Configured application with CORS and preview middleware enabled as per env.
    """
    settings = Settings.load()

    openapi_tags = [
        {"name": "Health", "description": "Health and status endpoints"},
    ]

    app = FastAPI(
        title="CloudUnify Pro REST API (FastAPI)",
        description="FastAPI-based backend scaffold for CloudUnify Pro migration.",
        version="1.0.0",
        openapi_tags=openapi_tags,
    )

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

    # Routers
    app.include_router(health_router, prefix="")

    # Startup hook to ensure schema is initialized
    from .db.init_db import ensure_schema

    @app.on_event("startup")
    async def _on_startup():
        await ensure_schema()

    return app


# Expose default app instance for ASGI servers (uvicorn/gunicorn)
app = create_app()
