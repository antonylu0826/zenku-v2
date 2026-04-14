import { getDb, getAllViews, getAllRules } from '../db';
import type { AgentResult } from '../types';

interface AssessInput {
  table_name: string;
  change_type: 'drop_column' | 'rename_column' | 'change_type' | 'drop_table';
  details?: {
    column_name?: string;
    new_name?: string;
    new_type?: string;
  };
}

export function runTestAgent(input: AssessInput): AgentResult {
  const { table_name, change_type, details } = input;
  const db = getDb();

  // 1. 受影響的 views
  const allViews = getAllViews();
  const affectedViews = allViews.filter(v => {
    try {
      const def = JSON.parse(v.definition);
      if (def.table_name === table_name) return true;
      if (def.detail_views?.some((d: { table_name: string }) => d.table_name === table_name)) return true;
      return false;
    } catch {
      return false;
    }
  });

  // 2. 受影響的 rules
  const affectedRules = getAllRules().filter(r => r.table_name === table_name);

  // 3. 資料筆數
  let rowCount = 0;
  try {
    const result = db.prepare(`SELECT COUNT(*) as count FROM "${table_name}"`).get() as { count: number } | undefined;
    rowCount = result?.count ?? 0;
  } catch {
    // table might not exist
  }

  // 4. 被引用的外鍵（哪些表引用此表）
  const allTables = (db.prepare(
    `SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' AND name NOT LIKE '_zenku_%'`
  ).all() as unknown as { name: string }[]).map(r => r.name).filter(t => t !== table_name);

  const referencingTables: string[] = [];
  for (const t of allTables) {
    const fkList = db.prepare(`PRAGMA foreign_key_list("${t}")`).all() as unknown as { table: string; from: string }[];
    if (fkList.some(fk => fk.table === table_name)) {
      referencingTables.push(t);
    }
  }

  // 5. 具體影響分析
  const impacts: string[] = [];

  if (change_type === 'drop_table') {
    impacts.push(`將刪除表 ${table_name} 及其 ${rowCount} 筆資料`);
    if (referencingTables.length > 0) {
      impacts.push(`以下表有外鍵依賴：${referencingTables.join(', ')}，可能造成資料孤兒或刪除失敗`);
    }
    if (affectedViews.length > 0) {
      impacts.push(`${affectedViews.length} 個介面將失效：${affectedViews.map(v => v.name).join(', ')}`);
    }
    if (affectedRules.length > 0) {
      impacts.push(`${affectedRules.length} 條規則將失效：${affectedRules.map(r => r.name).join(', ')}`);
    }
  } else if (change_type === 'drop_column' && details?.column_name) {
    impacts.push(`將刪除欄位 ${details.column_name}，${rowCount} 筆資料的該欄位值將遺失`);

    // Check if any view column references this field
    for (const v of affectedViews) {
      try {
        const def = JSON.parse(v.definition);
        const cols = def.columns ?? [];
        const formFields = def.form?.fields ?? [];
        const affectedCols = cols.filter((c: { key: string }) => c.key === details.column_name);
        const affectedFields = formFields.filter((f: { key: string }) => f.key === details.column_name);
        if (affectedCols.length > 0 || affectedFields.length > 0) {
          impacts.push(`介面「${v.name}」中有使用此欄位，需同步更新`);
        }
      } catch { /* skip */ }
    }

    // Check if any rule references this field
    for (const r of affectedRules) {
      const cond = r.condition ? JSON.parse(r.condition) : null;
      const acts = JSON.parse(r.actions) as { field?: string; value?: string }[];
      if (cond?.field === details.column_name || acts.some(a => a.field === details.column_name)) {
        impacts.push(`規則「${r.name}」引用了此欄位，需同步更新`);
      }
    }
  } else if (change_type === 'rename_column' && details?.column_name) {
    impacts.push(`將重新命名欄位 ${details.column_name} → ${details.new_name ?? '?'}，需同步更新所有引用`);
  } else if (change_type === 'change_type' && details?.column_name) {
    impacts.push(`將變更欄位 ${details.column_name} 的型別為 ${details.new_type ?? '?'}，可能造成 ${rowCount} 筆資料的型別轉換問題`);
  }

  const severity = rowCount > 100 || referencingTables.length > 0 ? '高風險' : '中風險';

  const report = `⚠️ 變更影響評估（${severity}）：
- 受影響的資料：${rowCount} 筆
- 受影響的介面：${affectedViews.length} 個
- 受影響的規則：${affectedRules.length} 條
${referencingTables.length > 0 ? `- 外鍵依賴表：${referencingTables.join(', ')}` : ''}

${impacts.length > 0 ? `具體影響：\n${impacts.map(i => `• ${i}`).join('\n')}` : ''}

建議：${rowCount > 100 ? '請謹慎操作，建議先備份資料' : '資料量不大，可以執行'}。是否繼續？`;

  return {
    success: true,
    message: report,
    data: {
      severity,
      affected_views: affectedViews.length,
      affected_rules: affectedRules.length,
      affected_rows: rowCount,
      referencing_tables: referencingTables,
      impacts,
    },
  };
}
