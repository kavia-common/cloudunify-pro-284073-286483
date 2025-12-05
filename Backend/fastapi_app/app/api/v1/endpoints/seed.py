"""
Seed endpoints (internal use):

- POST /_internal/seed/{entity}
- POST /_internal/seed
- POST /_internal/seed/all
- GET  /_internal/seed/verify

Behavior:
- If request body is provided, it's used (arrays of records).
- Otherwise, discover .projdefn (using PROJDEFN_DIR or searching for a '.projdefn' folder up the tree)
  and load files that match *<entity>*.json. If file content is an object with an 'items' array,
  it uses that array.
- Upserts are idempotent:
  - organizations: ON CONFLICT(id) DO UPDATE SET name=EXCLUDED.name
  - users: two-pass upsert:
      (a) those with id:   ON CONFLICT(id) DO UPDATE
      (b) those w/o id:    generate ids; ON CONFLICT(email) DO UPDATE
    Password handling: if 'passwordHash' provided, use as-is; else if 'password' provided, hash using bcrypt.
    If neither provided, password_hash is left unchanged in updates.
  - resources: ON CONFLICT(id) DO UPDATE (provider, type, name, tags, cost, status)
- In production (NODE_ENV=production), requires X-Seed-Token to match SEED_ADMIN_TOKEN.
"""
from __future__ import annotations

import json
import os
import re
import uuid
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple

from fastapi import APIRouter, Body, Depends, HTTPException, Request, status
from pydantic import BaseModel, Field
from sqlalchemy import Select, func, literal_column, select
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.init_db import ensure_schema
from app.db.session import get_session
from app.models.tables import Organization, Resource, User

from passlib.context import CryptContext

router = APIRouter(prefix="/_internal/seed", tags=["Seed"])

_pwd_ctx = CryptContext(schemes=["bcrypt"], deprecated="auto")

ENTITIES = ("organizations", "users", "resources")


def _bool_env(name: str) -> bool:
    raw = os.getenv(name)
    if raw is None:
        return False
    return str(raw).strip().lower() in {"1", "true", "yes", "y", "on"}


def _is_production() -> bool:
    return (os.getenv("NODE_ENV") or "").strip().lower() == "production"


# PUBLIC_INTERFACE
async def internal_seed_guard(request: Request) -> None:
    """Enforce X-Seed-Token header in production; allow all in non-production."""
    if not _is_production():
        return
    header_token = request.headers.get("x-seed-token") or request.headers.get("X-Seed-Token") or ""
    env_token = os.getenv("SEED_ADMIN_TOKEN", "")
    if not (env_token and header_token and header_token == env_token):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Access denied. Provide valid X-Seed-Token header in production.",
        )


def _now() -> datetime:
    return datetime.now(timezone.utc)


def _is_uuid_str(s: Any) -> bool:
    try:
        uuid.UUID(str(s))
        return True
    except Exception:
        return False


def _is_email(s: Any) -> bool:
    if not isinstance(s, str):
        return False
    return bool(re.match(r"^[^\s@]+@[^\s@]+\.[^\s@]+$", s))


def _to_datetime(val: Any) -> datetime:
    if isinstance(val, datetime):
        return val
    try:
        return datetime.fromisoformat(str(val))
    except Exception:
        return _now()


def _find_projdefn_root() -> Optional[Path]:
    explicit = os.getenv("PROJDEFN_DIR")
    if explicit:
        p = Path(explicit).expanduser()
        if p.is_dir():
            return p

    # Search upward from this file
    start = Path(__file__).resolve()
    for parent in list(start.parents)[:6]:
        candidate = parent / ".projdefn"
        if candidate.is_dir():
            return candidate
        parent_candidate = parent.parent / ".projdefn"
        if parent_candidate.is_dir():
            return parent_candidate

    # Try current working directory
    cwd_candidate = Path(os.getcwd()) / ".projdefn"
    if cwd_candidate.is_dir():
        return cwd_candidate

    return None


def _walk_json_files(root: Path) -> List[Path]:
    results: List[Path] = []
    stack = [root]
    while stack:
        current = stack.pop()
        for entry in current.iterdir():
            if entry.is_dir():
                stack.append(entry)
            elif entry.is_file() and entry.name.lower().endswith(".json"):
                results.append(entry)
    return results


