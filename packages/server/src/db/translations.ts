import { getDb } from './index';

export interface TranslationRow {
  key: string;
  locale: string;
  content: string;
  updated_at: string;
}

export async function getAllTranslations(): Promise<TranslationRow[]> {
  const { rows } = await getDb().query<TranslationRow>(
    'SELECT key, locale, content, updated_at FROM _zenku_translations ORDER BY key, locale'
  );
  return rows;
}

export async function getTranslationsByLocale(locale: string): Promise<Record<string, string>> {
  const { rows } = await getDb().query<{ key: string; content: string }>(
    'SELECT key, content FROM _zenku_translations WHERE locale = ?',
    [locale]
  );
  return Object.fromEntries(rows.map(r => [r.key, r.content]));
}

export async function upsertTranslation(key: string, locale: string, content: string): Promise<void> {
  const db = getDb();
  const { rows } = await db.query(
    'SELECT 1 FROM _zenku_translations WHERE key = ? AND locale = ?',
    [key, locale]
  );
  if (rows.length > 0) {
    await db.execute(
      'UPDATE _zenku_translations SET content = ?, updated_at = ? WHERE key = ? AND locale = ?',
      [content, new Date().toISOString(), key, locale]
    );
  } else {
    await db.execute(
      'INSERT INTO _zenku_translations (key, locale, content) VALUES (?, ?, ?)',
      [key, locale, content]
    );
  }
}

export async function upsertTranslations(entries: { key: string; locale: string; content: string }[]): Promise<void> {
  for (const entry of entries) {
    await upsertTranslation(entry.key, entry.locale, entry.content);
  }
}

export async function deleteTranslation(key: string, locale: string): Promise<void> {
  await getDb().execute(
    'DELETE FROM _zenku_translations WHERE key = ? AND locale = ?',
    [key, locale]
  );
}
