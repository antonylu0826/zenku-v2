import { getDb } from '../db';
import { createOrUpdateView } from '../tools/view-tools';
import type { ViewDefinition, AgentResult } from '../types';

interface UiInput {
  action: 'create_view' | 'update_view' | 'get_view';
  view?: ViewDefinition;
  view_id?: string;
}

export function runUiAgent(input: UiInput, userRequest: string): AgentResult {
  if (input.action === 'get_view') {
    const id = input.view_id;
    if (!id) return { success: false, message: 'get_view requires view_id' };
    const db = getDb();
    const row = db.prepare('SELECT definition FROM _zenku_views WHERE id = ?').get(id) as { definition: string } | undefined;
    if (!row) return { success: false, message: `View "${id}" not found` };
    const def = JSON.parse(row.definition) as ViewDefinition;
    return { success: true, message: `View definition for "${id}"`, data: def };
  }

  if (!input.view) return { success: false, message: 'create_view / update_view requires view' };
  return createOrUpdateView(input.view, userRequest);
}
