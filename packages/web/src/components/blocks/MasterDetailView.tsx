import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import { toast } from 'sonner';
import { getRecord, updateRow } from '../../api';
import type { ViewDefinition } from '../../types';
import { Button } from '../ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../ui/tabs';
import { FormView } from './FormView';
import { TableView } from './TableView';

interface Props {
  view: ViewDefinition;
  recordId: string;
}

type RowData = Record<string, unknown>;

export function MasterDetailView({ view, recordId }: Props) {
  const navigate = useNavigate();
  const [record, setRecord] = useState<RowData | null>(null);
  const [loading, setLoading] = useState(true);

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

  return (
    <div className="flex h-full flex-col">
      {/* Header */}
      <div className="flex items-center gap-3 border-b px-6 py-3">
        <Button
          variant="ghost"
          size="sm"
          onClick={() => navigate(`/view/${view.id}`)}
          className="gap-1.5 text-muted-foreground"
        >
          <ArrowLeft className="h-4 w-4" />
          返回列表
        </Button>
        <span className="text-sm font-medium text-muted-foreground">
          {view.name} #{recordId}
        </span>
      </div>

      {/* Master form */}
      <div className="border-b px-6 py-4">
        {loading ? (
          <p className="text-sm text-muted-foreground">載入中...</p>
        ) : record ? (
          <FormView
            key={JSON.stringify(record)}
            fields={view.form.fields}
            initialValues={record}
            mode="view"
            onSubmit={handleUpdate}
          />
        ) : (
          <p className="text-sm text-muted-foreground">找不到資料</p>
        )}
      </div>

      {/* Detail tabs */}
      {view.detail_views && view.detail_views.length > 0 && (
        <Tabs defaultValue={view.detail_views[0].table_name} className="flex flex-1 flex-col overflow-hidden">
          <TabsList>
            {view.detail_views.map(dv => (
              <TabsTrigger key={dv.table_name} value={dv.table_name}>
                {dv.tab_label}
              </TabsTrigger>
            ))}
          </TabsList>

          {view.detail_views.map(dv => (
            <TabsContent key={dv.table_name} value={dv.table_name}>
              <TableView
                view={dv.view}
                filters={{ [dv.foreign_key]: recordId }}
                onCreateData={data => ({ ...data, [dv.foreign_key]: recordId })}
              />
            </TabsContent>
          ))}
        </Tabs>
      )}
    </div>
  );
}