# PUBLIC_INTERFACE
def load_entity_from_projdefn(entity: str) -> List[Dict[str, Any]]:
    """Load an entity array from .projdefn files that include the entity name fragment."""
    root = _find_projdefn_root()
    if not root:
        return []
    items: List[Dict[str, Any]] = []
    entity_l = entity.lower()
    for f in _walk_json_files(root):
        name_l = f.name.lower()
        if entity_l in name_l and name_l.endswith(".json"):
            try:
                parsed = json.loads(f.read_text(encoding="utf-8"))
                if isinstance(parsed, list):
                    items.extend(x for x in parsed if isinstance(x, dict))
                elif isinstance(parsed, dict) and isinstance(parsed.get("items"), list):
                    items.extend(x for x in parsed["items"] if isinstance(x, dict))
            except Exception:
                # Ignore malformed files and continue
                continue
    return items


@dataclass
class ValidationResult:
    valid: List[Dict[str, Any]]
    errors: List[Dict[str, Any]]


def _normalize_resource_status(s: Optional[str]) -> Optional[str]:
    if not s:
        return None
    v = str(s).strip().lower()
    if v in {"active", "inactive", "deleted"}:
        return v
    if v in {"running", "started", "start"}:
        return "active"
    if v in {"stopped", "stopping", "stop"}:
        return "inactive"
    if v in {"terminated", "terminating", "deleting", "removed"}:
        return "deleted"
    return s


def _validate_and_normalize(entity: str, records: Any) -> ValidationResult:
    valid: List[Dict[str, Any]] = []
    errors: List[Dict[str, Any]] = []

    if not isinstance(records, list):
        return ValidationResult(valid, [{"index": -1, "error": "Records payload must be an array"}])

    if entity == "organizations":
        for idx, rec in enumerate(records):
            obj = rec or {}
            name = obj.get("name")
            if not isinstance(name, str) or not name:
                errors.append({"index": idx, "error": "Invalid organization.name"})
                continue
            out = {
                "id": obj["id"] if _is_uuid_str(obj.get("id")) else str(uuid.uuid4()),
                "name": name,
                "created_at": _to_datetime(obj.get("createdAt")),
            }
            valid.append(out)
    elif entity == "users":
        for idx, rec in enumerate(records):
            obj = rec or {}
            email = obj.get("email")
            name = obj.get("name")
            role = obj.get("role") or "user"
            if not _is_email(email):
                errors.append({"index": idx, "error": "Invalid user.email"})
                continue
            if not isinstance(name, str) or not name:
                errors.append({"index": idx, "error": "Invalid user.name"})
                continue
            if not isinstance(role, str) or not role:
                errors.append({"index": idx, "error": "Invalid user.role"})
                continue

            had_id = _is_uuid_str(obj.get("id"))
            out = {
                "id": obj["id"] if had_id else None,
                "email": str(email).lower(),
                "name": name,
                "role": role,
                "organization_id": obj["organizationId"] if _is_uuid_str(obj.get("organizationId")) else None,
                "created_at": _to_datetime(obj.get("createdAt")),
                "__had_id": had_id,
            }
            # password handling
            pw_hash = obj.get("passwordHash")
            pw_plain = obj.get("password")
            if isinstance(pw_hash, str) and pw_hash:
                out["password_hash"] = pw_hash
            elif isinstance(pw_plain, str) and pw_plain:
                try:
                    out["password_hash"] = _pwd_ctx.hash(pw_plain)
                except Exception:
                    pass
            valid.append(out)
    elif entity == "resources":
        allowed = {"AWS", "Azure", "GCP"}
        for idx, rec in enumerate(records):
            obj = rec or {}
            provider = obj.get("provider")
            rtype = obj.get("type")
            name = obj.get("name")
            status = _normalize_resource_status(obj.get("status"))
            if provider not in allowed:
                errors.append({"index": idx, "error": "Invalid resource.provider (must be 'AWS'|'Azure'|'GCP')"})
                continue
            if not isinstance(rtype, str) or not rtype:
                errors.append({"index": idx, "error": "Invalid resource.type"})
                continue
            if not isinstance(name, str) or not name:
                errors.append({"index": idx, "error": "Invalid resource.name"})
                continue
            if not isinstance(status, str) or not status:
                errors.append({"index": idx, "error": "Invalid resource.status"})
                continue
            out = {
                "id": obj["id"] if _is_uuid_str(obj.get("id")) else str(uuid.uuid4()),
                "provider": provider,
                "type": rtype,
                "name": name,
                "tags": obj.get("tags") if isinstance(obj.get("tags"), dict) else {},
                "cost": float(obj.get("cost") or 0.0),
                "status": status,
                "created_at": _to_datetime(obj.get("createdAt")),
            }
            valid.append(out)
    else:
        errors.append({"index": -1, "error": f"Unsupported entity: {entity}"})

    return ValidationResult(valid=valid, errors=errors)


