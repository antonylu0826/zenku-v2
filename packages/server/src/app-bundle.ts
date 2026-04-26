import { getDb, dbNow } from './db';
import { getAllSchemas, getUserTables } from './db/schema';
import { getAllViews } from './db/views';
import { getAllRules } from './db/rules';
import { getAllTranslations, upsertTranslations } from './db/translations';
import { initI18n } from './i18n';
import type { ColumnInfo, FieldType } from './db/adapter';
import type { ViewDefinition } from '@zenku/shared';

// ─── Bundle format ────────────────────────────────────────────────────────────

export const BUNDLE_VERSION = '2' as const;
export const SUPPORTED_BUNDLE_VERSIONS = ['1', '2'] as const;

export interface BundleManifest {
  name: string;
  description?: string;
  version: string;
  author?: string;
}

export interface ZenkuBundle {
  zenku_bundle_version: typeof BUNDLE_VERSION;
  exported_at: string;
  manifest: BundleManifest;
  schema: Record<string, ColumnInfo[]>;
  views: Array<{ id: string; name: string; table_name: string; definition: string }>;
  rules: Array<{
    id: string; name: string; description: string | null;
    table_name: string; trigger_type: string; condition: string | null;
    actions: string; priority: number; enabled: number;
  }>;
  /** translations[locale][key] = content — only present in v2 bundles */
  translations?: Record<string, Record<string, string>>;
}

// ─── Diff types ───────────────────────────────────────────────────────────────

export interface TableDiff {
  table: string;
  /** Columns in the bundle but not in the DB */
  columns_to_add: ColumnInfo[];
  /** Columns in the DB but not in the bundle (informational only) */
  columns_orphaned: ColumnInfo[];
}

export interface BundleDiff {
  tables_to_create: string[];
  tables_to_alter: TableDiff[];
  tables_unchanged: string[];
  views_to_create: string[];
  views_to_update: string[];
  rules_to_create: string[];
  rules_to_update: string[];
  /** Webhook URLs found in rules that will be imported */
  webhook_urls: string[];
  /** Columns that exist in DB but not in bundle (per table) */
  warnings: string[];
}

// ─── Generate ─────────────────────────────────────────────────────────────────

export async function generateBundle(manifest: BundleManifest): Promise<ZenkuBundle> {
  const [schema, views, rules, translationRows] = await Promise.all([
    getAllSchemas(),
    getAllViews(),
    getAllRules(),
    getAllTranslations(),
  ]);

  // Group translations: { locale: { key: content } }
  const translations: Record<string, Record<string, string>> = {};
  for (const row of translationRows) {
    if (!translations[row.locale]) translations[row.locale] = {};
    translations[row.locale][row.key] = row.content;
  }

  return {
    zenku_bundle_version: BUNDLE_VERSION,
    exported_at: new Date().toISOString(),
    manifest,
    schema,
    views: views.map(v => ({
      id: v.id,
      name: v.name,
      table_name: v.table_name,
      definition: v.definition,
    })),
    rules: rules.map(r => ({
      id: r.id,
      name: r.name,
      description: r.description,
      table_name: r.table_name,
      trigger_type: r.trigger_type,
      condition: r.condition,
      actions: r.actions,
      priority: r.priority,
      enabled: r.enabled,
    })),
    translations,
  };
}

// ─── Validate ─────────────────────────────────────────────────────────────────

export function validateBundle(data: unknown): { valid: true; bundle: ZenkuBundle } | { valid: false; error: string } {
  if (!data || typeof data !== 'object') return { valid: false, error: 'Bundle must be a JSON object' };
  const b = data as Record<string, unknown>;
  if (!SUPPORTED_BUNDLE_VERSIONS.includes(b.zenku_bundle_version as typeof SUPPORTED_BUNDLE_VERSIONS[number])) {
    return { valid: false, error: `Unsupported bundle version: ${b.zenku_bundle_version}` };
  }
  if (!b.manifest || typeof b.manifest !== 'object') return { valid: false, error: 'Missing manifest' };
  if (!b.schema || typeof b.schema !== 'object') return { valid: false, error: 'Missing schema' };
  if (!Array.isArray(b.views)) return { valid: false, error: 'views must be an array' };
  if (!Array.isArray(b.rules)) return { valid: false, error: 'rules must be an array' };
  return { valid: true, bundle: data as ZenkuBundle };
}

// ─── Diff ─────────────────────────────────────────────────────────────────────

