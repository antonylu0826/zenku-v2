import { Router } from 'express';
import { requireAuth } from '../middleware/auth';
import { executeOnChange } from '../engine/rule-engine';

const router = Router();

/**
 * POST /api/rules/evaluate-on-change
 * Evaluates on_change rules for a given table and changed field.
 * Returns field updates and validation errors (no DB writes).
 */
router.post('/evaluate-on-change', requireAuth, async (req, res) => {
  const { table, changed_field, form_data } = req.body as {
    table?: string;
    changed_field?: string;
    form_data?: Record<string, unknown>;
  };

  if (!table || typeof table !== 'string') {
    res.status(400).json({ error: 'ERROR_INVALID_PARAM', params: { param: 'table' } });
    return;
  }
  if (!changed_field || typeof changed_field !== 'string') {
    res.status(400).json({ error: 'ERROR_INVALID_PARAM', params: { param: 'changed_field' } });
    return;
  }
  if (!form_data || typeof form_data !== 'object' || Array.isArray(form_data)) {
    res.status(400).json({ error: 'ERROR_INVALID_PARAM', params: { param: 'form_data' } });
    return;
  }

  try {
    const result = await executeOnChange(table, changed_field, form_data);
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: 'ERROR_INTERNAL_SERVER', params: { detail: String(err) } });
  }
});

export default router;
