import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Plus, Trash2, ArrowLeft, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { createRow } from '../../api';
import type { DetailViewDef, FieldDef, ViewDefinition } from '../../types';
import { Button } from '../ui/button';
import { cn } from '../../lib/cn';
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
  const { t } = useTranslation();
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
    if (field.required && !field.computed && field.type !== 'auto_number') {
      const empty = value === null || value === undefined || String(value ?? '').trim() === '';
      setMasterErrors(prev => ({ ...prev, [field.key]: empty ? t('master_detail.required_error', { label: field.label }) : null }));
    }
  };

  // Draft rows per detail_view
  const [draftRows, setDraftRows] = useState<Record<string, RowData[]>>(() => {
    const init: Record<string, RowData[]> = {};
    for (const dv of view.detail_views ?? []) init[dv.view.table_name] = [];
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
      if (f.type === 'auto_number') continue;
      if (f.required) {
        const v = masterValues[f.key];
        const empty = v === null || v === undefined || String(v ?? '').trim() === '';
        errors[f.key] = empty ? t('master_detail.required_error', { label: f.label }) : null;
      }
    }
    setMasterErrors(errors);
    return Object.values(errors).every(e => !e);
  };

  const handleSaveAll = async () => {
    if (!validateMaster()) {
      toast.error(t('errors.ERROR_MISSING_FIELDS'));
      return;
    }
    setSaving(true);
    try {
      const master = await createRow(view.table_name, masterValues);
      const masterId = master.id;

      for (const dv of view.detail_views ?? []) {
        for (const row of draftRows[dv.view.table_name] ?? []) {
          await createRow(dv.view.table_name, { ...row, [dv.foreign_key]: masterId });
        }
      }

      toast.success(t('common_toast.save_success'));
      navigate(`/view/${view.id}/${masterId}`);
    } catch (error) {
      toast.error(t('common_toast.save_failed'), { description: String(error) });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="flex h-full flex-col">
      {/* Header */}
      <div className="flex shrink-0 items-center gap-2 border-b px-4 py-2.5">
        <Button
          variant="ghost"
          size="sm"
          onClick={() => navigate(`/view/${view.id}`)}
          className="gap-1.5 text-muted-foreground"
          disabled={saving}
        >
          <ArrowLeft className="size-3.5" />
          {t('common.back_to_list')}
        </Button>
        <span className="text-muted-foreground/60">/</span>
        <span className="text-sm font-medium">{t('master_detail.add_title', { name: view.name })}</span>
      </div>

      <div className="flex-1 divide-y overflow-auto">
        {/* Master form */}
        <div className="px-4 py-5 md:px-6">
          <h3 className="mb-4 text-xs font-semibold uppercase tracking-wider text-muted-foreground">{t('master_detail.main_record')}</h3>
          {(() => {
            const cols = view.form.columns ?? 4;
            return (
              <div className={cn(
                'grid gap-x-6 gap-y-4',
                cols === 2 && 'grid-cols-1 sm:grid-cols-2',
                cols === 3 && 'grid-cols-1 sm:grid-cols-3',
                cols === 1 && 'grid-cols-1',
              )}>
                {masterFields.map(field => {
                  const fullWidth = field.type === 'textarea' || field.type === 'richtext' || !!field.computed;
                  return (
                    <FormItem key={field.key} className={cn(fullWidth && cols > 1 && 'col-span-full')}>
                      <Label htmlFor={field.key}>
                        {field.label}
                        {field.required && !field.computed ? ' *' : ''}
                        {field.computed ? <span className="ml-1 text-xs text-muted-foreground">{t('form.auto_calculated')}</span> : null}
                      </Label>
                      <FieldInput
                        field={field}
                        value={masterValues[field.key]}
                        formValues={masterValues}
                        onChange={value => updateMaster(field, value)}
                      />
                      {masterErrors[field.key] ? <FormMessage>{masterErrors[field.key]}</FormMessage> : null}
                    </FormItem>
                  );
                })}
              </div>
            );
          })()}
        </div>

        {/* Detail draft sections */}
        {(view.detail_views ?? []).map((dv, i) => (
          <DraftDetailSection
            key={`${dv.view.table_name}-${i}`}
            detailView={dv}
            rows={draftRows[dv.view.table_name] ?? []}
            masterRecord={masterValues}
            onAdd={data => addDraftRow(dv.view.table_name, data)}
            onRemove={index => removeDraftRow(dv.view.table_name, index)}
          />
        ))}
      </div>

      {/* Footer */}
      <div className="shrink-0 border-t bg-card px-4 py-3 md:px-6">
        <div className="flex items-center justify-between gap-3">
          <p className="text-xs text-muted-foreground">{t('master_detail.save_all_hint')}</p>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={() => navigate(`/view/${view.id}`)} disabled={saving}>
              {t('common.cancel')}
            </Button>
            <Button size="sm" onClick={handleSaveAll} disabled={saving}>
              {saving ? <Loader2 className="mr-1.5 size-3.5 animate-spin" /> : null}
              {saving ? t('common.saving') : t('master_detail.save_all')}
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
  masterRecord,
  onAdd,
  onRemove,
}: {
  detailView: DetailViewDef;
  rows: RowData[];
  masterRecord?: Record<string, unknown>;
  onAdd: (data: RowData) => void;
  onRemove: (index: number) => void;
}) {
  const { t } = useTranslation();
  const [showAdd, setShowAdd] = useState(false);
  const dv = detailView.view;
  // Exclude FK field from the add form
  const formFields = dv.form.fields.filter(f => f.key !== detailView.foreign_key && !f.hidden_in_form);

  const handleAdd = async (data: Record<string, unknown>) => {
    onAdd(data);
    setShowAdd(false);
  };

  return (
    <div className="px-4 py-5 md:px-6">
      <div className="mb-3 flex items-center justify-between">
        <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{detailView.tab_label}</h3>
        <Button size="sm" variant="outline" onClick={() => setShowAdd(true)}>
          <Plus className="mr-1 h-3.5 w-3.5" />
          {t('master_detail.add_detail')}
        </Button>
      </div>

      {rows.length === 0 ? (
        <p className="text-sm text-muted-foreground">{t('master_detail.no_details')}</p>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              {dv.columns.map(col => (
                <TableHead key={col.key}>{col.label}</TableHead>
              ))}
              <TableHead className="w-28">
                <span className="inline-flex items-center rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-700 dark:bg-amber-900/30 dark:text-amber-400">
                  {t('master_detail.pending_badge')}
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
                  <Button variant="ghost" size="icon" onClick={() => onRemove(i)} aria-label={t('common.delete')}>
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
            <DialogTitle>{t('table.view.create_dialog_title', { name: detailView.tab_label })}</DialogTitle>
            <DialogDescription>{t('master_detail.new_detail_desc')}</DialogDescription>
          </DialogHeader>
          <div className="flex-1 min-h-0 overflow-y-auto -mx-6 px-6">
            <FormView fields={formFields} masterRecord={masterRecord} onSubmit={handleAdd} onCancel={() => setShowAdd(false)} />
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
