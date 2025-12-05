# CloudUnify Pro Backend

FastAPI is now the default backend for CloudUnify Pro. The legacy Express implementation has been moved into Backend/legacy_express for reference and is deprecated for new development. This document explains the FastAPI structure, setup, environment configuration, database connection fallback, seeding endpoints, error/logging behavior, and preview embedding (Kavia). Frontend instructions: set VITE_API_BASE to point to this backend (port 3001).

## Overview

The backend has been migrated to FastAPI for improved performance, developer ergonomics, and consistency of validation and error handling. The service runs on port 3001 by default and exposes interactive API documentation at /docs and OpenAPI JSON at /openapi.json. CORS, authentication, and security behavior are driven by environment variables and implemented in code under fastapi_app/app/.

- Default server: FastAPI (Uvicorn) on port 3001
- Swagger UI: http://localhost:3001/docs
- OpenAPI JSON: http://localhost:3001/openapi.json
- Legacy static OpenAPI (deprecated): Backend/interfaces/openapi.json
- Frontend base URL: VITE_API_BASE=http://localhost:3001

## Repository Structure (backend)

The FastAPI app lives under Backend/fastapi_app:

```
Backend/
└─ fastapi_app/
   ├─ README.md
   ├─ requirements.txt
   ├─ run.sh
   ├─ serve.py
   └─ app/
      ├─ __init__.py
      ├─ main.py                  # App factory, CORS, preview headers, routers, global error handlers
      ├─ core/
      │  ├─ config.py             # Settings from env; DB URL discovery & fallback
      │  ├─ errors.py             # Consistent JSON error responses
      │  ├─ logging.py            # Loguru + uvicorn integration, Authorization redaction
      │  ├─ middleware.py         # Preview embedding headers; request logging middleware
      │  └─ security.py           # JWT creation/validation; FastAPI dependency for auth
      ├─ db/
      │  ├─ __init__.py
      │  ├─ init_db.py            # ensure_schema()
      │  └─ session.py            # Async SQLAlchemy engine & session dependency
      ├─ models/
      │  ├─ __init__.py
      │  ├─ tables.py             # SQLAlchemy models (Organization, User, Resource)
      │  └─ schemas.py            # Pydantic models for API responses
      └─ api/
         ├─ __init__.py
         └─ v1/
            ├─ __init__.py
            └─ endpoints/
               ├─ __init__.py
               ├─ auth.py
               ├─ health.py
               ├─ organizations.py
               ├─ resources.py
               ├─ seed.py
               └─ users.py
```

# Legacy Node/Express retained for reference
Backend/
└─ legacy_express/   # Deprecated

## Scripts and entrypoints

- Backend/package.json (FastAPI default):
  - start: python fastapi_app/serve.py
  - dev: uvicorn app.main:app --app-dir fastapi_app --host 0.0.0.0 --port 3001 --reload
- Preview entrypoints: use fastapi_app/serve.py or fastapi_app/run.sh

## Quick Start (FastAPI)

1) Create a Python virtual environment and install dependencies (Python 3.11+ recommended):

Linux/macOS:
```
cd Backend/fastapi_app
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
```

Windows (PowerShell):
```
cd Backend/fastapi_app
python -m venv .venv
.venv\Scripts\Activate.ps1
pip install -r requirements.txt
```

2) Configure your environment (FastAPI reads from process env; it does NOT auto-load .env files). See the example:
```
cd Backend
cp .env.example .env  # optional convenience snapshot (not auto-loaded)
# export values to your shell / set in your process manager
# e.g., bash:
# set -a; source .env; set +a
```

Recommended dev settings:
- HOST=0.0.0.0
- PORT=3001
- PREVIEW_MODE=true (if running inside a preview/iframe)
- CORS_ORIGIN=http://localhost:3000 (or your Frontend URL)
- Set JWT_SECRET to enable auth-protected routes
- Provide DATABASE_URL or DB_CONNECTION_FILE

3) Run the server:

Development (auto-reload):
```
cd Backend/fastapi_app
uvicorn app.main:app --host 0.0.0.0 --port 3001 --reload
```

Production-like (no reload):
```
cd Backend/fastapi_app
python serve.py
# or equivalently:
uvicorn app.main:app --host 0.0.0.0 --port 3001
```

Convenience script:
```
cd Backend/fastapi_app
bash run.sh
```

Health and docs:
- Root health: http://localhost:3001/
- Healthz: http://localhost:3001/healthz
- Health: http://localhost:3001/health
- Docs: http://localhost:3001/docs
- OpenAPI JSON: http://localhost:3001/openapi.json

## Dependencies

See fastapi_app/requirements.txt for exact versions. Core packages:
- fastapi
- uvicorn[standard]
- pydantic>=2
- sqlalchemy>=2
- asyncpg
- passlib[bcrypt]
- PyJWT
- loguru

Dev/optional:
- python-dotenv (local workflows)
- slowapi (rate limiting)
- black/flake8/pytest

## Environment Variables

The server reads configuration solely from process environment variables. It does not load a .env automatically.

Server:
- HOST: Interface for Uvicorn bind. Defaults to 0.0.0.0
- PORT: Port for the server. Defaults to 3001
- LOG_LEVEL: Log level (e.g., debug, info). Defaults to info. REACT_APP_LOG_LEVEL is also honored
- NODE_ENV: Environment label (e.g., development, production). Defaults to development

