import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { getTableData, createRow, updateRow } from '../../api';
import type { ViewDefinition } from '../../types';
import { FormView } from './FormView';

interface Props {
  view: ViewDefinition;
}

type RowData = Record<string, unknown>;

export function FormOnlyView({ view }: Props) {
  const { t } = useTranslation();
  const [record, setRecord] = useState<RowData | null>(null);
  const [loading, setLoading] = useState(true);

  const visibleFieldCount = view.form.fields.filter(f => !f.hidden_in_form).length;
  const formColumns = view.form.columns ?? (visibleFieldCount >= 5 ? 2 : 1);

  const loadRecord = useCallback(async () => {
    setLoading(true);
    try {
      const result = await getTableData(view.table_name, { page: 1, limit: 1 });
      if (result.rows.length > 0) {
        setRecord(result.rows[0]);
      } else {
        // Auto-create an empty record if none exists
        const newRow = await createRow(view.table_name, {});
        setRecord(newRow);
      }
    } catch (err) {
      toast.error(t('common_toast.load_failed'), { description: String(err) });
    } finally {
      setLoading(false);
    }
  }, [view.table_name]);

  useEffect(() => {
    void loadRecord();
  }, [loadRecord]);

  const handleSave = async (data: Record<string, unknown>) => {
    if (!record?.id) return;
    try {
      const updated = await updateRow(view.table_name, record.id, data);
      setRecord(updated);
      toast.success(t('common_toast.save_success'));
    } catch (err) {
      toast.error(t('common_toast.save_failed'), { description: String(err) });
    }
  };

  return (
    <div className="flex h-full flex-col">
      <header className="flex h-12 shrink-0 items-center border-b px-4">
        <h2 className="text-base font-semibold tracking-tight">{view.name}</h2>
      </header>

      <div className="flex-1 overflow-auto p-4 md:p-6">
        {loading ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            {t('common.loading')}
          </div>
        ) : record ? (
          <FormView
            fields={view.form.fields}
            columns={formColumns}
            initialValues={record}
            onSubmit={handleSave}
          />
        ) : null}
      </div>
    </div>
  );
}
