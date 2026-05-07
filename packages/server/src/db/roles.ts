import crypto from 'crypto';
import { getDb, dbNow } from './index';

export interface RoleRow {
  id: string;
  name: string;
  description: string | null;
  created_at: string;
  updated_at: string;
}

export async function listRoles(): Promise<RoleRow[]> {
  const { rows } = await getDb().query<RoleRow>(
    `SELECT * FROM _zenku_roles ORDER BY name`
  );
  return rows;
}

export async function getRole(id: string): Promise<RoleRow | null> {
  const { rows } = await getDb().query<RoleRow>(
    `SELECT * FROM _zenku_roles WHERE id = ?`, [id]
  );
  return rows[0] ?? null;
}

export async function createRole(name: string, description?: string): Promise<RoleRow> {
  const id = crypto.randomUUID();
  const now = dbNow();
  await getDb().execute(
    `INSERT INTO _zenku_roles (id, name, description, created_at, updated_at) VALUES (?, ?, ?, ?, ?)`,
    [id, name, description ?? null, now, now]
  );
  const { rows } = await getDb().query<RoleRow>(`SELECT * FROM _zenku_roles WHERE id = ?`, [id]);
  return rows[0];
}

export async function updateRole(id: string, name: string, description?: string): Promise<RoleRow | null> {
  const now = dbNow();
  const result = await getDb().execute(
    `UPDATE _zenku_roles SET name = ?, description = ?, updated_at = ? WHERE id = ?`,
    [name, description ?? null, now, id]
  );
  if ((result.rowsAffected ?? 0) === 0) return null;
  const { rows } = await getDb().query<RoleRow>(`SELECT * FROM _zenku_roles WHERE id = ?`, [id]);
  return rows[0] ?? null;
}

export async function deleteRole(id: string): Promise<boolean> {
  const db = getDb();
  await db.execute(`DELETE FROM _zenku_permissions WHERE role = ?`, [id]);
  await db.execute(`DELETE FROM _zenku_role_members WHERE role_id = ?`, [id]);
  const result = await db.execute(`DELETE FROM _zenku_roles WHERE id = ?`, [id]);
  return (result.rowsAffected ?? 0) > 0;
}

export async function getUserRoles(userId: string): Promise<RoleRow[]> {
  const { rows } = await getDb().query<RoleRow>(
    `SELECT r.* FROM _zenku_roles r
     JOIN _zenku_role_members m ON m.role_id = r.id
     WHERE m.user_id = ?
     ORDER BY r.name`,
    [userId]
  );
  return rows;
}

export async function assignRole(userId: string, roleId: string): Promise<void> {
  const id = crypto.randomUUID();
  try {
    await getDb().execute(
      `INSERT INTO _zenku_role_members (id, user_id, role_id) VALUES (?, ?, ?)`,
      [id, userId, roleId]
    );
  } catch {
    // UNIQUE constraint — already assigned, ignore
  }
}

export async function removeRole(userId: string, roleId: string): Promise<boolean> {
  const result = await getDb().execute(
    `DELETE FROM _zenku_role_members WHERE user_id = ? AND role_id = ?`,
    [userId, roleId]
  );
  return (result.rowsAffected ?? 0) > 0;
}

export async function getRoleMemberCount(roleId: string): Promise<number> {
  const { rows } = await getDb().query<{ count: number }>(
    `SELECT COUNT(*) AS count FROM _zenku_role_members WHERE role_id = ?`, [roleId]
  );
  return rows[0]?.count ?? 0;
}
