import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { AuthUser } from '../../contexts/AuthContext';

interface Props {
  onAuth: (user: AuthUser, token: string) => void;
}

type Scope = 'mcp:read' | 'mcp:write' | 'mcp:admin';

const SCOPES: Scope[] = ['mcp:read', 'mcp:write', 'mcp:admin'];

function Logo() {
  return (
    <div className="mb-8 flex flex-col items-center gap-2">
      <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-primary text-xl font-bold text-primary-foreground">
        Z
      </div>
      <h1 className="text-2xl font-bold">Zenku</h1>
    </div>
  );
}

function StepIndicator({ current, total }: { current: number; total: number }) {
  const { t } = useTranslation();
  return (
    <div className="mb-6 flex items-center gap-3">
      {Array.from({ length: total }, (_, i) => (
        <div key={i} className="flex items-center gap-3">
          <div className={`flex h-7 w-7 items-center justify-center rounded-full text-xs font-semibold transition-colors ${
            i + 1 === current
              ? 'bg-primary text-primary-foreground'
              : i + 1 < current
              ? 'bg-primary/30 text-primary'
              : 'bg-muted text-muted-foreground'
          }`}>
            {i + 1}
          </div>
          {i < total - 1 && (
            <div className={`h-px w-8 transition-colors ${i + 1 < current ? 'bg-primary/30' : 'bg-border'}`} />
          )}
        </div>
      ))}
      <span className="ml-1 text-xs text-muted-foreground">
        {t('setup.step_indicator', { current, total })}
      </span>
    </div>
  );
}

// ─── Step 1: Admin account ────────────────────────────────────────────────────

interface Step1Props {
  onDone: (user: AuthUser, token: string) => void;
}

function Step1({ onDone }: Step1Props) {
  const { t } = useTranslation();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const res = await fetch('/api/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, email, password }),
      });
      const data = await res.json() as { token: string; user: AuthUser; error?: string; params?: Record<string, unknown> };
      if (!res.ok) {
        setError(String(t(`errors.${data.error}`, { ...data.params, defaultValue: data.error ?? t('common.error') })));
        return;
      }
      onDone(data.user, data.token);
    } catch {
      setError(t('errors.network_error'));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div>
      <p className="mb-1 text-sm font-medium text-muted-foreground">{t('setup.step1_desc')}</p>
      <form onSubmit={(e) => { void submit(e); }} className="mt-5 space-y-4">
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
        <div className="space-y-1.5">
          <label className="text-sm font-medium">{t('auth.email')}</label>
          <input
            type="email"
            value={email}
            onChange={e => setEmail(e.target.value)}
            placeholder="admin@example.com"
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
            autoComplete="new-password"
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
          {loading ? t('auth.processing') : t('auth.register_button')}
        </button>
      </form>
    </div>
  );
}

// ─── Step 2: API Key generation ───────────────────────────────────────────────

interface Step2Props {
  token: string;
  onDone: () => void;
}

