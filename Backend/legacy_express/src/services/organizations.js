'use strict';

const { query } = require('../db');

function mapOrgRow(row) {
  return {
    id: row.id,
    name: row.name,
    createdAt: row.created_at ? new Date(row.created_at).toISOString() : null,
  };
}

// PUBLIC_INTERFACE
async function listOrganizations() {
  const result = await query('SELECT id, name, created_at FROM organizations ORDER BY name ASC', []);
  return result.rows.map(mapOrgRow);
}

module.exports = {
  listOrganizations,
};
