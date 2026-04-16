import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import { toast } from 'sonner';
import { executeViewAction, getRecord, updateRow } from '../../api';
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

function formatDateTime(val: unknown): string {
  if (!val) return '-';
  const d = new Date(String(val));
  if (isNaN(d.getTime())) return String(val);
  return d.toLocaleString('zh-TW', { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' });
}

export function MasterDetailView({ view, recordId }: Props) {
  const navigate = useNavigate();
  const [record, setRecord] = useState<RowData | null>(null);
  const [loading, setLoading] = useState(true);
  const [confirmAction, setConfirmAction] = useState<CustomViewAction | null>(null);

  const fetchRecord = useCallback(async () => {
    setLoading(true);
    try {
      const data = await getRecord(view.table_name, recordId);
      setRecord(data);
    } catch (error) {
      toast.error('載入資料失敗', { description: String(error) });
    } finally {
      setLoading(false);
    }
  }, [view.table_name, recordId]);

  useEffect(() => {
    void fetchRecord();
  }, [fetchRecord]);

  const handleUpdate = async (data: Record<string, unknown>) => {
    try {
      const updated = await updateRow(view.table_name, recordId, data);
      setRecord(updated);
      toast.success('更新成功');
    } catch (error) {
      toast.error('更新失敗', { description: String(error) });
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
      toast.success(action.label + ' 執行成功');
      if (result.updated) setRecord(result.updated);
      else void fetchRecord();
    } catch (error) {
      toast.error(action.label + ' 執行失敗', { description: String(error) });
    }
  };

  const triggerAction = (action: CustomViewAction) => {
    if (action.confirm) {
      setConfirmAction(action);
    } else {
      void handleCustomAction(action);
    }
  };

  // Derive custom actions for the record context
  const recordCustomActions = view.actions
    .filter((a): a is CustomViewAction => typeof a === 'object')
    .filter(a => !a.context || a.context === 'record' || a.context === 'both');

  const formColumns = view.form.columns ?? 2;

  return (
    <div className="flex h-full flex-col">
      {/* Header */}
      <div className="flex shrink-0 items-center gap-3 border-b px-6 py-3">
        <Button
          variant="ghost"
          size="sm"
          onClick={() => navigate(`/view/${view.id}`)}
          className="gap-1.5 text-muted-foreground"
        >
          <ArrowLeft className="h-4 w-4" />
          返回列表
        </Button>
        <span className="text-muted-foreground">/</span>
        <span className="text-sm font-medium">{view.name}</span>
        <span className="text-sm text-muted-foreground">#{recordId}</span>

        {/* Custom action buttons */}
        {record && recordCustomActions.length > 0 && (
          <div className="ml-auto flex items-center gap-2">
            {recordCustomActions
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
                    {a.icon && <DynamicIcon name={a.icon} className="mr-1 h-4 w-4" />}
                    {a.label}
                  </Button>
                );
              })}
          </div>
        )}
      </div>

      {/* Confirm dialog */}
      <AlertDialog open={Boolean(confirmAction)} onOpenChange={open => { if (!open) setConfirmAction(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{confirmAction?.confirm?.title}</AlertDialogTitle>
            <AlertDialogDescription>{confirmAction?.confirm?.description}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>取消</AlertDialogCancel>
            <AlertDialogAction onClick={() => { if (confirmAction) { void handleCustomAction(confirmAction); setConfirmAction(null); } }}>
              確認
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Scrollable body */}
      <div className="flex-1 overflow-y-auto">
        <div className="space-y-6 p-6">

          {/* Master section: form (2/3) + metadata card (1/3) */}
          <div className="grid grid-cols-3 gap-6 items-start">
            {/* Form */}
            <div className="col-span-2">
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
                <p className="text-sm text-muted-foreground">找不到資料</p>
              )}
            </div>

            {/* Metadata card */}
            <div className="col-span-1">
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm font-medium">資訊摘要</CardTitle>
                </CardHeader>
                <CardContent>
                  {loading ? (
                    <div className="space-y-3">
                      {[...Array(3)].map((_, i) => <Skeleton key={i} className="h-4 w-full" />)}
                    </div>
                  ) : (
                    <dl className="space-y-3 text-sm">
                      <div>
                        <dt className="text-xs font-medium text-muted-foreground">ID</dt>
                        <dd className="mt-0.5 font-mono text-xs">{recordId}</dd>
                      </div>
                      <div>
                        <dt className="text-xs font-medium text-muted-foreground">建立時間</dt>
                        <dd className="mt-0.5">{formatDateTime(record?.created_at)}</dd>
                      </div>
                      <div>
                        <dt className="text-xs font-medium text-muted-foreground">最後更新</dt>
                        <dd className="mt-0.5">{formatDateTime(record?.updated_at)}</dd>
                      </div>
                    </dl>
                  )}
                </CardContent>
              </Card>
            </div>
          </div>

          {/* Detail view cards */}
          {(view.detail_views ?? []).map(dv => (
            <DetailCard key={dv.table_name} detailView={dv} masterId={recordId} />
          ))}

        </div>
      </div>
    </div>
  );
}

function DetailCard({ detailView, masterId }: { detailView: DetailViewDef; masterId: string }) {
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-3">
        <CardTitle className="text-sm font-medium">{detailView.tab_label}</CardTitle>
        {/* TableView 內建新增按鈕，這裡不重複加 */}
      </CardHeader>
      <CardContent className="p-0">
        <TableView
          view={detailView.view}
          filters={{ [detailView.foreign_key]: masterId }}
          onCreateData={data => ({ ...data, [detailView.foreign_key]: masterId })}
        />
      </CardContent>
    </Card>
  );
}
