import { getAllViews } from './db/views';

export function isSafeFieldName(name: string): boolean {
  return /^[a-zA-Z_][a-zA-Z0-9_]*$/.test(name);
}

export function p(v: string | string[] | undefined): string {
  if (v === undefined) return '';
  return Array.isArray(v) ? v[0] ?? '' : v;
}

export async function getMultiselectColumns(tableName: string): Promise<string[]> {
  const views = await getAllViews();
  const found: string[] = [];
  for (const v of views) {
    try {
      const def = JSON.parse(v.definition) as {
        table_name?: string;
        form?: { fields?: { key: string; type: string }[] };
        detail_views?: { table_name: string; view: { form?: { fields?: { key: string; type: string }[] } } }[];
      };
      let fields: { key: string; type: string }[] = [];
      if (def.table_name === tableName) {
        fields = def.form?.fields ?? [];
      } else if (def.detail_views) {
        const detail = def.detail_views.find(dv => dv.table_name === tableName);
        if (detail) fields = detail.view.form?.fields ?? [];
      }
      for (const f of fields) {
        if (f.type === 'multiselect' && !found.includes(f.key)) found.push(f.key);
      }
    } catch { continue; }
  }
  return found;
}

export interface RelationColumnDef {
  key: string;
  relation: { table: string; display_field: string; value_field: string };
}

export async function getRelationColumns(tableName: string): Promise<RelationColumnDef[]> {
  const views = await getAllViews();
  const seen = new Set<string>();
  const result: RelationColumnDef[] = [];

  function extractRelations(definitionStr: string) {
    try {
      const def = JSON.parse(definitionStr) as Record<string, unknown>;
      const columns = def.columns as Array<Record<string, unknown>>;
      if (!Array.isArray(columns)) return;
      for (const c of columns) {
        const rel = c.relation as any;
        if (c.type === 'relation' && rel && typeof rel === 'object' && rel.table && rel.display_field && !seen.has(String(c.key))) {
          seen.add(String(c.key));
          result.push({
            key: String(c.key),
            relation: {
              table: String(rel.table),
              display_field: String(rel.display_field),
              value_field: rel.value_field ? String(rel.value_field) : 'id',
            },
          });
        }
      }
    } catch { /* ignore parse errors */ }
  }

  // Collect from all direct views for this table
  for (const v of views) {
    if (v.table_name === tableName) extractRelations(v.definition);
  }

  // Also collect from any detail_views embedded in other view definitions
  for (const v of views) {
    try {
      const def = JSON.parse(v.definition) as { detail_views?: { table_name: string; view: unknown }[] };
      const dv = def.detail_views?.find(d => d.table_name === tableName);
      if (dv) extractRelations(JSON.stringify(dv.view));
    } catch { continue; }
  }

  return result;
}
