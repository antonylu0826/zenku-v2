import { getDb, logChange, writeJournal } from '../db';
import type { ViewDefinition, AgentResult } from '../types';

export function createOrUpdateView(view: ViewDefinition, userRequest: string): AgentResult {
  const db = getDb();

  const existing = db.prepare('SELECT id FROM _zenku_views WHERE id = ?').get(view.id);

  if (existing) {
    // Fetch old definition for journal diff
    const oldRow = db.prepare('SELECT definition FROM _zenku_views WHERE id = ?').get(view.id) as { definition: string } | undefined;
    const oldDef = oldRow ? JSON.parse(oldRow.definition) : null;

    db.prepare(`
      UPDATE _zenku_views SET name=?, table_name=?, definition=?, updated_at=datetime('now')
      WHERE id=?
    `).run(view.name, view.table_name, JSON.stringify(view), view.id);
    logChange('ui-agent', 'update_view', { viewId: view.id, viewName: view.name }, userRequest);

    writeJournal({
      agent: 'ui',
      type: 'view_change',
      description: `Updated interface "${view.name}"`,
      diff: { before: oldDef, after: view },
      user_request: userRequest,
      reversible: true,
      reverse_operations: oldDef ? [{
        type: 'sql',
        sql: `UPDATE _zenku_views SET name=${JSON.stringify(oldDef.name)}, table_name=${JSON.stringify(oldDef.table_name)}, definition=${JSON.stringify(JSON.stringify(oldDef))}, updated_at=datetime('now') WHERE id=${JSON.stringify(view.id)}`,
      }] : [{ type: 'sql', sql: `DELETE FROM _zenku_views WHERE id = ${JSON.stringify(view.id)}` }],
    });

    return { success: true, message: `Updated interface "${view.name}"`, data: view };
  } else {
    db.prepare(`
      INSERT INTO _zenku_views (id, name, table_name, definition)
      VALUES (?, ?, ?, ?)
    `).run(view.id, view.name, view.table_name, JSON.stringify(view));
    logChange('ui-agent', 'create_view', { viewId: view.id, viewName: view.name }, userRequest);

    writeJournal({
      agent: 'ui',
      type: 'view_change',
      description: `Created interface "${view.name}"`,
      diff: { before: null, after: view },
      user_request: userRequest,
      reversible: true,
      reverse_operations: [{ type: 'sql', sql: `DELETE FROM _zenku_views WHERE id = ${JSON.stringify(view.id)}` }],
    });

    return { success: true, message: `Created interface "${view.name}"`, data: view };
  }
}

export function getAllViewDefinitions(): ViewDefinition[] {
  const db = getDb();
  const rows = db.prepare('SELECT definition FROM _zenku_views ORDER BY created_at').all() as { definition: string }[];
  return rows.map(r => JSON.parse(r.definition) as ViewDefinition);
}
