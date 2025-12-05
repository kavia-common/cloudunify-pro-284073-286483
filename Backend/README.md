# CloudUnify Pro Backend

FastAPI is now the default backend for CloudUnify Pro. The legacy Express code has been moved to `Backend/legacy_express/` for reference during migration.

- Default server: FastAPI (uvicorn) on port 3001
- API docs at runtime: http://localhost:3001/docs
- OpenAPI JSON at runtime: http://localhost:3001/openapi.json
- Interfaces (static): `Backend/interfaces/openapi.json` (legacy spec; prefer runtime OpenAPI above)

## Quick Start (FastAPI)

1) Setup Python environment (3.11+ recommended):
- Linux/macOS:
  - cd Backend/fastapi_app
  - python -m venv .venv
  - source .venv/bin/activate
- Windows (PowerShell):
  - cd Backend/fastapi_app
  - python -m venv .venv
  - .venv\\Scripts\\Activate.ps1

2) Install dependencies:
- pip install -r requirements.txt

3) Configure environment:
- Export environment variables (the app reads from process env; it does not read .env automatically).
- See `.env.example` in the Backend folder for the list of variables (you can copy to your deployment environment).

4) Start server (port 3001 by default):
- Option A (recommended): python serve.py
- Option B: uvicorn app.main:app --host 0.0.0.0 --port 3001

5) Open:
- API docs: http://localhost:3001/docs
- OpenAPI JSON: http://localhost:3001/openapi.json

## Environment Variables

Set these in your environment (see `.env.example` for examples):

- HOST (default: 0.0.0.0)
- PORT (default: 3001)
- LOG_LEVEL (default: info; also respects REACT_APP_LOG_LEVEL)
- NODE_ENV (default: development)

- CORS_ORIGIN
  - Comma-separated list of origins or "*" (wildcard).
  - If not provided, we smartly default to a frontend URL (e.g., http://localhost:3000).

- PREVIEW_MODE
  - true/false. When true, allows embedding in Kavia preview iframes:
    - Sets CSP frame-ancestors appropriately
    - Removes X-Frame-Options
    - Adjusts COOP/COEP for embedded contexts
  - PREVIEW_FRAME_ANCESTORS optional override (default: `'self' https://*.cloud.kavia.ai`)

- JWT_SECRET
  - Required for authenticated endpoints; when missing, auth-protected dependencies respond with 503 to indicate unconfigured auth.

- JWT_EXPIRES_IN (optional; default 1h; formats: 3600s, 15m, 2h, 7d)
- JWT_ISSUER (default: cloudunify-pro)
- JWT_AUDIENCE (default: cloudunify-pro-frontend)
- JWT_ALG (default: HS256)

- DATABASE_URL
  - Preferred async SQLAlchemy URL (e.g., postgresql+asyncpg://user:pass@host:5432/db)
  - If using postgres:// or postgresql://, it will be converted to postgresql+asyncpg:// automatically.

- DB_CONNECTION_FILE
  - Optional path to a text file containing a PostgreSQL URL (e.g., .../Database/db_connection.txt). If DATABASE_URL is not set, the app will attempt to read and normalize this value.

## Legacy Express (Deprecated)

Legacy source has been relocated to `Backend/legacy_express/`. It is no longer the default runtime.

If you need to run it temporarily:
- cd Backend/legacy_express
- npm install
- npm run dev (for development) or npm start (build + run)
- Legacy docs: http://localhost:3001/docs (if you start it on port 3001)
- To regenerate its OpenAPI: npm run generate:openapi (outputs to ../interfaces/openapi.json)

Note: FastAPI is the default and recommended server. New features should be implemented in FastAPI.

## Notes

- Do not hardcode secrets; use environment variables.
- The FastAPI server exposes /, /healthz, and /health endpoints for liveness.
- Ensure your frontend points to the backend base URL and uses Bearer JWT for protected endpoints.