async def _upsert_organizations(session: AsyncSession, records: List[Dict[str, Any]]) -> Tuple[int, int]:
    if not records:
        return 0, 0
    stmt = (
        pg_insert(Organization)
        .values(records)
        .on_conflict_do_update(index_elements=[Organization.id], set_={"name": literal_column("EXCLUDED.name")})
        .returning(literal_column("(xmax = 0)").label("inserted"))
    )
    res = await session.execute(stmt)
    rows = res.all()
    inserted = sum(1 for r in rows if r.inserted is True)
    updated = len(rows) - inserted
    return inserted, updated


async def _upsert_users_by_id(session: AsyncSession, records: List[Dict[str, Any]]) -> Tuple[int, int]:
    if not records:
        return 0, 0
    set_map = {
        "email": literal_column("EXCLUDED.email"),
        "name": literal_column("EXCLUDED.name"),
        "role": literal_column("EXCLUDED.role"),
        "organization_id": literal_column("EXCLUDED.organization_id"),
        "password_hash": func.coalesce(literal_column("EXCLUDED.password_hash"), literal_column("users.password_hash")),
    }
    stmt = (
        pg_insert(User)
        .values(records)
        .on_conflict_do_update(index_elements=[User.id], set_=set_map)
        .returning(literal_column("(xmax = 0)").label("inserted"))
    )
    res = await session.execute(stmt)
    rows = res.all()
    inserted = sum(1 for r in rows if r.inserted is True)
    updated = len(rows) - inserted
    return inserted, updated


async def _upsert_users_by_email(session: AsyncSession, records: List[Dict[str, Any]]) -> Tuple[int, int]:
    if not records:
        return 0, 0
    # ensure ids present
    with_ids = []
    for r in records:
        rid = r.get("id")
        if not _is_uuid_str(rid):
            r = {**r, "id": str(uuid.uuid4())}
        with_ids.append(r)

    set_map = {
        "name": literal_column("EXCLUDED.name"),
        "role": literal_column("EXCLUDED.role"),
        "organization_id": literal_column("EXCLUDED.organization_id"),
        "password_hash": func.coalesce(literal_column("EXCLUDED.password_hash"), literal_column("users.password_hash")),
    }
    stmt = (
        pg_insert(User)
        .values(with_ids)
        .on_conflict_do_update(index_elements=[User.email], set_=set_map)
        .returning(literal_column("(xmax = 0)").label("inserted"))
    )
    res = await session.execute(stmt)
    rows = res.all()
    inserted = sum(1 for r in rows if r.inserted is True)
    updated = len(rows) - inserted
    return inserted, updated


async def _upsert_resources(session: AsyncSession, records: List[Dict[str, Any]]) -> Tuple[int, int, int]:
    if not records:
        return 0, 0, 0
    set_map = {
        "provider": literal_column("EXCLUDED.provider"),
        "type": literal_column("EXCLUDED.type"),
        "name": literal_column("EXCLUDED.name"),
        "tags": literal_column("EXCLUDED.tags"),
        "cost": literal_column("EXCLUDED.cost"),
        "status": literal_column("EXCLUDED.status"),
    }
    stmt = (
        pg_insert(Resource)
        .values(records)
        .on_conflict_do_update(index_elements=[Resource.id], set_=set_map)
        .returning(literal_column("(xmax = 0)").label("inserted"))
    )
    res = await session.execute(stmt)
    rows = res.all()
    inserted = sum(1 for r in rows if r.inserted is True)
    updated = len(rows) - inserted
    skipped = 0  # No conditional skip with current schema
    return inserted, updated, skipped


async def _seed_entity(session: AsyncSession, entity: str, records: Optional[List[Dict[str, Any]]]) -> Dict[str, Any]:
    if entity not in ENTITIES:
        return {
            "inserted": 0,
            "updated": 0,
            "skipped": 0,
            "errors": [{"index": -1, "error": f"Unsupported entity: {entity}"}],
        }

    await ensure_schema()

    source = records if isinstance(records, list) and records else load_entity_from_projdefn(entity)
    norm = _validate_and_normalize(entity, source)

    inserted = 0
    updated = 0
    skipped = len(norm.errors)

    if entity == "organizations":
        i, u = await _upsert_organizations(session, norm.valid)
        inserted += i
        updated += u
    elif entity == "users":
        with_id = [u for u in norm.valid if u.get("__had_id")]
        without_id = [u for u in norm.valid if not u.get("__had_id")]
        i1, u1 = await _upsert_users_by_id(session, with_id)
        i2, u2 = await _upsert_users_by_email(session, without_id)
        inserted += i1 + i2
        updated += u1 + u2
    elif entity == "resources":
        i, u, s = await _upsert_resources(session, norm.valid)
        inserted += i
        updated += u
        skipped += s

    return {"inserted": inserted, "updated": updated, "skipped": skipped, "errors": norm.errors[:10]}