export async function diffBundle(bundle: ZenkuBundle): Promise<BundleDiff> {
  const db = getDb();
  const [currentSchema, currentViews, currentRules] = await Promise.all([
    getAllSchemas(),
    getAllViews(),
    getAllRules(),
  ]);

  const existingTables = new Set(Object.keys(currentSchema));
  const currentViewIds = new Set(currentViews.map(v => v.id));
  const currentRuleIds = new Set(currentRules.map(r => r.id));

  const tables_to_create: string[] = [];
  const tables_to_alter: TableDiff[] = [];
  const tables_unchanged: string[] = [];
  const warnings: string[] = [];

  for (const [tableName, bundleCols] of Object.entries(bundle.schema)) {
    if (!existingTables.has(tableName)) {
      tables_to_create.push(tableName);
      continue;
    }

    const existingCols = currentSchema[tableName];
    const existingColNames = new Set(existingCols.map(c => c.name));
    const bundleColNames   = new Set(bundleCols.map(c => c.name));

    const columns_to_add     = bundleCols.filter(c => !existingColNames.has(c.name));
    const columns_orphaned   = existingCols.filter(c => !bundleColNames.has(c.name) && !['id', 'created_at', 'updated_at'].includes(c.name));

    if (columns_to_add.length > 0 || columns_orphaned.length > 0) {
      tables_to_alter.push({ table: tableName, columns_to_add, columns_orphaned });
      if (columns_orphaned.length > 0) {
        warnings.push(`Table "${tableName}": columns [${columns_orphaned.map(c => c.name).join(', ')}] exist in DB but not in bundle (will be kept)`);
      }
    } else {
      tables_unchanged.push(tableName);
    }
  }

  const views_to_create = bundle.views.filter(v => !currentViewIds.has(v.id)).map(v => v.id);
  const views_to_update = bundle.views.filter(v => currentViewIds.has(v.id)).map(v => v.id);
  const rules_to_create = bundle.rules.filter(r => !currentRuleIds.has(r.id)).map(r => r.id);
  const rules_to_update = bundle.rules.filter(r => currentRuleIds.has(r.id)).map(r => r.id);

  // Collect webhook URLs from rules actions
  const webhook_urls: string[] = [];
  for (const rule of bundle.rules) {
    try {
      const actions = JSON.parse(rule.actions);
      if (Array.isArray(actions)) {
        for (const action of actions) {
          if (action?.type === 'webhook' && action?.url) {
            webhook_urls.push(action.url);
          }
        }
      }
    } catch { /* ignore malformed actions */ }
  }

  return {
    tables_to_create,
    tables_to_alter,
    tables_unchanged,
    views_to_create,
    views_to_update,
    rules_to_create,
    rules_to_update,
    webhook_urls: [...new Set(webhook_urls)],
    warnings,
  };
}

// ─── Apply ────────────────────────────────────────────────────────────────────

export interface ApplyOptions {
  /** If true, disable all webhook actions in imported rules */
  disable_webhooks?: boolean;
  /** Override for specific webhook URLs */
  webhook_overrides?: Record<string, string>;
}

export interface ApplyResult {
  tables_created: string[];
  tables_altered: string[];
  views_upserted: string[];
  rules_upserted: string[];
  errors: string[];
}

const FORBIDDEN_TABLE_PREFIXES = ['_zenku_', 'sqlite_'];
const ALLOWED_TYPES = new Set(['TEXT', 'INTEGER', 'REAL', 'BLOB', 'BOOLEAN', 'DATE', 'DATETIME']);

function isSafeTableName(name: string): boolean {
  if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(name)) return false;
  if (FORBIDDEN_TABLE_PREFIXES.some(p => name.toLowerCase().startsWith(p))) return false;
  return true;
}

