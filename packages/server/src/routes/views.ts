import { Router } from 'express';
import crypto from 'crypto';
import { getDb, getAllViews } from '../db';
import { requireAdmin, requireAuth } from '../middleware/auth';
import { executeBefore, executeAfter, executeManual } from '../engine/rule-engine';
import { p } from '../utils';

const router = Router();

// ──────────────────────────────────────────────
// User Views
// ──────────────────────────────────────────────
router.get('/views', requireAuth, (_req, res) => {
  const views = getAllViews();
  res.json(views.map(v => ({ ...v, definition: JSON.parse(v.definition) })));
});

router.post('/views/:viewId/actions/:actionId/execute', requireAuth, async (req, res) => {
  const db = getDb();
  const viewId = p(req.params['viewId']);
  const actionId = p(req.params['actionId']);
  const { record_id } = req.body as { record_id?: string | number };

  if (record_id === undefined || record_id === null) {
    res.status(400).json({ error: 'ERROR_MISSING_ID' }); return;
  }

  // Load view definition
  const viewRow = db.prepare('SELECT definition, table_name FROM _zenku_views WHERE id = ?').get(viewId) as
    { definition: string; table_name: string } | undefined;
  if (!viewRow) { res.status(404).json({ error: 'ERROR_VIEW_NOT_FOUND' }); return; }

  const def = JSON.parse(viewRow.definition) as { actions?: unknown[] };
  const actions: unknown[] = def.actions ?? [];
  const action = actions.find(
    (a): a is { id: string; behavior: { type: string; [k: string]: unknown } } =>
      typeof a === 'object' && a !== null && (a as Record<string, unknown>)['id'] === actionId
  );
  if (!action) { res.status(404).json({ error: 'ERROR_ACTION_NOT_FOUND' }); return; }

  const { behavior } = action;
  const tableName = viewRow.table_name;

  // Load current record
  const record = db.prepare(`SELECT * FROM "${tableName}" WHERE id = ?`).get(record_id) as
    Record<string, unknown> | undefined;
  if (!record) { res.status(404).json({ error: 'ERROR_RECORD_NOT_FOUND' }); return; }

  try {
    switch (behavior.type) {
      case 'set_field': {
        const { field, value } = behavior as { type: string; field: string; value: string };
        if (!field) { res.status(400).json({ error: 'ERROR_MISSING_FIELD' }); return; }
        // Run through rule engine (before_update / after_update will fire)
        const data = { [field]: value };
        const beforeResult = await executeBefore(tableName, 'update', data, record);
        if (!beforeResult.allowed) {
          res.status(422).json({ error: 'ERROR_RULE_VALIDATION', params: { details: beforeResult.errors.join('; ') } }); return;
        }
        const merged = { ...beforeResult.data };
        db.prepare(`UPDATE "${tableName}" SET "${field}" = ?, updated_at = datetime('now') WHERE id = ?`)
          .run(String(merged[field] ?? value), record_id);
        const updated = db.prepare(`SELECT * FROM "${tableName}" WHERE id = ?`).get(record_id) as Record<string, unknown>;
        void executeAfter(tableName, 'update', updated, record);
        res.json({ success: true, updated });
        break;
      }

      case 'webhook': {
        const { url, method = 'POST', payload } = behavior as {
          type: string; url: string; method?: string; payload?: string;
        };
        if (!url) { res.status(400).json({ error: 'ERROR_MISSING_URL' }); return; }
        // Interpolate {{field}} tokens
        const body = payload
          ? payload.replace(/\{\{(\w+)\}\}/g, (_, f) => String(record[f] ?? ''))
          : JSON.stringify(record);
        const hookRes = await fetch(url, {
          method,
          headers: { 'Content-Type': 'application/json' },
          body: method === 'GET' ? undefined : body,
        });
        if (!hookRes.ok) {
          res.status(502).json({ error: 'ERROR_WEBHOOK_FAILED', params: { status: hookRes.status } }); return;
        }
        res.json({ success: true });
        break;
      }

      case 'create_related': {
        const { table, field_mapping } = behavior as {
          type: string; table: string; field_mapping: Record<string, string>;
        };
        if (!table || !field_mapping) { res.status(400).json({ error: 'ERROR_MISSING_FIELDS' }); return; }
        const insertData: Record<string, unknown> = {};
        for (const [targetField, sourceExpr] of Object.entries(field_mapping)) {
          // If sourceExpr matches a field name in the record, use its value; otherwise treat as literal
          insertData[targetField] = sourceExpr in record ? record[sourceExpr] : sourceExpr;
        }
        const beforeResult = await executeBefore(table, 'insert', insertData, {});
        if (!beforeResult.allowed) {
          res.status(422).json({ error: 'ERROR_RULE_VALIDATION', params: { details: beforeResult.errors.join('; ') } }); return;
        }
        const cols = Object.keys(beforeResult.data);
        const vals = Object.values(beforeResult.data) as (string | number | bigint | null)[];
        const newId = crypto.randomUUID();
        db.prepare(
          `INSERT INTO "${table}" (id, ${cols.map(c => `"${c}"`).join(', ')}, created_at, updated_at)
           VALUES (?, ${cols.map(() => '?').join(', ')}, datetime('now'), datetime('now'))`
        ).run(newId, ...vals);
        const created = db.prepare(`SELECT * FROM "${table}" WHERE id = ?`).get(newId) as Record<string, unknown>;
        void executeAfter(table, 'insert', created, {});
        res.json({ success: true, created });
        break;
      }

      case 'navigate':
        // Pure client-side server has nothing to do
        res.json({ success: true });
        break;

      case 'trigger_rule': {
        const { rule_id } = behavior as { type: string; rule_id: string };
        if (!rule_id) { res.status(400).json({ error: 'ERROR_RULE_NOT_FOUND' }); return; }
        const result = await executeManual(rule_id, { ...record }, tableName);
        if (!result.success) {
          res.status(422).json({ error: 'ERROR_RULE_VALIDATION', params: { details: result.errors.join('; ') } }); return;
        }
        // Reload updated record
        const refreshed = db.prepare(`SELECT * FROM "${tableName}" WHERE id = ?`).get(record_id) as Record<string, unknown>;
        res.json({ success: true, updated: refreshed });
        break;
      }

      default:
        res.status(400).json({ error: 'ERROR_UNKNOWN_ACTION', params: { type: String(behavior.type) } });
    }
  } catch (err) {
    res.status(500).json({ error: 'ERROR_INTERNAL_SERVER', params: { detail: String(err) } });
  }
});

