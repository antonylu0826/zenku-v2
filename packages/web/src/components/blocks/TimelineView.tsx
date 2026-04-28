import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { Calendar } from "lucide-react";
import { getTableData, updateRow } from '../../api';
import type { ViewDefinition } from '../../types';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '../ui/dialog';
import { FormView } from './FormView';
import { Badge } from '../ui/badge';
import { DynamicIcon } from '../ui/dynamic-icon';

interface Props {
  view: ViewDefinition;
}

type RowData = Record<string, unknown>;

function formatDate(value: unknown): { full: string; year: string; monthDay: string } {
  if (!value) return { full: '', year: '', monthDay: '' };
  const d = new Date(String(value));
  if (isNaN(d.getTime())) return { full: String(value), year: '', monthDay: String(value) };
  const year = d.getFullYear().toString();
  const monthDay = d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  return { full: `${monthDay} ${year}`, year, monthDay };
}

function groupByYear(rows: RowData[], dateField: string): { year: string; rows: RowData[] }[] {
  const groups = new Map<string, RowData[]>();
  for (const row of rows) {
    const { year } = formatDate(row[dateField]);
    const key = year || '—';
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(row);
  }
  return [...groups.entries()].map(([year, rows]) => ({ year, rows }));
}

export function TimelineView({ view }: Props) {
  const { t } = useTranslation();
  const timeline = view.timeline;
  const [rows, setRows] = useState<RowData[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingRow, setEditingRow] = useState<RowData | null>(null);

  const fetchRows = useCallback(async () => {
    setLoading(true);
    try {
      const result = await getTableData(view.table_name, {
        page: 1,
        limit: 500,
        ...(timeline ? { sort: timeline.date_field, order: 'desc' } : {}),
      });
      setRows(result.rows);
    } catch (err) {
      toast.error(t('common_toast.load_failed'), { description: String(err) });
    } finally {
      setLoading(false);
    }
  }, [view.table_name, timeline?.date_field, t]);

  useEffect(() => { void fetchRows(); }, [fetchRows]);

  const handleUpdate = async (data: Record<string, unknown>) => {
    const id = editingRow?.id;
    if (id === undefined || id === null) return;
    try {
      await updateRow(view.table_name, id as string | number, data);
      toast.success(t('common_toast.update_success'));
      setEditingRow(null);
      void fetchRows();
    } catch (err) {
      toast.error(t('common_toast.update_failed'), { description: String(err) });
    }
  };

  if (!timeline) {
    return <div className="flex h-full items-center justify-center text-sm text-muted-foreground">Timeline configuration is missing</div>;
  }

  if (loading) {
    return <div className="flex h-full items-center justify-center text-sm text-muted-foreground">{t('common.loading')}</div>;
  }

  const { date_field, title_field, description_field, icon_field, tags_field } = timeline;
  const groups = groupByYear(rows, date_field);

  const visibleFieldCount = view.form?.fields?.filter(f => !f.hidden_in_form).length ?? 0;
  const formColumns = view.form?.columns ?? (visibleFieldCount >= 5 ? 2 : 1);
  const dialogWidthClass = formColumns === 3 ? 'max-w-4xl' : formColumns === 2 ? 'max-w-2xl' : 'max-w-lg';

  return (
    <div className="flex h-full flex-col overflow-hidden bg-background">
      <div className="flex-1 overflow-auto">
        {rows.length === 0 ? (
          <div className="flex h-full items-center justify-center text-sm text-muted-foreground">{t('common.no_data')}</div>
        ) : (
          <div className="mx-auto max-w-3xl px-4 pb-12 pt-4 md:pb-20 md:pt-6 md:px-6">
            {groups.map(({ year, rows: groupRows }) => (
              <div key={year} className="mb-10 last:mb-0">
                {/* Year Header */}
                <div className="mb-6 flex items-center gap-3">
                  <span className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">{year}</span>
                  <div className="flex-1 border-t border-dashed border-border" />
                </div>

                <div className="relative ml-3 border-l-2 border-border pl-8">
                  {groupRows.map((row, idx) => {
                    const title = String(row[title_field] ?? '');
                    const desc = description_field ? String(row[description_field] ?? '') : '';
                    const { monthDay } = formatDate(row[date_field]);
                    const customIcon = icon_field ? String(row[icon_field] ?? '') : '';

                    return (
                      <div key={String(row.id ?? idx)} className="relative mb-10 last:mb-0">
                        {/* Timeline Dot */}
                        <div className="absolute -left-[41px] top-3 size-3 rounded-full border-2 border-primary bg-background" />

                        {/* Content Area */}
                        <div
                          className="group cursor-pointer space-y-3"
                          onClick={() => setEditingRow(row)}
                        >
                          <div className="flex items-center gap-3">
                            <div className="flex size-9 shrink-0 items-center justify-center rounded-full border bg-muted text-muted-foreground transition-colors group-hover:border-primary/40 group-hover:bg-primary/10 group-hover:text-primary">
                              {customIcon ? (
                                <DynamicIcon name={customIcon} className="size-4" />
                              ) : (
                                <Calendar className="size-4" />
                              )}
                            </div>
                            <span className="text-sm font-medium tabular-nums text-muted-foreground">{monthDay}</span>
                          </div>

                          <div className="space-y-1">
                            <h3 className="text-lg font-semibold tracking-tight text-foreground transition-colors group-hover:text-primary">
                              {title || '—'}
                            </h3>
                          </div>

                          {desc && (
                            <p className="line-clamp-3 text-pretty text-sm leading-relaxed text-muted-foreground">
                              {desc}
                            </p>
                          )}

                          {/* Dynamic Badges from config */}
                          {tags_field && (row[tags_field] || (typeof row[tags_field] === 'string' && (row[tags_field] as string).startsWith('['))) && (
                            <div className="flex flex-wrap gap-2">
                              {(() => {
                                let tags: string[] = [];
                                const val = row[tags_field];
                                if (Array.isArray(val)) {
                                  tags = val;
                                } else if (typeof val === 'string' && val.startsWith('[')) {
                                  try { tags = JSON.parse(val); } catch { tags = []; }
                                }
                                return tags.map((tag: string) => (
                                  <Badge key={tag} variant="secondary" className="rounded-full px-3">
                                    {tag}
                                  </Badge>
                                ));
                              })()}
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <Dialog open={Boolean(editingRow)} onOpenChange={open => (!open ? setEditingRow(null) : null)}>
        <DialogContent className={dialogWidthClass}>
          <DialogHeader>
            <DialogTitle>{t('table.view.edit_dialog_title', { name: view.name })}</DialogTitle>
            <DialogDescription>{t('table.view.edit_dialog_desc')}</DialogDescription>
          </DialogHeader>
          {editingRow && (
            <FormView
              fields={view.form.fields}
              columns={formColumns}
              initialValues={editingRow}
              onSubmit={handleUpdate}
              onCancel={() => setEditingRow(null)}
            />
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
