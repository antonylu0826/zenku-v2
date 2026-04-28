import { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  addMonths, differenceInDays, eachDayOfInterval,
  endOfMonth, format, isToday, isWeekend, parseISO,
  startOfMonth, subMonths,
} from 'date-fns';
import { CalendarDays, ChevronLeft, ChevronRight, Plus } from 'lucide-react';
import { createRow, getTableData, updateRow } from '../../api';
import type { ViewDefinition } from '../../types';
import { cn } from '../../lib/cn';
import { Button } from '../ui/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '../ui/dialog';
import { toast } from 'sonner';
import { FormView } from './FormView';

type RowData = Record<string, unknown>;

const LEFT_W = 240; // px — task name column width
const CELL_W = 32;  // px per day

interface Props {
  view: ViewDefinition;
}

export function GanttView({ view }: Props) {
  const { t } = useTranslation();
  const gantt = view.gantt;

  const builtinActions = view.actions.filter(
    (a): a is import('../../types').BuiltinAction => typeof a === 'string',
  );
  const canCreate = builtinActions.includes('create');
  const canEdit   = builtinActions.includes('edit');

  const [rows, setRows]           = useState<RowData[]>([]);
  const [loading, setLoading]     = useState(true);
  const [editingRow, setEditingRow] = useState<RowData | null>(null);
  const [showCreate, setShowCreate] = useState(false);

  const [rangeStart, setRangeStart] = useState(() => startOfMonth(new Date()));
  const [rangeEnd,   setRangeEnd]   = useState(() => endOfMonth(addMonths(new Date(), 2)));

  const fetchRows = useCallback(async () => {
    if (!gantt) return;
    setLoading(true);
    try {
      const result = await getTableData(view.table_name, { page: 1, limit: 2000 });
      setRows(result.rows);

      if (result.rows.length > 0) {
        const starts = result.rows.map(r => r[gantt.start_field] as string).filter(Boolean).map(s => parseISO(s));
        const ends   = result.rows.map(r => r[gantt.end_field]   as string).filter(Boolean).map(s => parseISO(s));
        if (starts.length && ends.length) {
          const minStart = new Date(Math.min(...starts.map(d => d.getTime())));
          const maxEnd   = new Date(Math.max(...ends.map(d => d.getTime())));
          setRangeStart(startOfMonth(subMonths(minStart, 0)));
          setRangeEnd(endOfMonth(maxEnd));
        }
      }
    } catch (err) {
      toast.error(t('common_toast.load_failed'), { description: String(err) });
    } finally {
      setLoading(false);
    }
  }, [view.table_name, gantt, t]);

  useEffect(() => { void fetchRows(); }, [fetchRows]);

  useEffect(() => {
    setRangeStart(startOfMonth(new Date()));
    setRangeEnd(endOfMonth(addMonths(new Date(), 2)));
  }, [view.id]);

  const dayCells = useMemo(
    () => eachDayOfInterval({ start: rangeStart, end: rangeEnd }),
    [rangeStart, rangeEnd],
  );

  const monthGroups = useMemo(() => {
    const groups: { label: string; count: number }[] = [];
    dayCells.forEach(day => {
      const label = format(day, 'MMM yyyy');
      if (groups.at(-1)?.label === label) {
        groups.at(-1)!.count++;
      } else {
        groups.push({ label, count: 1 });
      }
    });
    return groups;
  }, [dayCells]);

  const totalPx = dayCells.length * CELL_W;

  const todayOffset = useMemo(() => {
    const today = new Date();
    if (today < rangeStart || today > rangeEnd) return -1;
    return differenceInDays(today, rangeStart) * CELL_W + CELL_W / 2;
  }, [rangeStart, rangeEnd]);

  const visibleFieldCount = view.form.fields.filter(f => !f.hidden_in_form).length;
  const formColumns = view.form.columns ?? (visibleFieldCount >= 5 ? 2 : 1);
  const dialogWidthClass = formColumns === 3 ? 'max-w-4xl' : formColumns === 2 ? 'max-w-2xl' : 'max-w-lg';

  const handleCreate = async (data: Record<string, unknown>) => {
    try {
      await createRow(view.table_name, data);
      toast.success(t('common_toast.create_success'));
      setShowCreate(false);
      void fetchRows();
    } catch (err) {
      toast.error(t('common_toast.create_failed'), { description: String(err) });
    }
  };

  const handleUpdate = async (data: Record<string, unknown>) => {
    const id = editingRow?.id;
    if (id == null) return;
    try {
      await updateRow(view.table_name, id, data);
      toast.success(t('common_toast.update_success'));
      setEditingRow(null);
      void fetchRows();
    } catch (err) {
      toast.error(t('common_toast.update_failed'), { description: String(err) });
    }
  };

  if (!gantt) {
    return (
      <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
        {t('gantt.view.missing_config')}
      </div>
    );
  }

  const shiftMonths = (delta: number) => {
    setRangeStart(s => startOfMonth(addMonths(s, delta)));
    setRangeEnd(e => endOfMonth(addMonths(e, delta)));
  };

  const jumpToday = () => {
    setRangeStart(startOfMonth(new Date()));
    setRangeEnd(endOfMonth(addMonths(new Date(), 2)));
  };

  return (
    <div className="flex h-full flex-col">
      {/* Toolbar */}
      <div className="flex items-center justify-between gap-2 border-b px-4 py-2.5">
        <div className="flex items-center gap-1">
          <Button variant="ghost" size="icon" className="size-8" onClick={() => shiftMonths(-1)}>
            <ChevronLeft className="size-4" />
          </Button>
          <span className="min-w-[180px] text-center text-sm font-semibold tracking-tight tabular-nums">
            {format(rangeStart, 'MMM yyyy')} – {format(rangeEnd, 'MMM yyyy')}
          </span>
          <Button variant="ghost" size="icon" className="size-8" onClick={() => shiftMonths(1)}>
            <ChevronRight className="size-4" />
          </Button>
          <Button variant="outline" size="sm" className="ml-2" onClick={jumpToday}>
            <CalendarDays className="mr-1.5 size-3.5" />
            {t('gantt.view.today')}
          </Button>
        </div>
        {canCreate && (
          <Button size="sm" onClick={() => setShowCreate(true)}>
            <Plus className="size-3.5" />
            {t('table.view.create_button')}
          </Button>
        )}
      </div>

      {/* Gantt body */}
      {loading ? (
        <div className="flex flex-1 items-center justify-center text-sm text-muted-foreground">
          {t('common.loading')}
        </div>
      ) : (
        <div className="flex-1 overflow-auto">
          {/* ── Sticky header ── */}
          <div
            className="sticky top-0 z-20 flex border-b bg-background"
            style={{ minWidth: LEFT_W + totalPx }}
          >
            {/* Task name column header */}
            <div
              className="sticky left-0 z-30 shrink-0 border-r bg-background px-3 flex items-end pb-1"
              style={{ width: LEFT_W }}
            >
              <span className="text-xs font-medium text-muted-foreground select-none">
                {t('gantt.view.task_column')}
              </span>
            </div>

            {/* Time axis */}
            <div style={{ width: totalPx }}>
              {/* Month row */}
              <div className="flex border-b">
                {monthGroups.map(g => (
                  <div
                    key={g.label}
                    className="overflow-hidden whitespace-nowrap border-r px-2 py-0.5 text-xs font-medium text-muted-foreground select-none"
                    style={{ width: g.count * CELL_W }}
                  >
                    {g.label}
                  </div>
                ))}
              </div>
              {/* Day row */}
              <div className="flex">
                {dayCells.map((day, i) => (
                  <div
                    key={i}
                    className={cn(
                      'border-r py-0.5 text-center text-[10px] select-none',
                      isToday(day)
                        ? 'bg-primary/10 font-bold text-primary'
                        : isWeekend(day)
                          ? 'bg-muted/50 text-muted-foreground'
                          : 'text-muted-foreground',
                    )}
                    style={{ width: CELL_W }}
                  >
                    {format(day, 'd')}
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* ── Task rows ── */}
          <div className="relative" style={{ minWidth: LEFT_W + totalPx }}>
            {/* Today vertical line */}
            {todayOffset >= 0 && (
              <div
                className="pointer-events-none absolute bottom-0 top-0 w-px bg-primary/40 z-10"
                style={{ left: LEFT_W + todayOffset }}
              />
            )}

            {rows.length === 0 ? (
              <div className="flex h-32 items-center justify-center text-sm text-muted-foreground">
                {t('common.no_data')}
              </div>
            ) : (
              rows.map(row => {
                const startStr  = row[gantt.start_field]    as string | undefined;
                const endStr    = row[gantt.end_field]      as string | undefined;
                const title     = String(row[gantt.title_field] ?? '-');
                const progress  = gantt.progress_field ? Number(row[gantt.progress_field] ?? 0) : null;
                const colorVal  = gantt.color_field ? String(row[gantt.color_field] ?? '') : '';
                const barColor  = colorVal.startsWith('#') ? colorVal : undefined;

                let barLeft  = -1;
                let barWidth = 0;
                if (startStr && endStr) {
                  const s = parseISO(startStr);
                  const e = parseISO(endStr);
                  barLeft  = differenceInDays(s, rangeStart) * CELL_W;
                  barWidth = (differenceInDays(e, s) + 1) * CELL_W;
                }

                return (
                  <div
                    key={String(row.id)}
                    className="flex h-11 items-center border-b transition-colors hover:bg-muted/40"
                  >
                    {/* Sticky task name */}
                    <div
                      className="sticky left-0 z-10 flex h-full shrink-0 items-center border-r bg-background/95 px-3 backdrop-blur-sm"
                      style={{ width: LEFT_W }}
                    >
                      <span className="truncate text-sm">{title}</span>
                    </div>

                    {/* Bar area */}
                    <div className="relative h-full" style={{ width: totalPx }}>
                      {barLeft >= 0 && barWidth > 0 && (
                        <div
                          className={cn(
                            'absolute inset-y-2 rounded transition-opacity',
                            canEdit && 'cursor-pointer hover:opacity-80',
                            !barColor && 'bg-primary/75',
                          )}
                          style={{
                            left: barLeft,
                            width: barWidth,
                            ...(barColor && { backgroundColor: `${barColor}bb` }),
                          }}
                          onClick={() => canEdit && setEditingRow(row)}
                        >
                          {/* Progress overlay */}
                          {progress !== null && progress > 0 && (
                            <div
                              className="absolute inset-0 rounded bg-black/20"
                              style={{ width: `${Math.min(100, progress)}%` }}
                            />
                          )}
                          {/* Label inside bar */}
                          {barWidth > 64 && (
                            <span className="pointer-events-none absolute inset-0 flex items-center truncate px-2 text-[11px] font-medium text-white">
                              {title}
                            </span>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      )}

      {/* Edit dialog */}
      <Dialog open={Boolean(editingRow)} onOpenChange={open => { if (!open) setEditingRow(null); }}>
        <DialogContent className={dialogWidthClass}>
          <DialogHeader>
            <DialogTitle>{t('table.view.edit_dialog_title', { name: view.name })}</DialogTitle>
            <DialogDescription>{t('table.view.edit_dialog_desc')}</DialogDescription>
          </DialogHeader>
          {editingRow && (
            <div className="-mx-6 flex-1 min-h-0 overflow-y-auto px-6">
              <FormView
                fields={view.form.fields}
                columns={formColumns}
                initialValues={editingRow}
                onSubmit={handleUpdate}
                onCancel={() => setEditingRow(null)}
              />
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Create dialog */}
      {canCreate && (
        <Dialog open={showCreate} onOpenChange={setShowCreate}>
          <DialogContent className={dialogWidthClass}>
            <DialogHeader>
              <DialogTitle>{t('table.view.create_dialog_title', { name: view.name })}</DialogTitle>
              <DialogDescription>{t('table.view.create_dialog_desc')}</DialogDescription>
            </DialogHeader>
            <div className="-mx-6 flex-1 min-h-0 overflow-y-auto px-6">
              <FormView
                fields={view.form.fields}
                columns={formColumns}
                onSubmit={handleCreate}
                onCancel={() => setShowCreate(false)}
              />
            </div>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}
