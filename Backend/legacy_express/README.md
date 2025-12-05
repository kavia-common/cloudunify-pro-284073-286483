# CloudUnify Pro — Legacy Express Backend (Deprecated)

This folder contains the deprecated Express/Node.js backend. FastAPI is now the default backend and should be used for all new development (`../fastapi_app/`).

## Run (only if necessary)

- cd Backend/legacy_express
- npm install
- npm run dev  (development)
- npm start     (build + run)

API docs (when running): http://localhost:3001/docs

## OpenAPI (legacy)

To regenerate the legacy OpenAPI JSON:
- npm run generate:openapi
This writes to the parent folder: `../interfaces/openapi.json`.

## Notes

- This codebase is kept for reference during migration and may be removed once no longer needed.
- Security, CORS, and middleware behavior in production is defined by the FastAPI implementation.
