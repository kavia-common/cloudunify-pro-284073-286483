# CloudUnify Pro — FastAPI Backend (Scaffold)

This folder contains a FastAPI scaffold for migrating the backend to Python/FastAPI. It runs on port 3001 by default and includes:
- CORS configuration via environment variables (CORS_ORIGIN).
- Preview embedding headers for Kavia preview iframes (PREVIEW_MODE=true).
- Health routes: `/`, `/healthz`, `/health`.
- OpenAPI docs available at `/docs` and `/openapi.json`.

Note: The existing Express backend remains intact. This scaffold can be run separately while migration progresses.

## Getting Started

1. Create and activate a virtual environment (example with Python 3.11+):
   ```
   cd Backend/fastapi_app
   python -m venv .venv
   source .venv/bin/activate  # Windows: .venv\Scripts\activate
   ```

2. Install dependencies:
   ```
   pip install -r requirements.txt
   ```

3. Configure environment (optional):
   - Copy `.env.example` to your runtime environment (your CI or launcher will set env vars).
   - The app reads from environment variables directly; it does not read `.env` files itself.

4. Run the server on port 3001 (default):
   ```
   python serve.py
   ```
   or
   ```
   uvicorn app.main:app --host 0.0.0.0 --port 3001
   ```

Now open:
- Docs: http://localhost:3001/docs
- OpenAPI JSON: http://localhost:3001/openapi.json

## Configuration

Environment variables (see `.env.example`):
- Server:
  - `PORT` (default: 3001)
  - `HOST` (default: 0.0.0.0)
  - `LOG_LEVEL` (default: `info`, also respects `REACT_APP_LOG_LEVEL`)
  - `NODE_ENV` (default: `development`)
- CORS:
  - `CORS_ORIGIN` (default: `*`), comma-separated list or `*`
- Preview/Embed:
  - `PREVIEW_MODE` (default: `false`)
  - `PREVIEW_FRAME_ANCESTORS` (default: `'self' https://*.cloud.kavia.ai`)

When `PREVIEW_MODE=true`, responses include:
- `Content-Security-Policy: frame-ancestors 'self' https://*.cloud.kavia.ai`
- `Cross-Origin-Opener-Policy: same-origin-allow-popups`
- `Cross-Origin-Embedder-Policy: unsafe-none`
- The middleware also removes any `X-Frame-Options` header to allow embedding.

## Health Endpoints

- GET `/` — Returns a JSON object with status, message, timestamp, and environment.
- GET `/healthz` and `/health` — Same response, suitable for probes.

Example:
```
{
  "status": "ok",
  "message": "Service is healthy",
  "timestamp": "2025-01-01T12:34:56.789012+00:00",
  "environment": "development"
}
```

## Notes

- This is an initial scaffold; database integration (SQLAlchemy/psycopg) and routes will be added in subsequent steps of the migration.
- Do not hardcode secrets. Supply env vars via your deployment environment.

