import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Loader2, RefreshCw, ChevronDown, ChevronRight,
  Eye, EyeOff, Lock, Unlock, AlertCircle, Palette, Type,
  Trash2, Table2, FileText, Zap, Info, Plus, Pencil,
} from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { Button } from '../ui/button';
import { Badge } from '../ui/badge';
import { Switch } from '../ui/switch';
import { Input } from '../ui/input';
import { Textarea } from '../ui/textarea';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../ui/tabs';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '../ui/dialog';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '../ui/alert-dialog';
import { toast } from 'sonner';
import type { ViewDefinition, FieldDef, ColumnDef, CustomViewAction, ActionBehavior, BuiltinAction } from '../../types';
import type { AppearanceRule, AppearanceEffect, AppearanceCondition } from '../../types';

// ─── Types ───────────────────────────────────────────────────────────────────

interface AdminView {
  id: string;
  name: string;
  table_name: string;
  definition: ViewDefinition;
  created_at: string;
  updated_at: string;
}

// ─── Constants ───────────────────────────────────────────────────────────────

const VIEW_TYPE_COLOR: Record<string, string> = {
  'table': 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300',
  'master-detail': 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300',
  'dashboard': 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300',
  'kanban': 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300',
  'calendar': 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300',
};
const FIELD_TYPE_COLOR: Record<string, string> = {
  text: 'bg-gray-100 text-gray-600', number: 'bg-blue-50 text-blue-600',
  currency: 'bg-green-50 text-green-600', date: 'bg-orange-50 text-orange-600',
  boolean: 'bg-purple-50 text-purple-600', select: 'bg-yellow-50 text-yellow-600',
  relation: 'bg-indigo-50 text-indigo-600', email: 'bg-pink-50 text-pink-600',
  url: 'bg-cyan-50 text-cyan-600', textarea: 'bg-gray-50 text-gray-500',
};

// ─── Helpers ─────────────────────────────────────────────────────────────────

function countAppearanceRules(view: ViewDefinition): number {
  const formRules = (view.form?.fields ?? []).reduce((n, f) => n + (f.appearance?.length ?? 0), 0);
  const colRules  = (view.columns ?? []).reduce((n, c) => n + (c.appearance?.length ?? 0), 0);
  const detailRules = (view.detail_views ?? []).reduce((n, dv) => {
    const dvForm = (dv.view.form?.fields ?? []).reduce((m, f) => m + (f.appearance?.length ?? 0), 0);
    const dvCol  = (dv.view.columns ?? []).reduce((m, c) => m + (c.appearance?.length ?? 0), 0);
    return n + dvForm + dvCol;
  }, 0);
  return formRules + colRules + detailRules;
}

function conditionText(when: Record<string, unknown>, t: any): string {
  if ('logic' in when) {
    const sub = (when.conditions as Array<Record<string, unknown>> ?? []).map(c => conditionText(c, t));
    return `(${sub.join(` ${String(when.logic).toUpperCase()} `)})`;
  }
  const opMap: Record<string, string> = {
    eq: '=', neq: '≠', gt: '>', lt: '<', gte: '≥', lte: '≤', contains: t('admin.views.op_contains'),
  };
  const op  = opMap[String(when.operator)] ?? String(when.operator);
  const val = when.value !== undefined ? ` "${String(when.value)}"` : '';
  return `${when.field} ${op}${val}`;
}

function effectItems(apply: AppearanceEffect, t: any): Array<{ icon: React.ReactNode; label: string }> {
  const items: Array<{ icon: React.ReactNode; label: string }> = [];
  if (apply.visibility === 'hidden')  items.push({ icon: <EyeOff className="h-3 w-3" />, label: t('admin.views.effect_hidden') });
  if (apply.visibility === 'visible') items.push({ icon: <Eye className="h-3 w-3" />, label: t('admin.views.effect_visible') });
  if (apply.enabled === false)        items.push({ icon: <Lock className="h-3 w-3" />, label: t('admin.views.effect_readonly') });
  if (apply.enabled === true)         items.push({ icon: <Unlock className="h-3 w-3" />, label: t('admin.views.effect_enabled') });
  if (apply.required)                 items.push({ icon: <AlertCircle className="h-3 w-3" />, label: t('admin.views.effect_required') });
  if (apply.text_color || apply.font_weight) items.push({ icon: <Type className="h-3 w-3" />, label: t('admin.views.effect_text') });
  if (apply.bg_color)                 items.push({ icon: <Palette className="h-3 w-3" />, label: t('admin.views.effect_background') });
  return items;
}

// ─── Inline label editor ─────────────────────────────────────────────────────

function LabelEditor({
  initialValue, onSave,
}: { initialValue: string; onSave: (val: string) => Promise<void> }) {
  const { t } = useTranslation();
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(initialValue);
  const [saving, setSaving] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const save = async () => {
    if (value.trim() === initialValue || !value.trim()) { setEditing(false); setValue(initialValue); return; }
    setSaving(true);
    await onSave(value.trim());
    setSaving(false);
    setEditing(false);
  };

  if (editing) {
    return (
      <Input
        ref={inputRef}
        value={value}
        className="h-6 px-1.5 py-0 text-sm w-36"
        onChange={e => setValue(e.target.value)}
        onBlur={() => void save()}
        onKeyDown={e => {
          if (e.key === 'Enter') { e.preventDefault(); void save(); }
          if (e.key === 'Escape') { setEditing(false); setValue(initialValue); }
        }}
        disabled={saving}
        autoFocus
      />
    );
  }
  return (
    <button
      className="text-sm font-medium hover:text-primary hover:underline text-left truncate max-w-[9rem]"
      title={t('admin.views.click_to_edit')}
      onClick={() => { setEditing(true); setValue(initialValue); }}
    >
      {initialValue}
    </button>
  );
}

// ─── Appearance rule list ─────────────────────────────────────────────────────

