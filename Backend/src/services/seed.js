'use strict';

const fs = require('fs');
const path = require('path');
const { randomUUID } = require('crypto');
const bcrypt = require('bcryptjs');
const { query, ensureSchema } = require('../db');

const ENTITIES = ['users', 'organizations', 'resources'];

function isUUIDv4(str) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(str);
}

function isEmail(str) {
  // Basic email check
  return typeof str === 'string' && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(str);
}

function toISODateOrNow(val) {
  if (!val) return new Date();
  const d = new Date(val);
  return Number.isNaN(d.getTime()) ? new Date() : d;
}

function chunkArray(arr, size) {
  const chunks = [];
  for (let i = 0; i < arr.length; i += size) {
    chunks.push(arr.slice(i, i + size));
  }
  return chunks;
}

/**
 * Ascend the directory tree to discover a ".projdefn" folder if present.
 */
function findProjdefnRoot() {
  const explicit = process.env.PROJDEFN_DIR;
  if (explicit && fs.existsSync(explicit) && fs.statSync(explicit).isDirectory()) {
    return explicit;
  }

  // Start near this file and ascend a few levels to find .projdefn
  let cursor = path.resolve(__dirname);
  for (let i = 0; i < 6; i += 1) {
    const candidate = path.join(cursor, '.projdefn');
    if (fs.existsSync(candidate) && fs.statSync(candidate).isDirectory()) {
      return candidate;
    }
    // also check sibling in project root
    const parentCandidate = path.join(cursor, '..', '.projdefn');
    if (fs.existsSync(parentCandidate) && fs.statSync(parentCandidate).isDirectory()) {
      return parentCandidate;
    }
    cursor = path.join(cursor, '..');
  }

  // Try process.cwd()
  const cwdCandidate = path.join(process.cwd(), '.projdefn');
  if (fs.existsSync(cwdCandidate) && fs.statSync(cwdCandidate).isDirectory()) {
    return cwdCandidate;
  }

  return null;
}

function walkDirCollectJsonFiles(dirPath) {
  const results = [];
  const stack = [dirPath];

  while (stack.length) {
    const current = stack.pop();
    const entries = fs.readdirSync(current, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(current, entry.name);
      if (entry.isDirectory()) {
        stack.push(fullPath);
      } else if (entry.isFile() && entry.name.toLowerCase().endsWith('.json')) {
        results.push(fullPath);
      }
    }
  }

  return results;
}

/**
 * Load arrays from .projdefn for a given entity by matching file names containing that entity.
 * Multiple files are merged into a single array.
 */
// PUBLIC_INTERFACE
function loadEntityFromProjdefn(entity) {
  const projRoot = findProjdefnRoot();
  if (!projRoot) {
    return [];
  }

  const allJsonFiles = walkDirCollectJsonFiles(projRoot);
  const matched = allJsonFiles.filter((f) =>
    f.toLowerCase().includes(`${entity.toLowerCase()}`) &&
    (f.toLowerCase().includes('.json'))
  );

  let items = [];
  for (const file of matched) {
    try {
      const raw = fs.readFileSync(file, 'utf-8');
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        items = items.concat(parsed);
      } else if (Array.isArray(parsed?.items)) {
        items = items.concat(parsed.items);
      }
    } catch (err) {
      console.error(`[seed] Failed to parse JSON file: ${file}`, err.message);
    }
  }

  return items;
}

/**
 * Validate and normalize records for an entity. Invalid ones are returned in errors.
 * For missing IDs (where allowed), IDs are generated.
 */
