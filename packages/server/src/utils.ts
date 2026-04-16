import { getAllViews } from './db';

/**
 * 安全欄位名驗證
 * 僅允許英文字母、數字與下底線，且首字不能為數字。
 */
export function isSafeFieldName(name: string): boolean {
  return /^[a-zA-Z_][a-zA-Z0-9_]*$/.test(name);
}

/**
 * 標準化請求參數
 * Express 5 的端點參數可能是 string | string[]，統一轉為 string。
 */
export function p(v: string | string[] | undefined): string {
  if (v === undefined) return '';
  return Array.isArray(v) ? v[0] ?? '' : v;
}

/**
 * 關聯欄位定義介面
 */
export interface RelationColumnDef {
  key: string;
  relation: { table: string; display_field: string };
}

/**
 * 從視圖定義中提取關聯欄位 (供 SQL JOIN 使用)
 */
export function getRelationColumns(tableName: string): RelationColumnDef[] {
  const views = getAllViews();
  
  // 先查找直接對應的 view
  let view = views.find(v => v.table_name === tableName);
  
  // 如果找不到，查找該表是否在某個 master-detail view 的 detail_views 中
  if (!view) {
    for (const v of views) {
      try {
        const def = JSON.parse(v.definition) as { detail_views?: { table_name: string; view: { columns?: unknown[] } }[] };
        if (def.detail_views) {
          const detailView = def.detail_views.find(dv => dv.table_name === tableName);
          if (detailView) {
            view = { definition: JSON.stringify(detailView.view) } as any;
            break;
          }
        }
      } catch {
        continue;
      }
    }
  }
  
  if (!view) return [];
  try {
    const def = JSON.parse(view.definition) as { columns?: { key: string; type: string; relation?: { table: string; display_field: string } }[] };
    return (def.columns ?? [])
      .filter(c => (c as any).type === 'relation' && (c as any).relation?.table && (c as any).relation?.display_field)
      .map(c => ({ key: c.key, relation: (c as any).relation! }));
  } catch {
    return [];
  }
}
