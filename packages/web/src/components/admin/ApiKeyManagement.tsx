import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Copy, Plus, Trash2, ShieldOff, Check, Key, Activity, ChevronDown, ChevronUp } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { Button } from '../ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '../ui/dialog';
import { Input } from '../ui/input';
import { Badge } from '../ui/badge';
import { toast } from 'sonner';

interface ApiKeyRecord {
  id: string;
  name: string;
  key_prefix: string;
  scopes: string[];
  created_by: string;
  created_at: string;
  expires_at: string | null;
  last_used_at: string | null;
  revoked: number;
}

interface ScopeOption {
  value: string;
  label: string;
  group: string;
}

interface ExtLogEntry {
  id: number;
  timestamp: string;
  description: string;
  diff: string;
  user_request: string;
}

const BASE = '/api';

function parseDiff(raw: string): { before: unknown; after: unknown } | null {
  try { return JSON.parse(raw) as { before: unknown; after: unknown }; }
  catch { return null; }
}

export function ApiKeyManagement() {
  const { t } = useTranslation();
  const { token } = useAuth();
  const headers = { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` };

  const [keys, setKeys] = useState<ApiKeyRecord[]>([]);
  const [scopeOptions, setScopeOptions] = useState<ScopeOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [newKeyRaw, setNewKeyRaw] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  // Create form state
  const [formName, setFormName] = useState('');
  const [formScopes, setFormScopes] = useState<Set<string>>(new Set());
  const [formExpires, setFormExpires] = useState('');
  const [creating, setCreating] = useState(false);

  // Inbound log state
  const [logs, setLogs] = useState<ExtLogEntry[]>([]);
  const [logsLoading, setLogsLoading] = useState(false);
  const [showLogs, setShowLogs] = useState(false);
  const [expandedLog, setExpandedLog] = useState<number | null>(null);

  const load = async () => {
    setLoading(true);
    try {
      const [keysRes, scopesRes] = await Promise.all([
        fetch(`${BASE}/admin/api-keys`, { headers }),
        fetch(`${BASE}/admin/api-keys/scopes`, { headers }),
      ]);
      setKeys(await keysRes.json() as ApiKeyRecord[]);
      setScopeOptions(await scopesRes.json() as ScopeOption[]);
    } catch {
      toast.error(t('common.error'));
    } finally {
      setLoading(false);
    }
  };

  const loadLogs = async () => {
    setLogsLoading(true);
    try {
      const res = await fetch(`${BASE}/admin/api-keys/logs`, { headers });
      setLogs(await res.json() as ExtLogEntry[]);
    } catch {
      toast.error(t('common.error'));
    } finally {
      setLogsLoading(false);
    }
  };

  useEffect(() => { void load(); }, []);

  const handleToggleLogs = () => {
    const next = !showLogs;
    setShowLogs(next);
    if (next && logs.length === 0) void loadLogs();
  };

  const handleCreate = async () => {
    if (!formName.trim() || formScopes.size === 0) {
      toast.error(t('api_keys.error_name_and_scope'));
      return;
    }
    setCreating(true);
    try {
      const res = await fetch(`${BASE}/admin/api-keys`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ name: formName.trim(), scopes: [...formScopes], expires_at: formExpires || undefined }),
      });
      if (!res.ok) { toast.error(t('common.error')); return; }
      const data = await res.json() as { raw_key: string };
      setNewKeyRaw(data.raw_key);
      setShowCreate(false);
      setFormName(''); setFormScopes(new Set()); setFormExpires('');
      void load();
    } finally {
      setCreating(false);
    }
  };

  const handleRevoke = async (id: string) => {
    const res = await fetch(`${BASE}/admin/api-keys/${id}/revoke`, { method: 'PATCH', headers });
    if (res.ok) { toast.success(t('api_keys.revoked')); void load(); }
    else toast.error(t('common.error'));
  };

  const handleDelete = async (id: string) => {
    const res = await fetch(`${BASE}/admin/api-keys/${id}`, { method: 'DELETE', headers });
    if (res.ok) { toast.success(t('api_keys.deleted')); void load(); }
    else toast.error(t('common.error'));
  };

  const copyKey = async () => {
    if (!newKeyRaw) return;
    await navigator.clipboard.writeText(newKeyRaw);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  // Group scopes by group label
  const scopeGroups = scopeOptions.reduce<Record<string, ScopeOption[]>>((acc, s) => {
    (acc[s.group] ??= []).push(s);
    return acc;
  }, {});

  const toggleScope = (value: string) => {
    setFormScopes(prev => {
      const next = new Set(prev);
      if (next.has(value)) next.delete(value); else next.add(value);
      return next;
    });
  };

  return (
    <>
      <div className="flex h-full flex-col overflow-hidden">
        {/* Header */}
        <div className="flex shrink-0 items-center justify-between border-b px-6 py-4">
          <div>
            <h2 className="flex items-center gap-2 text-base font-semibold">
              <Key size={16} />
              {t('api_keys.title')}
            </h2>
            <p className="mt-0.5 text-xs text-muted-foreground">{t('api_keys.description')}</p>
          </div>
          <Button size="sm" onClick={() => setShowCreate(true)}>
            <Plus size={14} className="mr-1" />
            {t('api_keys.create')}
          </Button>
        </div>

        <div className="flex-1 overflow-y-auto p-6 space-y-4">
          {/* Key list */}
          {loading ? (
            <div className="text-sm text-muted-foreground text-center py-8">{t('common.loading')}</div>
          ) : keys.length === 0 ? (
            <div className="text-sm text-muted-foreground text-center py-8">{t('api_keys.empty')}</div>
          ) : (
            <div className="space-y-2">
              {keys.map(k => (
                <div key={k.id} className={`border rounded-md p-3 space-y-2 ${k.revoked ? 'opacity-50' : ''}`}>
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="font-medium truncate">{k.name}</span>
                      {k.revoked ? (
                        <Badge variant="destructive" className="text-xs shrink-0">{t('api_keys.revoked_badge')}</Badge>
                      ) : (
                        <Badge variant="outline" className="text-xs shrink-0 font-mono">{k.key_prefix}****</Badge>
                      )}
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      {!k.revoked && (
                        <Button variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground"
                          title={t('api_keys.revoke')}
                          onClick={() => void handleRevoke(k.id)}>
                          <ShieldOff size={13} />
                        </Button>
                      )}
                      <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive"
                        title={t('common.delete')}
                        onClick={() => void handleDelete(k.id)}>
                        <Trash2 size={13} />
                      </Button>
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-1">
                    {k.scopes.map(s => (
                      <Badge key={s} variant="secondary" className="text-xs font-mono">{s}</Badge>
                    ))}
                  </div>
                  <div className="text-xs text-muted-foreground flex gap-4">
                    <span>{t('api_keys.created')}: {new Date(k.created_at).toLocaleDateString()}</span>
                    {k.last_used_at && <span>{t('api_keys.last_used')}: {new Date(k.last_used_at).toLocaleDateString()}</span>}
                    {k.expires_at && <span>{t('api_keys.expires')}: {new Date(k.expires_at).toLocaleDateString()}</span>}
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Inbound Activity Log */}
          <div className="border rounded-md overflow-hidden">
            <button
              type="button"
              className="w-full flex items-center justify-between px-4 py-3 text-sm font-medium hover:bg-accent transition-colors"
              onClick={handleToggleLogs}
            >
              <span className="flex items-center gap-2">
                <Activity size={14} />
                {t('api_keys.log_title')}
              </span>
              {showLogs ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
            </button>

            {showLogs && (
              <div className="border-t">
                {logsLoading ? (
                  <div className="text-xs text-muted-foreground text-center py-6">{t('common.loading')}</div>
                ) : logs.length === 0 ? (
                  <div className="text-xs text-muted-foreground text-center py-6">{t('api_keys.log_empty')}</div>
                ) : (
                  <div className="divide-y max-h-80 overflow-y-auto">
                    {logs.map(log => {
                      const diff = parseDiff(log.diff);
                      const isExpanded = expandedLog === log.id;
                      return (
                        <div key={log.id} className="px-4 py-2.5 space-y-1">
                          <div className="flex items-start justify-between gap-2">
                            <span className="text-xs font-mono text-foreground leading-relaxed">{log.description}</span>
                            <span className="text-xs text-muted-foreground shrink-0 tabular-nums">
                              {new Date(log.timestamp).toLocaleString()}
                            </span>
                          </div>
                          {diff && (
                            <button
                              type="button"
                              className="text-xs text-muted-foreground hover:text-foreground transition-colors"
                              onClick={() => setExpandedLog(isExpanded ? null : log.id)}
                            >
                              {isExpanded ? t('api_keys.log_hide_diff') : t('api_keys.log_show_diff')}
                            </button>
                          )}
                          {isExpanded && diff && (
                            <pre className="text-xs bg-muted rounded p-2 overflow-x-auto max-h-40 whitespace-pre-wrap break-all">
                              {JSON.stringify(diff.after, null, 2)}
                            </pre>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
                <div className="border-t px-4 py-2 flex justify-end">
                  <button
                    type="button"
                    className="text-xs text-muted-foreground hover:text-foreground transition-colors"
                    onClick={() => void loadLogs()}
                  >
                    {t('api_keys.log_refresh')}
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Create Key Dialog */}
      <Dialog open={showCreate} onOpenChange={open => { if (!open) setShowCreate(false); }}>
        <DialogContent className="max-w-lg max-h-[85vh]">
          <DialogHeader>
            <DialogTitle>{t('api_keys.create')}</DialogTitle>
          </DialogHeader>
          <div className="flex-1 overflow-y-auto -mx-6 px-6 space-y-4 py-1">
            <div className="space-y-1.5">
              <label className="text-sm font-medium">{t('api_keys.form_name')}</label>
              <Input value={formName} onChange={e => setFormName(e.target.value)} placeholder={t('api_keys.form_name_placeholder')} />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">{t('api_keys.form_scopes')}</label>
              {Object.entries(scopeGroups).map(([group, options]) => (
                <div key={group} className="space-y-1">
                  <div className="text-xs text-muted-foreground font-medium uppercase tracking-wide">{group}</div>
                  {options.map(opt => (
                    <label key={opt.value} className="flex items-center gap-2 cursor-pointer hover:bg-accent rounded px-1.5 py-1">
                      <input
                        type="checkbox"
                        checked={formScopes.has(opt.value)}
                        onChange={() => toggleScope(opt.value)}
                        className="rounded"
                      />
                      <span className="text-sm">{opt.label}</span>
                      <span className="text-xs text-muted-foreground font-mono ml-auto">{opt.value}</span>
                    </label>
                  ))}
                </div>
              ))}
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-medium">{t('api_keys.form_expires')} <span className="text-muted-foreground font-normal">({t('common.none')})</span></label>
              <Input type="date" value={formExpires} onChange={e => setFormExpires(e.target.value)} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowCreate(false)}>{t('common.cancel')}</Button>
            <Button onClick={() => void handleCreate()} disabled={creating}>
              {creating ? t('common.loading') : t('api_keys.create_confirm')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* One-time Key Display Dialog */}
      <Dialog open={!!newKeyRaw} onOpenChange={open => { if (!open) setNewKeyRaw(null); }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{t('api_keys.created_title')}</DialogTitle>
            <DialogDescription>{t('api_keys.created_warning')}</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="flex items-center gap-2 rounded-md border bg-muted p-3 font-mono text-sm break-all">
              <span className="flex-1">{newKeyRaw}</span>
              <Button variant="ghost" size="icon" className="shrink-0" onClick={() => void copyKey()}>
                {copied ? <Check size={14} className="text-green-600" /> : <Copy size={14} />}
              </Button>
            </div>
          </div>
          <DialogFooter>
            <Button onClick={() => setNewKeyRaw(null)}>{t('common.ok')}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
