import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Plus, Trash2, ArrowLeft, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { createRow } from '../../api';
import type { DetailViewDef, FieldDef, ViewDefinition } from '../../types';
import { Button } from '../ui/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '../ui/dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../ui/table';
import { FormItem, FormMessage } from '../ui/form';
import { Label } from '../ui/label';
import { FormView } from './FormView';
import { FieldInput } from '../fields';

interface Props {
  view: ViewDefinition;
}

type RowData = Record<string, unknown>;

export function MasterDetailCreateView({ view }: Props) {
  const navigate = useNavigate();
  const [saving, setSaving] = useState(false);

  // Master form values — live-tracked
  const masterFields = view.form.fields.filter(f => !f.hidden_in_form);
  const [masterValues, setMasterValues] = useState<RowData>(() => {
    const init: RowData = {};
    for (const f of masterFields) {
      init[f.key] = f.type === 'boolean' ? false : '';
    }
    return init;
  });
  const [masterErrors, setMasterErrors] = useState<Record<string, string | null>>({});

  const updateMaster = (field: FieldDef, value: unknown) => {
    setMasterValues(prev => ({ ...prev, [field.key]: value }));
    if (field.required && !field.computed) {
      const empty = value === null || value === undefined || String(value ?? '').trim() === '';
      setMasterErrors(prev => ({ ...prev, [field.key]: empty ? `${field.label} 為必填` : null }));
    }
  };

  // Draft rows per detail_view
  const [draftRows, setDraftRows] = useState<Record<string, RowData[]>>(() => {
    const init: Record<string, RowData[]> = {};
    for (const dv of view.detail_views ?? []) init[dv.table_name] = [];
    return init;
  });

  const addDraftRow = (tableName: string, data: RowData) => {
    setDraftRows(prev => ({ ...prev, [tableName]: [...(prev[tableName] ?? []), data] }));
  };
  const removeDraftRow = (tableName: string, index: number) => {
    setDraftRows(prev => ({ ...prev, [tableName]: prev[tableName].filter((_, i) => i !== index) }));
  };

  const validateMaster = () => {
    const errors: Record<string, string | null> = {};
    for (const f of masterFields) {
      if (f.computed) continue;
      if (f.required) {
        const v = masterValues[f.key];
        const empty = v === null || v === undefined || String(v ?? '').trim() === '';
        errors[f.key] = empty ? `${f.label} 為必填` : null;
      }
    }
    setMasterErrors(errors);
    return Object.values(errors).every(e => !e);
  };

  const handleSaveAll = async () => {
    if (!validateMaster()) {
      toast.error('請填寫必填欄位');
      return;
    }
    setSaving(true);
    try {
      const master = await createRow(view.table_name, masterValues);
      const masterId = master.id;

      for (const dv of view.detail_views ?? []) {
        for (const row of draftRows[dv.table_name] ?? []) {
          await createRow(dv.table_name, { ...row, [dv.foreign_key]: masterId });
        }
      }

      toast.success('儲存成功');
      navigate(`/view/${view.id}/${masterId}`);
    } catch (error) {
      toast.error('儲存失敗', { description: String(error) });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="flex h-full flex-col">
      {/* Header */}
      <div className="flex shrink-0 items-center gap-3 border-b px-6 py-3">
        <Button
          variant="ghost"
          size="sm"
          onClick={() => navigate(`/view/${view.id}`)}
          className="gap-1.5 text-muted-foreground"
          disabled={saving}
        >
          <ArrowLeft className="h-4 w-4" />
          返回列表
        </Button>
        <span className="text-sm font-medium">新增 {view.name}</span>
      </div>

      <div className="flex-1 divide-y overflow-auto">
        {/* Master form */}
        <div className="px-6 py-5">
          <h3 className="mb-4 text-sm font-semibold text-muted-foreground">主檔資料</h3>
          <div className="space-y-4">
            {masterFields.map(field => (
              <FormItem key={field.key}>
                <Label htmlFor={field.key}>
                  {field.label}
                  {field.required && !field.computed ? ' *' : ''}
                  {field.computed ? <span className="ml-1 text-xs text-muted-foreground">（自動計算）</span> : null}
                </Label>
                <FieldInput
                  field={field}
                  value={masterValues[field.key]}
                  formValues={masterValues}
                  onChange={value => updateMaster(field, value)}
                />
                {masterErrors[field.key] ? <FormMessage>{masterErrors[field.key]}</FormMessage> : null}
              </FormItem>
            ))}
          </div>
        </div>

        {/* Detail draft sections */}
        {(view.detail_views ?? []).map(dv => (
          <DraftDetailSection
            key={dv.table_name}
            detailView={dv}
            rows={draftRows[dv.table_name] ?? []}
            onAdd={data => addDraftRow(dv.table_name, data)}
            onRemove={index => removeDraftRow(dv.table_name, index)}
          />
        ))}
      </div>

      {/* Footer */}
      <div className="shrink-0 border-t bg-card px-6 py-4">
        <div className="flex items-center justify-between">
          <p className="text-xs text-muted-foreground">主檔與所有待寫入明細將一併儲存</p>
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => navigate(`/view/${view.id}`)} disabled={saving}>
              取消
            </Button>
            <Button onClick={handleSaveAll} disabled={saving}>
              {saving ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : null}
              {saving ? '儲存中...' : '全部儲存'}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

function DraftDetailSection({
  detailView,
  rows,
  onAdd,
  onRemove,
}: {
  detailView: DetailViewDef;
  rows: RowData[];
  onAdd: (data: RowData) => void;
  onRemove: (index: number) => void;
}) {
  const [showAdd, setShowAdd] = useState(false);
  const dv = detailView.view;
  // Exclude FK field from the add form
  const formFields = dv.form.fields.filter(f => f.key !== detailView.foreign_key && !f.hidden_in_form);

  const handleAdd = async (data: Record<string, unknown>) => {
    onAdd(data);
    setShowAdd(false);
  };

  return (
    <div className="px-6 py-5">
      <div className="mb-3 flex items-center justify-between">
        <h3 className="text-sm font-semibold text-muted-foreground">{detailView.tab_label}</h3>
        <Button size="sm" variant="outline" onClick={() => setShowAdd(true)}>
          <Plus className="mr-1 h-3.5 w-3.5" />
          新增明細
        </Button>
      </div>

      {rows.length === 0 ? (
        <p className="text-sm text-muted-foreground">尚無明細，點擊「新增明細」加入。</p>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              {dv.columns.map(col => (
                <TableHead key={col.key}>{col.label}</TableHead>
              ))}
              <TableHead className="w-28">
                <span className="inline-flex items-center rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-700 dark:bg-amber-900/30 dark:text-amber-400">
                  待寫入
                </span>
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((row, i) => (
              <TableRow key={i} className="bg-amber-50/40 dark:bg-amber-900/10">
                {dv.columns.map(col => (
                  <TableCell key={col.key}>
                    {row[col.key] !== undefined && row[col.key] !== '' && row[col.key] !== null
                      ? String(row[col.key])
                      : <span className="text-muted-foreground">-</span>}
                  </TableCell>
                ))}
                <TableCell>
                  <Button variant="ghost" size="icon" onClick={() => onRemove(i)} aria-label="移除">
                    <Trash2 className="h-4 w-4 text-destructive" />
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}

      <Dialog open={showAdd} onOpenChange={setShowAdd}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>新增 {detailView.tab_label}</DialogTitle>
            <DialogDescription>
              填入明細資料後加入清單。主檔儲存時一併寫入。
            </DialogDescription>
          </DialogHeader>
          <FormView fields={formFields} onSubmit={handleAdd} onCancel={() => setShowAdd(false)} />
        </DialogContent>
      </Dialog>
    </div>
  );
}