function Step2({ token, onDone }: Step2Props) {
  const { t } = useTranslation();
  const [keyName, setKeyName] = useState('Claude Desktop');
  const [scope, setScope] = useState<Scope>('mcp:admin');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [generatedKey, setGeneratedKey] = useState('');
  const [copied, setCopied] = useState(false);
  const [copiedConfig, setCopiedConfig] = useState(false);

  const scopeLabel = (s: Scope) => {
    if (s === 'mcp:read') return t('setup.scope_read');
    if (s === 'mcp:write') return t('setup.scope_write');
    return t('setup.scope_admin');
  };

  const generate = async () => {
    if (!keyName.trim()) return;
    setError('');
    setLoading(true);
    try {
      const res = await fetch('/api/admin/api-keys', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ name: keyName.trim(), scopes: [scope] }),
      });
      const data = await res.json() as { raw_key?: string; error?: string; params?: Record<string, unknown> };
      if (!res.ok) {
        setError(String(t(`errors.${data.error}`, { ...data.params, defaultValue: data.error ?? t('common.error') })));
        return;
      }
      setGeneratedKey(data.raw_key ?? '');
    } catch {
      setError(t('errors.network_error'));
    } finally {
      setLoading(false);
    }
  };

  const copy = (text: string, setter: (v: boolean) => void) => {
    void navigator.clipboard.writeText(text).then(() => {
      setter(true);
      setTimeout(() => setter(false), 2000);
    });
  };

  const claudeConfig = generatedKey
    ? JSON.stringify({
        mcpServers: {
          zenku: {
            command: 'npx',
            args: ['-y', 'mcp-remote', `${window.location.origin}/api/mcp`, '--header', `Authorization:Bearer ${generatedKey}`],
          },
        },
      }, null, 2)
    : '';

  if (generatedKey) {
    return (
      <div className="space-y-5">
        <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 dark:border-amber-900/50 dark:bg-amber-950/30">
          <p className="text-sm font-medium text-amber-800 dark:text-amber-300">{t('setup.key_created_warning')}</p>
        </div>
        <div className="space-y-1.5">
          <label className="text-sm font-medium">{t('setup.key_created_title')}</label>
          <div className="flex gap-2">
            <code className="flex-1 overflow-x-auto rounded-md border bg-muted px-3 py-2 text-xs font-mono">
              {generatedKey}
            </code>
            <button
              type="button"
              onClick={() => copy(generatedKey, setCopied)}
              className="shrink-0 rounded-md border px-3 py-2 text-sm font-medium transition hover:bg-muted"
            >
              {copied ? t('setup.copied') : t('setup.copy_key')}
            </button>
          </div>
        </div>
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <p className="text-sm font-medium">{t('setup.claude_hint_title')}</p>
            <button
              type="button"
              onClick={() => copy(claudeConfig, setCopiedConfig)}
              className="text-xs text-muted-foreground hover:text-foreground"
            >
              {copiedConfig ? t('setup.copied') : t('setup.copy_config')}
            </button>
          </div>
          <p className="text-xs text-muted-foreground">{t('setup.claude_hint_note')}</p>
          <pre className="overflow-x-auto rounded-md border bg-muted p-3 text-xs font-mono leading-relaxed">
            {claudeConfig}
          </pre>
        </div>
        <button
          type="button"
          onClick={onDone}
          className="w-full rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition hover:bg-primary/90"
        >
          {t('setup.finish_btn')}
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <p className="text-sm text-muted-foreground">{t('setup.step2_desc')}</p>
      <div className="space-y-1.5">
        <label className="text-sm font-medium">{t('setup.key_name_label')}</label>
        <input
          type="text"
          value={keyName}
          onChange={e => setKeyName(e.target.value)}
          placeholder={t('setup.key_name_placeholder')}
          className="w-full rounded-md border bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-primary"
        />
      </div>
      <div className="space-y-2">
        <label className="text-sm font-medium">{t('setup.scope_label')}</label>
        <div className="space-y-2">
          {SCOPES.map(s => (
            <label key={s} className={`flex cursor-pointer items-start gap-3 rounded-lg border p-3 transition ${scope === s ? 'border-primary bg-primary/5' : 'hover:bg-muted/50'}`}>
              <input
                type="radio"
                name="scope"
                value={s}
                checked={scope === s}
                onChange={() => setScope(s)}
                className="mt-0.5 accent-primary"
              />
              <div>
                <span className="text-sm font-medium">{scopeLabel(s)}</span>
                {s === 'mcp:admin' && (
                  <span className="ml-2 rounded-full bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary">
                    {t('setup.scope_recommended')}
                  </span>
                )}
                <p className="mt-0.5 text-xs text-muted-foreground">{s}</p>
              </div>
            </label>
          ))}
        </div>
      </div>
      {error && (
        <p className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">{error}</p>
      )}
      <button
        type="button"
        onClick={() => { void generate(); }}
        disabled={loading || !keyName.trim()}
        className="w-full rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition hover:bg-primary/90 disabled:opacity-50"
      >
        {loading ? t('setup.generating') : t('setup.generate_btn')}
      </button>
      <button
        type="button"
        onClick={onDone}
        className="w-full text-center text-sm text-muted-foreground hover:text-foreground"
      >
        {t('setup.step2_skip')}
      </button>
    </div>
  );
}

// ─── Wizard ───────────────────────────────────────────────────────────────────

export function SetupWizard({ onAuth }: Props) {
  const { t } = useTranslation();
  const [step, setStep] = useState<1 | 2>(1);
  const [authState, setAuthState] = useState<{ user: AuthUser; token: string } | null>(null);

  const handleStep1Done = (user: AuthUser, token: string) => {
    setAuthState({ user, token });
    setStep(2);
  };

  const handleFinish = () => {
    if (authState) onAuth(authState.user, authState.token);
  };

  const titles: Record<1 | 2, string> = {
    1: t('setup.step1_title'),
    2: t('setup.step2_title'),
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="w-full max-w-md">
        <Logo />
        <StepIndicator current={step} total={2} />
        <div className="rounded-xl border bg-card p-6 shadow-sm">
          <h2 className="mb-1 text-lg font-semibold">{titles[step]}</h2>
          {step === 1 && <Step1 onDone={handleStep1Done} />}
          {step === 2 && authState && (
            <Step2 token={authState.token} onDone={handleFinish} />
          )}
        </div>
      </div>
    </div>
  );
}