function validateAndNormalize(entity, records) {
  const valid = [];
  const errors = [];

  if (!Array.isArray(records)) {
    return { valid, errors: [{ index: -1, error: 'Records payload must be an array' }] };
  }

  if (entity === 'organizations') {
    records.forEach((rec, idx) => {
      const obj = rec || {};
      const out = {
        id: obj.id && typeof obj.id === 'string' && isUUIDv4(obj.id) ? obj.id : randomUUID(),
        name: obj.name,
        createdAt: toISODateOrNow(obj.createdAt),
      };

      if (!out.name || typeof out.name !== 'string') {
        errors.push({ index: idx, error: 'Invalid organization.name' });
        return;
      }

      valid.push(out);
    });
  } else if (entity === 'users') {
    records.forEach((rec, idx) => {
      const obj = rec || {};
      const hadId = !!obj.id && typeof obj.id === 'string' && isUUIDv4(obj.id);
      // For users, don't generate id immediately for hadId === false; we will handle two-pass upsert.
      const out = {
        id: hadId ? obj.id : null,
        email: obj.email,
        name: obj.name,
        role: obj.role,
        organizationId:
          obj.organizationId && typeof obj.organizationId === 'string' && isUUIDv4(obj.organizationId)
            ? obj.organizationId
            : null,
        createdAt: toISODateOrNow(obj.createdAt),
        __hadId: hadId, // internal marker to split upsert strategy
        // Optional password fields for seeding:
        password: typeof obj.password === 'string' ? obj.password : undefined,
        passwordHash: typeof obj.passwordHash === 'string' ? obj.passwordHash : undefined,
      };

      if (!isEmail(out.email)) {
        errors.push({ index: idx, error: 'Invalid user.email' });
        return;
      }
      if (!out.name || typeof out.name !== 'string') {
        errors.push({ index: idx, error: 'Invalid user.name' });
        return;
      }
      if (!out.role || typeof out.role !== 'string') {
        errors.push({ index: idx, error: 'Invalid user.role' });
        return;
      }

      valid.push(out);
    });
  } else if (entity === 'resources') {
    const allowedProviders = ['AWS', 'Azure', 'GCP'];
    records.forEach((rec, idx) => {
      const obj = rec || {};
      const id = obj.id && typeof obj.id === 'string' && isUUIDv4(obj.id) ? obj.id : randomUUID();
      const provider = typeof obj.provider === 'string' ? obj.provider : null;
      const providerOk = provider && allowedProviders.includes(provider);
      const tagsObj = obj.tags && typeof obj.tags === 'object' && !Array.isArray(obj.tags) ? obj.tags : {};
      const costNum = Number(obj.cost);
      const statusStr = typeof obj.status === 'string' ? obj.status : null;

      const out = {
        id,
        provider,
        type: obj.type,
        name: obj.name,
        tags: tagsObj,
        cost: Number.isFinite(costNum) ? costNum : 0,
        status: statusStr,
        createdAt: toISODateOrNow(obj.createdAt),
      };

      if (!providerOk) {
        errors.push({ index: idx, error: 'Invalid resource.provider (must be \'AWS\'|\'Azure\'|\'GCP\')' });
        return;
      }
      if (!out.type || typeof out.type !== 'string') {
        errors.push({ index: idx, error: 'Invalid resource.type' });
        return;
      }
      if (!out.name || typeof out.name !== 'string') {
        errors.push({ index: idx, error: 'Invalid resource.name' });
        return;
      }
      if (!out.status) {
        errors.push({ index: idx, error: 'Invalid resource.status' });
        return;
      }

      valid.push(out);
    });
  } else {
    errors.push({ index: -1, error: `Unsupported entity: ${entity}` });
  }

  return { valid, errors };
}

/**
 * Build VALUES placeholders for a bulk INSERT.
 */
function buildValuesPlaceholders(rows, cols) {
  const parts = [];
  let idx = 1;
  for (let r = 0; r < rows; r += 1) {
    const placeholders = [];
    for (let c = 0; c < cols; c += 1) {
      placeholders.push(`$${idx}`);
      idx += 1;
    }
    parts.push(`(${placeholders.join(', ')})`);
  }
  return parts.join(', ');
}

/**
 * Upsert organizations by id
 */
async function upsertOrganizations(records) {
  if (!records.length) return { inserted: 0, updated: 0 };

  const batchSize = 100;
  let inserted = 0;
  let updated = 0;

  for (const batch of chunkArray(records, batchSize)) {
    const cols = ['id', 'name', 'created_at'];
    const values = [];
    const params = [];

    for (const r of batch) {
      params.push(r.id, r.name, r.createdAt);
    }
    const placeholders = buildValuesPlaceholders(batch.length, cols.length);

    const sql = `
      INSERT INTO organizations (${cols.join(', ')})
      VALUES ${placeholders}
      ON CONFLICT (id) DO UPDATE
      SET name = EXCLUDED.name
      RETURNING (xmax = 0) AS inserted;
    `;
    const result = await query(sql, params);
    const ins = result.rows.filter((x) => x.inserted === true).length;
    inserted += ins;
    updated += result.rows.length - ins;
  }

  return { inserted, updated };
}

