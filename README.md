# cloudunify-pro-284073-286483

## Overview

CloudUnify Pro Backend exposes secure REST APIs for authentication, users, organizations, and multi-cloud resources with JWT-based auth and PostgreSQL persistence. OpenAPI is served dynamically at runtime.

- API Docs: `/docs`
- OpenAPI JSON: `/openapi.json`

The service uses environment variables for configuration (see `.env.example` under `Backend/`).

## Authentication

- POST `/auth/login`
  - Body: `{ "email": "user@example.com", "password": "secret" }`
  - Returns: `{ "token": "<JWT>", "user": { id, email, name, role, organizationId, createdAt } }`

- GET `/users/me`
  - Requires `Authorization: Bearer <JWT>`
  - Returns current authenticated user profile.

Example login:
```
curl -sX POST http://localhost:3001/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"alice@example.com","password":"password123"}'
```

Example profile:
```
curl -s http://localhost:3001/users/me \
  -H "Authorization: Bearer <JWT>"
```

## Users, Organizations, and Resources

- GET `/users` (optional `?orgId=<uuid>`)
- GET `/organizations`
- GET `/resources` (optional `?provider=AWS|Azure|GCP&status=<string>`)

All above require a valid JWT (Bearer token).

## Error Responses (Standardized)

All error responses conform to a consistent JSON shape:
```
{
  "error": "<machine_code>",
  "message": "<human-readable message>",
  "code": <http_status_code>,
  "details": { ...optional context... }
}
```

Examples:
- 401 Unauthorized: `{ "error": "unauthorized", "message": "Missing Authorization header", "code": 401 }`
- 404 Not Found: `{ "error": "not_found", "message": "Route not found", "code": 404 }`
- 500 Internal Error: `{ "error": "internal_error", "message": "Internal Server Error", "code": 500 }`

## OpenAPI

- Visual docs at `/docs` (runtime server URL is injected dynamically)
- Raw spec at `/openapi.json`
- Generate a static spec file:
  ```
  cd Backend
  npm run generate:openapi
  ```
  Output: `Backend/interfaces/openapi.json`

## Environment Variables

See `Backend/.env.example`. Key variables:
- JWT: `JWT_SECRET`, `JWT_EXPIRES_IN`, `JWT_ISSUER`, `JWT_AUDIENCE`
- CORS: `CORS_ORIGIN`
- DB: either `DATABASE_URL` or `PGHOST`, `PGPORT`, `PGUSER`, `PGPASSWORD`, `PGDATABASE`, `PGSSL`, `PGPOOL_MAX`
- Seeding: `SEED_ADMIN_TOKEN`, `PROJDEFN_DIR`
- Server: `PORT`, `HOST`, `LOG_LEVEL`

Do not hardcode secrets. Provide values via environment or a local `.env` file (not committed).

## Database

PostgreSQL access via `pg` with a pooled connection. On startup the server runs a lightweight `ensureSchema()`:
- `organizations` table
- `users` table (with `password_hash` column)
- `resources` table and helpful indices

Tables are created with `CREATE TABLE IF NOT EXISTS` so it is safe to start multiple times.

## Seeding Mock Data (Internal)

This backend exposes internal endpoints to load and upsert mock data from `.projdefn` JSON files into PostgreSQL. The upserts are idempotent and safe to run multiple times.

- POST `/_internal/seed/:entity`
  - `:entity` in [`organizations`, `users`, `resources`]
  - Body optional. If omitted, the server searches for a `.projdefn` directory and loads `*{entity}*.json` files, merging arrays across multiple files.
  - Returns: `{ inserted, updated, skipped, errors }`
  - Password support for users:
    - You can provide either `password` (plaintext) OR `passwordHash` (bcrypt hash).
    - If `password` is provided, it is hashed server-side using bcryptjs with a secure salt round.
    - If both are omitted, the user will be created/updated without a password (login will fail for that user).
- POST `/_internal/seed/all`
  - Seeds in order: organizations -> users -> resources
  - Optional request body:
    ```
    {
      "organizations": [ ... ],
      "users": [ ... ],
      "resources": [ ... ]
    }
    ```
  - Returns aggregated per-entity stats and totals.

Security:
- In non-production (`NODE_ENV !== 'production'`), endpoints are open to ease local development.
- In production, you must include the header `X-Seed-Token` matching env `SEED_ADMIN_TOKEN`.

Examples (local):
```
curl -X POST http://localhost:3001/_internal/seed/organizations -H "Content-Type: application/json"
curl -X POST http://localhost:3001/_internal/seed/users -H "Content-Type: application/json"
curl -X POST http://localhost:3001/_internal/seed/resources -H "Content-Type: application/json"
```

Example with explicit user payload (password hashing supported):
```
curl -X POST http://localhost:3001/_internal/seed/users \
  -H "Content-Type: application/json" \
  -d '[
    {"email":"alice@example.com","name":"Alice","role":"admin","password":"password123"},
    {"email":"bob@example.com","name":"Bob","role":"user","organizationId":"2f42b2d1-2a4b-4d65-8ed5-3a1c9a9d1b07"}
  ]'
```

Production example (requires token):
```
curl -X POST https://api.example.com/_internal/seed/all \
  -H "Content-Type: application/json" \
  -H "X-Seed-Token: ${SEED_ADMIN_TOKEN}"
```

## Development

- Dev run (TypeScript):
  ```
  cd Backend
  npm install
  npm run dev
  ```
- Build and run:
  ```
  npm run build
  npm start
  ```

Note: The build is configured to compile TypeScript sources and copy JavaScript route/service/controller files to `dist`. It excludes `src/app.js` and `src/server.js` to avoid conflicts with the TypeScript entrypoints.

## Health

- GET `/` returns:
  ```
  {
    "status": "ok",
    "message": "Service is healthy",
    "timestamp": "...",
    "environment": "development"
  }
  ```

## Database configuration alignment (DATABASE_URL)

The Backend reads the database connection string from the environment variable `DATABASE_URL`. This must match the DSN defined by the Database container in `Database/db_connection.txt`.

- If `Database/db_connection.txt` contains a line like:
  ```
  psql postgresql://appuser:dbuser123@localhost:5000/myapp
  ```
  set Backend `DATABASE_URL` to the DSN part (everything after `psql `):
  ```
  DATABASE_URL=postgresql://appuser:dbuser123@localhost:5000/myapp
  ```

- On startup, the server:
  - Logs a sanitized form of the connection source (username/password hidden)
  - Applies a lightweight schema setup via `ensureSchema()`:
    - Creates tables if missing: `organizations`, `users` (with `password_hash`), `resources`
    - Ensures helpful indexes exist:
      - Unique index on `users(email)` (if not already created by constraint)
      - Index on `users(organization_id)` for faster org-scoped queries
      - Indexes on `resources(provider)` and `resources(status)`

Optional DB environment variables:
- `PGSSL` (default `false`) – enable SSL (`rejectUnauthorized: false`)
- `PGPOOL_MAX` (default `10`) – connection pool size
- `PGAPPNAME` (default `cloudunify-pro-backend`) – application_name for DB sessions
- `PGCONNECT_TIMEOUT_MS` (default `5000`) – connection timeout
- `PGIDLE_TIMEOUT_MS` (default `30000`) – idle timeout

An example `.env.example` is provided at `Backend/.env.example`. Copy it to `.env` and adjust as needed. Do not commit your `.env`.
