"""
Logging utilities integrating Loguru with the standard logging/uvicorn stack.

Features:
- Route all standard logging (including uvicorn.access) to Loguru.
- Redact sensitive values such as Authorization headers from log messages.
- Provide a simple configure_logging() function to set up logging early in app startup.
"""
from __future__ import annotations

import logging
import re
import sys
from typing import Optional

from loguru import logger


# Regex patterns to remove Authorization header values (case-insensitive).
_AUTH_HEADER_PATTERNS = [
    re.compile(r"(Authorization\s*:\s*)(Bearer\s+)?[^\s,;]+", flags=re.IGNORECASE),
    re.compile(r'("Authorization"\s*:\s*")(Bearer\s+)?[^"]+(")', flags=re.IGNORECASE),
    re.compile(r"'Authorization'\s*:\s*'(Bearer\s+)?[^']+'", flags=re.IGNORECASE),
]


def _sanitize_message(message: str) -> str:
    """Redact Authorization tokens from a free-form log message."""
    if not message:
        return message
    redacted = message
    for pat in _AUTH_HEADER_PATTERNS:
        redacted = pat.sub(r"\1<redacted>\3" if pat.groups >= 3 else r"\1<redacted>", redacted)
    return redacted


class InterceptHandler(logging.Handler):
    """A logging.Handler that forwards standard logging records to Loguru."""

    def emit(self, record: logging.LogRecord) -> None:
        try:
            # Map standard logging level to Loguru level
            level = logger.level(record.levelname).name if record.levelname in logger._levels else record.levelno
        except Exception:
            level = record.levelno

        # Sanitize the message before forwarding.
        message = record.getMessage()
        message = _sanitize_message(message)

        # Find caller depth to keep file/line accurate in Loguru records.
        frame, depth = logging.currentframe(), 2
        while frame and frame.f_code.co_filename == logging.__file__:
            frame = frame.f_back
            depth += 1

        logger.opt(depth=depth, exception=record.exc_info).log(level, message)


# PUBLIC_INTERFACE
def configure_logging(level: Optional[str] = None) -> None:
    """Configure Loguru and intercept standard logging (including uvicorn) to Loguru.

    Args:
        level: Optional log level (e.g., "INFO", "DEBUG", "WARNING"). Defaults to "INFO" if not provided.
    """
    # Remove any existing Loguru handlers then add our STDOUT sink.
    logger.remove()
    logger.add(
        sys.stdout,
        level=(level or "INFO").upper(),
        backtrace=False,
        diagnose=False,
        format="<green>{time:YYYY-MM-DD HH:mm:ss.SSS}</green> | "
               "<level>{level: <8}</level> | "
               "<cyan>{name}</cyan>:<cyan>{function}</cyan>:<cyan>{line}</cyan> - "
               "<level>{message}</level>",
    )

    # Intercept all standard logging to Loguru
    intercept = InterceptHandler()
    root_logger = logging.getLogger()
    for h in list(root_logger.handlers):
        root_logger.removeHandler(h)
    root_logger.addHandler(intercept)
    root_logger.setLevel(logging.DEBUG)

    # Route common library loggers to Loguru
    for name in ("uvicorn", "uvicorn.error", "uvicorn.access", "fastapi", "sqlalchemy"):
        logger_ = logging.getLogger(name)
        for h in list(logger_.handlers):
            logger_.removeHandler(h)
        logger_.handlers = [intercept]
        logger_.propagate = False
        logger_.setLevel(logging.DEBUG)