function AppearanceRuleList({
  rules, onToggle, onDelete,
}: {
  rules: AppearanceRule[];
  onToggle: (ruleIndex: number, nextEnabled: boolean) => void;
  onDelete: (ruleIndex: number) => void;
}) {
  const { t } = useTranslation();
  const [deletingIndex, setDeletingIndex] = useState<number | null>(null);

  if (rules.length === 0) {
    return <p className="px-4 py-2 text-xs text-muted-foreground italic">{t('admin.views.no_rule')}</p>;
  }
  return (
    <div className="divide-y divide-border/40">
      {rules.map((rule, i) => {
        const isEnabled = rule.enabled !== false;
        const items = effectItems(rule.apply, t);
        return (
          <div key={i} className={`flex items-start gap-3 px-4 py-2.5 ${!isEnabled ? 'opacity-50' : ''}`}>
            {/* Index */}
            <span className="shrink-0 mt-0.5 text-xs font-mono text-muted-foreground w-4">{i + 1}</span>

            {/* Condition */}
            <div className="flex-1 min-w-0">
              <div className="text-xs text-muted-foreground mb-1">{t('admin.views.label_when')}</div>
              <code className="text-xs bg-muted/70 px-1.5 py-0.5 rounded break-all">
                {conditionText(rule.when as Record<string, unknown>, t)}
              </code>
            </div>

            {/* Effects */}
            <div className="w-36 shrink-0">
              <div className="text-xs text-muted-foreground mb-1">{t('admin.views.label_effect')}</div>
              <div className="flex flex-wrap gap-1">
                {items.map((item, j) => (
                  <span key={j} className="inline-flex items-center gap-1 rounded bg-muted px-1.5 py-0.5 text-xs">
                    {item.icon}{item.label}
                  </span>
                ))}
                {rule.apply.text_color && (
                  <span className="inline-flex items-center gap-1 rounded border px-1.5 py-0.5 text-xs"
                    style={{ color: rule.apply.text_color }}>
                    <span className="h-2 w-2 rounded-full border" style={{ backgroundColor: rule.apply.text_color }} />
                    {t('admin.views.effect_text')}
                  </span>
                )}
                {rule.apply.bg_color && (
                  <span className="inline-flex items-center gap-1 rounded border px-1.5 py-0.5 text-xs">
                    <span className="h-2 w-2 rounded-full border" style={{ backgroundColor: rule.apply.bg_color }} />
                    {t('admin.views.effect_background')}
                  </span>
                )}
              </div>
            </div>

            {/* Controls */}
            <div className="flex items-center gap-1.5 shrink-0 mt-0.5">
              <Switch
                checked={isEnabled}
                onCheckedChange={checked => onToggle(i, checked)}
              />
              <Button variant="ghost" size="icon" className="h-6 w-6"
                onClick={() => setDeletingIndex(i)}>
                <Trash2 className="h-3.5 w-3.5 text-destructive" />
              </Button>
            </div>
          </div>
        );
      })}

      <AlertDialog open={deletingIndex !== null} onOpenChange={open => { if (!open) setDeletingIndex(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('admin.views.dialog_delete_title')}</AlertDialogTitle>
            <AlertDialogDescription>{t('admin.views.dialog_delete_desc_rule')}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t('common.cancel')}</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => { if (deletingIndex !== null) { onDelete(deletingIndex); setDeletingIndex(null); } }}
            >{t('common.delete')}</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

// ─── Form Field row ───────────────────────────────────────────────────────────

function FieldRow({
  field, onSaveLabel, onToggle, onAppearanceToggle, onAppearanceDelete,
}: {
  field: FieldDef;
  onSaveLabel: (key: string, label: string) => Promise<void>;
  onToggle: (key: string, prop: 'required' | 'hidden_in_form', val: boolean) => Promise<void>;
  onAppearanceToggle: (fieldKey: string, ruleIndex: number, nextEnabled: boolean) => void;
  onAppearanceDelete: (fieldKey: string, ruleIndex: number) => void;
}) {
  const { t } = useTranslation();
  const [expanded, setExpanded] = useState(false);
  const ruleCount = field.appearance?.length ?? 0;

  return (
    <div className="border-b border-border/50 last:border-0">
      {/* Main row */}
      <div className="flex items-center gap-3 px-4 py-2.5 hover:bg-muted/20">
        {/* Expand toggle */}
        <button
          className="shrink-0 text-muted-foreground hover:text-foreground"
          onClick={() => setExpanded(e => !e)}
        >
          {expanded
            ? <ChevronDown className="h-3.5 w-3.5" />
            : <ChevronRight className="h-3.5 w-3.5" />}
        </button>

        {/* Key */}
        <span className="w-32 shrink-0 font-mono text-xs text-muted-foreground truncate" title={field.key}>
          {field.key}
        </span>

        {/* Label (editable) */}
        <div className="w-36 shrink-0">
          <LabelEditor
            initialValue={field.label}
            onSave={val => onSaveLabel(field.key, val)}
          />
        </div>

        {/* Type */}
        <span className={`shrink-0 rounded px-1.5 py-0.5 text-xs font-medium ${FIELD_TYPE_COLOR[field.type] ?? 'bg-gray-100 text-gray-600'}`}>
          {field.type}
        </span>

        {/* Spacer */}
        <div className="flex-1" />

        {/* Required */}
        <div className="flex items-center gap-1.5 shrink-0">
          <span className="text-xs text-muted-foreground min-w-[3.5rem] text-right">{t('admin.views.label_required')}</span>
          <Switch
            checked={!!field.required}
            disabled={!!field.computed}
            onCheckedChange={v => void onToggle(field.key, 'required', v)}
          />
        </div>

        {/* Hidden in form */}
        <div className="flex items-center gap-1.5 shrink-0 ml-3">
          <span className="text-xs text-muted-foreground min-w-[2.5rem] text-right">{t('admin.views.label_hidden')}</span>
          <Switch
            checked={!!field.hidden_in_form}
            onCheckedChange={v => void onToggle(field.key, 'hidden_in_form', v)}
          />
        </div>

        {/* Appearance rules badge */}
        <button
          className="ml-3 shrink-0"
          onClick={() => setExpanded(e => !e)}
          title={t('admin.views.label_rule')}
        >
          <Badge
            variant={ruleCount > 0 ? 'default' : 'outline'}
            className="text-xs"
          >
            {t('admin.views.rule_count', { count: ruleCount })}
          </Badge>
        </button>
      </div>

      {/* Appearance rules (expanded) */}
      {expanded && (
        <div className="bg-muted/10 ml-8 border-l-2 border-border/30">
          <AppearanceRuleList
            rules={field.appearance ?? []}
            onToggle={(idx, next) => onAppearanceToggle(field.key, idx, next)}
            onDelete={idx => onAppearanceDelete(field.key, idx)}
          />
        </div>
      )}
    </div>
  );
}

// ─── Column row ───────────────────────────────────────────────────────────────

function ColumnRow({
  col, onSaveLabel, onToggle, onAppearanceToggle, onAppearanceDelete,
}: {
  col: ColumnDef;
  onSaveLabel: (key: string, label: string) => Promise<void>;
  onToggle: (key: string, prop: 'hidden_in_table', val: boolean) => Promise<void>;
  onAppearanceToggle: (fieldKey: string, ruleIndex: number, nextEnabled: boolean) => void;
  onAppearanceDelete: (fieldKey: string, ruleIndex: number) => void;
}) {
  const { t } = useTranslation();
  const [expanded, setExpanded] = useState(false);
  const ruleCount = col.appearance?.length ?? 0;

  return (
    <div className="border-b border-border/50 last:border-0">
      <div className="flex items-center gap-3 px-4 py-2.5 hover:bg-muted/20">
        <button className="shrink-0 text-muted-foreground" onClick={() => setExpanded(e => !e)}>
          {expanded ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
        </button>

        <span className="w-32 shrink-0 font-mono text-xs text-muted-foreground truncate">{col.key}</span>

        <div className="w-36 shrink-0">
          <LabelEditor initialValue={col.label} onSave={val => onSaveLabel(col.key, val)} />
        </div>

        <span className={`shrink-0 rounded px-1.5 py-0.5 text-xs font-medium ${FIELD_TYPE_COLOR[col.type] ?? 'bg-gray-100 text-gray-600'}`}>
          {col.type}
        </span>

        <div className="flex-1" />

        {col.sortable !== false && (
          <span className="text-xs text-muted-foreground shrink-0">{t('admin.views.sortable')}</span>
        )}

        <div className="flex items-center gap-1.5 shrink-0 ml-3">
          <span className="text-xs text-muted-foreground min-w-[2.5rem] text-right">{t('admin.views.label_hidden')}</span>
          <Switch
            checked={!!col.hidden_in_table}
            onCheckedChange={v => void onToggle(col.key, 'hidden_in_table', v)}
          />
        </div>

        <button className="ml-3 shrink-0" onClick={() => setExpanded(e => !e)}>
          <Badge variant={ruleCount > 0 ? 'default' : 'outline'} className="text-xs">
            {t('admin.views.rule_count', { count: ruleCount })}
          </Badge>
        </button>
      </div>

      {expanded && (
        <div className="bg-muted/10 ml-8 border-l-2 border-border/30">
          <AppearanceRuleList
            rules={col.appearance ?? []}
            onToggle={(idx, next) => onAppearanceToggle(col.key, idx, next)}
            onDelete={idx => onAppearanceDelete(col.key, idx)}
          />
        </div>
      )}
    </div>
  );
}

// ─── Action constants ─────────────────────────────────────────────────────────

const BUILTIN_ACTIONS: BuiltinAction[] = ['create', 'edit', 'delete', 'export'];

// ─── Blank custom action template ─────────────────────────────────────────────

function blankAction(): CustomViewAction {
  return {
    id: '',
    label: '',
    variant: 'outline',
    context: 'record',
    behavior: { type: 'set_field', field: '', value: '' },
  };
}

// ─── Simple condition editor (leaf only) ──────────────────────────────────────

function LeafConditionEditor({
  label, value, onChange,
}: {
  label: string;
  value: AppearanceCondition | undefined;
  onChange: (v: AppearanceCondition | undefined) => void;
}) {
  const { t } = useTranslation();
  const leaf = (value && !('logic' in value)) ? value : { field: '', operator: 'eq' as const, value: '' };
  const enabled = Boolean(value);

  const OPERATOR_OPTIONS = [
    { value: 'eq',       label: t('admin.views.op_eq') },
    { value: 'neq',      label: t('admin.views.op_neq') },
    { value: 'gt',       label: t('admin.views.op_gt') },
    { value: 'lt',       label: t('admin.views.op_lt') },
    { value: 'gte',      label: t('admin.views.op_gte') },
    { value: 'lte',      label: t('admin.views.op_lte') },
    { value: 'contains', label: t('admin.views.op_contains') },
  ];

  return (
    <div className="space-y-1.5">
      <div className="flex items-center gap-2">
        <Switch checked={enabled} onCheckedChange={on => onChange(on ? leaf : undefined)} />
        <span className="text-xs font-medium">{label}</span>
      </div>
      {enabled && (
        <div className="ml-6 flex flex-wrap gap-2">
          <Input
            className="h-7 text-xs w-32"
            placeholder={t('admin.views.placeholder_field')}
            value={('field' in leaf) ? String(leaf.field) : ''}
            onChange={e => onChange({ ...leaf, field: e.target.value })}
          />
          <select
            className="h-7 rounded-md border bg-background px-2 text-xs"
            value={('operator' in leaf) ? String(leaf.operator) : 'eq'}
            onChange={e => onChange({ ...leaf, operator: e.target.value as AppearanceCondition extends { operator: infer O } ? O : never })}
          >
            {OPERATOR_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
          <Input
            className="h-7 text-xs w-28"
            placeholder={t('admin.views.placeholder_value')}
            value={('value' in leaf) ? String(leaf.value ?? '') : ''}
            onChange={e => onChange({ ...leaf, value: e.target.value })}
          />
        </div>
      )}
    </div>
  );
}

// ─── Action form dialog ───────────────────────────────────────────────────────

function ActionFormDialog({
  open, initial, onClose, onSave,
}: {
  open: boolean;
  initial: CustomViewAction | null;
  onClose: () => void;
  onSave: (action: CustomViewAction) => Promise<void>;
}) {
  const { t } = useTranslation();
  const [form, setForm] = useState<CustomViewAction>(initial ?? blankAction());
  const [saving, setSaving] = useState(false);

  useEffect(() => { setForm(initial ?? blankAction()); }, [initial, open]);

  const set = (patch: Partial<CustomViewAction>) => setForm(f => ({ ...f, ...patch }));
  const setBehavior = (patch: Partial<ActionBehavior>) =>
    setForm(f => ({ ...f, behavior: { ...f.behavior, ...patch } as ActionBehavior }));

  const behaviorType = form.behavior.type;

  const handleSave = async () => {
    if (!form.id.trim()) { toast.error(t('admin.views.toast_error_id')); return; }
    if (!form.label.trim()) { toast.error(t('admin.views.toast_error_label')); return; }
    setSaving(true);
    try { await onSave({ ...form, id: form.id.trim(), label: form.label.trim() }); }
    finally { setSaving(false); }
  };

  const BEHAVIOR_TYPES = [
    { value: 'set_field',     label: t('admin.views.behavior_set_field') },
    { value: 'trigger_rule',  label: t('admin.views.behavior_trigger_rule') },
    { value: 'webhook',       label: t('admin.views.behavior_webhook') },
    { value: 'navigate',      label: t('admin.views.behavior_navigate') },
    { value: 'create_related',label: t('admin.views.behavior_create_related') },
  ] as const;
  const VARIANT_OPTIONS = [
    { value: 'default',     label: t('admin.views.variant_default') },
    { value: 'outline',     label: t('admin.views.variant_outline') },
    { value: 'secondary',   label: t('admin.views.variant_secondary') },
    { value: 'destructive', label: t('admin.views.variant_destructive') },
    { value: 'warning',     label: t('admin.views.variant_warning') },
  ];
  const CONTEXT_OPTIONS = [
    { value: 'record', label: t('admin.views.context_record') },
    { value: 'list',   label: t('admin.views.context_list') },
    { value: 'both',   label: t('admin.views.context_both') },
  ];

  return (
    <Dialog open={open} onOpenChange={o => { if (!o) onClose(); }}>
      <DialogContent className="max-w-xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{initial ? t('admin.views.title_edit_action') : t('admin.views.title_add_action')}</DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-1">
          {/* Basic info */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <label className="text-xs font-medium">{t('admin.views.label_action_id')} <span className="text-destructive">*</span></label>
              <Input
                className="h-8 text-sm font-mono"
                placeholder="approve_order"
                value={form.id}
                onChange={e => set({ id: e.target.value.replace(/\s/g, '_') })}
                disabled={Boolean(initial)}
              />
              <p className="text-xs text-muted-foreground">{t('admin.views.desc_action_id')}</p>
            </div>
            <div className="space-y-1">
              <label className="text-xs font-medium">{t('admin.views.label_action_label')} <span className="text-destructive">*</span></label>
              <Input className="h-8 text-sm" placeholder={t('admin.views.placeholder_btn_name')} value={form.label} onChange={e => set({ label: e.target.value })} />
            </div>
          </div>

          <div className="grid grid-cols-3 gap-3">
            <div className="space-y-1">
              <label className="text-xs font-medium">{t('admin.views.label_variant')}</label>
              <select className="w-full h-8 rounded-md border bg-background px-2 text-sm"
                value={form.variant ?? 'outline'} onChange={e => set({ variant: e.target.value as CustomViewAction['variant'] })}>
                {VARIANT_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
            </div>
            <div className="space-y-1">
              <label className="text-xs font-medium">{t('admin.views.label_context')}</label>
              <select className="w-full h-8 rounded-md border bg-background px-2 text-sm"
                value={form.context ?? 'record'} onChange={e => set({ context: e.target.value as CustomViewAction['context'] })}>
                {CONTEXT_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
            </div>
            <div className="space-y-1">
              <label className="text-xs font-medium">{t('admin.views.label_icon')}</label>
              <Input className="h-8 text-sm" placeholder="check-circle" value={form.icon ?? ''} onChange={e => set({ icon: e.target.value || undefined })} />
            </div>
          </div>

          {/* Behavior */}
          <div className="rounded-md border p-3 space-y-3">
            <div className="flex items-center gap-3">
              <label className="text-xs font-medium w-16 shrink-0">{t('admin.views.label_behavior')}</label>
              <select className="flex-1 h-8 rounded-md border bg-background px-2 text-sm"
                value={behaviorType}
                onChange={e => set({ behavior: { type: e.target.value as ActionBehavior['type'] } as ActionBehavior })}>
                {BEHAVIOR_TYPES.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
            </div>

            {behaviorType === 'set_field' && (
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="text-xs text-muted-foreground">{t('admin.views.placeholder_field')}</label>
                  <Input className="h-7 text-xs" placeholder="status"
                    value={(form.behavior as { field?: string }).field ?? ''}
                    onChange={e => setBehavior({ field: e.target.value } as Partial<ActionBehavior>)} />
                </div>
                <div className="space-y-1">
                  <label className="text-xs text-muted-foreground">{t('admin.views.placeholder_value')}</label>
                  <Input className="h-7 text-xs" placeholder="approved"
                    value={(form.behavior as { value?: string }).value ?? ''}
                    onChange={e => setBehavior({ value: e.target.value } as Partial<ActionBehavior>)} />
                </div>
              </div>
            )}

            {behaviorType === 'trigger_rule' && (
              <div className="space-y-1">
                <label className="text-xs text-muted-foreground">{t('admin.views.label_trigger_rule_id')}</label>
                <Input className="h-7 text-xs font-mono" placeholder="rule_id"
                  value={(form.behavior as { rule_id?: string }).rule_id ?? ''}
                  onChange={e => setBehavior({ rule_id: e.target.value } as Partial<ActionBehavior>)} />
              </div>
            )}

            {behaviorType === 'webhook' && (
              <div className="space-y-2">
                <div className="grid grid-cols-3 gap-2">
                  <div className="col-span-2 space-y-1">
                    <label className="text-xs text-muted-foreground">URL</label>
                    <Input className="h-7 text-xs" placeholder="https://..."
                      value={(form.behavior as { url?: string }).url ?? ''}
                      onChange={e => setBehavior({ url: e.target.value } as Partial<ActionBehavior>)} />
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs text-muted-foreground">Method</label>
                    <select className="w-full h-7 rounded-md border bg-background px-2 text-xs"
                      value={(form.behavior as { method?: string }).method ?? 'POST'}
                      onChange={e => setBehavior({ method: e.target.value as 'GET' | 'POST' } as Partial<ActionBehavior>)}>
                      <option value="POST">POST</option>
                      <option value="GET">GET</option>
                    </select>
                  </div>
                </div>
                <div className="space-y-1">
                  <label className="text-xs text-muted-foreground">{t('admin.views.label_payload_template')}</label>
                  <Textarea className="text-xs font-mono min-h-[60px] resize-none"
                    placeholder={'{"id":"{{id}}","status":"{{status}}"}'}
                    value={(form.behavior as { payload?: string }).payload ?? ''}
                    onChange={e => setBehavior({ payload: e.target.value || undefined } as Partial<ActionBehavior>)} />
                </div>
              </div>
            )}

            {behaviorType === 'navigate' && (
              <div className="grid grid-cols-3 gap-2">
                <div className="space-y-1">
                  <label className="text-xs text-muted-foreground">{t('admin.views.label_target_view')}</label>
                  <Input className="h-7 text-xs" placeholder="orders"
                    value={(form.behavior as { view_id?: string }).view_id ?? ''}
                    onChange={e => setBehavior({ view_id: e.target.value } as Partial<ActionBehavior>)} />
                </div>
                <div className="space-y-1">
                  <label className="text-xs text-muted-foreground">{t('admin.views.label_filter_field')}</label>
                  <Input className="h-7 text-xs" placeholder="customer_id"
                    value={(form.behavior as { filter_field?: string }).filter_field ?? ''}
                    onChange={e => setBehavior({ filter_field: e.target.value || undefined } as Partial<ActionBehavior>)} />
                </div>
                <div className="space-y-1">
                  <label className="text-xs text-muted-foreground">{t('admin.views.label_source_field')}</label>
                  <Input className="h-7 text-xs" placeholder="id"
                    value={(form.behavior as { filter_value_from?: string }).filter_value_from ?? ''}
                    onChange={e => setBehavior({ filter_value_from: e.target.value || undefined } as Partial<ActionBehavior>)} />
                </div>
              </div>
            )}

            {behaviorType === 'create_related' && (
              <div className="space-y-2">
                <div className="space-y-1">
                  <label className="text-xs text-muted-foreground">{t('admin.views.label_target_table')}</label>
                  <Input className="h-7 text-xs" placeholder="shipments"
                    value={(form.behavior as { table?: string }).table ?? ''}
                    onChange={e => setBehavior({ table: e.target.value } as Partial<ActionBehavior>)} />
                </div>
                <div className="space-y-1">
                  <label className="text-xs text-muted-foreground">{t('admin.views.label_mapping')}</label>
                  <Textarea className="text-xs font-mono min-h-[60px] resize-none"
                    placeholder={'{"order_id":"id","status":"pending"}'}
                    value={JSON.stringify((form.behavior as { field_mapping?: Record<string, string> }).field_mapping ?? {}, null, 2)}
                    onChange={e => {
                      try {
                        const parsed = JSON.parse(e.target.value) as Record<string, string>;
                        setBehavior({ field_mapping: parsed } as Partial<ActionBehavior>);
                      } catch { /* ignore parse error while typing */ }
                    }} />
                </div>
              </div>
            )}
          </div>

          {/* Conditions */}
          <div className="space-y-2">
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">{t('admin.views.label_visibility_and_enabled')}</p>
            <LeafConditionEditor
              label={t('admin.views.label_visible_when')}
              value={form.visible_when}
              onChange={v => set({ visible_when: v })}
            />
            <LeafConditionEditor
              label={t('admin.views.label_enabled_when')}
              value={form.enabled_when}
              onChange={v => set({ enabled_when: v })}
            />
          </div>

          {/* Confirm dialog */}
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <Switch
                checked={Boolean(form.confirm)}
                onCheckedChange={on => set({ confirm: on ? { title: '', description: '' } : undefined })}
              />
              <span className="text-xs font-medium">{t('admin.views.label_show_confirm')}</span>
            </div>
            {form.confirm && (
              <div className="ml-6 grid grid-cols-2 gap-2">
                <div className="space-y-1">
                  <label className="text-xs text-muted-foreground">{t('admin.views.col_view_name')}</label>
                  <Input className="h-7 text-xs" placeholder={t('admin.views.placeholder_confirm_title')}
                    value={form.confirm.title}
                    onChange={e => set({ confirm: { ...form.confirm!, title: e.target.value } })} />
                </div>
                <div className="space-y-1">
                  <label className="text-xs text-muted-foreground">{t('common.description')}</label>
                  <Input className="h-7 text-xs" placeholder={t('admin.views.placeholder_confirm_desc')}
                    value={form.confirm.description}
                    onChange={e => set({ confirm: { ...form.confirm!, description: e.target.value } })} />
                </div>
              </div>
            )}
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>{t('common.cancel')}</Button>
          <Button onClick={() => void handleSave()} disabled={saving}>
            {saving ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : null}
            {t('common.save')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Actions panel ────────────────────────────────────────────────────────────

function ActionsPanel({
  view, headers, onUpdate,
}: {
  view: AdminView;
  headers: Record<string, string>;
  onUpdate: (updated: AdminView) => void;
}) {
  const { t } = useTranslation();
  const [editingAction, setEditingAction] = useState<CustomViewAction | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [deletingActionId, setDeletingActionId] = useState<string | null>(null);

  const builtins = (view.definition.actions ?? []).filter((a): a is BuiltinAction => typeof a === 'string');
  const customs  = (view.definition.actions ?? []).filter((a): a is CustomViewAction => typeof a === 'object');

  const patchLocal = (newActions: (BuiltinAction | CustomViewAction)[]) => {
    onUpdate({ ...view, definition: { ...view.definition, actions: newActions } });
  };

  const toggleBuiltin = async (action: BuiltinAction, enabled: boolean) => {
    const res = await fetch(`/api/admin/views/${view.id}/builtin-action`, {
      method: 'PATCH', headers,
      body: JSON.stringify({ action, enabled }),
    });
    if (!res.ok) { toast.error(t('common.error')); return; }
    const next = enabled
      ? [...(view.definition.actions ?? []), action] as (BuiltinAction | CustomViewAction)[]
      : (view.definition.actions ?? []).filter(a => a !== action) as (BuiltinAction | CustomViewAction)[];
    patchLocal(next);
  };

  const saveCustomAction = async (action: CustomViewAction) => {
    const res = await fetch(`/api/admin/views/${view.id}/custom-action`, {
      method: 'PUT', headers,
      body: JSON.stringify(action),
    });
    if (!res.ok) { toast.error(t('common.error')); return; }
    const existing = customs.findIndex(c => c.id === action.id);
    const nextCustom = existing !== -1
      ? customs.map(c => c.id === action.id ? action : c)
      : [...customs, action];
    patchLocal([...builtins, ...nextCustom]);
    setDialogOpen(false);
    toast.success(t('admin.views.toast_updated'));
  };

  const deleteCustomAction = async (actionId: string) => {
    const res = await fetch(`/api/admin/views/${view.id}/custom-action/${actionId}`, {
      method: 'DELETE', headers,
    });
    if (!res.ok) { toast.error(t('common.error')); return; }
    patchLocal([...builtins, ...customs.filter(c => c.id !== actionId)]);
    toast.success(t('admin.views.toast_deleted'));
  };

  const BEHAVIOR_LABEL: Record<string, string> = {
    set_field: t('admin.views.behavior_set_field'), 
    trigger_rule: t('admin.views.behavior_trigger_rule'), 
    webhook: t('admin.views.behavior_webhook'),
    navigate: t('admin.views.behavior_navigate'), 
    create_related: t('admin.views.behavior_create_related'),
  };

  const ACTION_LABEL: Record<string, string> = {
    create: t('admin.views.action_create'), 
    edit: t('admin.views.action_edit'), 
    delete: t('admin.views.action_delete'), 
    export: t('admin.views.action_export'),
  };

  return (
    <div className="space-y-5">
      {/* Built-in actions */}
      <div>
        <p className="mb-2 text-xs font-semibold text-muted-foreground uppercase tracking-wide">{t('admin.views.label_builtin_actions')}</p>
        <div className="rounded-md border divide-y">
          {BUILTIN_ACTIONS.map(a => (
            <div key={a} className="flex items-center justify-between px-4 py-2.5">
              <div>
                <span className="text-sm font-medium">{ACTION_LABEL[a]}</span>
                <span className="ml-2 text-xs text-muted-foreground font-mono">{a}</span>
              </div>
              <Switch
                checked={builtins.includes(a)}
                onCheckedChange={v => void toggleBuiltin(a, v)}
              />
            </div>
          ))}
        </div>
      </div>

      {/* Custom actions */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">{t('admin.views.label_custom_actions')}</p>
          <Button size="sm" variant="outline" className="h-7 gap-1 text-xs"
            onClick={() => { setEditingAction(null); setDialogOpen(true); }}>
            <Plus className="h-3.5 w-3.5" />{t('admin.views.add_action_btn')}
          </Button>
        </div>
        <div className="rounded-md border overflow-hidden">
          {customs.length === 0 ? (
            <p className="px-4 py-8 text-sm text-center text-muted-foreground">{t('admin.views.no_custom_action')}</p>
          ) : (
            <div className="divide-y">
              {customs.map(action => (
                <div key={action.id} className="flex items-center gap-3 px-4 py-2.5">
                  {/* ID + label */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium">{action.label}</span>
                      <span className="font-mono text-xs text-muted-foreground">{action.id}</span>
                    </div>
                    <div className="flex gap-2 mt-0.5 flex-wrap">
                      <Badge variant="secondary" className="text-xs px-1.5 py-0">
                        {BEHAVIOR_LABEL[action.behavior.type] ?? action.behavior.type}
                      </Badge>
                      {action.context && action.context !== 'record' && (
                        <Badge variant="outline" className="text-xs px-1.5 py-0">{action.context}</Badge>
                      )}
                      {action.visible_when && (
                        <Badge variant="outline" className="text-xs px-1.5 py-0">{t('admin.views.has_visible_when')}</Badge>
                      )}
                      {action.confirm && (
                        <Badge variant="outline" className="text-xs px-1.5 py-0">{t('admin.views.label_needs_confirm')}</Badge>
                      )}
                    </div>
                  </div>
                  {/* Variant badge */}
                  <span className={`shrink-0 rounded px-2 py-0.5 text-xs font-medium border ${
                    action.variant === 'destructive' ? 'border-destructive text-destructive' :
                    action.variant === 'default' ? 'bg-primary text-primary-foreground border-primary' :
                    'border-border text-muted-foreground'
                  }`}>{action.variant ?? 'outline'}</span>
                  {/* Actions */}
                  <div className="flex gap-1 shrink-0">
                    <Button variant="ghost" size="icon" className="h-7 w-7"
                      onClick={() => { setEditingAction(action); setDialogOpen(true); }}>
                      <Pencil className="h-3.5 w-3.5" />
                    </Button>
                    <Button variant="ghost" size="icon" className="h-7 w-7"
                      onClick={() => setDeletingActionId(action.id)}>
                      <Trash2 className="h-3.5 w-3.5 text-destructive" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Add/edit dialog */}
      <ActionFormDialog
        open={dialogOpen}
        initial={editingAction}
        onClose={() => setDialogOpen(false)}
        onSave={saveCustomAction}
      />

      {/* Delete confirm */}
      <AlertDialog open={Boolean(deletingActionId)} onOpenChange={o => { if (!o) setDeletingActionId(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('admin.views.dialog_delete_title_action')}</AlertDialogTitle>
            <AlertDialogDescription>{t('admin.views.dialog_delete_desc_action')}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t('common.cancel')}</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => { if (deletingActionId) { void deleteCustomAction(deletingActionId); setDeletingActionId(null); } }}>
              {t('common.delete')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

// ─── Section wrappers (master + per-detail) ──────────────────────────────────

function FieldSection({
  title, fields,
  onSaveLabel, onToggle, onAppearanceToggle, onAppearanceDelete,
}: {
  title?: string;
  fields: FieldDef[];
  onSaveLabel: (key: string, label: string) => Promise<void>;
  onToggle: (key: string, prop: 'required' | 'hidden_in_form', val: boolean) => Promise<void>;
  onAppearanceToggle: (fieldKey: string, ruleIndex: number, nextEnabled: boolean) => void;
  onAppearanceDelete: (fieldKey: string, ruleIndex: number) => void;
}) {
  const { t } = useTranslation();
  return (
    <div>
      {title && (
        <p className="mb-1.5 text-xs font-semibold text-muted-foreground uppercase tracking-wide">{title}</p>
      )}
      <div className="rounded-md border overflow-hidden">
        {/* Header */}
        <div className="sticky top-0 z-10 flex items-center gap-3 border-b bg-background px-4 py-2 text-xs font-medium text-muted-foreground">
          <span className="w-3.5 shrink-0" />
          <span className="w-32 shrink-0">{t('admin.views.col_field_key')}</span>
          <span className="w-36 shrink-0">{t('admin.views.label_tag')}</span>
          <span className="w-16 shrink-0">{t('admin.views.label_type')}</span>
          <div className="flex-1" />
          <span className="w-16 shrink-0 text-right">{t('admin.views.label_required')}</span>
          <span className="w-16 shrink-0 text-right">{t('admin.views.label_hidden')}</span>
          <span className="w-16 shrink-0 text-right">{t('admin.views.label_rule')}</span>
        </div>
        {fields.length === 0 ? (
          <p className="px-4 py-8 text-sm text-center text-muted-foreground">{t('admin.views.no_field')}</p>
        ) : (
          fields.map(field => (
            <FieldRow
              key={field.key}
              field={field}
              onSaveLabel={onSaveLabel}
              onToggle={onToggle}
              onAppearanceToggle={onAppearanceToggle}
              onAppearanceDelete={onAppearanceDelete}
            />
          ))
        )}
      </div>
    </div>
  );
}

function ColumnSection({
  title, columns,
  onSaveLabel, onToggle, onAppearanceToggle, onAppearanceDelete,
}: {
  title?: string;
  columns: ColumnDef[];
  onSaveLabel: (key: string, label: string) => Promise<void>;
  onToggle: (key: string, prop: 'hidden_in_table', val: boolean) => Promise<void>;
  onAppearanceToggle: (fieldKey: string, ruleIndex: number, nextEnabled: boolean) => void;
  onAppearanceDelete: (fieldKey: string, ruleIndex: number) => void;
}) {
  const { t } = useTranslation();
  return (
    <div>
      {title && (
        <p className="mb-1.5 text-xs font-semibold text-muted-foreground uppercase tracking-wide">{title}</p>
      )}
      <div className="rounded-md border overflow-hidden">
        {/* Header */}
        <div className="sticky top-0 z-10 flex items-center gap-3 border-b bg-background px-4 py-2 text-xs font-medium text-muted-foreground">
          <span className="w-3.5 shrink-0" />
          <span className="w-32 shrink-0">{t('admin.views.col_field_key')}</span>
          <span className="w-36 shrink-0">{t('admin.views.label_tag')}</span>
          <span className="w-16 shrink-0">{t('admin.views.label_type')}</span>
          <div className="flex-1" />
          <span className="w-16 shrink-0 text-right">{t('admin.views.label_hidden')}</span>
          <span className="w-16 shrink-0 text-right">{t('admin.views.label_rule')}</span>
        </div>
        {columns.length === 0 ? (
          <p className="px-4 py-8 text-sm text-center text-muted-foreground">{t('admin.views.no_column')}</p>
        ) : (
          columns.map(col => (
            <ColumnRow
              key={col.key}
              col={col}
              onSaveLabel={onSaveLabel}
              onToggle={onToggle}
              onAppearanceToggle={onAppearanceToggle}
              onAppearanceDelete={onAppearanceDelete}
            />
          ))
        )}
      </div>
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

export function ViewManagement() {
  const { t, i18n } = useTranslation();
  const { token } = useAuth();
  const [views, setViews] = useState<AdminView[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const headers = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };

  const VIEW_TYPE_LABEL: Record<string, string> = {
    'table': t('admin.views.type_table'), 
    'master-detail': t('admin.views.type_master_detail'),
    'dashboard': t('admin.views.type_dashboard'), 
    'kanban': t('admin.views.type_kanban'), 
    'calendar': t('admin.views.type_calendar'),
  };

  const fetchViews = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/admin/views', { headers });
      if (res.ok) {
        const data = await res.json() as AdminView[];
        setViews(data);
        if (data.length > 0 && !selectedId) setSelectedId(data[0].id);
      } else {
        toast.error(t('admin.views.toast_load_error'));
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { void fetchViews(); }, []);

  const selected = views.find(v => v.id === selectedId) ?? null;

  // ── Field property update ──
  const saveFieldProp = async (
    scope: 'form' | 'column',
    fieldKey: string,
    updates: Record<string, unknown>,
    detailIndex?: number,
  ) => {
    if (!selectedId) return;
    const res = await fetch(`/api/admin/views/${selectedId}/field-prop`, {
      method: 'PATCH', headers,
      body: JSON.stringify({ scope, field_key: fieldKey, updates, detail_index: detailIndex }),
    });
    if (!res.ok) { toast.error(t('common.error')); return; }
    setViews(prev => prev.map(v => {
      if (v.id !== selectedId) return v;
      const def = { ...v.definition };
      if (detailIndex !== undefined) {
        // Update field inside detail_views[detailIndex]
        const dvs = [...(def.detail_views ?? [])];
        const dv = dvs[detailIndex];
        if (!dv) return v;
        const dvView = { ...dv.view };
        if (scope === 'form') {
          dvView.form = {
            ...dvView.form,
            fields: (dvView.form as { fields: FieldDef[] }).fields.map(f =>
              f.key === fieldKey ? { ...f, ...updates } as FieldDef : f
            ),
          };
        } else {
          dvView.columns = (dvView.columns as ColumnDef[]).map(c =>
            c.key === fieldKey ? { ...c, ...updates } as ColumnDef : c
          );
        }
        dvs[detailIndex] = { ...dv, view: dvView as ViewDefinition };
        def.detail_views = dvs;
      } else {
        if (scope === 'form') {
          def.form = {
            ...def.form,
            fields: def.form.fields.map(f =>
              f.key === fieldKey ? { ...f, ...updates } as FieldDef : f
            ),
          };
        } else {
          def.columns = def.columns.map(c =>
            c.key === fieldKey ? { ...c, ...updates } as ColumnDef : c
          );
        }
      }
      return { ...v, definition: def };
    }));
  };

  // ── Appearance toggle ──
  const handleAppearanceToggle = async (
    scope: 'form' | 'column', fieldKey: string, ruleIndex: number, nextEnabled: boolean,
    detailIndex?: number,
  ) => {
    if (!selectedId) return;
    const res = await fetch('/api/admin/appearance/toggle', {
      method: 'PATCH', headers,
      body: JSON.stringify({ view_id: selectedId, scope, field_key: fieldKey, rule_index: ruleIndex, detail_index: detailIndex }),
    });
    if (!res.ok) { toast.error(t('common.error')); return; }

    const patchAppearance = (fields: FieldDef[] | ColumnDef[]) =>
      fields.map(f => {
        if (f.key !== fieldKey || !f.appearance) return f;
        return { ...f, appearance: f.appearance.map((r, i) => i === ruleIndex ? { ...r, enabled: nextEnabled } : r) };
      });

    setViews(prev => prev.map(v => {
      if (v.id !== selectedId) return v;
      const def = { ...v.definition };
      if (detailIndex !== undefined) {
        const dvs = [...(def.detail_views ?? [])];
        const dv = dvs[detailIndex];
        if (!dv) return v;
        const dvView = { ...dv.view };
        if (scope === 'form') dvView.form = { ...dvView.form, fields: patchAppearance((dvView.form as { fields: FieldDef[] }).fields) as FieldDef[] };
        else dvView.columns = patchAppearance(dvView.columns as ColumnDef[]) as ColumnDef[];
        dvs[detailIndex] = { ...dv, view: dvView as ViewDefinition };
        def.detail_views = dvs;
      } else {
        if (scope === 'form') def.form = { ...def.form, fields: patchAppearance(def.form.fields) as FieldDef[] };
        else def.columns = patchAppearance(def.columns) as ColumnDef[];
      }
      return { ...v, definition: def };
    }));
    toast.success(nextEnabled ? t('admin.views.toast_rule_enabled') : t('admin.views.toast_rule_disabled'));
  };

  // ── Appearance delete ──
  const handleAppearanceDelete = async (
    scope: 'form' | 'column', fieldKey: string, ruleIndex: number,
    detailIndex?: number,
  ) => {
    if (!selectedId) return;
    const res = await fetch('/api/admin/appearance/rule', {
      method: 'DELETE', headers,
      body: JSON.stringify({ view_id: selectedId, scope, field_key: fieldKey, rule_index: ruleIndex, detail_index: detailIndex }),
    });
    if (!res.ok) { toast.error(t('common.error')); return; }

    const removeRule = (fields: FieldDef[] | ColumnDef[]) =>
      fields.map(f => {
        if (f.key !== fieldKey || !f.appearance) return f;
        const next = f.appearance.filter((_, i) => i !== ruleIndex);
        return { ...f, appearance: next.length ? next : undefined };
      });

    setViews(prev => prev.map(v => {
      if (v.id !== selectedId) return v;
      const def = { ...v.definition };
      if (detailIndex !== undefined) {
        const dvs = [...(def.detail_views ?? [])];
        const dv = dvs[detailIndex];
        if (!dv) return v;
        const dvView = { ...dv.view };
        if (scope === 'form') dvView.form = { ...dvView.form, fields: removeRule((dvView.form as { fields: FieldDef[] }).fields) as FieldDef[] };
        else dvView.columns = removeRule(dvView.columns as ColumnDef[]) as ColumnDef[];
        dvs[detailIndex] = { ...dv, view: dvView as ViewDefinition };
        def.detail_views = dvs;
      } else {
        if (scope === 'form') def.form = { ...def.form, fields: removeRule(def.form.fields) as FieldDef[] };
        else def.columns = removeRule(def.columns) as ColumnDef[];
      }
      return { ...v, definition: def };
    }));
    toast.success(t('admin.views.toast_deleted_rule'));
  };

  return (
    <div className="flex h-full overflow-hidden">

        {/* ── Left: view list ── */}
        <div className="flex w-64 shrink-0 flex-col border-r">
          <div className="flex items-center justify-between border-b px-4 py-3">
            <h2 className="text-sm font-semibold">{t('admin.views.title')}</h2>
            <div className="flex gap-1">
              <Button variant="ghost" size="icon" className="h-7 w-7"
                onClick={() => void fetchViews()} disabled={loading}>
                <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
              </Button>
            </div>
          </div>

          <div className="flex-1 overflow-y-auto">
            {loading ? (
              <div className="flex justify-center py-10">
                <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
              </div>
            ) : views.length === 0 ? (
              <p className="px-4 py-6 text-xs text-muted-foreground text-center">{t('admin.views.no_view')}</p>
            ) : (
              views.map(v => {
                const ruleCount = countAppearanceRules(v.definition);
                const isSelected = v.id === selectedId;
                return (
                  <button
                    key={v.id}
                    className={`w-full text-left px-4 py-3 border-b border-border/50 hover:bg-accent transition-colors ${isSelected ? 'bg-accent' : ''}`}
                    onClick={() => setSelectedId(v.id)}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <span className="font-medium text-sm truncate">{v.definition.name}</span>
                      <span className={`shrink-0 rounded-full px-1.5 py-0.5 text-xs font-medium ${VIEW_TYPE_COLOR[v.definition.type] ?? ''}`}>
                        {VIEW_TYPE_LABEL[v.definition.type] ?? v.definition.type}
                      </span>
                    </div>
                    <div className="mt-1 flex items-center gap-2 text-xs text-muted-foreground">
                      <span className="font-mono truncate">{v.table_name}</span>
                      {v.definition.group && <span className="shrink-0">· {v.definition.group}</span>}
                    </div>
                    <div className="mt-1 flex gap-3 text-xs text-muted-foreground">
                      <span>{t('admin.views.badge_field_count', { count: (v.definition.form?.fields ?? []).length })}</span>
                      <span>{t('admin.views.badge_column_count', { count: (v.definition.columns ?? []).length })}</span>
                      {(v.definition.detail_views ?? []).length > 0 && (
                        <span>{t('admin.views.badge_detail_count', { count: v.definition.detail_views!.length })}</span>
                      )}
                      {ruleCount > 0 && <span className="text-primary font-medium">{t('admin.views.rule_count', { count: ruleCount })}</span>}
                    </div>
                  </button>
                );
              })
            )}
          </div>

          <div className="border-t px-4 py-2.5 text-xs text-muted-foreground">
            {t('admin.views.total_count', { count: views.length })}
          </div>
        </div>

        {/* ── Right: view detail ── */}
        <div className="flex flex-1 flex-col overflow-hidden">
          {!selected ? (
            <div className="flex flex-1 items-center justify-center text-muted-foreground">
              <div className="text-center">
                <Info className="h-8 w-8 mx-auto mb-2 opacity-30" />
                <p className="text-sm">{t('admin.views.select_view_info')}</p>
              </div>
            </div>
          ) : (
            <>
              {/* View header */}
              <div className="shrink-0 border-b px-6 py-3">
                <div className="flex items-center gap-3">
                  <h3 className="text-base font-semibold">{selected.definition.name}</h3>
                  <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${VIEW_TYPE_COLOR[selected.definition.type] ?? ''}`}>
                    {VIEW_TYPE_LABEL[selected.definition.type]}
                  </span>
                  {selected.definition.group && (
                    <Badge variant="outline" className="text-xs font-normal">{selected.definition.group}</Badge>
                  )}
                </div>
                <div className="mt-0.5 text-xs text-muted-foreground">
                  {t('admin.views.table_info', { table: selected.table_name })}
                  <span className="mx-2">·</span>
                  {t('admin.views.updated_info', { date: new Date(selected.updated_at).toLocaleString(i18n.language) })}
                </div>
              </div>

              {/* Tabs */}
              <Tabs defaultValue="form" className="flex flex-1 flex-col overflow-hidden">
                <TabsList className="shrink-0 mx-6 mt-3 w-fit">
                  <TabsTrigger value="form" className="gap-1.5 text-xs">
                    <FileText className="h-3.5 w-3.5" />
                    {t('admin.views.tab_fields')}
                    <Badge variant="secondary" className="ml-1 text-xs">
                      {(selected.definition.form?.fields?.length ?? 0) +
                        (selected.definition.detail_views ?? []).reduce((n, dv) => n + (dv.view.form?.fields?.length ?? 0), 0)}
                    </Badge>
                  </TabsTrigger>
                  <TabsTrigger value="column" className="gap-1.5 text-xs">
                    <Table2 className="h-3.5 w-3.5" />
                    {t('admin.views.tab_columns')}
                    <Badge variant="secondary" className="ml-1 text-xs">
                      {(selected.definition.columns?.length ?? 0) +
                        (selected.definition.detail_views ?? []).reduce((n, dv) => n + (dv.view.columns?.length ?? 0), 0)}
                    </Badge>
                  </TabsTrigger>
                  <TabsTrigger value="action" className="gap-1.5 text-xs">
                    <Zap className="h-3.5 w-3.5" />
                    {t('admin.views.tab_actions')}
                    <Badge variant="secondary" className="ml-1 text-xs">{selected.definition.actions?.length ?? 0}</Badge>
                  </TabsTrigger>
                </TabsList>

                {/* Form fields tab */}
                <TabsContent value="form" className="flex-1 overflow-y-auto mt-0 mx-6 mb-3 space-y-4">
                  <FieldSection
                    title={selected.definition.type === 'master-detail' ? t('admin.views.title_master_table', { name: selected.definition.name }) : undefined}
                    fields={selected.definition.form?.fields ?? []}
                    onSaveLabel={(key, label) => saveFieldProp('form', key, { label })}
                    onToggle={(key, prop, val) => saveFieldProp('form', key, { [prop]: val })}
                    onAppearanceToggle={(key, idx, next) => void handleAppearanceToggle('form', key, idx, next)}
                    onAppearanceDelete={(key, idx) => void handleAppearanceDelete('form', key, idx)}
                  />
                  {(selected.definition.detail_views ?? []).map((dv, dvIdx) => (
                    <FieldSection
                      key={dv.table_name}
                      title={t('admin.views.title_detail_table', { label: dv.tab_label, table: dv.table_name })}
                      fields={dv.view.form?.fields ?? []}
                      onSaveLabel={(key, label) => saveFieldProp('form', key, { label }, dvIdx)}
                      onToggle={(key, prop, val) => saveFieldProp('form', key, { [prop]: val }, dvIdx)}
                      onAppearanceToggle={(key, idx, next) => void handleAppearanceToggle('form', key, idx, next, dvIdx)}
                      onAppearanceDelete={(key, idx) => void handleAppearanceDelete('form', key, idx, dvIdx)}
                    />
                  ))}
                </TabsContent>

                {/* Columns tab */}
                <TabsContent value="column" className="flex-1 overflow-y-auto mt-0 mx-6 mb-3 space-y-4">
                  <ColumnSection
                    title={selected.definition.type === 'master-detail' ? `主表：${selected.definition.name}` : undefined}
                    columns={selected.definition.columns ?? []}
                    onSaveLabel={(key, label) => saveFieldProp('column', key, { label })}
                    onToggle={(key, prop, val) => saveFieldProp('column', key, { [prop]: val })}
                    onAppearanceToggle={(key, idx, next) => void handleAppearanceToggle('column', key, idx, next)}
                    onAppearanceDelete={(key, idx) => void handleAppearanceDelete('column', key, idx)}
                  />
                  {(selected.definition.detail_views ?? []).map((dv, dvIdx) => (
                    <ColumnSection
                      key={dv.table_name}
                      title={`明細：${dv.tab_label}（${dv.table_name}）`}
                      columns={dv.view.columns ?? []}
                      onSaveLabel={(key, label) => saveFieldProp('column', key, { label }, dvIdx)}
                      onToggle={(key, prop, val) => saveFieldProp('column', key, { [prop]: val }, dvIdx)}
                      onAppearanceToggle={(key, idx, next) => void handleAppearanceToggle('column', key, idx, next, dvIdx)}
                      onAppearanceDelete={(key, idx) => void handleAppearanceDelete('column', key, idx, dvIdx)}
                    />
                  ))}
                </TabsContent>

                {/* Actions tab */}
                <TabsContent value="action" className="flex-1 overflow-y-auto mt-0 mx-6 mb-3">
                  <ActionsPanel
                    view={selected}
                    headers={headers}
                    onUpdate={updated => setViews(prev => prev.map(v => v.id === updated.id ? updated : v))}
                  />
                </TabsContent>
              </Tabs>
            </>
          )}
        </div>
    </div>
  );
}
