import { createHash, randomBytes } from 'node:crypto';
import { getDb, dbNow } from './index';
import { expandScopes, hasAnyScope, hasScope } from '../security/access-policy';

export { expandScopes, hasAnyScope, hasScope };

export interface UserRow {
  id: string;
  email: string;
  name: string;
  password_hash: string;
  role: 'admin' | 'builder' | 'user';
  language: string;
  created_at: string;
  last_login_at: string | null;
}

export interface ApiKeyRecord {
  id: string;
  name: string;
  key_prefix: string;
  key_hash: string;
  scopes: string[];
  created_by: string;
  created_at: string;
  expires_at: string | null;
  last_used_at: string | null;
  revoked: number;
}

function hashKey(rawKey: string): string {
  return createHash('sha256').update(rawKey).digest('hex');
}

export async function getUserCount(): Promise<number> {
  const { rows } = await getDb().query<{ count: number }>(
    'SELECT COUNT(*) as count FROM _zenku_users'
  );
  return rows[0]?.count ?? 0;
}

export async function getUserLanguage(userId: string): Promise<string> {
  const { rows } = await getDb().query<{ language?: string }>(
    'SELECT language FROM _zenku_users WHERE id = ?',
    [userId]
  );
  return rows[0]?.language ?? 'en';
}

export async function createApiKey(
  name: string,
  scopes: string[],
  createdBy: string,
  expiresAt?: string,
): Promise<{ rawKey: string; record: Omit<ApiKeyRecord, 'key_hash'> }> {
  const random = randomBytes(24).toString('base64url').slice(0, 32);
  const rawKey = `zk_live_${random}`;
  const keyPrefix = `zk_live_${random.slice(0, 4)}`;
  const keyHash = hashKey(rawKey);
  const id = crypto.randomUUID();
  await getDb().execute(
    `INSERT INTO _zenku_api_keys (id, name, key_prefix, key_hash, scopes, created_by, expires_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [id, name, keyPrefix, keyHash, JSON.stringify(scopes), createdBy, expiresAt ?? null]
  );
  return {
    rawKey,
    record: {
      id, name, key_prefix: keyPrefix, scopes, created_by: createdBy,
      created_at: new Date().toISOString(), expires_at: expiresAt ?? null,
      last_used_at: null, revoked: 0,
    },
  };
}

export async function verifyApiKey(rawKey: string, requiredScope: string | string[]): Promise<ApiKeyRecord | null> {
  if (!rawKey.startsWith('zk_live_')) return null;
  const keyHash = hashKey(rawKey);
  const db = getDb();
  const { rows } = await db.query<Omit<ApiKeyRecord, 'scopes'> & { scopes: string }>(
    `SELECT * FROM _zenku_api_keys
     WHERE key_hash = ? AND revoked = 0
       AND (expires_at IS NULL OR expires_at > ?)`,
    [keyHash, dbNow()]
  );
  const row = rows[0];
  if (!row) return null;

  const scopes: string[] = JSON.parse(row.scopes);
  const requiredScopes = Array.isArray(requiredScope) ? requiredScope : [requiredScope];
  if (!hasAnyScope(scopes, requiredScopes)) return null;

  await db.execute(
    `UPDATE _zenku_api_keys SET last_used_at = ? WHERE id = ?`,
    [dbNow(), row.id]
  );
  return { ...row, scopes };
}

export async function listApiKeys(): Promise<Omit<ApiKeyRecord, 'key_hash'>[]> {
  const { rows } = await getDb().query<Omit<ApiKeyRecord, 'scopes' | 'key_hash'> & { scopes: string }>(
    'SELECT id, name, key_prefix, scopes, created_by, created_at, expires_at, last_used_at, revoked FROM _zenku_api_keys ORDER BY created_at DESC'
  );
  return rows.map(r => ({ ...r, scopes: JSON.parse(r.scopes) }));
}

export async function revokeApiKey(id: string): Promise<boolean> {
  const result = await getDb().execute(
    'UPDATE _zenku_api_keys SET revoked = 1 WHERE id = ?',
    [id]
  );
  return result.rowsAffected > 0;
}

export async function deleteApiKey(id: string): Promise<boolean> {
  const result = await getDb().execute(
    'DELETE FROM _zenku_api_keys WHERE id = ?',
    [id]
  );
  return result.rowsAffected > 0;
}
