import { useState } from 'react';
import { Loader2 } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Label } from '../ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '../ui/dialog';
import { toast } from 'sonner';

interface Props {
  open: boolean;
  onClose: () => void;
}

type Tab = 'profile' | 'password';

export function ProfileDialog({ open, onClose }: Props) {
  const { user, token, updateUser } = useAuth();
  const headers = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };

  const [tab, setTab] = useState<Tab>('profile');

  // Profile tab
  const [name, setName] = useState(user.name);
  const [profileLoading, setProfileLoading] = useState(false);

  // Password tab
  const [oldPwd, setOldPwd] = useState('');
  const [newPwd, setNewPwd] = useState('');
  const [confirmPwd, setConfirmPwd] = useState('');
  const [pwdLoading, setPwdLoading] = useState(false);

  const handleSaveProfile = async () => {
    if (!name.trim()) { toast.error('姓名不可為空'); return; }
    setProfileLoading(true);
    try {
      const res = await fetch('/api/users/me', { method: 'PUT', headers, body: JSON.stringify({ name: name.trim() }) });
      const json = await res.json() as { success?: boolean; name?: string; error?: string };
      if (!res.ok) { toast.error(json.error ?? '儲存失敗'); return; }
      updateUser({ name: json.name ?? name.trim() });
      toast.success('名稱已更新');
      onClose();
    } finally {
      setProfileLoading(false);
    }
  };

  const handleChangePassword = async () => {
    if (!oldPwd || !newPwd || !confirmPwd) { toast.error('請填寫所有欄位'); return; }
    if (newPwd.length < 6) { toast.error('新密碼至少 6 個字元'); return; }
    if (newPwd !== confirmPwd) { toast.error('兩次密碼不一致'); return; }
    setPwdLoading(true);
    try {
      const res = await fetch('/api/users/me/password', {
        method: 'PUT', headers,
        body: JSON.stringify({ old_password: oldPwd, new_password: newPwd }),
      });
      const json = await res.json() as { success?: boolean; error?: string };
      if (!res.ok) { toast.error(json.error ?? '修改失敗'); return; }
      toast.success('密碼已更新，其他裝置的登入 Session 已清除');
      setOldPwd(''); setNewPwd(''); setConfirmPwd('');
      onClose();
    } finally {
      setPwdLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={v => { if (!v) onClose(); }}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>個人設定</DialogTitle>
        </DialogHeader>

        {/* Tab bar */}
        <div className="flex border-b">
          {(['profile', 'password'] as Tab[]).map(t => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`px-4 py-2 text-sm font-medium transition-colors ${
                tab === t
                  ? 'border-b-2 border-primary text-primary'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              {t === 'profile' ? '基本資料' : '修改密碼'}
            </button>
          ))}
        </div>

        {tab === 'profile' && (
          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label>Email</Label>
              <Input value={user.email} disabled className="bg-muted text-muted-foreground" />
            </div>
            <div className="space-y-1.5">
              <Label>顯示名稱</Label>
              <Input
                value={name}
                onChange={e => setName(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') void handleSaveProfile(); }}
              />
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={onClose}>取消</Button>
              <Button onClick={() => void handleSaveProfile()} disabled={profileLoading}>
                {profileLoading && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />}
                儲存
              </Button>
            </div>
          </div>
        )}

        {tab === 'password' && (
          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label>目前密碼</Label>
              <Input
                type="password"
                value={oldPwd}
                onChange={e => setOldPwd(e.target.value)}
                autoFocus
              />
            </div>
            <div className="space-y-1.5">
              <Label>新密碼（至少 6 個字元）</Label>
              <Input type="password" value={newPwd} onChange={e => setNewPwd(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>確認新密碼</Label>
              <Input
                type="password"
                value={confirmPwd}
                onChange={e => setConfirmPwd(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') void handleChangePassword(); }}
              />
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={onClose}>取消</Button>
              <Button onClick={() => void handleChangePassword()} disabled={pwdLoading}>
                {pwdLoading && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />}
                確認修改
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
