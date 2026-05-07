import type { Request, Response, NextFunction } from 'express';
import { hasPermission } from '../db/permissions';
import { p } from '../utils';

export function requireTablePermission(action: 'read' | 'create' | 'update' | 'delete') {
  return (req: Request, res: Response, next: NextFunction): void => {
    const user = req.user!;
    if (user.role === 'admin' || user.role === 'builder') { next(); return; }

    const table = p(req.params.table);
    void (async () => {
      try {
        const allowed = await hasPermission(user.id, table, `can_${action}`);
        if (allowed) { next(); return; }
        res.status(403).json({ error: 'ERROR_FORBIDDEN_TABLE', params: { table, action } });
      } catch (err) {
        next(err);
      }
    })();
  };
}
