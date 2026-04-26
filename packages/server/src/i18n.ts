import { getAllTranslations, upsertTranslation, upsertTranslations, getTranslationsByLocale } from './db/translations';
import type { TranslationRow } from './db/translations';

export type { TranslationRow };

let cache = new Map<string, string>();
let initialized = false;

function cacheKey(locale: string, key: string): string {
  return `${locale}::${key}`;
}

export async function initI18n(): Promise<void> {
  const rows = await getAllTranslations();
  cache = new Map(rows.map(r => [cacheKey(r.locale, r.key), r.content]));
  initialized = true;
}

export function t(key: string, locale: string): string {
  if (!key.startsWith('$')) return key;
  if (!initialized) return key.slice(1);

  const bare = key.slice(1);
  return (
    cache.get(cacheKey(locale, key)) ??
    cache.get(cacheKey('en', key)) ??
    bare
  );
}

export function resolveI18n(value: unknown, locale: string): unknown {
  if (typeof value === 'string') {
    return value.startsWith('$') ? t(value, locale) : value;
  }
  if (Array.isArray(value)) {
    return value.map(v => resolveI18n(v, locale));
  }
  if (value !== null && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>).map(([k, v]) => [k, resolveI18n(v, locale)])
    );
  }
  return value;
}

export async function setTranslation(key: string, locale: string, content: string): Promise<void> {
  await upsertTranslation(key, locale, content);
  cache.set(cacheKey(locale, key), content);
}

export async function bulkSetTranslations(entries: { key: string; locale: string; content: string }[]): Promise<void> {
  await upsertTranslations(entries);
  for (const { key, locale, content } of entries) {
    cache.set(cacheKey(locale, key), content);
  }
}

export { getTranslationsByLocale, getAllTranslations };
