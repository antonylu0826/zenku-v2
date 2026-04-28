import { useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Download, Upload, AlertTriangle, CheckCircle2, ChevronRight, Link } from 'lucide-react';
import { toast } from 'sonner';
import {
  exportApp, previewImport, applyImport,
  type ImportPreviewResult, type ImportApplyResult,
} from '../api';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Label } from './ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './ui/card';
import { Badge } from './ui/badge';
import { Checkbox } from './ui/checkbox';
import { Separator } from './ui/separator';
import { cn } from '../lib/cn';

// ─── Export Section ───────────────────────────────────────────────────────────

function ExportSection() {
  const { t } = useTranslation();
  const [name, setName]           = useState('Zenku App');
  const [description, setDesc]    = useState('');
  const [version, setVersion]     = useState('1.0.0');
  const [exporting, setExporting] = useState(false);

  const handleExport = async () => {
    setExporting(true);
    try {
      await exportApp({ name, description, version });
      toast.success(t('bundle.export_success'));
    } catch (err) {
      toast.error(t('bundle.export_failed'), { description: String(err) });
    } finally {
      setExporting(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Download className="h-5 w-5" />
          {t('bundle.export_title')}
        </CardTitle>
        <CardDescription>{t('bundle.export_desc')}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <Label htmlFor="exp-name">{t('bundle.field_name')}</Label>
            <Input id="exp-name" value={name} onChange={e => setName(e.target.value)} placeholder="My App" />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="exp-ver">{t('bundle.field_version')}</Label>
            <Input id="exp-ver" value={version} onChange={e => setVersion(e.target.value)} placeholder="1.0.0" />
          </div>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="exp-desc">{t('bundle.field_description')}</Label>
          <Input id="exp-desc" value={description} onChange={e => setDesc(e.target.value)} placeholder={t('bundle.field_description_placeholder')} />
        </div>
        <Button onClick={handleExport} disabled={exporting || !name.trim()}>
          <Download className="mr-2 h-4 w-4" />
          {exporting ? t('bundle.exporting') : t('bundle.export_btn')}
        </Button>
      </CardContent>
    </Card>
  );
}

// ─── Diff Preview ─────────────────────────────────────────────────────────────

function DiffRow({ label, items, variant }: { label: string; items: string[]; variant: 'create' | 'update' | 'unchanged' }) {
  if (items.length === 0) return null;
  const colors = { create: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300', update: 'bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300', unchanged: 'bg-muted text-muted-foreground' };
  return (
    <div className="flex items-start gap-3 py-1.5">
      <span className="min-w-[80px] text-xs text-muted-foreground">{label}</span>
      <div className="flex flex-wrap gap-1">
        {items.map(id => (
          <span key={id} className={cn('rounded px-1.5 py-0.5 text-xs font-mono', colors[variant])}>{id}</span>
        ))}
      </div>
    </div>
  );
}

// ─── Import Section ───────────────────────────────────────────────────────────

type ImportStep = 'upload' | 'preview' | 'result';

function ImportSection() {
  const { t } = useTranslation();
  const fileRef = useRef<HTMLInputElement>(null);

  const [step, setStep]                     = useState<ImportStep>('upload');
  const [bundleData, setBundleData]         = useState<unknown>(null);
  const [preview, setPreview]               = useState<ImportPreviewResult | null>(null);
  const [result, setResult]                 = useState<ImportApplyResult | null>(null);
  const [loading, setLoading]               = useState(false);
  const [disableWebhooks, setDisableHooks]  = useState(true);
  const [webhookOverrides, setWebhookOverrides] = useState<Record<string, string>>({});

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const text = await file.text();
      const data = JSON.parse(text);
      setBundleData(data);
      setLoading(true);
      const prev = await previewImport(data);
      setPreview(prev);
      setWebhookOverrides(Object.fromEntries(prev.diff.webhook_urls.map(u => [u, u])));
      setStep('preview');
    } catch (err) {
      toast.error(t('bundle.parse_failed'), { description: String(err) });
    } finally {
      setLoading(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  };

  const handleApply = async () => {
    if (!bundleData) return;
    setLoading(true);
    try {
      const overrides = Object.fromEntries(
        Object.entries(webhookOverrides).filter(([orig, repl]) => repl !== orig && repl.trim())
      );
      const res = await applyImport(bundleData, { disable_webhooks: disableWebhooks, webhook_overrides: overrides });
      setResult(res);
      setStep('result');
      if (res.success) {
        toast.success(t('bundle.import_success'));
        // Reload views after import
        setTimeout(() => window.location.reload(), 1500);
      } else {
        toast.error(t('bundle.import_partial'));
      }
    } catch (err) {
      toast.error(t('bundle.import_failed'), { description: String(err) });
    } finally {
      setLoading(false);
    }
  };

  const reset = () => { setStep('upload'); setBundleData(null); setPreview(null); setResult(null); };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Upload className="h-5 w-5" />
          {t('bundle.import_title')}
        </CardTitle>
        <CardDescription>{t('bundle.import_desc')}</CardDescription>
      </CardHeader>
      <CardContent>
        {/* Step indicator */}
        <div className="mb-6 flex items-center gap-2 text-sm">
          {(['upload', 'preview', 'result'] as ImportStep[]).map((s, i) => (
            <span key={s} className="flex items-center gap-2">
              {i > 0 && <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />}
              <span className={cn('font-medium', step === s ? 'text-primary' : 'text-muted-foreground')}>
                {t(`bundle.step_${s}`)}
              </span>
            </span>
          ))}
        </div>

        {/* Step: Upload */}
        {step === 'upload' && (
          <div className="space-y-4">
            <label
              className="flex cursor-pointer flex-col items-center justify-center rounded-lg border-2 border-dashed border-muted-foreground/30 px-6 py-10 text-center transition hover:border-primary/50 hover:bg-muted/30"
              onClick={() => fileRef.current?.click()}
            >
              <Upload className="mb-3 h-8 w-8 text-muted-foreground" />
              <p className="text-sm font-medium">{t('bundle.upload_prompt')}</p>
              <p className="mt-1 text-xs text-muted-foreground">.zenku.json</p>
            </label>
            <input ref={fileRef} type="file" accept=".json,.zenku.json" className="hidden" onChange={handleFileChange} />
            {loading && <p className="text-center text-sm text-muted-foreground">{t('common.loading')}</p>}
          </div>
        )}

        {/* Step: Preview */}
        {step === 'preview' && preview && (
          <div className="space-y-5">
            {/* Manifest */}
            <div className="rounded-md border bg-muted/30 px-4 py-3">
              <p className="text-sm font-semibold">{preview.manifest.name} <span className="font-normal text-muted-foreground">v{preview.manifest.version}</span></p>
              {preview.manifest.description && <p className="mt-0.5 text-xs text-muted-foreground">{preview.manifest.description}</p>}
            </div>

            {/* Summary badges */}
            <div className="flex flex-wrap gap-2">
              <Badge variant="outline">{t('bundle.summary_tables', { count: preview.summary.tables })}</Badge>
              <Badge variant="outline">{t('bundle.summary_views', { count: preview.summary.views })}</Badge>
              <Badge variant="outline">{t('bundle.summary_rules', { count: preview.summary.rules })}</Badge>
              {preview.summary.webhooks > 0 && (
                <Badge variant="destructive">{t('bundle.summary_webhooks', { count: preview.summary.webhooks })}</Badge>
              )}
            </div>

            {/* Diff details */}
            <div className="space-y-1 rounded-md border p-3">
              <p className="mb-2 text-xs font-medium text-muted-foreground uppercase tracking-wide">{t('bundle.diff_schema')}</p>
              <DiffRow label={t('bundle.diff_create')} items={preview.diff.tables_to_create} variant="create" />
              {preview.diff.tables_to_alter.map(d => (
                <DiffRow key={d.table} label={t('bundle.diff_alter')} items={[`${d.table} (+${d.columns_to_add.length} cols)`]} variant="update" />
              ))}
              <DiffRow label={t('bundle.diff_unchanged')} items={preview.diff.tables_unchanged} variant="unchanged" />
              <Separator className="my-2" />
              <p className="mb-2 text-xs font-medium text-muted-foreground uppercase tracking-wide">{t('bundle.diff_views')}</p>
              <DiffRow label={t('bundle.diff_create')} items={preview.diff.views_to_create} variant="create" />
              <DiffRow label={t('bundle.diff_update')} items={preview.diff.views_to_update} variant="update" />
              <Separator className="my-2" />
              <p className="mb-2 text-xs font-medium text-muted-foreground uppercase tracking-wide">{t('bundle.diff_rules')}</p>
              <DiffRow label={t('bundle.diff_create')} items={preview.diff.rules_to_create} variant="create" />
              <DiffRow label={t('bundle.diff_update')} items={preview.diff.rules_to_update} variant="update" />
            </div>

            {/* Warnings */}
            {preview.diff.warnings.length > 0 && (
              <div className="rounded-md border border-amber-200 bg-amber-50 p-3 dark:border-amber-800 dark:bg-amber-950/30">
                <div className="mb-1 flex items-center gap-1.5 text-sm font-medium text-amber-800 dark:text-amber-300">
                  <AlertTriangle className="h-4 w-4" />
                  {t('bundle.warnings')}
                </div>
                {preview.diff.warnings.map((w, i) => (
                  <p key={i} className="text-xs text-amber-700 dark:text-amber-400">{w}</p>
                ))}
              </div>
            )}

            {/* Webhook audit */}
            {preview.diff.webhook_urls.length > 0 && (
              <div className="space-y-2 rounded-md border border-destructive/30 bg-destructive/5 p-3">
                <div className="flex items-center gap-1.5 text-sm font-medium text-destructive">
                  <Link className="h-4 w-4" />
                  {t('bundle.webhook_audit_title')} ({preview.diff.webhook_urls.length})
                </div>
                <p className="text-xs text-muted-foreground">{t('bundle.webhook_audit_desc')}</p>
                {preview.diff.webhook_urls.map(url => (
                  <div key={url} className="flex items-center gap-2">
                    <span className="min-w-0 flex-1 truncate font-mono text-xs text-muted-foreground">{url}</span>
                    <Input
                      value={webhookOverrides[url] ?? url}
                      onChange={e => setWebhookOverrides(prev => ({ ...prev, [url]: e.target.value }))}
                      className="h-7 w-64 shrink-0 font-mono text-xs"
                      placeholder={url}
                    />
                  </div>
                ))}
              </div>
            )}

            {/* Webhook disable option */}
            <label className="flex cursor-pointer items-start gap-2">
              <Checkbox
                checked={disableWebhooks}
                onCheckedChange={v => setDisableHooks(!!v)}
                className="mt-0.5"
              />
              <div>
                <p className="text-sm font-medium">{t('bundle.disable_webhooks')}</p>
                <p className="text-xs text-muted-foreground">{t('bundle.disable_webhooks_hint')}</p>
              </div>
            </label>

            <div className="flex gap-2">
              <Button onClick={handleApply} disabled={loading}>
                {loading ? t('bundle.applying') : t('bundle.apply_btn')}
              </Button>
              <Button variant="outline" onClick={reset}>{t('common.cancel')}</Button>
            </div>
          </div>
        )}

        {/* Step: Result */}
        {step === 'result' && result && (
          <div className="space-y-4">
            <div className={cn('flex items-center gap-2 rounded-md border p-3',
              result.success ? 'border-emerald-200 bg-emerald-50 dark:border-emerald-800 dark:bg-emerald-950/30' : 'border-destructive/30 bg-destructive/5'
            )}>
              <CheckCircle2 className={cn('h-5 w-5', result.success ? 'text-emerald-600' : 'text-destructive')} />
              <p className="text-sm font-medium">{result.success ? t('bundle.import_success') : t('bundle.import_partial')}</p>
            </div>

            <div className="space-y-1 text-sm">
              <p className="text-muted-foreground">{t('bundle.result_tables_created')}: <span className="font-medium text-foreground">{result.tables_created.join(', ') || '–'}</span></p>
              <p className="text-muted-foreground">{t('bundle.result_tables_altered')}: <span className="font-medium text-foreground">{result.tables_altered.join(', ') || '–'}</span></p>
              <p className="text-muted-foreground">{t('bundle.result_views')}: <span className="font-medium text-foreground">{result.views_upserted.length}</span></p>
              <p className="text-muted-foreground">{t('bundle.result_rules')}: <span className="font-medium text-foreground">{result.rules_upserted.length}</span></p>
            </div>

            {result.errors.length > 0 && (
              <div className="rounded-md border border-destructive/30 bg-destructive/5 p-3 space-y-1">
                <p className="text-sm font-medium text-destructive">{t('bundle.result_errors')}</p>
                {result.errors.map((e, i) => <p key={i} className="text-xs text-destructive/80">{e}</p>)}
              </div>
            )}

            <Button variant="outline" onClick={reset}>{t('bundle.import_another')}</Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ─── BundlePage ───────────────────────────────────────────────────────────────

export function BundlePage() {
  const { t } = useTranslation();
  return (
    <div className="h-full overflow-auto">
      <div className="mx-auto max-w-3xl space-y-6 p-4 md:p-6">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">{t('bundle.page_title')}</h1>
          <p className="mt-1 text-sm text-muted-foreground">{t('bundle.page_desc')}</p>
        </div>
        <ExportSection />
        <ImportSection />
      </div>
    </div>
  );
}
