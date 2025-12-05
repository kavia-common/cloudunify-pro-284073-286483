from typing import Callable

from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request
from starlette.responses import Response


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
    """

    def __init__(self, app, enabled: bool, frame_ancestors: str):
        super().__init__(app)
        self.enabled = enabled
        self.frame_ancestors = frame_ancestors

    async def dispatch(self, request: Request, call_next: Callable) -> Response:
        response: Response = await call_next(request)

        if not self.enabled:
            # Do not interfere with default headers when preview mode is disabled.
            return response

        # Remove X-Frame-Options to allow frame-ancestors to control embedding.
        if "X-Frame-Options" in response.headers:
            del response.headers["X-Frame-Options"]

        # Apply CSP frame-ancestors to allow embedding in specific preview hosts.
        # Note: this overrides any existing CSP for clarity in preview mode.
        response.headers["Content-Security-Policy"] = (
            f"frame-ancestors {self.frame_ancestors}"
        )

        # COEP and COOP adjustments for embedded contexts.
        response.headers["Cross-Origin-Embedder-Policy"] = "unsafe-none"
        response.headers["Cross-Origin-Opener-Policy"] = "same-origin-allow-popups"

        # Signal preview mode for debugging.
        response.headers["X-Preview-Mode"] = "true"
        return response
