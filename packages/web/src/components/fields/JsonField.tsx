import { lazy, Suspense, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '../ui/button';
import { cn } from '../../lib/cn';
import type { FieldInputInnerProps, FieldReadonlyProps } from './registry';

// Lazy-load the full editor chunk
const JsonEditor = lazy(() => import('./JsonEditor').then(m => ({ default: m.JsonEditor })));

// ─── JsonInput ────────────────────────────────────────────────────────────────

export function JsonInput({ value, onChange, disabled }: FieldInputInnerProps) {
  const { t } = useTranslation();
  const [error, setError] = useState<string | null>(null);
  const raw = value == null ? '' : typeof value === 'string' ? value : JSON.stringify(value, null, 2);

  const format = () => {
    try {
      onChange(JSON.stringify(JSON.parse(raw || '{}'), null, 2));
      setError(null);
    } catch (e) {
      setError((e as Error).message);
    }
  };

  return (
    <div className={cn('rounded-md border bg-background', disabled && 'opacity-50 pointer-events-none')}>
      <div className="flex items-center justify-between border-b px-3 py-1.5">
        <span className="text-xs text-muted-foreground">JSON</span>
        {!disabled && (
          <Button type="button" variant="ghost" size="sm" className="h-6 text-xs" onClick={format}>
            {t('json.format')}
          </Button>
        )}
      </div>
      <Suspense fallback={<div className="min-h-[160px] animate-pulse bg-muted/20 rounded-b-md" />}>
        <JsonEditor
          value={raw}
          onChange={v => { setError(null); onChange(v); }}
          disabled={!!disabled}
        />
      </Suspense>
      {error && <p className="px-3 pb-1.5 text-xs text-destructive">{error}</p>}
    </div>
  );
}

// ─── JsonReadonly ─────────────────────────────────────────────────────────────

export function JsonReadonly({ value }: FieldReadonlyProps) {
  if (!value) return <span className="text-sm text-muted-foreground">-</span>;
  let display: string;
  try { display = JSON.stringify(typeof value === 'string' ? JSON.parse(value) : value, null, 2); }
  catch { display = String(value); }
  return (
    <pre className="max-h-[200px] overflow-auto rounded-md bg-muted px-3 py-2 text-xs font-mono whitespace-pre-wrap">
      {display}
    </pre>
  );
}
