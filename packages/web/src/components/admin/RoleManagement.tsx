import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Plus, Pencil, Trash2, Loader2 } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Label } from '../ui/label';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../ui/table';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '../ui/dialog';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '../ui/alert-dialog';
import { toast } from 'sonner';

interface RoleRow {
  id: string;
  name: string;
  description: string | null;
  member_count: number;
  created_at: string;
}

const BASE = '/api';

export function RoleManagement() {
  const { t } = useTranslation();
  const { token } = useAuth();
  const headers = { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` };

  const [roles, setRoles] = useState<RoleRow[]>([]);
  const [loading, setLoading] = useState(true);

  // Create/Edit dialog
  const [editRole, setEditRole] = useState<RoleRow | null>(null);
  const [showDialog, setShowDialog] = useState(false);
  const [formName, setFormName] = useState('');
  const [formDesc, setFormDesc] = useState('');
  const [saving, setSaving] = useState(false);

  // Delete confirm
  const [deleteRole, setDeleteRole] = useState<RoleRow | null>(null);
  const [deleting, setDeleting] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const res = await fetch(`${BASE}/admin/roles`, { headers });
      setRoles(await res.json() as RoleRow[]);
    } catch {
      toast.error(t('common.error'));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { void load(); }, []);

  const openCreate = () => {
    setEditRole(null);
    setFormName('');
    setFormDesc('');
    setShowDialog(true);
  };

  const openEdit = (role: RoleRow) => {
    setEditRole(role);
    setFormName(role.name);
    setFormDesc(role.description ?? '');
    setShowDialog(true);
  };

  const handleSave = async () => {
    if (!formName.trim()) return;
    setSaving(true);
    try {
      const res = editRole
        ? await fetch(`${BASE}/admin/roles/${editRole.id}`, {
            method: 'PUT', headers,
            body: JSON.stringify({ name: formName.trim(), description: formDesc.trim() || undefined }),
          })
        : await fetch(`${BASE}/admin/roles`, {
            method: 'POST', headers,
            body: JSON.stringify({ name: formName.trim(), description: formDesc.trim() || undefined }),
          });
      if (!res.ok) {
        const err = await res.json() as { error: string };
        toast.error(t(`errors.${err.error}`, { defaultValue: err.error }));
        return;
      }
      toast.success(editRole
        ? t('roles.toast_updated', { name: formName.trim() })
        : t('roles.toast_created', { name: formName.trim() }));
      setShowDialog(false);
      void load();
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!deleteRole) return;
    setDeleting(true);
    try {
      await fetch(`${BASE}/admin/roles/${deleteRole.id}`, { method: 'DELETE', headers });
      toast.success(t('roles.toast_deleted'));
      setDeleteRole(null);
      void load();
    } finally {
      setDeleting(false);
    }
  };

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <div className="flex shrink-0 items-center justify-between border-b px-6 py-4">
        <div>
          <h2 className="text-base font-semibold">{t('roles.title')}</h2>
          <p className="mt-0.5 text-xs text-muted-foreground">{t('roles.desc')}</p>
        </div>
        <Button size="sm" onClick={openCreate}>
          <Plus className="mr-1.5 h-3.5 w-3.5" />
          {t('roles.btn_add')}
        </Button>
      </div>

      <div className="flex-1 overflow-y-auto">
        {loading ? (
          <div className="flex items-center justify-center py-16">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : roles.length === 0 ? (
          <div className="flex items-center justify-center py-16 text-sm text-muted-foreground">
            {t('roles.no_roles')}
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t('roles.col_name')}</TableHead>
                <TableHead>{t('roles.col_desc')}</TableHead>
                <TableHead className="w-24 text-center">{t('roles.col_members')}</TableHead>
                <TableHead className="w-24 text-right">{t('roles.col_actions')}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {roles.map(role => (
                <TableRow key={role.id}>
                  <TableCell className="font-medium">{role.name}</TableCell>
                  <TableCell className="text-sm text-muted-foreground">{role.description ?? '—'}</TableCell>
                  <TableCell className="text-center text-sm">{role.member_count}</TableCell>
                  <TableCell>
                    <div className="flex items-center justify-end gap-1">
                      <Button variant="ghost" size="icon" onClick={() => openEdit(role)}>
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button variant="ghost" size="icon" onClick={() => setDeleteRole(role)}>
                        <Trash2 className="h-4 w-4 text-destructive" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </div>

      {/* Create / Edit dialog */}
      <Dialog open={showDialog} onOpenChange={setShowDialog}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{editRole ? t('roles.dialog_edit_title') : t('roles.dialog_add_title')}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label>{t('roles.label_name')}</Label>
              <Input
                value={formName}
                onChange={e => setFormName(e.target.value)}
                placeholder={t('roles.placeholder_name')}
                autoFocus
              />
            </div>
            <div className="space-y-1.5">
              <Label>{t('roles.label_desc')}</Label>
              <Input
                value={formDesc}
                onChange={e => setFormDesc(e.target.value)}
                placeholder={t('roles.placeholder_desc')}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowDialog(false)}>{t('common.cancel')}</Button>
            <Button onClick={() => void handleSave()} disabled={saving || !formName.trim()}>
              {saving && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />}
              {t('common.ok')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete confirm */}
      <AlertDialog open={!!deleteRole} onOpenChange={open => { if (!open) setDeleteRole(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('common.confirm')}</AlertDialogTitle>
            <AlertDialogDescription>
              {t('roles.confirm_delete', { name: deleteRole?.name })}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t('common.cancel')}</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => void handleDelete()}
              disabled={deleting}
            >
              {deleting && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />}
              {t('common.delete')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
