const BASE = '/api';

function authHeaders(): Record<string, string> {
  const token = localStorage.getItem('zenku-token');
  return token ? { Authorization: `Bearer ${token}` } : {};
}

export interface OnChangeResult {
  updates: Record<string, unknown>;
  errors: string[];
}

/**
 * Call the server to evaluate on_change rules for a table.
 * Returns field updates (to apply to form) and validation errors.
 * This call does NOT write to the database.
 */
export async function evaluateOnChange(
  table: string,
  changedField: string,
  formData: Record<string, unknown>,
): Promise<OnChangeResult> {
  try {
    const res = await fetch(`${BASE}/rules/evaluate-on-change`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...authHeaders() },
      body: JSON.stringify({ table, changed_field: changedField, form_data: formData }),
    });
    if (!res.ok) return { updates: {}, errors: [] };
    return res.json() as Promise<OnChangeResult>;
  } catch {
    // Network error — silently fail, don't block the form
    return { updates: {}, errors: [] };
  }
}