export async function applyBundle(
  bundle: ZenkuBundle,
  options: ApplyOptions = {},
): Promise<ApplyResult> {
  const db = getDb();
  const { disable_webhooks = true, webhook_overrides = {} } = options;
  const result: ApplyResult = {
    tables_created: [],
    tables_altered: [],
    views_upserted: [],
    rules_upserted: [],
    errors: [],
  };

  const diff = await diffBundle(bundle);

  // ── 1. Create new tables ──────────────────────────────────────────────────

  for (const tableName of diff.tables_to_create) {
    if (!isSafeTableName(tableName)) {
      result.errors.push(`Skipped unsafe table name: "${tableName}"`);
      continue;
    }
    const bundleCols = bundle.schema[tableName] ?? [];
    const RESERVED = new Set(['id', 'created_at', 'updated_at']);
    const colSpecs = bundleCols
      .filter(c => !RESERVED.has(c.name))
      .filter(c => ALLOWED_TYPES.has(c.type.toUpperCase()))
      .map(c => ({
        name: c.name,
        type: c.type.toUpperCase() as FieldType,
        required: c.notNull && c.defaultValue === null,
      }));
    try {
      await db.createTable(tableName, colSpecs);
      result.tables_created.push(tableName);
    } catch (err) {
      result.errors.push(`Failed to create table "${tableName}": ${String(err)}`);
    }
  }

  // ── 2. Alter existing tables (add new columns) ────────────────────────────

  for (const { table, columns_to_add } of diff.tables_to_alter) {
    if (columns_to_add.length === 0) continue;
    for (const col of columns_to_add) {
      const type = col.type.toUpperCase() as FieldType;
      if (!ALLOWED_TYPES.has(type)) continue;
      try {
        await db.addColumn(table, { name: col.name, type, required: false });
      } catch (err) {
        result.errors.push(`Failed to add column "${col.name}" to "${table}": ${String(err)}`);
      }
    }
    result.tables_altered.push(table);
  }

  // ── 3. Upsert views ───────────────────────────────────────────────────────

  for (const v of bundle.views) {
    try {
      const now = dbNow();
      const { rows } = await db.query('SELECT id FROM _zenku_views WHERE id = ?', [v.id]);
      if (rows.length > 0) {
        await db.execute(
          'UPDATE _zenku_views SET name=?, table_name=?, definition=?, updated_at=? WHERE id=?',
          [v.name, v.table_name, v.definition, now, v.id]
        );
      } else {
        await db.execute(
          'INSERT INTO _zenku_views (id, name, table_name, definition) VALUES (?, ?, ?, ?)',
          [v.id, v.name, v.table_name, v.definition]
        );
      }
      result.views_upserted.push(v.id);
    } catch (err) {
      result.errors.push(`Failed to upsert view "${v.id}": ${String(err)}`);
    }
  }

  // ── 4. Upsert rules ───────────────────────────────────────────────────────

  for (const r of bundle.rules) {
    try {
      // Apply webhook overrides / disable
      let actions = r.actions;
      if (disable_webhooks || Object.keys(webhook_overrides).length > 0) {
        try {
          const parsed = JSON.parse(actions);
          if (Array.isArray(parsed)) {
            const patched = parsed.map((action: Record<string, unknown>) => {
              if (action.type !== 'webhook') return action;
              const url = String(action.url ?? '');
              if (webhook_overrides[url]) return { ...action, url: webhook_overrides[url] };
              if (disable_webhooks) return { ...action, disabled: true };
              return action;
            });
            actions = JSON.stringify(patched);
          }
        } catch { /* keep original if parse fails */ }
      }

      const now = dbNow();
      const { rows } = await db.query('SELECT id FROM _zenku_rules WHERE id = ?', [r.id]);
      if (rows.length > 0) {
        await db.execute(
          'UPDATE _zenku_rules SET name=?, description=?, table_name=?, trigger_type=?, condition=?, actions=?, priority=?, enabled=?, updated_at=? WHERE id=?',
          [r.name, r.description, r.table_name, r.trigger_type, r.condition, actions, r.priority, r.enabled, now, r.id]
        );
      } else {
        await db.execute(
          'INSERT INTO _zenku_rules (id, name, description, table_name, trigger_type, condition, actions, priority, enabled) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
          [r.id, r.name, r.description, r.table_name, r.trigger_type, r.condition, actions, r.priority, r.enabled]
        );
      }
      result.rules_upserted.push(r.id);
    } catch (err) {
      result.errors.push(`Failed to upsert rule "${r.id}": ${String(err)}`);
    }
  }

  // ── 5. Upsert translations (v2 bundles only) ──────────────────────────────

  if (bundle.translations && typeof bundle.translations === 'object') {
    const entries: { key: string; locale: string; content: string }[] = [];
    for (const [locale, keys] of Object.entries(bundle.translations)) {
      for (const [key, content] of Object.entries(keys)) {
        entries.push({ key, locale, content });
      }
    }
    if (entries.length > 0) {
      try {
        await upsertTranslations(entries);
        await initI18n();
      } catch (err) {
        result.errors.push(`Failed to import translations: ${String(err)}`);
      }
    }
  }

  return result;
}
