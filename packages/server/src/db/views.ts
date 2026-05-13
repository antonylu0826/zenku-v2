import { getDb } from './index';

export interface ViewRow {
  id: string;
  name: string;
  table_name: string;
  definition: string;
  created_at: string;
  updated_at: string;
}

export async function getAllViews(): Promise<ViewRow[]> {
  const db = getDb();
  const { rows } = await db.query<ViewRow>(
    'SELECT * FROM _zenku_views ORDER BY created_at'
  );

  // Enrich with table traits
  const { rows: traitRows } = await db.query<{ table_name: string; trait_name: string; config: string }>(
    'SELECT table_name, trait_name, config FROM _zenku_table_traits'
  );
  const traitMap = new Map<string, Array<{ trait_name: string; config: unknown }>>();
  for (const tr of traitRows) {
    const list = traitMap.get(tr.table_name) ?? [];
    try { list.push({ trait_name: tr.trait_name, config: JSON.parse(tr.config) }); } catch { /* skip */ }
    traitMap.set(tr.table_name, list);
  }

  for (const view of rows) {
    const traits = traitMap.get(view.table_name);
    if (traits?.length) {
      try {
        const def = JSON.parse(view.definition);
        def.traits = traits;
        view.definition = JSON.stringify(def);
      } catch { /* skip malformed */ }
    }
  }

  return rows;
}

export async function getPrimaryViewForTable(tableName: string): Promise<{ definition: string } | undefined> {
  const { rows } = await getDb().query<{ definition: string }>(
    'SELECT definition FROM _zenku_views WHERE table_name = ?',
    [tableName]
  );
  if (rows.length === 0) return undefined;
  // Prefer table / master-detail views (same logic as the old ORDER BY CASE)
  const preferred = rows.find(r => {
    try {
      const t = (JSON.parse(r.definition) as { type?: string }).type;
      return t === 'table' || t === 'master-detail';
    } catch { return false; }
  });
  return preferred ?? rows[0];
}
