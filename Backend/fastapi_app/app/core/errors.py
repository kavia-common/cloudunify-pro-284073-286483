"""
Global error handling for the FastAPI app.

Provides:
- register_exception_handlers(app): Register handlers for HTTPException, RequestValidationError, and generic Exception.
All handlers return a consistent JSON shape: { "error": str, "message": str, "code": int, "details": object|null }.
"""
from __future__ import annotations

import traceback
from http import HTTPStatus
from typing import Any, Dict, Optional

from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from starlette.exceptions import HTTPException as StarletteHTTPException
from starlette import status


def _error_name(status_code: int) -> str:
    try:
        return HTTPStatus(status_code).phrase.replace(" ", "")
    except Exception:
        return "Error"


def _build_error_payload(
    *,
    status_code: int,
    message: str,
    details: Optional[Any] = None,
    error_name: Optional[str] = None,
) -> Dict[str, Any]:
    return {
        "error": error_name or _error_name(status_code),
        "message": message,
        "code": status_code,
        "details": details,
    }


# PUBLIC_INTERFACE
def register_exception_handlers(app: FastAPI) -> None:
    """Register global exception handlers that return a consistent error response shape."""

    @app.exception_handler(StarletteHTTPException)
    async def http_exception_handler(request: Request, exc: StarletteHTTPException):
        # FastAPI/Starlette HTTPException (404, 401, etc.)
        message = exc.detail if isinstance(exc.detail, str) else str(exc.detail)
        details = None if isinstance(exc.detail, str) else exc.detail
        payload = _build_error_payload(
            status_code=exc.status_code,
            message=message,
            details=details,
        )
        return JSONResponse(status_code=exc.status_code, content=payload)

    @app.exception_handler(RequestValidationError)
    async def validation_exception_handler(request: Request, exc: RequestValidationError):
        # Pydantic validation errors (422)
        payload = _build_error_payload(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            message="Request validation failed",
            details=exc.errors(),
            error_name="ValidationError",
        )
        return JSONResponse(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, content=payload)

    @app.exception_handler(Exception)
    async def generic_exception_handler(request: Request, exc: Exception):
        # Unhandled exceptions (500)
        # Avoid leaking stack traces to clients; include minimal details.
        payload = _build_error_payload(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            message="Internal server error",
            details=None,
            error_name="InternalServerError",
        )
        return JSONResponse(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, content=payload)
