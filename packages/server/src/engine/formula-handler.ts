import { evaluateFormula } from '@zenku/shared';
import { getPrimaryViewForTable } from '../db';
import { ViewDefinition } from '../types';

/**
 * Recalculate the computed fields in the data object based on the formula defined in the View.
 * @param tableName Table name
 * @param data      Current data object
 * @returns New data object with computed results
 */
export function recalculateComputedFields(tableName: string, data: Record<string, any>): Record<string, any> {
  const viewRow = getPrimaryViewForTable(tableName);

  if (!viewRow) return data;

  try {
    const viewDef = JSON.parse(viewRow.definition) as ViewDefinition;
    const fields = viewDef.form?.fields || [];
    const computedFields = fields.filter(f => f.computed && f.computed.formula);

    if (computedFields.length === 0) return data;

    const result = { ...data };
    
    // 2. Perform calculations
    for (const field of computedFields) {
      if (!field.computed) continue;
      
      try {
        // Prepare dependency field values
        const depValues: Record<string, number> = {};
        const deps = field.computed.dependencies || [];

        let allDepsPresent = true;
        for (const dep of deps) {
          const val = result[dep];
          if (val === undefined || val === null) {
            // If a dependency is missing and the formula allows it, default to 0; otherwise skip this field
            depValues[dep] = 0;
          } else {
            depValues[dep] = typeof val === 'number' ? val : parseFloat(String(val)) || 0;
          }
        }

        // Evaluate the formula
        const computedVal = evaluateFormula(field.computed.formula, depValues);
        result[field.key] = computedVal;
      } catch (err) {
        console.warn(`[FormulaHandler] Error calculating field "${field.key}" in table "${tableName}":`, err);
        // Leave the value as-is on calculation failure
      }
    }

    return result;
  } catch (err) {
    console.error('[FormulaHandler] Failed to parse view definition:', err);
    return data;
  }
}
