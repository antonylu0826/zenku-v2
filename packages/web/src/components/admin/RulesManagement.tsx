import { useEffect, useState, Fragment } from 'react';
import {
  Loader2, RefreshCw, Trash2, X, ChevronDown, ChevronRight,
  ShieldCheck, ShieldOff, Info,
} from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { Button } from '../ui/button';
import { Badge } from '../ui/badge';
import { Switch } from '../ui/switch';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../ui/table';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '../ui/alert-dialog';
import { toast } from 'sonner';

// ─── Types ───────────────────────────────────────────────────────────────────

type TriggerType =
  | 'before_insert' | 'after_insert'
  | 'before_update' | 'after_update'
  | 'before_delete'
  | 'on_schedule' | 'manual';

interface RuleCondition {
  field: string;
  operator: string;
  value?: unknown;
}

type RuleAction = Record<string, unknown> & { type: string };

interface RuleRow {
  id: string;
  name: string;
  description: string | null;
  table_name: string;
  trigger_type: TriggerType;
  condition: RuleCondition | null;
  actions: RuleAction[];
  priority: number;
  enabled: boolean;
  created_at: string;
  updated_at: string;
}

interface Props {
  onClose: () => void;
}

// ─── Labels ──────────────────────────────────────────────────────────────────

const TRIGGER_LABEL: Record<TriggerType, string> = {
  before_insert: '新增前',
  after_insert:  '新增後',
  before_update: '更新前',
  after_update:  '更新後',
  before_delete: '刪除前',
  on_schedule:   '排程',
  manual:        '手動',
};

const TRIGGER_COLOR: Record<TriggerType, string> = {
  before_insert: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300',
  after_insert:  'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300',
  before_update: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300',
  after_update:  'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300',
  before_delete: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300',
  on_schedule:   'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300',
  manual:        'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300',
};

const ACTION_TYPE_LABEL: Record<string, string> = {
  set_field:              '設定欄位',
  validate:               '驗證',
  create_record:          '建立記錄',
  update_record:          '更新記錄',
  update_related_records: '更新關聯記錄',
  webhook:                'Webhook',
  notify:                 '通知',
};

const OPERATOR_LABEL: Record<string, string> = {
  eq:       '等於',
  neq:      '不等於',
  gt:       '大於',
  lt:       '小於',
  gte:      '大於等於',
  lte:      '小於等於',
  contains: '包含',
  changed:  '已變更',
  was_eq:   '原值等於',
  was_neq:  '原值不等於',
};

// ─── Helpers ─────────────────────────────────────────────────────────────────

function conditionSummary(cond: RuleCondition | null): string {
  if (!cond) return '（無條件）';
  const op = OPERATOR_LABEL[cond.operator] ?? cond.operator;
  const val = cond.value !== undefined ? String(cond.value) : '';
  return cond.operator === 'changed'
    ? `${cond.field} 已變更`
    : `${cond.field} ${op} ${val}`;
}

// ─── Detail Panel ────────────────────────────────────────────────────────────

