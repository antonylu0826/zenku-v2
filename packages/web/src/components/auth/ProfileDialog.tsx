import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Loader2 } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Label } from '../ui/label';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '../ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../ui/select';
import { toast } from 'sonner';

interface Props {
  open: boolean;
  onClose: () => void;
}

type Tab = 'profile' | 'password';

export function ProfileDialog({ open, onClose }: Props) {
  const { t, i18n } = useTranslation();
  const { user, token, updateUser } = useAuth();
  const headers = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };

  const [tab, setTab] = useState<Tab>('profile');

  // Profile tab
  const [name, setName] = useState(user.name);
  const [language, setLanguage] = useState(user.language || 'en');
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
      const res = await fetch('/api/users/me', { method: 'PUT', headers, body: JSON.stringify({ name: name.trim(), language }) });
      const json = await res.json() as { success?: boolean; name?: string; language?: string; error?: string; params?: any };
      if (!res.ok) {
        toast.error(String(t(`errors.${json.error}`, { ...json.params, defaultValue: json.error || t('common.error') })));
        return;
      }
      
      i18n.changeLanguage(language);
      updateUser({ name: json.name ?? name.trim(), language: json.language || language });
      toast.success(t('profile.update_success'));
      onClose();
    } finally {
      setProfileLoading(false);
    }
  };

  const handleChangePassword = async () => {
    if (!oldPwd || !newPwd || !confirmPwd) { toast.error(t('common.error')); return; }
    if (newPwd.length < 6) { toast.error(t('profile.new_password')); return; }
    if (newPwd !== confirmPwd) { toast.error(t('profile.confirm_password')); return; }
    setPwdLoading(true);
    try {
      const res = await fetch('/api/users/me/password', {
        method: 'PUT', headers,
        body: JSON.stringify({ old_password: oldPwd, new_password: newPwd }),
      });
      const json = await res.json() as { success?: boolean; error?: string; params?: any };
      if (!res.ok) {
        toast.error(String(t(`errors.${json.error}`, { ...json.params, defaultValue: json.error || t('common.error') })));
        return;
      }
      toast.success(t('profile.password_success'));
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
          <DialogTitle>{t('profile.title')}</DialogTitle>
          <DialogDescription className="sr-only">
            {t('profile.title')}
          </DialogDescription>
        </DialogHeader>

        {/* Tab bar */}
        <div className="flex border-b">
          {(['profile', 'password'] as Tab[]).map(tabItem => (
            <button
              key={tabItem}
              onClick={() => setTab(tabItem)}
              className={`px-4 py-2 text-sm font-medium transition-colors ${
                tab === tabItem
                  ? 'border-b-2 border-primary text-primary'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              {tabItem === 'profile' ? t('profile.tab_basic') : t('profile.tab_password')}
            </button>
          ))}
        </div>

        {tab === 'profile' && (
          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label>{t('profile.email')}</Label>
              <Input value={user.email} disabled className="bg-muted text-muted-foreground" />
            </div>
            <div className="space-y-1.5">
              <Label>{t('profile.name')}</Label>
              <Input
                value={name}
                onChange={e => setName(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') void handleSaveProfile(); }}
              />
            </div>
            <div className="space-y-1.5">
              <Label>{t('profile.language')}</Label>
              <Select value={language} onValueChange={setLanguage}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="zh-TW">繁體中文</SelectItem>
                  <SelectItem value="en">English</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="flex justify-end gap-2 text-sm pt-2">
              <Button variant="outline" onClick={onClose}>{t('common.cancel')}</Button>
              <Button onClick={() => void handleSaveProfile()} disabled={profileLoading}>
                {profileLoading && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />}
                {t('common.save')}
              </Button>
            </div>
          </div>
        )}

        {tab === 'password' && (
          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label>{t('profile.old_password')}</Label>
              <Input
                type="password"
                value={oldPwd}
                onChange={e => setOldPwd(e.target.value)}
                autoFocus
              />
            </div>
            <div className="space-y-1.5">
              <Label>{t('profile.new_password')}</Label>
              <Input type="password" value={newPwd} onChange={e => setNewPwd(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>{t('profile.confirm_password')}</Label>
              <Input
                type="password"
                value={confirmPwd}
                onChange={e => setConfirmPwd(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') void handleChangePassword(); }}
              />
            </div>
            <div className="flex justify-end gap-2 text-sm pt-2">
              <Button variant="outline" onClick={onClose}>{t('common.cancel')}</Button>
              <Button onClick={() => void handleChangePassword()} disabled={pwdLoading}>
                {pwdLoading && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />}
                {t('profile.confirm_changes')}
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
