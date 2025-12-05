# CloudUnify Pro — FastAPI Backend (Default)

FastAPI is now the default backend for CloudUnify Pro. It runs on port 3001 by default and includes:
- CORS configuration via environment variables (CORS_ORIGIN)
- Preview embedding headers (PREVIEW_MODE=true)
- Health routes: `/`, `/healthz`, `/health`
- Swagger UI at `/docs` and OpenAPI JSON at `/openapi.json`

The legacy Express backend has been moved to `Backend/legacy_express/` and is deprecated.

## Getting Started

1. Create and activate a virtual environment (Python 3.11+):
   - cd Backend/fastapi_app
   - python -m venv .venv
   - source .venv/bin/activate   (Windows: .venv\\Scripts\\activate)

2. Install dependencies:
   - pip install -r requirements.txt

3. Configure environment:
   - The app reads environment variables from the process (it does NOT load a `.env` file directly).
   - See `../.env.example` for variables and sample values. Set them in your shell or deployment environment.

4. Start the server on port 3001:
   - Option A: python serve.py
   - Option B: uvicorn app.main:app --host 0.0.0.0 --port 3001

5. Open:
   - Docs: http://localhost:3001/docs
   - OpenAPI JSON: http://localhost:3001/openapi.json

You can also use the helper script in this directory:
- bash run.sh   (uses HOST, PORT, LOG_LEVEL env vars if set)

## Configuration

Environment variables:
- Server:
  - HOST (default: 0.0.0.0)
  - PORT (default: 3001)
  - LOG_LEVEL (default: info, also respects REACT_APP_LOG_LEVEL)
  - NODE_ENV (default: development)
- CORS:
  - CORS_ORIGIN (comma-separated list or "*" for all; if not set, a sensible Frontend origin is derived)
- Preview/Embed:
  - PREVIEW_MODE (default: false)
  - PREVIEW_FRAME_ANCESTORS (default: `'self' https://*.cloud.kavia.ai`)
- Auth:
  - JWT_SECRET (required for protected endpoints)
  - JWT_EXPIRES_IN (optional; default 1h; supports 3600s, 15m, 2h, 7d)
  - JWT_ISSUER (default: cloudunify-pro)
  - JWT_AUDIENCE (default: cloudunify-pro-frontend)
  - JWT_ALG (default: HS256)
- Database:
  - DATABASE_URL (preferred; will be normalized to async driver)
  - DB_CONNECTION_FILE (optional fallback pointing to a file containing a PostgreSQL URL)

## Health Endpoints

- GET `/` — Returns `{ status, message, timestamp, environment }`
- GET `/healthz` and `/health` — Suitable for probes

## Notes

- All new development should target this FastAPI application.
- Legacy Express code remains available under `../legacy_express/` for reference or temporary use during migration.
