import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import i18n from '../../i18n';
import type { AuthUser, OidcProvider } from '../../contexts/AuthContext';

const LANGUAGES = [
  { code: 'zh-TW', label: '中文' },
  { code: 'en',    label: 'EN' },
];

interface Props {
  hasUsers: boolean;
  oidcProviders: OidcProvider[];
  authMode: 'local' | 'sso_only';
  onAuth: (user: AuthUser, token: string) => void;
}

interface AuthResponse {
  token: string;
  user: AuthUser;
  error?: string;
  params?: Record<string, unknown>;
}

export function LoginPage({ hasUsers, oidcProviders, authMode, onAuth }: Props) {
  const { t } = useTranslation();
  const [mode, setMode] = useState<'login' | 'register'>(hasUsers ? 'login' : 'register');
  const [email, setEmail] = useState('');
  const [name, setName] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const oidcError = params.get('oidc_error');
    if (oidcError) {
      window.history.replaceState({}, '', window.location.pathname);
      if (oidcError === 'email_taken_local') {
        setError(t('auth.oidc_email_taken'));
      } else {
        setError(t('auth.oidc_failed'));
      }
    }
  }, [t]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    if (mode === 'register' && password.length < 6) {
      setError(t('errors.ERROR_PASSWORD_TOO_SHORT', { min: 6 }));
      return;
    }
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
    <div className="relative flex min-h-screen items-center justify-center bg-muted/30 px-4">
      <div className="absolute right-4 top-4 flex gap-1">
        {LANGUAGES.map(({ code, label }) => (
          <button
            key={code}
            type="button"
            onClick={() => { void i18n.changeLanguage(code); }}
            className={`rounded px-2 py-1 text-xs font-medium transition ${
              i18n.language === code
                ? 'bg-primary/10 text-primary'
                : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            {label}
          </button>
        ))}
      </div>
      <div className="w-full max-w-sm rounded-lg border bg-card p-6 shadow-sm md:p-8">
        {/* Logo */}
        <div className="mb-6 flex flex-col items-center gap-2">
          <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-primary text-xl font-bold text-primary-foreground">
            Z
          </div>
          <h1 className="text-xl font-bold tracking-tight">Zenku</h1>
          <p className="text-center text-sm text-muted-foreground">
            {authMode === 'sso_only'
              ? t('auth.sso_only_title')
              : mode === 'login'
                ? t('auth.login_title')
                : !hasUsers ? t('auth.register_admin_title') : t('auth.register_title')}
          </p>
        </div>

        {authMode === 'sso_only' ? (
          /* SSO-only: show only SSO buttons */
          <div className="space-y-3">
            {error && <p className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">{error}</p>}
            {oidcProviders.map(p => (
              <a
                key={p.id}
                href={`/api/auth/oidc/${p.id}/login`}
                className="flex w-full items-center justify-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition hover:bg-primary/90"
              >
                {t('auth.sso_login', { name: p.name })}
              </a>
            ))}
          </div>
        ) : (
          /* Normal mode: form + optional SSO buttons */
          <>
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

            {oidcProviders.length > 0 && (
              <div className="mt-5">
                <div className="relative flex items-center gap-3">
                  <div className="flex-1 border-t" />
                  <span className="text-xs text-muted-foreground">{t('auth.or_sso')}</span>
                  <div className="flex-1 border-t" />
                </div>
                <div className="mt-3 flex flex-col gap-2">
                  {oidcProviders.map(p => (
                    <a
                      key={p.id}
                      href={`/api/auth/oidc/${p.id}/login`}
                      className="flex w-full items-center justify-center gap-2 rounded-md border px-4 py-2 text-sm font-medium transition hover:bg-muted"
                    >
                      {t('auth.sso_login', { name: p.name })}
                    </a>
                  ))}
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
