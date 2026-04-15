import { useEffect, useState } from 'react';
import { X, ChevronRight, RefreshCw, Archive, ArchiveX, Trash2, Loader2 } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { SessionDetail } from './SessionDetail';
import { Button } from '../ui/button';
import { Badge } from '../ui/badge';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '../ui/alert-dialog';
import { toast } from 'sonner';

interface SessionRow {
  id: string;
  user_id: string;
  user_name: string;
  user_email: string;
  title: string | null;
  provider: string;
  model: string;
  message_count: number;
  total_input_tokens: number;
  total_output_tokens: number;
  total_cost_usd: number;
  created_at: string;
  updated_at: string;
  archived: number;
}

interface Props {
  onClose: () => void;
}

export function ChatHistory({ onClose }: Props) {
  const { token } = useAuth();
  const headers = { Authorization: `Bearer ${token}` };

  const [sessions, setSessions] = useState<SessionRow[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [selectedSession, setSelectedSession] = useState<string | null>(null);
  const [filterProvider, setFilterProvider] = useState('');
  const [showArchived, setShowArchived] = useState(false);

  // Action states
  const [savingId, setSavingId] = useState<string | null>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [deleteLoading, setDeleteLoading] = useState(false);

  const fetchSessions = async () => {
    setLoading(true);
    const params = new URLSearchParams({ page: String(page), limit: '20', archived: showArchived ? '1' : '0' });
    if (filterProvider) params.set('provider', filterProvider);
    const res = await fetch(`/api/admin/sessions?${params}`, { headers });
    if (res.ok) {
      const data = await res.json() as { sessions: SessionRow[]; total: number };
      setSessions(data.sessions);
      setTotal(data.total);
    }
    setLoading(false);
  };

  useEffect(() => { void fetchSessions(); }, [page, filterProvider, showArchived]);

  const toggleArchive = async (s: SessionRow, e: React.MouseEvent) => {
    e.stopPropagation();
    setSavingId(s.id);
    const action = s.archived ? 'unarchive' : 'archive';
    const res = await fetch(`/api/admin/sessions/${s.id}/${action}`, { method: 'PATCH', headers });
    if (res.ok) {
      toast.success(s.archived ? '已取消封存' : '已封存');
      void fetchSessions();
    } else {
      toast.error('操作失敗');
    }
    setSavingId(null);
  };

  const handleDelete = async () => {
    if (!deleteId) return;
    setDeleteLoading(true);
    const res = await fetch(`/api/admin/sessions/${deleteId}`, { method: 'DELETE', headers });
    const json = await res.json() as { success?: boolean; error?: string };
    if (!res.ok) {
      toast.error(json.error ?? '刪除失敗');
    } else {
      toast.success('對話已刪除');
      setDeleteId(null);
      void fetchSessions();
    }
    setDeleteLoading(false);
  };

  if (selectedSession) {
    return <SessionDetail sessionId={selectedSession} onBack={() => setSelectedSession(null)} onClose={onClose} />;
  }

  const totalPages = Math.ceil(total / 20);
  const deleteTarget = sessions.find(s => s.id === deleteId);

  return (
    <>
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
        <div className="flex w-full max-w-4xl flex-col overflow-hidden rounded-xl border bg-background shadow-xl" style={{ maxHeight: '85vh' }}>
          {/* Header */}
          <div className="flex items-center justify-between border-b px-6 py-4">
            <div>
              <h2 className="text-base font-semibold">對話歷程</h2>
              <p className="text-xs text-muted-foreground">共 {total} 筆 session</p>
            </div>
            <div className="flex items-center gap-2">
              {/* Show archived toggle */}
              <button
                onClick={() => { setPage(1); setShowArchived(v => !v); }}
                className={`flex items-center gap-1.5 rounded-md border px-2.5 py-1.5 text-xs transition-colors ${
                  showArchived
                    ? 'border-primary bg-primary/10 text-primary'
                    : 'border-border text-muted-foreground hover:bg-accent'
                }`}
              >
                <Archive size={12} />
                {showArchived ? '顯示已封存' : '顯示一般'}
              </button>
              <select
                value={filterProvider}
                onChange={e => { setPage(1); setFilterProvider(e.target.value); }}
                className="rounded border bg-background px-2 py-1 text-xs"
              >
                <option value="">所有 Provider</option>
                <option value="claude">Claude</option>
                <option value="openai">OpenAI</option>
                <option value="gemini">Gemini</option>
              </select>
              <Button variant="ghost" size="icon" onClick={() => void fetchSessions()} title="重新整理">
                <RefreshCw size={14} />
              </Button>
              <Button variant="ghost" size="icon" onClick={onClose}>
                <X size={16} />
              </Button>
            </div>
          </div>

          {/* Table */}
          <div className="flex-1 overflow-y-auto">
            {loading ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
              </div>
            ) : sessions.length === 0 ? (
              <div className="py-16 text-center text-sm text-muted-foreground">
                {showArchived ? '尚無已封存的對話' : '尚無對話紀錄'}
              </div>
            ) : (
              <table className="w-full text-sm">
                <thead className="sticky top-0 border-b bg-muted/80 backdrop-blur">
                  <tr>
                    <th className="px-4 py-3 text-left font-medium text-muted-foreground">標題 / 時間</th>
                    <th className="px-4 py-3 text-left font-medium text-muted-foreground">使用者</th>
                    <th className="px-4 py-3 text-left font-medium text-muted-foreground">Provider</th>
                    <th className="px-4 py-3 text-right font-medium text-muted-foreground">訊息數</th>
                    <th className="px-4 py-3 text-right font-medium text-muted-foreground">Tokens</th>
                    <th className="px-4 py-3 text-right font-medium text-muted-foreground">費用</th>
                    <th className="px-4 py-3 text-right font-medium text-muted-foreground">操作</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {sessions.map(s => (
                    <tr
                      key={s.id}
                      className={`cursor-pointer hover:bg-muted/30 ${s.archived ? 'opacity-60' : ''}`}
                      onClick={() => setSelectedSession(s.id)}
                    >
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <span className="max-w-[200px] truncate font-medium">
                            {s.title ?? '（無標題）'}
                          </span>
                          {!!s.archived && (
                            <Badge variant="secondary" className="shrink-0 text-xs">已封存</Badge>
                          )}
                        </div>
                        <div className="text-xs text-muted-foreground">
                          {new Date(s.updated_at).toLocaleString('zh-TW')}
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <div className="font-medium">{s.user_name}</div>
                        <div className="text-xs text-muted-foreground">{s.user_email}</div>
                      </td>
                      <td className="px-4 py-3">
                        <div className="text-xs">
                          <span className="rounded-full bg-primary/10 px-1.5 py-0.5 font-medium text-primary">
                            {s.provider}
                          </span>
                        </div>
                        <div className="mt-0.5 text-xs text-muted-foreground">{s.model}</div>
                      </td>
                      <td className="px-4 py-3 text-right tabular-nums">{s.message_count}</td>
                      <td className="px-4 py-3 text-right tabular-nums">
                        {(s.total_input_tokens + s.total_output_tokens).toLocaleString()}
                      </td>
                      <td className="px-4 py-3 text-right tabular-nums text-xs">
                        ${s.total_cost_usd.toFixed(4)}
                      </td>
                      <td className="px-4 py-3">
                        <div
                          className="flex items-center justify-end gap-1"
                          onClick={e => e.stopPropagation()}
                        >
                          {/* Archive / Unarchive */}
                          <Button
                            variant="ghost"
                            size="icon"
                            title={s.archived ? '取消封存' : '封存'}
                            onClick={e => void toggleArchive(s, e)}
                            disabled={savingId === s.id}
                          >
                            {savingId === s.id
                              ? <Loader2 className="h-4 w-4 animate-spin" />
                              : s.archived
                                ? <ArchiveX className="h-4 w-4 text-amber-600" />
                                : <Archive className="h-4 w-4 text-muted-foreground" />}
                          </Button>
                          {/* Delete */}
                          <Button
                            variant="ghost"
                            size="icon"
                            title="永久刪除"
                            onClick={() => setDeleteId(s.id)}
                            disabled={savingId === s.id}
                          >
                            <Trash2 className="h-4 w-4 text-destructive" />
                          </Button>
                          <ChevronRight size={14} className="text-muted-foreground" />
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex items-center justify-center gap-2 border-t px-6 py-3">
              <button
                disabled={page <= 1}
                onClick={() => setPage(p => p - 1)}
                className="rounded px-3 py-1 text-sm hover:bg-accent disabled:opacity-40"
              >
                上一頁
              </button>
              <span className="text-sm text-muted-foreground">{page} / {totalPages}</span>
              <button
                disabled={page >= totalPages}
                onClick={() => setPage(p => p + 1)}
                className="rounded px-3 py-1 text-sm hover:bg-accent disabled:opacity-40"
              >
                下一頁
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Delete confirm */}
      <AlertDialog open={!!deleteId} onOpenChange={open => { if (!open) setDeleteId(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>永久刪除對話</AlertDialogTitle>
            <AlertDialogDescription>
              確定要永久刪除「<span className="font-medium">{deleteTarget?.title ?? '（無標題）'}</span>」？
              此操作將一併刪除所有訊息與工具紀錄，無法復原。
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>取消</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => void handleDelete()}
              disabled={deleteLoading}
            >
              {deleteLoading && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />}
              永久刪除
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