class SeedAllBody(BaseModel):
    """Optional object with arrays to seed each entity."""

    organizations: Optional[List[Dict[str, Any]]] = Field(None, description="Array of organizations")
    users: Optional[List[Dict[str, Any]]] = Field(None, description="Array of users")
    resources: Optional[List[Dict[str, Any]]] = Field(None, description="Array of resources")


# PUBLIC_INTERFACE
@router.post(
    "/{entity}",
    summary="Seed mock data for a specific entity",
    description="Inserts or updates mock data into PostgreSQL. Uses request body array or discovers from .projdefn.",
    responses={
        200: {"description": "Seeding result"},
        400: {"description": "Invalid entity"},
        403: {"description": "Forbidden in production without X-Seed-Token"},
        500: {"description": "Internal error"},
    },
)
async def seed_one(
    entity: str,
    body: Optional[List[Dict[str, Any]]] = Body(default=None),
    _: None = Depends(internal_seed_guard),
    session: AsyncSession = Depends(get_session),
):
    """Seed a single entity with provided records or from .projdefn files."""
    if entity not in ENTITIES:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=f"Entity must be one of {', '.join(ENTITIES)}")
    result = await _seed_entity(session, entity, body if isinstance(body, list) else None)
    return result


# PUBLIC_INTERFACE
@router.post(
    "",
    summary="Seed all entities from .projdefn (no body required)",
    description="Convenience endpoint equivalent to POST /_internal/seed/all. Optional body to override arrays.",
    responses={
        200: {"description": "Aggregated seeding result"},
        403: {"description": "Forbidden in production without X-Seed-Token"},
        500: {"description": "Internal error"},
    },
)
async def seed_default(
    body: Optional[SeedAllBody] = Body(default=None),
    _: None = Depends(internal_seed_guard),
    session: AsyncSession = Depends(get_session),
):
    """Seed all entities. Uses provided arrays if present; otherwise discovers from .projdefn."""
    payload = body.model_dump() if isinstance(body, SeedAllBody) else {}
    results: Dict[str, Any] = {}
    totals = {"inserted": 0, "updated": 0, "skipped": 0}

    for entity in ("organizations", "users", "resources"):
        arr = payload.get(entity) if isinstance(payload, dict) else None
        res = await _seed_entity(session, entity, arr if isinstance(arr, list) else None)
        results[entity] = res
        totals["inserted"] += res.get("inserted", 0)
        totals["updated"] += res.get("updated", 0)
        totals["skipped"] += res.get("skipped", 0)

    return {**results, "total": totals}


# PUBLIC_INTERFACE
@router.post(
    "/all",
    summary="Seed all entities (organizations -> users -> resources)",
    description="Deterministic seeding order. Optional body to override arrays.",
    responses={
        200: {"description": "Aggregated seeding result"},
        403: {"description": "Forbidden in production without X-Seed-Token"},
        500: {"description": "Internal error"},
    },
)
async def seed_all(
    body: Optional[SeedAllBody] = Body(default=None),
    _: None = Depends(internal_seed_guard),
    session: AsyncSession = Depends(get_session),
):
    """Seed all entities in deterministic order."""
    return await seed_default(body=body, _=_, session=session)


class SeedVerifyResponse(BaseModel):
    """Seed verification summary."""

    ok: bool = Field(True, description="Indicates success")
    counts: Dict[str, int] = Field(..., description="Counts by entity and total")


# PUBLIC_INTERFACE
@router.get(
    "/verify",
    response_model=SeedVerifyResponse,
    summary="Verify seeded counts for organizations, users, and resources",
    description="Returns simple counts for each entity to confirm seeding completed successfully.",
    responses={
        200: {"description": "Counts summary"},
        403: {"description": "Forbidden in production without X-Seed-Token"},
        500: {"description": "Internal error"},
    },
)
async def seed_verify(
    _: None = Depends(internal_seed_guard),
    session: AsyncSession = Depends(get_session),
) -> SeedVerifyResponse:
    """Return counts per entity and total."""
    await ensure_schema()
    orgs_q = select(func.count()).select_from(Organization)
    users_q = select(func.count()).select_from(User)
    res_q = select(func.count()).select_from(Resource)

    r1 = await session.execute(orgs_q)
    r2 = await session.execute(users_q)
    r3 = await session.execute(res_q)

    organizations = int(r1.scalar() or 0)
    users = int(r2.scalar() or 0)
    resources = int(r3.scalar() or 0)
    total = organizations + users + resources
    return SeedVerifyResponse(ok=True, counts={"organizations": organizations, "users": users, "resources": resources, "total": total})