/**
 * Upsert users by id (for those who had id in input)
 */
async function upsertUsersById(records) {
  if (!records.length) return { inserted: 0, updated: 0 };
  const batchSize = 100;
  let inserted = 0;
  let updated = 0;

  for (const batch of chunkArray(records, batchSize)) {
    const cols = ['id', 'email', 'name', 'role', 'organization_id', 'created_at', 'password_hash'];
    const params = [];
    for (const r of batch) {
      const hashed =
        typeof r.passwordHash === 'string' && r.passwordHash
          ? r.passwordHash
          : typeof r.password === 'string' && r.password
            ? bcrypt.hashSync(r.password, 10)
            : null;
      params.push(r.id, r.email, r.name, r.role, r.organizationId, r.createdAt, hashed);
    }
    const placeholders = buildValuesPlaceholders(batch.length, cols.length);
    const sql = `
      INSERT INTO users (${cols.join(', ')})
      VALUES ${placeholders}
      ON CONFLICT (id) DO UPDATE
      SET email = EXCLUDED.email,
          name = EXCLUDED.name,
          role = EXCLUDED.role,
          organization_id = EXCLUDED.organization_id,
          password_hash = COALESCE(EXCLUDED.password_hash, users.password_hash)
      RETURNING (xmax = 0) AS inserted;
    `;
    const result = await query(sql, params);
    const ins = result.rows.filter((x) => x.inserted === true).length;
    inserted += ins;
    updated += result.rows.length - ins;
  }
  return { inserted, updated };
}

/**
 * Upsert users by email (for those absent id in input; we generate ids)
 */
async function upsertUsersByEmail(records) {
  if (!records.length) return { inserted: 0, updated: 0 };
  const batchSize = 100;
  let inserted = 0;
  let updated = 0;

  for (const batch of chunkArray(records, batchSize)) {
    const cols = ['id', 'email', 'name', 'role', 'organization_id', 'created_at', 'password_hash'];
    const params = [];
    const withIds = batch.map((r) => ({
      ...r,
      id: r.id && isUUIDv4(r.id) ? r.id : randomUUID(),
    }));

    for (const r of withIds) {
      const hashed =
        typeof r.passwordHash === 'string' && r.passwordHash
          ? r.passwordHash
          : typeof r.password === 'string' && r.password
            ? bcrypt.hashSync(r.password, 10)
            : null;
      params.push(r.id, r.email, r.name, r.role, r.organizationId, r.createdAt, hashed);
    }
    const placeholders = buildValuesPlaceholders(withIds.length, cols.length);
    const sql = `
      INSERT INTO users (${cols.join(', ')})
      VALUES ${placeholders}
      ON CONFLICT (email) DO UPDATE
      SET name = EXCLUDED.name,
          role = EXCLUDED.role,
          organization_id = EXCLUDED.organization_id,
          password_hash = COALESCE(EXCLUDED.password_hash, users.password_hash)
      RETURNING (xmax = 0) AS inserted;
    `;
    const result = await query(sql, params);
    const ins = result.rows.filter((x) => x.inserted === true).length;
    inserted += ins;
    updated += result.rows.length - ins;
  }
  return { inserted, updated };
}

/**
 * Upsert resources by id
 */
