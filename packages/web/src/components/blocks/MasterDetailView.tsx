import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { ArrowLeft, ChevronLeft, ChevronRight, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { deleteRow, executeViewAction, getRecord, getTableData, updateRow } from '../../api';
import type { CustomViewAction, DetailViewDef, ViewDefinition } from '../../types';
import { evaluateAppearanceCondition } from '@zenku/shared';
import { Button } from '../ui/button';
import { DynamicIcon } from '../ui/dynamic-icon';
import { Card, CardContent, CardHeader, CardTitle } from '../ui/card';
import { Skeleton } from '../ui/skeleton';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '../ui/alert-dialog';
import { FormView } from './FormView';
import { TableView } from './TableView';

interface Props {
  view: ViewDefinition;
  recordId: string;
}

type RowData = Record<string, unknown>;

function RecordNav({ ids, recordId, viewId, navigate, prevLabel, nextLabel }: {
  ids: (string | number)[];
  recordId: string;
  viewId: string;
  navigate: (path: string) => void;
  prevLabel: string;
  nextLabel: string;
}) {
  let idx = ids.indexOf(recordId as string | number);
  if (idx === -1) idx = ids.findIndex(id => String(id) === String(recordId));
  const prevId = idx > 0 ? ids[idx - 1] : null;
  const nextId = idx !== -1 && idx < ids.length - 1 ? ids[idx + 1] : null;
  return (
    <div className="flex items-center gap-1">
      <Button variant="ghost" size="icon" disabled={!prevId} onClick={() => prevId && navigate(`/view/${viewId}/${prevId}`)} title={prevLabel}>
        <ChevronLeft className="h-4 w-4" />
      </Button>
      <span className="text-xs text-muted-foreground">{idx + 1} / {ids.length}</span>
      <Button variant="ghost" size="icon" disabled={!nextId} onClick={() => nextId && navigate(`/view/${viewId}/${nextId}`)} title={nextLabel}>
        <ChevronRight className="h-4 w-4" />
      </Button>
    </div>
  );
}

export function MasterDetailView({ view, recordId }: Props) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [record, setRecord] = useState<RowData | null>(null);
  const [loading, setLoading] = useState(true);
  const [confirmAction, setConfirmAction] = useState<CustomViewAction | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [adjacentIds, setAdjacentIds] = useState<(string | number)[]>([]);

  const fetchRecord = useCallback(async () => {
    setLoading(true);
    try {
      const data = await getRecord(view.table_name, recordId);
      setRecord(data);
    } catch (error) {
      toast.error(t('common_toast.load_failed'), { description: String(error) });
    } finally {
      setLoading(false);
    }
  }, [view.table_name, recordId]);

  useEffect(() => {
    void fetchRecord();
  }, [fetchRecord]);

  useEffect(() => {
    getTableData(view.table_name, { page: 1, limit: 500 })
      .then(res => setAdjacentIds(res.rows.map(r => r['id'] as string | number)))
      .catch(() => {});
  }, [view.table_name]);

  const handleUpdate = async (data: Record<string, unknown>) => {
    try {
      const updated = await updateRow(view.table_name, recordId, data);
      setRecord(updated);
      toast.success(t('common_toast.update_success'));
    } catch (error) {
      toast.error(t('common_toast.update_failed'), { description: String(error) });
    }
  };

  const handleCustomAction = async (action: CustomViewAction) => {
    if (action.behavior.type === 'navigate') {
      const nav = action.behavior as { type: string; view_id: string; filter_field?: string; filter_value_from?: string };
      const filterVal = nav.filter_value_from && record ? record[nav.filter_value_from] : undefined;
      const query = nav.filter_field && filterVal !== undefined ? `?filter[${nav.filter_field}]=${String(filterVal)}` : '';
      navigate(`/view/${nav.view_id}${query}`);
      return;
    }
    try {
      const result = await executeViewAction(view.id, action.id, recordId);
      toast.success(t('table.view.toast_action_success', { action: action.label }));
      if (result.updated) setRecord(result.updated);
      else void fetchRecord();
    } catch (error) {
      toast.error(t('table.view.toast_action_failed', { action: action.label }), { description: String(error) });
    }
  };

  const triggerAction = (action: CustomViewAction) => {
    if (action.confirm) {
      setConfirmAction(action);
    } else {
      void handleCustomAction(action);
    }
  };

  const handleDelete = async () => {
    try {
      await deleteRow(view.table_name, recordId);
      toast.success(t('common_toast.delete_success', { defaultValue: 'Record deleted' }));
      navigate(`/view/${view.id}`);
    } catch (error) {
      toast.error(t('common_toast.delete_failed', { defaultValue: 'Delete failed' }), { description: String(error) });
    }
  };

  // Derive custom actions for the record context
  const recordCustomActions = view.actions
    .filter((a): a is CustomViewAction => typeof a === 'object')
    .filter(a => !a.context || a.context === 'record' || a.context === 'both');

  const builtinActions = view.actions.filter((a): a is import('../../types').BuiltinAction => typeof a === 'string');
  const canDelete = builtinActions.includes('delete');

  const formColumns = (view.form.columns ?? 4) as 1 | 2 | 3 | 4;

  return (
    <div className="flex h-full flex-col">
      {/* Header */}
      <div className="flex shrink-0 items-center gap-2 border-b px-4 py-2.5">
        <Button
          variant="ghost"
          size="sm"
          onClick={() => navigate(`/view/${view.id}`)}
          className="gap-1.5 text-muted-foreground"
        >
          <ArrowLeft className="size-3.5" />
          {t('common.back_to_list')}
        </Button>
        <span className="text-muted-foreground/60">/</span>
        <span className="text-sm font-medium">{view.name}</span>
        <span className="rounded bg-muted px-1.5 py-0.5 text-xs font-mono tabular-nums text-muted-foreground">#{recordId}</span>

        {/* Prev / Next navigation */}
        {adjacentIds.length > 0 && <RecordNav
          ids={adjacentIds}
          recordId={recordId}
          viewId={view.id}
          navigate={navigate}
          prevLabel={t('common.prev_page')}
          nextLabel={t('common.next_page')}
        />}

        {/* Action buttons */}
        <div className="ml-auto flex items-center gap-2">
          {record && recordCustomActions
            .filter(a => !a.visible_when || evaluateAppearanceCondition(a.visible_when, record))
            .map(a => {
              const isEnabled = !a.enabled_when || evaluateAppearanceCondition(a.enabled_when, record);
              return (
                <Button
                  key={a.id}
                  variant={(a.variant === 'warning' ? 'outline' : a.variant) ?? 'outline'}
                  size="sm"
                  disabled={!isEnabled}
                  onClick={() => triggerAction(a)}
                >
                  {a.icon && <DynamicIcon name={a.icon} className="mr-1 h-3.5 w-3.5" />}
                  {a.label}
                </Button>
              );
            })}
          {canDelete && (
            <Button
              variant="outline"
              size="sm"
              className="text-destructive hover:border-destructive/50 hover:bg-destructive/10 hover:text-destructive"
              onClick={() => setConfirmDelete(true)}
            >
              <Trash2 className="mr-1.5 h-3.5 w-3.5" />
              {t('table.view.delete')}
            </Button>
          )}
        </div>
      </div>

      {/* Custom action confirm dialog */}
      <AlertDialog open={Boolean(confirmAction)} onOpenChange={open => { if (!open) setConfirmAction(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{confirmAction?.confirm?.title}</AlertDialogTitle>
            <AlertDialogDescription>{confirmAction?.confirm?.description}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t('common.cancel')}</AlertDialogCancel>
            <AlertDialogAction onClick={() => { if (confirmAction) { void handleCustomAction(confirmAction); setConfirmAction(null); } }}>
              {t('common.confirm')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Delete confirm dialog */}
      <AlertDialog open={confirmDelete} onOpenChange={setConfirmDelete}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('table.view.delete_confirm_title')}</AlertDialogTitle>
            <AlertDialogDescription>{t('table.view.delete_confirm_desc')}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t('table.view.cancel')}</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => void handleDelete()}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {t('table.view.delete')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Scrollable body */}
      <div className="flex-1 overflow-y-auto">
        <div className="space-y-6 p-4 md:p-6">

          {loading ? (
            <div className="space-y-3">
              {[...Array(4)].map((_, i) => (
                <div key={i} className="space-y-1.5">
                  <Skeleton className="h-4 w-24" />
                  <Skeleton className="h-9 w-full" />
                </div>
              ))}
            </div>
          ) : record ? (
            <FormView
              key={JSON.stringify(record)}
              fields={view.form.fields}
              initialValues={record}
              mode="view"
              columns={formColumns}
              onSubmit={handleUpdate}
            />
          ) : (
            <p className="text-sm text-muted-foreground">{t('master_detail.record_not_found')}</p>
          )}

          {/* Detail view cards */}
          {(view.detail_views ?? []).map((dv, i) => (
            <DetailCard key={`${dv.view.table_name}-${i}`} detailView={dv} masterId={recordId} masterRecord={record || undefined} />
          ))}

        </div>
      </div>
    </div>
  );
}

function DetailCard({ detailView, masterId, masterRecord }: { detailView: DetailViewDef; masterId: string; masterRecord?: Record<string, unknown> }) {
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-3">
        <CardTitle className="text-sm font-medium">{detailView.tab_label}</CardTitle>
        {/* TableView has a built-in Add button; no need to add another here */}
      </CardHeader>
      <CardContent className="p-0">
        <TableView
          view={detailView.view}
          filters={{ [detailView.foreign_key]: masterId }}
          masterRecord={masterRecord}
          onCreateData={data => ({ ...data, [detailView.foreign_key]: masterId })}
        />
      </CardContent>
    </Card>
  );
}
