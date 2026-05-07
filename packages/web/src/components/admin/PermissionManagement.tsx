import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../../contexts/AuthContext';
import { Checkbox } from '../ui/checkbox';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../ui/select';
import { toast } from 'sonner';

interface RoleOption {
  id: string;
  name: string;
}

interface PermissionRow {
  id: string;
  role: string;
  table_name: string;
  can_read: number;
  can_create: number;
  can_update: number;
  can_delete: number;
}

type Action = 'can_read' | 'can_create' | 'can_update' | 'can_delete';
const ACTIONS: { key: Action; labelKey: string }[] = [
  { key: 'can_read',   labelKey: 'permissions.col_read'   },
  { key: 'can_create', labelKey: 'permissions.col_create' },
  { key: 'can_update', labelKey: 'permissions.col_update' },
  { key: 'can_delete', labelKey: 'permissions.col_delete' },
];

const BASE = '/api';
const WILDCARD = '*';

export function PermissionManagement() {
  const { t } = useTranslation();
  const { token } = useAuth();
  const headers = { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` };

  const [tables, setTables] = useState<string[]>([]);
  const [perms, setPerms] = useState<PermissionRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<string | null>(null);
  const [customRoles, setCustomRoles] = useState<RoleOption[]>([]);
  const [selectedRole, setSelectedRole] = useState<string>('user');

  const loadMeta = async () => {
    const [tablesRes, rolesRes] = await Promise.all([
      fetch(`${BASE}/admin/permissions/tables`, { headers }),
      fetch(`${BASE}/admin/roles`, { headers }),
    ]);
    setTables(await tablesRes.json() as string[]);
    setCustomRoles(await rolesRes.json() as RoleOption[]);
  };

  const loadPerms = async (role: string) => {
    setLoading(true);
    try {
      const permsRes = await fetch(`${BASE}/admin/permissions?role=${encodeURIComponent(role)}`, { headers });
      setPerms(await permsRes.json() as PermissionRow[]);
    } catch {
      toast.error(t('common.error'));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void (async () => {
      await loadMeta();
      await loadPerms('user');
    })();
  }, []);

  const handleRoleChange = (role: string) => {
    setSelectedRole(role);
    void loadPerms(role);
  };

  const getPerm = (tableName: string): PermissionRow | undefined =>
    perms.find(p => p.table_name === tableName);

  const handleToggle = async (tableName: string, action: Action, checked: boolean) => {
    const existing = getPerm(tableName);
    const current = {
      can_read:   existing?.can_read   === 1,
      can_create: existing?.can_create === 1,
      can_update: existing?.can_update === 1,
      can_delete: existing?.can_delete === 1,
    };
    const next = { ...current, [action]: checked };
    const allOff = !next.can_read && !next.can_create && !next.can_update && !next.can_delete;

    setSaving(tableName + action);
    try {
      if (allOff && existing) {
        await fetch(`${BASE}/admin/permissions/${existing.id}`, { method: 'DELETE', headers });
      } else {
        await fetch(`${BASE}/admin/permissions`, {
          method: 'PUT',
          headers,
          body: JSON.stringify({ role: selectedRole, table_name: tableName, ...next }),
        });
      }
      await loadPerms(selectedRole);
    } catch {
      toast.error(t('common.error'));
    } finally {
      setSaving(null);
    }
  };

  const allTables = [WILDCARD, ...tables];

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="h-6 w-6 animate-spin rounded-full border-2 border-primary border-t-transparent" />
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col overflow-hidden p-6">
      <div className="mb-4 flex items-start justify-between gap-4">
        <div>
          <h2 className="text-lg font-semibold">{t('admin.menu.permissions')}</h2>
          <p className="mt-1 text-sm text-muted-foreground">{t('permissions.desc')}</p>
        </div>
        <Select value={selectedRole} onValueChange={handleRoleChange}>
          <SelectTrigger className="w-48 shrink-0">
            <SelectValue placeholder={t('permissions.select_role')} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="user">{t('admin.roles.user')}</SelectItem>
            {customRoles.map(r => (
              <SelectItem key={r.id} value={r.id}>{r.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="overflow-auto rounded-md border">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b bg-muted/50">
              <th className="px-4 py-2 text-left font-medium text-muted-foreground">
                {t('permissions.col_table')}
              </th>
              {ACTIONS.map(a => (
                <th key={a.key} className="px-4 py-2 text-center font-medium text-muted-foreground">
                  {t(a.labelKey)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {allTables.map((tableName, idx) => {
              const perm = getPerm(tableName);
              const isWildcard = tableName === WILDCARD;
              return (
                <tr
                  key={tableName}
                  className={`border-b last:border-0 ${isWildcard ? 'bg-amber-50/50 dark:bg-amber-950/20' : idx % 2 === 0 ? '' : 'bg-muted/20'}`}
                >
                  <td className="px-4 py-2 font-mono text-xs">
                    {isWildcard ? (
                      <span className="flex items-center gap-1.5">
                        <span className="font-semibold text-amber-600 dark:text-amber-400">*</span>
                        <span className="text-muted-foreground">{t('permissions.wildcard_desc')}</span>
                      </span>
                    ) : tableName}
                  </td>
                  {ACTIONS.map(a => {
                    const checked = perm?.[a.key] === 1;
                    const key = tableName + a.key;
                    return (
                      <td key={a.key} className="px-4 py-2 text-center">
                        <Checkbox
                          checked={checked}
                          disabled={saving === key}
                          onCheckedChange={v => { void handleToggle(tableName, a.key, !!v); }}
                        />
                      </td>
                    );
                  })}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
