import { useEffect, useState } from 'react';
import { Loader2, Plus, RefreshCw, KeyRound, Trash2, UserX, UserCheck, X } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Label } from '../ui/label';
import { Badge } from '../ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../ui/table';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '../ui/dialog';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '../ui/alert-dialog';
import { toast } from 'sonner';

interface UserRow {
  id: string;
  email: string;
  name: string;
  role: 'admin' | 'builder' | 'user';
  disabled: number;
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

  // Add user dialog
  const [showAdd, setShowAdd] = useState(false);
  const [addForm, setAddForm] = useState({ name: '', email: '', password: '', role: 'user' as 'admin' | 'builder' | 'user' });
  const [addLoading, setAddLoading] = useState(false);

  // Reset password dialog
  const [resetUserId, setResetUserId] = useState<string | null>(null);
  const [resetPwd, setResetPwd] = useState('');
  const [resetLoading, setResetLoading] = useState(false);

  // Delete confirm
  const [deleteUserId, setDeleteUserId] = useState<string | null>(null);
  const [deleteLoading, setDeleteLoading] = useState(false);

  const headers = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };

  const fetchUsers = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/admin/users', { headers });
      if (res.ok) setUsers(await res.json() as UserRow[]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { void fetchUsers(); }, []);

  const changeRole = async (userId: string, role: 'admin' | 'builder' | 'user') => {
    setSaving(userId);
    await fetch(`/api/admin/users/${userId}/role`, { method: 'PUT', headers, body: JSON.stringify({ role }) });
    setSaving(null);
    void fetchUsers();
  };

  const toggleDisable = async (u: UserRow) => {
    setSaving(u.id);
    const endpoint = u.disabled ? 'enable' : 'disable';
    const res = await fetch(`/api/admin/users/${u.id}/${endpoint}`, { method: 'PATCH', headers });
    if (!res.ok) {
      const err = await res.json() as { error: string };
      toast.error(err.error);
    } else {
      toast.success(u.disabled ? `已啟用 ${u.name}` : `已停用 ${u.name}`);
      void fetchUsers();
    }
    setSaving(null);
  };

  const handleAddUser = async () => {
    if (!addForm.name || !addForm.email || !addForm.password) {
      toast.error('請填寫所有必填欄位');
      return;
    }
    setAddLoading(true);
    try {
      const res = await fetch('/api/admin/users', { method: 'POST', headers, body: JSON.stringify(addForm) });
      const json = await res.json() as { success?: boolean; error?: string };
      if (!res.ok) { toast.error(json.error ?? '新增失敗'); return; }
      toast.success(`已新增使用者 ${addForm.name}`);
      setShowAdd(false);
      setAddForm({ name: '', email: '', password: '', role: 'user' });
      void fetchUsers();
    } finally {
      setAddLoading(false);
    }
  };

  const handleResetPassword = async () => {
    if (!resetUserId || resetPwd.length < 6) {
      toast.error('密碼至少 6 個字元');
      return;
    }
    setResetLoading(true);
    try {
      const res = await fetch(`/api/admin/users/${resetUserId}/reset-password`, {
        method: 'POST', headers, body: JSON.stringify({ new_password: resetPwd }),
      });
      const json = await res.json() as { success?: boolean; error?: string };
      if (!res.ok) { toast.error(json.error ?? '重設失敗'); return; }
      toast.success('密碼已重設，該使用者的登入 Session 已清除');
      setResetUserId(null);
      setResetPwd('');
    } finally {
      setResetLoading(false);
    }
  };

  const handleDelete = async () => {
    if (!deleteUserId) return;
    setDeleteLoading(true);
    try {
      const res = await fetch(`/api/admin/users/${deleteUserId}`, { method: 'DELETE', headers });
      const json = await res.json() as { success?: boolean; error?: string };
      if (!res.ok) { toast.error(json.error ?? '刪除失敗'); return; }
      toast.success('使用者已刪除');
      setDeleteUserId(null);
      void fetchUsers();
    } finally {
      setDeleteLoading(false);
    }
  };

  const resetUser = users.find(u => u.id === resetUserId);
  const deleteUser = users.find(u => u.id === deleteUserId);

  return (
    <>
      {/* Main dialog */}
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
        <div className="flex w-full max-w-3xl flex-col overflow-hidden rounded-xl border bg-background shadow-xl" style={{ maxHeight: '85vh' }}>
          {/* Header */}
          <div className="flex shrink-0 items-center justify-between border-b px-6 py-4">
            <h2 className="text-base font-semibold">使用者管理</h2>
            <div className="flex items-center gap-2">
              <Button size="sm" onClick={() => setShowAdd(true)}>
                <Plus className="mr-1.5 h-3.5 w-3.5" />
                新增使用者
              </Button>
              <Button variant="ghost" size="icon" onClick={() => void fetchUsers()} title="重新整理">
                <RefreshCw className="h-4 w-4" />
              </Button>
              <Button variant="ghost" size="icon" onClick={onClose}>
                <X className="h-4 w-4" />
              </Button>
            </div>
          </div>

          {/* Table */}
          <div className="flex-1 overflow-y-auto">
            {loading ? (
              <div className="flex items-center justify-center py-16">
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>姓名</TableHead>
                    <TableHead>Email</TableHead>
                    <TableHead>角色</TableHead>
                    <TableHead>最後登入</TableHead>
                    <TableHead className="text-right">操作</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {users.map(u => (
                    <TableRow key={u.id} className={u.disabled ? 'opacity-60' : ''}>
                      <TableCell className="font-medium">
                        <div className="flex items-center gap-2">
                          {u.name}
                          {u.id === me.id && <Badge variant="secondary" className="text-xs">你</Badge>}
                          {!!u.disabled && <Badge variant="outline" className="text-xs text-muted-foreground">已停用</Badge>}
                        </div>
                      </TableCell>
                      <TableCell className="text-muted-foreground">{u.email}</TableCell>
                      <TableCell>
                        <Select
                          value={u.role}
                          disabled={u.id === me.id || saving === u.id || !!u.disabled}
                          onValueChange={v => { void changeRole(u.id, v as 'admin' | 'builder' | 'user'); }}
                        >
                          <SelectTrigger className="h-7 w-[90px] px-2 text-xs">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {ROLES.map(r => (
                              <SelectItem key={r.value} value={r.value} className="text-xs">{r.label}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {u.last_login_at ? new Date(u.last_login_at).toLocaleString('zh-TW') : '未曾登入'}
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center justify-end gap-1">
                          {/* Reset password */}
                          <Button
                            variant="ghost"
                            size="icon"
                            title="重設密碼"
                            onClick={() => { setResetUserId(u.id); setResetPwd(''); }}
                            disabled={saving === u.id}
                          >
                            <KeyRound className="h-4 w-4" />
                          </Button>
                          {/* Disable / Enable */}
                          {u.id !== me.id && (
                            <Button
                              variant="ghost"
                              size="icon"
                              title={u.disabled ? '啟用帳號' : '停用帳號'}
                              onClick={() => void toggleDisable(u)}
                              disabled={saving === u.id}
                            >
                              {u.disabled
                                ? <UserCheck className="h-4 w-4 text-green-600" />
                                : <UserX className="h-4 w-4 text-amber-600" />}
                            </Button>
                          )}
                          {/* Delete */}
                          {u.id !== me.id && (
                            <Button
                              variant="ghost"
                              size="icon"
                              title="刪除使用者"
                              onClick={() => setDeleteUserId(u.id)}
                              disabled={saving === u.id}
                            >
                              <Trash2 className="h-4 w-4 text-destructive" />
                            </Button>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </div>

          {/* Footer */}
          <div className="shrink-0 border-t px-6 py-3 text-xs text-muted-foreground">
            共 {users.length} 位使用者
          </div>
        </div>
      </div>

      {/* Add user dialog */}
      <Dialog open={showAdd} onOpenChange={setShowAdd}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>新增使用者</DialogTitle>
            <DialogDescription>建立新帳號並設定初始密碼</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label>姓名 *</Label>
              <Input value={addForm.name} onChange={e => setAddForm(f => ({ ...f, name: e.target.value }))} placeholder="王小明" />
            </div>
            <div className="space-y-1.5">
              <Label>Email *</Label>
              <Input type="email" value={addForm.email} onChange={e => setAddForm(f => ({ ...f, email: e.target.value }))} placeholder="user@example.com" />
            </div>
            <div className="space-y-1.5">
              <Label>初始密碼 *（至少 6 個字元）</Label>
              <Input type="password" value={addForm.password} onChange={e => setAddForm(f => ({ ...f, password: e.target.value }))} />
            </div>
            <div className="space-y-1.5">
              <Label>角色</Label>
              <Select value={addForm.role} onValueChange={v => setAddForm(f => ({ ...f, role: v as 'admin' | 'builder' | 'user' }))}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {ROLES.map(r => <SelectItem key={r.value} value={r.value}>{r.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowAdd(false)}>取消</Button>
            <Button onClick={() => void handleAddUser()} disabled={addLoading}>
              {addLoading && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />}
              新增
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Reset password dialog */}
      <Dialog open={!!resetUserId} onOpenChange={open => { if (!open) setResetUserId(null); }}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>重設密碼</DialogTitle>
            <DialogDescription>
              為 <span className="font-medium">{resetUser?.name}</span> 設定新密碼。重設後該使用者的現有登入 Session 將失效。
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-1.5 py-2">
            <Label>新密碼（至少 6 個字元）</Label>
            <Input
              type="password"
              value={resetPwd}
              onChange={e => setResetPwd(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') void handleResetPassword(); }}
              autoFocus
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setResetUserId(null)}>取消</Button>
            <Button onClick={() => void handleResetPassword()} disabled={resetLoading}>
              {resetLoading && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />}
              確認重設
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete confirm */}
      <AlertDialog open={!!deleteUserId} onOpenChange={open => { if (!open) setDeleteUserId(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>確認刪除</AlertDialogTitle>
            <AlertDialogDescription>
              確定要刪除使用者 <span className="font-medium">{deleteUser?.name}（{deleteUser?.email}）</span>？此操作無法復原，該使用者的所有登入 Session 也將一併清除。
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>取消</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => void handleDelete()}
              disabled={deleteLoading}
            >
              {deleteLoading && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />}
              刪除
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
