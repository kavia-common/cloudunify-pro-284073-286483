'use strict';

const { query } = require('../db');

/**
 * Map a DB user row to API shape.
 */
function mapUserRow(row) {
  if (!row) return null;
  return {
    id: row.id,
    email: row.email,
    name: row.name,
    role: row.role,
    organizationId: row.organization_id || null,
    createdAt: row.created_at ? new Date(row.created_at).toISOString() : null,
  };
}

// PUBLIC_INTERFACE
async function getUserByEmail(email) {
  const result = await query(
    'SELECT id, email, name, role, organization_id, created_at, password_hash FROM users WHERE email = $1',
    [email]
  );
  return result.rows[0] || null;
}

// PUBLIC_INTERFACE
async function getUserById(id) {
  const result = await query(
    'SELECT id, email, name, role, organization_id, created_at FROM users WHERE id = $1',
    [id]
  );
  const row = result.rows[0] || null;
  return mapUserRow(row);
}

// PUBLIC_INTERFACE
async function listUsers(params = {}) {
  const values = [];
  const where = [];
  if (params.organizationId) {
    where.push('organization_id = $' + (values.length + 1));
    values.push(params.organizationId);
  }
  const sql = `SELECT id, email, name, role, organization_id, created_at FROM users ${
    where.length ? 'WHERE ' + where.join(' AND ') : ''
  } ORDER BY created_at DESC NULLS LAST, email ASC`;
  const result = await query(sql, values);
  return result.rows.map(mapUserRow);
}

module.exports = {
  getUserByEmail,
  getUserById,
  listUsers,
  mapUserRow,
};
