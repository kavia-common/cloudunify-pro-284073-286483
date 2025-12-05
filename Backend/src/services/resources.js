'use strict';

const { query } = require('../db');

function mapResourceRow(row) {
  return {
    id: row.id,
    provider: row.provider,
    type: row.type,
    name: row.name,
    tags: row.tags || {},
    cost: Number(row.cost || 0),
    status: row.status,
    createdAt: row.created_at ? new Date(row.created_at).toISOString() : null,
  };
}

// PUBLIC_INTERFACE
async function listResources(filters = {}) {
  const values = [];
  const where = [];
  if (filters.provider) {
    where.push(`provider = $${values.length + 1}`);
    values.push(filters.provider);
  }
  if (filters.status) {
    where.push(`status = $${values.length + 1}`);
    values.push(filters.status);
  }

  const sql = `SELECT id, provider, type, name, tags, cost, status, created_at
               FROM resources
               ${where.length ? 'WHERE ' + where.join(' AND ') : ''}
               ORDER BY created_at DESC NULLS LAST, name ASC`;
  const result = await query(sql, values);
  return result.rows.map(mapResourceRow);
}

module.exports = {
  listResources,
};
