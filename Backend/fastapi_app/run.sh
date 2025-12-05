#!/usr/bin/env bash
# Helper script to run the FastAPI app with uvicorn using env-driven config.
# Usage: bash run.sh
set -euo pipefail

HOST="${HOST:-0.0.0.0}"
PORT="${PORT:-3001}"
LOG_LEVEL="${LOG_LEVEL:-info}"

exec uvicorn app.main:app --host "$HOST" --port "$PORT" --log-level "$LOG_LEVEL"
