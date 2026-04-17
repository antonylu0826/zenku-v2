import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { AuthUser } from '../../contexts/AuthContext';

interface Props {
  hasUsers: boolean;
  onAuth: (user: AuthUser, token: string) => void;
}

interface AuthResponse {
  token: string;
  user: AuthUser;
  error?: string;
  params?: any;
}

export function LoginPage({ hasUsers, onAuth }: Props) {
  const { t } = useTranslation();
  const [mode, setMode] = useState<'login' | 'register'>(hasUsers ? 'login' : 'register');
  const [email, setEmail] = useState('');
  const [name, setName] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const endpoint = mode === 'login' ? '/api/auth/login' : '/api/auth/register';
      const body = mode === 'login' ? { email, password } : { email, name, password };

      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });

      const data = await res.json() as AuthResponse;

      if (!res.ok) {
        setError(String(t(`errors.${data.error}`, { ...data.params, defaultValue: data.error || t('common.error') })));
        return;
      }

      onAuth(data.user, data.token);
    } catch {
      setError(t('errors.network_error'));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="w-full max-w-sm">
        {/* Logo */}
        <div className="mb-8 flex flex-col items-center gap-2">
          <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-primary text-xl font-bold text-primary-foreground">
            Z
          </div>
          <h1 className="text-2xl font-bold">Zenku</h1>
          <p className="text-sm text-muted-foreground">
            {mode === 'login' 
              ? t('auth.login_title') 
              : !hasUsers ? t('auth.register_admin_title') : t('auth.register_title')}
          </p>
        </div>

        {/* Form */}
        <form onSubmit={(e) => { void submit(e); }} className="space-y-4">
          {mode === 'register' && (
            <div className="space-y-1.5">
              <label className="text-sm font-medium">{t('auth.name')}</label>
              <input
                type="text"
                value={name}
                onChange={e => setName(e.target.value)}
                placeholder={t('auth.name')}
                required
                className="w-full rounded-md border bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-primary"
              />
            </div>
          )}

          <div className="space-y-1.5">
            <label className="text-sm font-medium">{t('auth.email')}</label>
            <input
              type="email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              placeholder="your@email.com"
              required
              autoComplete="email"
              className="w-full rounded-md border bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-primary"
            />
          </div>

          <div className="space-y-1.5">
            <label className="text-sm font-medium">{t('auth.password')}</label>
            <input
              type="password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              placeholder={t('auth.password_hint')}
              required
              autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
              className="w-full rounded-md border bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-primary"
            />
          </div>

          {error && (
            <p className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">{error}</p>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition hover:bg-primary/90 disabled:opacity-50"
          >
            {loading ? t('auth.processing') : mode === 'login' ? t('auth.login_button') : t('auth.register_button')}
          </button>
        </form>

        {/* Toggle */}
        {hasUsers && (
          <p className="mt-4 text-center text-sm text-muted-foreground">
            {mode === 'login' ? t('auth.no_account') : t('auth.has_account')}
            <button
              type="button"
              onClick={() => { setMode(m => m === 'login' ? 'register' : 'login'); setError(''); }}
              className="ml-1 font-medium text-primary hover:underline"
            >
              {mode === 'login' ? t('auth.switch_register') : t('auth.switch_login')}
            </button>
          </p>
        )}
      </div>
    </div>
  );
}
