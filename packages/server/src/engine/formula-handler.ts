import { evaluateFormula } from '@zenku/shared';
import { getDb } from '../db';
import { ViewDefinition } from '../types';

/**
 * 根據 View 定義中的公式，重新計算資料物件中的 Computed Fields
 * @param tableName 資料表名稱
 * @param data 目前的資料物件
 * @returns 包含計算結果的新資料物件
 */
export function recalculateComputedFields(tableName: string, data: Record<string, any>): Record<string, any> {
  const db = getDb();
  
  // 1. 尋找與此 table 關聯的 View 定義
  // 優先尋找類型為 'master-detail' 或 'table' 的 View
  const viewRow = db.prepare(`
    SELECT definition FROM _zenku_views 
    WHERE table_name = ? 
    ORDER BY (CASE WHEN json_extract(definition, '$.type') = 'master-detail' THEN 0 ELSE 1 END) ASC
    LIMIT 1
  `).get(tableName) as { definition: string } | undefined;

  if (!viewRow) return data;

  try {
    const viewDef = JSON.parse(viewRow.definition) as ViewDefinition;
    const fields = viewDef.form?.fields || [];
    const computedFields = fields.filter(f => f.computed && f.computed.formula);

    if (computedFields.length === 0) return data;

    const result = { ...data };
    
    // 2. 進行計算
    for (const field of computedFields) {
      if (!field.computed) continue;
      
      try {
        // 準備依賴欄位的值
        const depValues: Record<string, number> = {};
        const deps = field.computed.dependencies || [];
        
        let allDepsPresent = true;
        for (const dep of deps) {
          const val = result[dep];
          if (val === undefined || val === null) {
            // 如果依賴項缺失且有預設值或公式允許，則設為 0，否則跳過此欄位計算
            depValues[dep] = 0;
          } else {
            depValues[dep] = typeof val === 'number' ? val : parseFloat(String(val)) || 0;
          }
        }

        // 計算公式
        const computedVal = evaluateFormula(field.computed.formula, depValues);
        result[field.key] = computedVal;
      } catch (err) {
        console.warn(`[FormulaHandler] Error calculating field "${field.key}" in table "${tableName}":`, err);
        // 計算失敗則維持原樣或設為 null
      }
    }

    return result;
  } catch (err) {
    console.error('[FormulaHandler] Failed to parse view definition:', err);
    return data;
  }
}