CORS and Preview:
- CORS_ORIGIN: Comma-separated origins or "*" to allow any origin. If not set, the app infers a sensible default (typically http://localhost:3000)
- PREVIEW_MODE: true/false. When true, enables preview embedding headers for Kavia
- PREVIEW_FRAME_ANCESTORS: CSP frame-ancestors value when preview is enabled. Default is `'self' https://*.cloud.kavia.ai`

Authentication (JWT):
- JWT_SECRET: Secret used to sign and verify tokens. Required for protected endpoints; if missing, auth-dependent endpoints return 503
- JWT_EXPIRES_IN: Token lifetime (e.g., "3600s", "15m", "2h", "7d"). Defaults to 1h
- JWT_ISSUER: Issuer claim. Defaults to cloudunify-pro
- JWT_AUDIENCE: Audience claim. Defaults to cloudunify-pro-frontend

Database:
- DATABASE_URL: Preferred SQLAlchemy URL. If using postgres:// or postgresql://, it is normalized to postgresql+asyncpg:// automatically
- DB_CONNECTION_FILE: Optional file path containing a PostgreSQL URL (e.g., Database/db_connection.txt). Used when DATABASE_URL is unset

Seeding:
- PROJDEFN_DIR: Optional path to a .projdefn directory. Used by seeding endpoints to auto-discover JSON files
- SEED_ADMIN_TOKEN: Required token for production seeding endpoints (sent via X-Seed-Token header)

## Database configuration and fallback

The app favors DATABASE_URL. If it is missing, it attempts to extract a PostgreSQL URL from a text file, defaulting to Database/db_connection.txt (relative), or other workspace candidates. When a URL is found, it is normalized to use the asyncpg driver for async SQLAlchemy:

- postgresql:// → postgresql+asyncpg://
- postgres:// → postgresql+asyncpg://
- postgresql+psycopg2:// → postgresql+asyncpg://

Startup is non-blocking: If no database configuration is detected at startup, the application logs a warning and skips schema initialization; health endpoints (/, /health, /healthz) are available immediately.

## Endpoint contract (parity with legacy)

- POST /auth/login → { token, user }
- GET  /users/me   → current user profile
- GET  /users      → list users (optional ?orgId=UUID)
- GET  /organizations → list organizations
- GET  /resources  → list resources (optional ?provider=AWS|Azure|GCP&status=string)

All errors follow a consistent shape:
```
{
  "error": "Unauthorized",
  "message": "Invalid token",
  "code": 401,
  "details": null
}
```

## Seeding endpoints (internal)

Routes:
- POST /_internal/seed/{entity} where entity ∈ {organizations, users, resources}
- POST /_internal/seed          (same as /_internal/seed/all; can accept an object with arrays)
- POST /_internal/seed/all      (deterministic order: organizations → users → resources)
- GET  /_internal/seed/verify   (returns counts by entity and total)

Behavior:
- If a request body is provided, the corresponding array(s) are used.
- If no body is provided, the server attempts to discover a .projdefn directory (via PROJDEFN_DIR or auto-discovery) and load files matching:
  - *organizations*.json
  - *users*.json
  - *resources*.json
  It supports objects with an "items" array or bare arrays.

Upsert rules:
- organizations: ON CONFLICT(id) DO UPDATE (name)
- users: Two-pass upsert
  - With id present: ON CONFLICT(id) DO UPDATE
  - Without id: generate ids; ON CONFLICT(email) DO UPDATE
  - Passwords:
    - If passwordHash is provided, it is used as-is
    - Else if password is provided, it is bcrypt-hashed server side
- resources: ON CONFLICT(id) DO UPDATE (provider, type, name, tags, cost, status)

Production guard:
- In production (NODE_ENV=production), all seeding endpoints require the header X-Seed-Token matching SEED_ADMIN_TOKEN. Otherwise, 403 is returned.

## Logging

- Loguru-based logging with uvicorn integration
- Authorization headers are redacted before logging (both middleware and logger sanitization)
- Lightweight request logging middleware logs method, path, redacted headers, and response status; bodies are not logged
- LOG_LEVEL (or REACT_APP_LOG_LEVEL) controls verbosity

## CORS

CORS is configured via CORSMiddleware and driven by CORS_ORIGIN:
- CORS_ORIGIN can be a comma-separated list of origins or "*" for any origin
- If not specified, the app infers a sensible default for local development (typically http://localhost:3000)
- Credentials disabled (allow_credentials=false) to safely support wildcard origins

## Preview embedding (Kavia)

When PREVIEW_MODE=true:
- X-Frame-Options is removed, allowing CSP to govern embedding
- Content-Security-Policy frame-ancestors is set from PREVIEW_FRAME_ANCESTORS (default `'self' https://*.cloud.kavia.ai`)
- Cross-Origin-Embedder-Policy is set to unsafe-none; Cross-Origin-Opener-Policy to same-origin-allow-popups
- The response includes X-Preview-Mode: true

When PREVIEW_MODE=false:
- X-Frame-Options=DENY and CSP frame-ancestors 'none'
- The response includes X-Preview-Mode: false

## Frontend integration

Set VITE_API_BASE to your backend base, for example:
- VITE_API_BASE=http://localhost:3001

The frontend code prefers VITE_API_BASE or computes a local default (same host on port 3001). In preview environments, ensure:
- PREVIEW_MODE=true
- CORS_ORIGIN includes your Frontend URL (or use CORS_ORIGIN="*") for development
- JWT_SECRET is configured to enable authentication

## Legacy Express (deprecated)

The legacy Node/Express backend has been moved to Backend/legacy_express and is no longer the default runtime. It may be run temporarily if needed:

```
cd Backend/legacy_express
npm install
npm run dev       # development
# or
npm start         # build + run
```

New features and fixes must target the FastAPI application.
