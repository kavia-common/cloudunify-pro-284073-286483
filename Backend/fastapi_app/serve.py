"""
Uvicorn launcher for the CloudUnify Pro FastAPI app.

Usage:
    python serve.py
or
    HOST=0.0.0.0 PORT=3001 LOG_LEVEL=info python serve.py
"""
import os
import uvicorn

from app.core.config import Settings


def _map_log_level(level: str) -> str:
    level = (level or "").strip().lower()
    if level in {"trace"}:
        return "debug"
    if level in {"fatal"}:
        return "critical"
    if level in {"warn"}:
        return "warning"
    return level or "info"


if __name__ == "__main__":
    settings = Settings.load()
    host = settings.host or "0.0.0.0"
    port = settings.port or 3001
    log_level = _map_log_level(settings.log_level)

    # Maintain default port 3001 to match existing container behavior
    uvicorn.run("app.main:app", host=host, port=port, log_level=log_level, reload=False)
