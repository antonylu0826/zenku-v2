import { useEffect, useState } from 'react';
import { X } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../ui/select';

interface UserRow {
  id: string;
  email: string;
  name: string;
  role: 'admin' | 'builder' | 'user';
  created_at: string;
  last_login_at: string | null;
}

interface Props {
  onClose: () => void;
}

const ROLES: Array<{ value: 'admin' | 'builder' | 'user'; label: string }> = [
  { value: 'admin', label: '管理員' },
  { value: 'builder', label: '建置者' },
  { value: 'user', label: '使用者' },
];

export function UserManagement({ onClose }: Props) {
  const { token, user: me } = useAuth();
  const [users, setUsers] = useState<UserRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<string | null>(null);

  const fetchUsers = async () => {
    const res = await fetch('/api/admin/users', {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (res.ok) {
      setUsers(await res.json() as UserRow[]);
    }
    setLoading(false);
  };

  useEffect(() => { void fetchUsers(); }, []);

  const changeRole = async (userId: string, role: 'admin' | 'builder' | 'user') => {
    setSaving(userId);
    await fetch(`/api/admin/users/${userId}/role`, {
      method: 'PUT',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ role }),
    });
    setSaving(null);
    void fetchUsers();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="w-full max-w-2xl overflow-hidden rounded-xl border bg-background shadow-xl">
        {/* Header */}
        <div className="flex items-center justify-between border-b px-6 py-4">
          <h2 className="text-base font-semibold">使用者管理</h2>
          <button onClick={onClose} className="rounded-md p-1 hover:bg-accent">
            <X size={16} />
          </button>
        </div>

        {/* Content */}
        <div className="max-h-[60vh] overflow-y-auto">
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <div className="h-5 w-5 animate-spin rounded-full border-2 border-primary border-t-transparent" />
            </div>
          ) : (
            <table className="w-full text-sm">
              <thead className="border-b bg-muted/50">
                <tr>
                  <th className="px-6 py-3 text-left font-medium text-muted-foreground">姓名</th>
                  <th className="px-6 py-3 text-left font-medium text-muted-foreground">Email</th>
                  <th className="px-6 py-3 text-left font-medium text-muted-foreground">角色</th>
                  <th className="px-6 py-3 text-left font-medium text-muted-foreground">最後登入</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {users.map(u => (
                  <tr key={u.id} className="hover:bg-muted/30">
                    <td className="px-6 py-3 font-medium">
                      {u.name}
                      {u.id === me.id && (
                        <span className="ml-2 rounded-full bg-primary/10 px-1.5 py-0.5 text-xs text-primary">你</span>
                      )}
                    </td>
                    <td className="px-6 py-3 text-muted-foreground">{u.email}</td>
                    <td className="px-6 py-3">
                      <Select
                        value={u.role}
                        disabled={u.id === me.id || saving === u.id}
                        onValueChange={v => { void changeRole(u.id, v as 'admin' | 'builder' | 'user'); }}
                      >
                        <SelectTrigger className="h-7 w-[90px] px-2 text-xs">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {ROLES.map(r => (
                            <SelectItem key={r.value} value={r.value} className="text-xs">
                              {r.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </td>
                    <td className="px-6 py-3 text-muted-foreground">
                      {u.last_login_at
                        ? new Date(u.last_login_at).toLocaleString('zh-TW')
                        : '未曾登入'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
}