// ──────────────────────────────────────────────
// Admin View Configuration
// ──────────────────────────────────────────────
router.get('/admin/views', requireAdmin, (_req, res) => {
  const views = getAllViews();
  res.json(views.map(v => ({ ...v, definition: JSON.parse(v.definition) })));
});

router.patch('/admin/views/:id/field-prop', requireAdmin, (req, res) => {
  const db = getDb();
  const viewId = p(req.params.id);
  const { field, prop, value } = req.body as { field?: string; prop?: string; value?: unknown };
  if (!field || !prop) { res.status(400).json({ error: 'ERROR_MISSING_FIELDS' }); return; }

  const row = db.prepare('SELECT definition FROM _zenku_views WHERE id = ?').get(viewId) as { definition: string } | undefined;
  if (!row) { res.status(404).json({ error: 'ERROR_VIEW_NOT_FOUND' }); return; }

  const def = JSON.parse(row.definition);
  if (prop === 'visible' || prop === 'disabled') {
    if (!def.appearance) def.appearance = {};
    if (!def.appearance[field]) def.appearance[field] = {};
    def.appearance[field][prop] = value;
  } else {
    // 預設更新 columns 內部的屬性
    const col = (def.columns || []).find((c: any) => c.key === field);
    if (col) col[prop] = value;
    const formField = (def.form?.fields || []).find((f: any) => f.key === field);
    if (formField) formField[prop] = value;
  }

  db.prepare(`UPDATE _zenku_views SET definition = ?, updated_at = datetime('now') WHERE id = ?`)
    .run(JSON.stringify(def), viewId);
  res.json({ success: true });
});

router.patch('/admin/views/:id/builtin-action', requireAdmin, (req, res) => {
  const db = getDb();
  const viewId = p(req.params.id);
  const { action, enabled } = req.body as { action?: string; enabled?: boolean };
  if (!action || enabled === undefined) { res.status(400).json({ error: 'ERROR_MISSING_FIELDS' }); return; }

  const row = db.prepare('SELECT definition FROM _zenku_views WHERE id = ?').get(viewId) as { definition: string } | undefined;
  if (!row) { res.status(404).json({ error: 'ERROR_VIEW_NOT_FOUND' }); return; }

  const def = JSON.parse(row.definition);
  const actions: unknown[] = def.actions ?? [];

  if (enabled) {
    if (!actions.includes(action)) actions.push(action);
  } else {
    const idx = actions.indexOf(action);
    if (idx !== -1) actions.splice(idx, 1);
  }
  def.actions = actions;

  db.prepare(`UPDATE _zenku_views SET definition = ?, updated_at = datetime('now') WHERE id = ?`)
    .run(JSON.stringify(def), viewId);
  res.json({ success: true });
});

router.put('/admin/views/:id/custom-action', requireAdmin, (req, res) => {
  const db = getDb();
  const viewId = p(req.params.id);
  const actionDef = req.body as { id?: string };
  if (!actionDef.id) { res.status(400).json({ error: 'ERROR_MISSING_FIELDS' }); return; }

  const row = db.prepare('SELECT definition FROM _zenku_views WHERE id = ?').get(viewId) as { definition: string } | undefined;
  if (!row) { res.status(404).json({ error: 'ERROR_VIEW_NOT_FOUND' }); return; }

  const def = JSON.parse(row.definition);
  const actions: unknown[] = def.actions ?? [];

  const idx = actions.findIndex(
    a => typeof a === 'object' && a !== null && (a as any).id === actionDef.id
  );
  if (idx !== -1) {
    actions[idx] = actionDef;
  } else {
    actions.push(actionDef);
  }
  def.actions = actions;

  db.prepare(`UPDATE _zenku_views SET definition = ?, updated_at = datetime('now') WHERE id = ?`)
    .run(JSON.stringify(def), viewId);
  res.json({ success: true });
});

router.delete('/admin/views/:id/custom-action/:actionId', requireAdmin, (req, res) => {
  const db = getDb();
  const viewId = p(req.params.id);
  const actionId = p(req.params.actionId);

  const row = db.prepare('SELECT definition FROM _zenku_views WHERE id = ?').get(viewId) as { definition: string } | undefined;
  if (!row) { res.status(404).json({ error: 'ERROR_VIEW_NOT_FOUND' }); return; }

  const def = JSON.parse(row.definition);
  const before = (def.actions ?? []).length;
  def.actions = (def.actions ?? []).filter(
    (a: any) => !(typeof a === 'object' && a !== null && a.id === actionId)
  );
  if (def.actions.length === before) { res.status(404).json({ error: 'ERROR_ACTION_NOT_FOUND' }); return; }

  db.prepare(`UPDATE _zenku_views SET definition = ?, updated_at = datetime('now') WHERE id = ?`)
    .run(JSON.stringify(def), viewId);
  res.json({ success: true });
});

export default router;
