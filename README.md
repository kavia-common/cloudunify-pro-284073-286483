# cloudunify-pro-284073-286483

## Seed Mock Data (Internal)

This backend exposes internal endpoints to load and upsert mock data from `.projdefn` JSON files into PostgreSQL. The upserts are idempotent and safe to run multiple times.

- POST /_internal/seed/:entity
  - `:entity` in [`organizations`, `users`, `resources`]
  - Body optional. If omitted, the server searches for `.projdefn` directory and loads `*{entity}*.json` files, merging arrays across multiple files.
  - Returns: `{ inserted, updated, skipped, errors }`
- POST /_internal/seed/all
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
- In non-production (NODE_ENV !== 'production'), endpoints are open to ease local development.
- In production, you must include header `X-Seed-Token` matching env `SEED_ADMIN_TOKEN`.

Environment variables (see `.env.example`):
```
PGHOST, PGPORT, PGUSER, PGPASSWORD, PGDATABASE, PGSSL, PGPOOL_MAX
SEED_ADMIN_TOKEN
PROJDEFN_DIR (optional override path to .projdefn)
```

Example: seed from .projdefn automatically (local)
```
curl -X POST http://localhost:3000/_internal/seed/organizations -H "Content-Type: application/json"
curl -X POST http://localhost:3000/_internal/seed/users -H "Content-Type: application/json"
curl -X POST http://localhost:3000/_internal/seed/resources -H "Content-Type: application/json"
```

Example: seed all in one call
```
curl -X POST http://localhost:3000/_internal/seed/all -H "Content-Type: application/json"
```

Example: passing explicit payload for users
```
curl -X POST http://localhost:3000/_internal/seed/users \
  -H "Content-Type: application/json" \
  -d '[
    {"email":"alice@example.com","name":"Alice","role":"admin"},
    {"email":"bob@example.com","name":"Bob","role":"user","organizationId":"2f42b2d1-2a4b-4d65-8ed5-3a1c9a9d1b07"}
  ]'
```

Production example (requires token)
```
curl -X POST https://api.example.com/_internal/seed/all \
  -H "Content-Type: application/json" \
  -H "X-Seed-Token: ${SEED_ADMIN_TOKEN}"
```

OpenAPI
- Visit /docs to view the API documentation with the Seed endpoints included.
- You can generate a static openapi.json by running: `npm run generate:openapi` inside Backend.