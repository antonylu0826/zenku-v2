import crypto from 'crypto';
import { getDb, dbNow } from './index';

export interface PermissionRow {
  id: string;
  role: string;
  table_name: string;
  can_read: number;
  can_create: number;
  can_update: number;
  can_delete: number;
  created_at: string;
  updated_at: string;
}

async function getUserRoleIds(userId: string): Promise<string[]> {
  const { rows } = await getDb().query<{ role_id: string }>(
    `SELECT role_id FROM _zenku_role_members WHERE user_id = ?`, [userId]
  );
  return ['user', ...rows.map(r => r.role_id)];
}

export async function listPermissions(role?: string): Promise<PermissionRow[]> {
  const db = getDb();
  if (role) {
    const { rows } = await db.query<PermissionRow>(
      `SELECT * FROM _zenku_permissions WHERE role = ? ORDER BY table_name`,
      [role]
    );
    return rows;
  }
  const { rows } = await db.query<PermissionRow>(
    `SELECT * FROM _zenku_permissions ORDER BY role, table_name`
  );
  return rows;
}

export async function upsertPermission(
  role: string,
  tableName: string,
  perms: { can_read: boolean; can_create: boolean; can_update: boolean; can_delete: boolean }
): Promise<PermissionRow> {
  const db = getDb();
  const now = dbNow();
  const { rows: existing } = await db.query<PermissionRow>(
    `SELECT * FROM _zenku_permissions WHERE role = ? AND table_name = ?`,
    [role, tableName]
  );
  if (existing[0]) {
    await db.execute(
      `UPDATE _zenku_permissions SET can_read = ?, can_create = ?, can_update = ?, can_delete = ?, updated_at = ? WHERE role = ? AND table_name = ?`,
      [perms.can_read ? 1 : 0, perms.can_create ? 1 : 0, perms.can_update ? 1 : 0, perms.can_delete ? 1 : 0, now, role, tableName]
    );
    const { rows } = await db.query<PermissionRow>(
      `SELECT * FROM _zenku_permissions WHERE role = ? AND table_name = ?`,
      [role, tableName]
    );
    return rows[0];
  }
  const id = crypto.randomUUID();
  await db.execute(
    `INSERT INTO _zenku_permissions (id, role, table_name, can_read, can_create, can_update, can_delete, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [id, role, tableName, perms.can_read ? 1 : 0, perms.can_create ? 1 : 0, perms.can_update ? 1 : 0, perms.can_delete ? 1 : 0, now, now]
  );
  const { rows } = await db.query<PermissionRow>(
    `SELECT * FROM _zenku_permissions WHERE id = ?`,
    [id]
  );
  return rows[0];
}

export async function deletePermission(id: string): Promise<boolean> {
  const result = await getDb().execute(
    `DELETE FROM _zenku_permissions WHERE id = ?`,
    [id]
  );
  return (result.rowsAffected ?? 0) > 0;
}

/**
 * Check if a user has the given permission on a table.
 * Checks 'user' role rules + all custom roles assigned to the user (OR union).
 * Exact table rule takes priority over wildcard '*' within each role.
 */
/**
 * Check if a user has the given permission on a table.
 * Checks 'user' role rules + all custom roles assigned to the user (OR union).
 * Exact table rule takes priority over wildcard '*' within each role.
 */
export async function hasPermission(
  userId: string,
  tableName: string,
  action: 'can_read' | 'can_create' | 'can_update' | 'can_delete'
): Promise<boolean> {
  const roleIds = await getUserRoleIds(userId);
  const placeholders = roleIds.map(() => '?').join(', ');
  const { rows } = await getDb().query<PermissionRow>(
    `SELECT * FROM _zenku_permissions WHERE role IN (${placeholders}) AND table_name IN (?, '*')`,
    [...roleIds, tableName]
  );

  const byRole = new Map<string, { exact?: PermissionRow; wildcard?: PermissionRow }>();
  for (const row of rows) {
    if (!byRole.has(row.role)) byRole.set(row.role, {});
    const entry = byRole.get(row.role)!;
    if (row.table_name === tableName) entry.exact = row;
    else entry.wildcard = row;
  }

  for (const entry of byRole.values()) {
    const effective = entry.exact ?? entry.wildcard;
    if (effective?.[action] === 1) return true;
  }
  return false;
}

/** Returns the effective permission list for a user (union across user role + custom roles). */
export async function getEffectivePermissions(userId: string): Promise<PermissionRow[]> {
  const roleIds = await getUserRoleIds(userId);
  const placeholders = roleIds.map(() => '?').join(', ');
  const { rows } = await getDb().query<PermissionRow>(
    `SELECT * FROM _zenku_permissions WHERE role IN (${placeholders}) ORDER BY role, table_name`,
    roleIds
  );
  return rows;
}
