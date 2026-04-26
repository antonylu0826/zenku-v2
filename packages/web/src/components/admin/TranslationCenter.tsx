import { useEffect, useState, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { Plus, Trash2, RefreshCw, Languages } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '../ui/button';
import { Input } from '../ui/input';

interface TranslationRow {
  key: string;
  locale: string;
  content: string;
  updated_at: string;
}

// Group by key → { locale → content }
type TranslationMap = Record<string, Record<string, string>>;

const SUPPORTED_LOCALES = ['en', 'zh-TW'];

function authHeaders() {
  const token = localStorage.getItem('zenku-token');
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (token) headers['Authorization'] = `Bearer ${token}`;
  return headers;
}

export function TranslationCenter() {
  const { t } = useTranslation();
  const headers = authHeaders();

  const [rows, setRows]           = useState<TranslationRow[]>([]);
  const [loading, setLoading]     = useState(false);
  const [search, setSearch]       = useState('');
  const [saving, setSaving]       = useState<string | null>(null);

  // draft edits: `${key}::${locale}` → content
  const [drafts, setDrafts]       = useState<Record<string, string>>({});

  // new-key form
  const [newKey, setNewKey]       = useState('');
  const [newLocale, setNewLocale] = useState(SUPPORTED_LOCALES[0]);
  const [newContent, setNewContent] = useState('');
  const [adding, setAdding]       = useState(false);

  const fetchRows = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/admin/translations', { headers });
      if (res.ok) setRows(await res.json() as TranslationRow[]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { void fetchRows(); }, []);

  const map: TranslationMap = useMemo(() => {
    const m: TranslationMap = {};
    for (const r of rows) {
      if (!m[r.key]) m[r.key] = {};
      m[r.key][r.locale] = r.content;
    }
    return m;
  }, [rows]);

  const allKeys = useMemo(
    () => Object.keys(map).filter(k => !search || k.toLowerCase().includes(search.toLowerCase())),
    [map, search]
  );

  const draftKey = (key: string, locale: string) => `${key}::${locale}`;

  const getCurrent = (key: string, locale: string) => {
    const dk = draftKey(key, locale);
    return dk in drafts ? drafts[dk] : (map[key]?.[locale] ?? '');
  };

  const handleSave = async (key: string, locale: string) => {
    const content = getCurrent(key, locale);
    const sk = draftKey(key, locale);
    setSaving(sk);
    try {
      const res = await fetch('/api/admin/translations', {
        method: 'PUT',
        headers,
        body: JSON.stringify({ key, locale, content }),
      });
      if (!res.ok) throw new Error();
      toast.success(t('translations.toast_saved'));
      setDrafts(d => { const n = { ...d }; delete n[sk]; return n; });
      void fetchRows();
    } catch {
      toast.error(t('translations.toast_save_failed'));
    } finally {
      setSaving(null);
    }
  };

  const handleDelete = async (key: string, locale: string) => {
    const sk = draftKey(key, locale);
    setSaving(sk);
    try {
      const res = await fetch('/api/admin/translations', {
        method: 'DELETE',
        headers,
        body: JSON.stringify({ key, locale }),
      });
      if (!res.ok) throw new Error();
      toast.success(t('translations.toast_deleted'));
      void fetchRows();
    } catch {
      toast.error(t('translations.toast_delete_failed'));
    } finally {
      setSaving(null);
    }
  };

  const handleAdd = async () => {
    if (!newKey.startsWith('$') || !newContent.trim()) {
      toast.error(t('translations.error_invalid_key'));
      return;
    }
    setAdding(true);
    try {
      const res = await fetch('/api/admin/translations', {
        method: 'PUT',
        headers,
        body: JSON.stringify({ key: newKey, locale: newLocale, content: newContent }),
      });
      if (!res.ok) throw new Error();
      toast.success(t('translations.toast_saved'));
      setNewKey(''); setNewContent('');
      void fetchRows();
    } catch {
      toast.error(t('translations.toast_save_failed'));
    } finally {
      setAdding(false);
    }
  };

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between border-b px-6 py-4">
        <div>
          <h2 className="text-base font-semibold">{t('translations.title')}</h2>
          <p className="text-xs text-muted-foreground mt-0.5">{t('translations.desc')}</p>
        </div>
        <Button variant="outline" size="sm" onClick={fetchRows} disabled={loading}>
          <RefreshCw className={`h-4 w-4 mr-1.5 ${loading ? 'animate-spin' : ''}`} />
          {t('admin.users.refresh')}
        </Button>
      </div>

      {/* Add new row */}
      <div className="border-b px-6 py-3 bg-muted/30">
        <p className="text-xs font-medium text-muted-foreground mb-2">{t('translations.add_entry')}</p>
        <div className="flex items-center gap-2">
          <Input
            className="h-8 text-xs w-56"
            placeholder="$field.name.label"
            value={newKey}
            onChange={e => setNewKey(e.target.value)}
          />
          <select
            className="h-8 rounded-md border bg-background px-2 text-xs"
            value={newLocale}
            onChange={e => setNewLocale(e.target.value)}
          >
            {SUPPORTED_LOCALES.map(l => <option key={l} value={l}>{l}</option>)}
          </select>
          <Input
            className="h-8 text-xs flex-1"
            placeholder={t('translations.content_placeholder')}
            value={newContent}
            onChange={e => setNewContent(e.target.value)}
          />
          <Button size="sm" className="h-8" onClick={handleAdd} disabled={adding}>
            <Plus className="h-3.5 w-3.5 mr-1" />{t('common.add')}
          </Button>
        </div>
      </div>

      {/* Search */}
      <div className="border-b px-6 py-2">
        <Input
          className="h-8 text-xs w-72"
          placeholder={t('translations.search_placeholder')}
          value={search}
          onChange={e => setSearch(e.target.value)}
        />
      </div>

      {/* Table */}
      <div className="flex-1 overflow-y-auto px-6 py-4">
        {allKeys.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 gap-3 text-muted-foreground">
            <Languages className="h-10 w-10 opacity-30" />
            <p className="text-sm">{t('translations.no_entries')}</p>
          </div>
        ) : (
          <div className="space-y-3">
            {allKeys.map(key => (
              <div key={key} className="rounded-lg border bg-card p-4">
                <p className="text-xs font-mono font-semibold text-primary mb-3">{key}</p>
                <div className="space-y-2">
                  {SUPPORTED_LOCALES.map(locale => {
                    const sk = draftKey(key, locale);
                    const current = getCurrent(key, locale);
                    const isDirty = sk in drafts;
                    const isSaving = saving === sk;
                    return (
                      <div key={locale} className="flex items-center gap-2">
                        <span className="w-14 shrink-0 text-xs font-medium text-muted-foreground">{locale}</span>
                        <Input
                          className="h-7 text-xs flex-1"
                          value={current}
                          onChange={e => setDrafts(d => ({ ...d, [sk]: e.target.value }))}
                        />
                        {isDirty && (
                          <Button
                            size="sm"
                            className="h-7 px-2 text-xs"
                            disabled={isSaving}
                            onClick={() => void handleSave(key, locale)}
                          >
                            {t('common.save')}
                          </Button>
                        )}
                        {map[key]?.[locale] !== undefined && (
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7 shrink-0"
                            disabled={isSaving}
                            onClick={() => void handleDelete(key, locale)}
                          >
                            <Trash2 className="h-3.5 w-3.5 text-destructive" />
                          </Button>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