function RuleDetail({ rule }: { rule: RuleRow }) {
  return (
    <div className="space-y-4 p-4 text-sm">
      {/* Condition */}
      <div>
        <div className="mb-1.5 font-medium text-muted-foreground uppercase tracking-wide text-xs">觸發條件</div>
        {rule.condition ? (
          <div className="rounded-md border bg-muted/30 p-3 font-mono text-xs leading-relaxed">
            <span className="text-blue-600 dark:text-blue-400">{rule.condition.field}</span>
            {' '}
            <span className="text-purple-600 dark:text-purple-400">
              {OPERATOR_LABEL[rule.condition.operator] ?? rule.condition.operator}
            </span>
            {rule.condition.value !== undefined && (
              <> <span className="text-green-600 dark:text-green-400">"{String(rule.condition.value)}"</span></>
            )}
          </div>
        ) : (
          <p className="text-muted-foreground text-xs italic">無條件（每次觸發皆執行）</p>
        )}
      </div>

      {/* Actions */}
      <div>
        <div className="mb-1.5 font-medium text-muted-foreground uppercase tracking-wide text-xs">
          動作清單（{rule.actions.length} 個）
        </div>
        <div className="space-y-2">
          {rule.actions.map((action, i) => (
            <div key={i} className="flex gap-3 rounded-md border bg-muted/30 p-3">
              <div className="shrink-0">
                <Badge variant="secondary" className="text-xs font-mono">
                  {i + 1}
                </Badge>
              </div>
              <div className="min-w-0 space-y-1">
                <div className="font-medium text-xs">
                  {ACTION_TYPE_LABEL[action.type] ?? action.type}
                </div>
                <pre className="text-xs text-muted-foreground whitespace-pre-wrap break-all font-mono">
                  {JSON.stringify(action, null, 2)}
                </pre>
              </div>
            </div>
          ))}
          {rule.actions.length === 0 && (
            <p className="text-muted-foreground text-xs italic">無動作</p>
          )}
        </div>
      </div>

      {/* Metadata */}
      <div className="flex gap-6 text-xs text-muted-foreground border-t pt-3">
        <span>ID: <span className="font-mono">{rule.id}</span></span>
        <span>建立: {new Date(rule.created_at).toLocaleString('zh-TW')}</span>
        <span>更新: {new Date(rule.updated_at).toLocaleString('zh-TW')}</span>
      </div>
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

export function RulesManagement({ onClose }: Props) {
  const { token } = useAuth();
  const [rules, setRules] = useState<RuleRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [toggling, setToggling] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [deleteRuleId, setDeleteRuleId] = useState<string | null>(null);
  const [deleteLoading, setDeleteLoading] = useState(false);

  const headers = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };

  const fetchRules = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/admin/rules', { headers });
      if (res.ok) setRules(await res.json() as RuleRow[]);
      else toast.error('載入規則失敗');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { void fetchRules(); }, []);

  const handleToggle = async (rule: RuleRow) => {
    setToggling(rule.id);
    try {
      const res = await fetch(`/api/admin/rules/${rule.id}/toggle`, { method: 'PATCH', headers });
      if (!res.ok) { toast.error('切換失敗'); return; }
      const data = await res.json() as { enabled: boolean };
      toast.success(data.enabled ? `已啟用「${rule.name}」` : `已停用「${rule.name}」`);
      setRules(prev => prev.map(r => r.id === rule.id ? { ...r, enabled: data.enabled } : r));
    } finally {
      setToggling(null);
    }
  };

  const handleDelete = async () => {
    if (!deleteRuleId) return;
    setDeleteLoading(true);
    try {
      const res = await fetch(`/api/admin/rules/${deleteRuleId}`, { method: 'DELETE', headers });
      const json = await res.json() as { success?: boolean; error?: string };
      if (!res.ok) { toast.error(json.error ?? '刪除失敗'); return; }
      toast.success('規則已刪除');
      setDeleteRuleId(null);
      setRules(prev => prev.filter(r => r.id !== deleteRuleId));
    } finally {
      setDeleteLoading(false);
    }
  };

  const deleteRule = rules.find(r => r.id === deleteRuleId);
  const enabledCount = rules.filter(r => r.enabled).length;

  // Group rules by table
  const tables = Array.from(new Set(rules.map(r => r.table_name)));

  return (
    <>
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
        <div
          className="flex w-full max-w-5xl flex-col overflow-hidden rounded-xl border bg-background shadow-xl"
          style={{ maxHeight: '88vh' }}
        >
          {/* Header */}
          <div className="flex shrink-0 items-center justify-between border-b px-6 py-4">
            <div>
              <h2 className="text-base font-semibold">業務規則管理</h2>
              <p className="text-xs text-muted-foreground mt-0.5">
                共 {rules.length} 條規則，{enabledCount} 條啟用中
              </p>
            </div>
            <div className="flex items-center gap-2">
              <Button variant="ghost" size="icon" onClick={() => void fetchRules()} title="重新整理" disabled={loading}>
                <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
              </Button>
              <Button variant="ghost" size="icon" onClick={onClose}>
                <X className="h-4 w-4" />
              </Button>
            </div>
          </div>

          {/* Body */}
          <div className="flex-1 overflow-y-auto">
            {loading ? (
              <div className="flex items-center justify-center py-20">
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
              </div>
            ) : rules.length === 0 ? (
              <div className="flex flex-col items-center justify-center gap-3 py-20 text-muted-foreground">
                <Info className="h-8 w-8 opacity-40" />
                <p className="text-sm">尚未設定任何業務規則</p>
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-8" />
                    <TableHead>規則名稱</TableHead>
                    <TableHead>目標表格</TableHead>
                    <TableHead>觸發時機</TableHead>
                    <TableHead>條件</TableHead>
                    <TableHead>動作</TableHead>
                    <TableHead className="w-16 text-center">優先度</TableHead>
                    <TableHead className="w-20 text-center">啟用</TableHead>
                    <TableHead className="w-12" />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rules.map(rule => (
                    <Fragment key={rule.id}>
                      <TableRow
                        key={rule.id}
                        className={`cursor-pointer ${!rule.enabled ? 'opacity-50' : ''}`}
                        onClick={() => setExpandedId(expandedId === rule.id ? null : rule.id)}
                      >
                        {/* Expand */}
                        <TableCell className="py-2 pr-0">
                          {expandedId === rule.id
                            ? <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
                            : <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />}
                        </TableCell>

                        {/* Name */}
                        <TableCell className="py-2">
                          <div className="font-medium text-sm">{rule.name}</div>
                          {rule.description && (
                            <div className="text-xs text-muted-foreground mt-0.5">{rule.description}</div>
                          )}
                        </TableCell>

                        {/* Table */}
                        <TableCell className="py-2">
                          <span className="font-mono text-xs bg-muted px-1.5 py-0.5 rounded">{rule.table_name}</span>
                        </TableCell>

                        {/* Trigger */}
                        <TableCell className="py-2">
                          <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${TRIGGER_COLOR[rule.trigger_type]}`}>
                            {TRIGGER_LABEL[rule.trigger_type]}
                          </span>
                        </TableCell>

                        {/* Condition summary */}
                        <TableCell className="py-2 text-xs text-muted-foreground max-w-[180px] truncate">
                          {conditionSummary(rule.condition)}
                        </TableCell>

                        {/* Actions summary */}
                        <TableCell className="py-2" onClick={e => e.stopPropagation()}>
                          <div className="flex flex-wrap gap-1">
                            {Array.from(new Set(rule.actions.map(a => a.type))).map(type => (
                              <span
                                key={type}
                                className="inline-flex items-center rounded px-1.5 py-0.5 text-xs bg-muted text-muted-foreground"
                              >
                                {ACTION_TYPE_LABEL[type] ?? type}
                              </span>
                            ))}
                            {rule.actions.length === 0 && (
                              <span className="text-xs text-muted-foreground italic">無</span>
                            )}
                          </div>
                        </TableCell>

                        {/* Priority */}
                        <TableCell className="py-2 text-center text-sm">
                          {rule.priority}
                        </TableCell>

                        {/* Toggle */}
                        <TableCell className="py-2 text-center" onClick={e => e.stopPropagation()}>
                          <div className="flex items-center justify-center gap-1.5">
                            {rule.enabled
                              ? <ShieldCheck className="h-3.5 w-3.5 text-green-600 shrink-0" />
                              : <ShieldOff className="h-3.5 w-3.5 text-muted-foreground shrink-0" />}
                            <Switch
                              checked={rule.enabled}
                              disabled={toggling === rule.id}
                              onCheckedChange={() => void handleToggle(rule)}
                            />
                          </div>
                        </TableCell>

                        {/* Delete */}
                        <TableCell className="py-2" onClick={e => e.stopPropagation()}>
                          <Button
                            variant="ghost"
                            size="icon"
                            title="刪除規則"
                            onClick={() => setDeleteRuleId(rule.id)}
                          >
                            <Trash2 className="h-4 w-4 text-destructive" />
                          </Button>
                        </TableCell>
                      </TableRow>

                      {/* Expanded detail row */}
                      {expandedId === rule.id && (
                        <TableRow key={`${rule.id}-detail`} className="bg-muted/20 hover:bg-muted/20">
                          <TableCell colSpan={9} className="p-0">
                            <RuleDetail rule={rule} />
                          </TableCell>
                        </TableRow>
                      )}
                    </Fragment>
                  ))}
                </TableBody>
              </Table>
            )}
          </div>

          {/* Footer: table summary */}
          {!loading && rules.length > 0 && (
            <div className="shrink-0 border-t px-6 py-3 text-xs text-muted-foreground flex gap-4 flex-wrap">
              <span>涵蓋表格：</span>
              {tables.map(t => {
                const count = rules.filter(r => r.table_name === t).length;
                const active = rules.filter(r => r.table_name === t && r.enabled).length;
                return (
                  <span key={t} className="font-mono">
                    {t} <span className="text-foreground font-medium">{active}/{count}</span>
                  </span>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* Delete confirm */}
      <AlertDialog open={!!deleteRuleId} onOpenChange={open => { if (!open) setDeleteRuleId(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>確認刪除規則</AlertDialogTitle>
            <AlertDialogDescription>
              確定要刪除規則「<span className="font-medium">{deleteRule?.name}</span>」？
              刪除後此規則將立即停止執行，且無法復原。
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
              刪除
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
