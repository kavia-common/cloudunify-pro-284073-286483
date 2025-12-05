from typing import Callable, Iterable, Optional

from loguru import logger
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request
from starlette.responses import Response


def _redact_authorization(headers: Iterable[tuple[str, str]]) -> dict:
    """Return a sanitized headers dict for logging (Authorization redacted)."""
    sanitized = {}
    for k, v in headers:
        if k.lower() == "authorization" and v:
            sanitized[k] = "<redacted>"
        else:
            sanitized[k] = v
    return sanitized


class PreviewEmbeddingHeadersMiddleware(BaseHTTPMiddleware):
    """
    PUBLIC_INTERFACE
    Middleware that configures headers to support embedding the app inside
    Kavia preview iframes when preview mode is enabled.

    When enabled:
    - Removes X-Frame-Options (if any) so that CSP frame-ancestors governs embedding.
    - Sets Content-Security-Policy frame-ancestors to the configured list.
    - Sets Cross-Origin-Embedder-Policy to 'unsafe-none' to avoid iframe issues.
    - Sets Cross-Origin-Opener-Policy to 'same-origin-allow-popups'.

    When disabled:
    - Explicitly DENY framing using both X-Frame-Options: DENY and
      Content-Security-Policy: frame-ancestors 'none'
    """

    def __init__(self, app, enabled: bool, frame_ancestors: str):
        super().__init__(app)
        self.enabled = enabled
        self.frame_ancestors = frame_ancestors

    async def dispatch(self, request: Request, call_next: Callable) -> Response:
        response: Response = await call_next(request)

        if self.enabled:
            # Remove X-Frame-Options to allow frame-ancestors to control embedding.
            if "X-Frame-Options" in response.headers:
                del response.headers["X-Frame-Options"]

            # Apply CSP frame-ancestors to allow embedding in specific preview hosts.
            response.headers["Content-Security-Policy"] = (
                f"frame-ancestors {self.frame_ancestors}"
            )

            # COEP and COOP adjustments for embedded contexts.
            response.headers["Cross-Origin-Embedder-Policy"] = "unsafe-none"
            response.headers["Cross-Origin-Opener-Policy"] = "same-origin-allow-popups"

            # Signal preview mode for debugging.
            response.headers["X-Preview-Mode"] = "true"
            return response

        # Preview disabled: enforce DENY
        response.headers["X-Frame-Options"] = "DENY"
        response.headers["Content-Security-Policy"] = "frame-ancestors 'none'"
        response.headers["X-Preview-Mode"] = "false"
        return response


class RequestLoggingMiddleware(BaseHTTPMiddleware):
    """
    PUBLIC_INTERFACE
    Lightweight request/response logging with Authorization header redaction.
    Uses Loguru logger and avoids logging bodies to reduce PII exposure.
    """

    def __init__(self, app, enabled: bool = True, ignore_paths: Optional[set[str]] = None):
        super().__init__(app)
        self.enabled = enabled
        self.ignore_paths = ignore_paths or {"/docs", "/openapi.json", "/health", "/healthz", "/"}

    async def dispatch(self, request: Request, call_next: Callable) -> Response:
        if not self.enabled or any(str(request.url.path).startswith(p) for p in self.ignore_paths):
            return await call_next(request)

        headers = _redact_authorization(request.headers.items())
        logger.bind(path=request.url.path).info(
            f"{request.method} {request.url.path} - headers={headers}"
        )
        response = await call_next(request)
        logger.bind(path=request.url.path).info(
            f"{request.method} {request.url.path} -> {response.status_code}"
        )
        return response