async function upsertResources(records) {
  if (!records.length) return { inserted: 0, updated: 0 };

  const batchSize = 100;
  let inserted = 0;
  let updated = 0;

  for (const batch of chunkArray(records, batchSize)) {
    const cols = ['id', 'provider', 'type', 'name', 'tags', 'cost', 'status', 'created_at'];
    const params = [];
    for (const r of batch) {
      params.push(r.id, r.provider, r.type, r.name, JSON.stringify(r.tags || {}), r.cost, r.status, r.createdAt);
    }
    const placeholders = buildValuesPlaceholders(batch.length, cols.length);

    const sql = `
      INSERT INTO resources (${cols.join(', ')})
      VALUES ${placeholders}
      ON CONFLICT (id) DO UPDATE
      SET provider = EXCLUDED.provider,
          type = EXCLUDED.type,
          name = EXCLUDED.name,
          tags = EXCLUDED.tags,
          cost = EXCLUDED.cost,
          status = EXCLUDED.status
      RETURNING (xmax = 0) AS inserted;
    `;
    const result = await query(sql, params);
    const ins = result.rows.filter((x) => x.inserted === true).length;
    inserted += ins;
    updated += result.rows.length - ins;
  }

  return { inserted, updated };
}

/**
 * Seed a single entity. If bodyRecords is empty or not present, load from .projdefn
 */
// PUBLIC_INTERFACE
async function seedEntity(entity, bodyRecords) {
  if (!ENTITIES.includes(entity)) {
    return {
      inserted: 0,
      updated: 0,
      skipped: 0,
      errors: [{ index: -1, error: `Unsupported entity: ${entity}` }],
    };
  }

  await ensureSchema();

  const sourceRecords = Array.isArray(bodyRecords) && bodyRecords.length > 0
    ? bodyRecords
    : loadEntityFromProjdefn(entity);

  const { valid, errors } = validateAndNormalize(entity, sourceRecords);

  let inserted = 0;
  let updated = 0;
  let skipped = errors.length;

  if (entity === 'organizations') {
    const res = await upsertOrganizations(valid);
    inserted += res.inserted;
    updated += res.updated;
  } else if (entity === 'users') {
    // Split by those that originally had ids vs those that did not
    const withId = valid.filter((u) => u.__hadId);
    const withoutId = valid.filter((u) => !u.__hadId);

    // Ensure unique index on users(email) is already handled by ensureSchema()
    const r1 = await upsertUsersById(withId);
    const r2 = await upsertUsersByEmail(withoutId);
    inserted += r1.inserted + r2.inserted;
    updated += r1.updated + r2.updated;
  } else if (entity === 'resources') {
    const res = await upsertResources(valid);
    inserted += res.inserted;
    updated += res.updated;
  }

  // Log results
  console.log(`[seed] ${entity}: inserted=${inserted}, updated=${updated}, skipped=${skipped}`);

  return {
    inserted,
    updated,
    skipped,
    errors: errors.slice(0, 10),
  };
}

/**
 * Seed all in deterministic order: organizations -> users -> resources
 */
// PUBLIC_INTERFACE
async function seedAll(payloadMap) {
  await ensureSchema();

  const results = {};
  const order = ['organizations', 'users', 'resources'];
  let tInserted = 0;
  let tUpdated = 0;
  let tSkipped = 0;

  for (const entity of order) {
    const body = payloadMap && Array.isArray(payloadMap[entity]) ? payloadMap[entity] : undefined;
    const res = await seedEntity(entity, body);
    results[entity] = {
      inserted: res.inserted,
      updated: res.updated,
      skipped: res.skipped,
      errors: res.errors,
    };
    tInserted += res.inserted;
    tUpdated += res.updated;
    tSkipped += res.skipped;
  }

  return {
    ...results,
    total: {
      inserted: tInserted,
      updated: tUpdated,
      skipped: tSkipped,
    },
  };
}

/**
 * Return counts for seeded entities for verification.
 */
// PUBLIC_INTERFACE
async function getSeedCounts() {
  await ensureSchema();
  const [orgs, users, resources] = await Promise.all([
    query('SELECT COUNT(*)::int AS c FROM organizations', []),
    query('SELECT COUNT(*)::int AS c FROM users', []),
    query('SELECT COUNT(*)::int AS c FROM resources', []),
  ]);

  const counts = {
    organizations: (orgs.rows[0] && orgs.rows[0].c) || 0,
    users: (users.rows[0] && users.rows[0].c) || 0,
    resources: (resources.rows[0] && resources.rows[0].c) || 0,
  };
  return {
    ...counts,
    total: counts.organizations + counts.users + counts.resources,
  };
}

module.exports = {
  ENTITIES,
  loadEntityFromProjdefn,
  seedEntity,
  seedAll,
  getSeedCounts,
};
