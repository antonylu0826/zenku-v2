import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  addDays, addMonths, addWeeks, format, getDay, getDaysInMonth,
  isAfter, isSameDay, isToday, parseISO, startOfWeek, subDays, subMonths, subWeeks,
} from 'date-fns';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { toast } from 'sonner';
import { createRow, getTableData, updateRow } from '../../api';
import type { ViewDefinition } from '../../types';
import { useViews } from '../../contexts/ViewsContext';
import { Button } from '../ui/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '../ui/dialog';
import { cn } from '../../lib/cn';
import { FormView } from './FormView';

type RowData = Record<string, unknown>;
type ViewMode = 'month' | 'week' | 'day';

interface Props {
  view: ViewDefinition;
}

// ─── Colour helpers ───────────────────────────────────────────────────────────

const EVENT_COLORS = [
  'bg-indigo-100 text-indigo-800 dark:bg-indigo-900/40 dark:text-indigo-300',
  'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300',
  'bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300',
  'bg-rose-100 text-rose-800 dark:bg-rose-900/40 dark:text-rose-300',
  'bg-violet-100 text-violet-800 dark:bg-violet-900/40 dark:text-violet-300',
  'bg-sky-100 text-sky-800 dark:bg-sky-900/40 dark:text-sky-300',
];

function colorClass(val: string | undefined, map: Map<string, number>) {
  if (!val) return EVENT_COLORS[0];
  if (!map.has(val)) map.set(val, map.size % EVENT_COLORS.length);
  return EVENT_COLORS[map.get(val)!];
}

// ─── Shared context passed to sub-components (avoids prop drilling) ───────────

interface CalShared {
  titleField: string;
  colorField?: string;
  colorMap: Map<string, number>;
  draggingId: React.MutableRefObject<string | number | null>;
  eventsByDate: Record<string, RowData[]>;
  focusDate: Date;
  viewMode: ViewMode;
  onEdit: (row: RowData) => void;
  openCreate: (dateStr: string) => void;
  onDrop: (dateStr: string) => Promise<void>;
}

// ─── EventPill ────────────────────────────────────────────────────────────────

function EventPill({ event, shared }: { event: RowData; shared: CalShared }) {
  const cls = colorClass(
    shared.colorField ? String(event[shared.colorField] ?? '') : undefined,
    shared.colorMap,
  );
  return (
    <div
      draggable
      onDragStart={e => { shared.draggingId.current = event.id as string | number; e.dataTransfer.effectAllowed = 'move'; }}
      onDragEnd={() => { shared.draggingId.current = null; }}
      className={cn('truncate rounded px-1 py-0.5 text-xs leading-tight cursor-grab active:cursor-grabbing hover:brightness-95', cls)}
      title={String(event[shared.titleField] ?? '')}
      onClick={e => { e.stopPropagation(); shared.onEdit(event); }}
    >
      {String(event[shared.titleField] ?? '')}
    </div>
  );
}

// ─── DayCell ──────────────────────────────────────────────────────────────────

function DayCell({ date, muted = false, shared, moreLabel }: {
  date: Date; muted?: boolean; shared: CalShared; moreLabel: (n: number) => string;
}) {
  const dateStr = format(date, 'yyyy-MM-dd');
  const events  = shared.eventsByDate[dateStr] ?? [];
  const today   = isToday(date);
  const isFocus = isSameDay(date, shared.focusDate);
  return (
    <div
      className={cn(
        'min-h-[80px] border-b border-r p-1 cursor-pointer hover:bg-accent/50',
        muted && 'bg-muted/20',
        today && 'bg-primary/5',
      )}
      onClick={() => shared.openCreate(dateStr)}
      onDragOver={e => e.preventDefault()}
      onDrop={e => { e.preventDefault(); void shared.onDrop(dateStr); }}
    >
      <span className={cn(
        'inline-flex h-6 w-6 items-center justify-center rounded-full text-xs',
        today    ? 'bg-primary text-primary-foreground font-semibold' :
        isFocus && shared.viewMode !== 'month' ? 'ring-1 ring-primary text-primary' :
        muted    ? 'text-muted-foreground' : 'text-foreground',
      )}>
        {date.getDate()}
      </span>
      <div className="mt-0.5 space-y-0.5">
        {events.slice(0, 3).map((ev, i) => <EventPill key={i} event={ev} shared={shared} />)}
        {events.length > 3 && <div className="px-1 text-xs text-muted-foreground">{moreLabel(events.length - 3)}</div>}
      </div>
    </div>
  );
}

// ─── MonthView ────────────────────────────────────────────────────────────────

function MonthView({ shared, weekdays, moreLabel }: {
  shared: CalShared; weekdays: string[]; moreLabel: (n: number) => string;
}) {
  const firstDay    = new Date(shared.focusDate.getFullYear(), shared.focusDate.getMonth(), 1);
  const daysInMonth = getDaysInMonth(firstDay);
  const startOffset = getDay(firstDay);
  const cells: (Date | null)[] = [];
  for (let i = 0; i < startOffset; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(new Date(shared.focusDate.getFullYear(), shared.focusDate.getMonth(), d));
  while (cells.length % 7 !== 0) cells.push(null);
  return (
    <>
      <div className="grid shrink-0 grid-cols-7 border-b">
        {weekdays.map(d => <div key={d} className="py-2 text-center text-xs font-medium text-muted-foreground">{d}</div>)}
      </div>
      <div className="grid flex-1 grid-cols-7 overflow-auto">
        {cells.map((date, idx) => date
          ? <DayCell key={format(date, 'yyyy-MM-dd')} date={date} shared={shared} moreLabel={moreLabel} />
          : <div key={`empty-${idx}`} className="min-h-[80px] border-b border-r bg-muted/20" />
        )}
      </div>
    </>
  );
}

// ─── WeekView ─────────────────────────────────────────────────────────────────

function WeekView({ shared, weekdays, moreLabel }: {
  shared: CalShared; weekdays: string[]; moreLabel: (n: number) => string;
}) {
  const weekStart = startOfWeek(shared.focusDate, { weekStartsOn: 0 });
  const days      = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));
  return (
    <>
      <div className="grid shrink-0 grid-cols-7 border-b">
        {days.map((d, i) => (
          <div key={i} className={cn('py-2 text-center text-xs font-medium', isToday(d) ? 'text-primary' : 'text-muted-foreground')}>
            <div>{weekdays[i]}</div>
            <div className={cn('mx-auto mt-0.5 flex h-6 w-6 items-center justify-center rounded-full text-sm',
              isToday(d) && 'bg-primary text-primary-foreground font-bold')}>{d.getDate()}</div>
          </div>
        ))}
      </div>
      <div className="grid flex-1 grid-cols-7 overflow-auto">
        {days.map(date => <DayCell key={format(date, 'yyyy-MM-dd')} date={date} shared={shared} moreLabel={moreLabel} />)}
      </div>
    </>
  );
}

// ─── DayView ──────────────────────────────────────────────────────────────────

function DayView({ shared, noDataLabel, clickToAddLabel }: {
  shared: CalShared; noDataLabel: string; clickToAddLabel: string;
}) {
  const dateStr = format(shared.focusDate, 'yyyy-MM-dd');
  const events  = shared.eventsByDate[dateStr] ?? [];
  return (
    <div
      className="flex-1 overflow-auto p-4"
      onDragOver={e => e.preventDefault()}
      onDrop={e => { e.preventDefault(); void shared.onDrop(dateStr); }}
      onClick={() => shared.openCreate(dateStr)}
    >
      {events.length === 0 ? (
        <div className="flex h-32 items-center justify-center text-sm text-muted-foreground">{noDataLabel}</div>
      ) : (
        <div className="space-y-2" onClick={e => e.stopPropagation()}>
          {events.map((ev, i) => (
            <div key={i} className="rounded-md border p-3 hover:bg-accent/50 cursor-pointer" onClick={() => shared.onEdit(ev)}>
              <EventPill event={ev} shared={shared} />
            </div>
          ))}
        </div>
      )}
      <div className="mt-4 text-center text-xs text-muted-foreground">{clickToAddLabel}</div>
    </div>
  );
}

// ─── CalendarView ─────────────────────────────────────────────────────────────

export function CalendarView({ view }: Props) {
  const { t, i18n } = useTranslation();
  const { views } = useViews();
  const calendar = view.calendar;

  // Use the primary (non-calendar) view name for dialog titles to avoid
  // showing the view-type suffix (e.g., "客戶訂單行事曆" → "客戶訂單")
  const entityName = useMemo(() => {
    const primary = views.find(v => v.table_name === view.table_name && v.type !== 'calendar');
    return primary?.name ?? view.name;
  }, [views, view.table_name, view.name]);

  const [rows, setRows]             = useState<RowData[]>([]);
  const [loading, setLoading]       = useState(true);
  const [viewMode, setViewMode]     = useState<ViewMode>('month');
  const [focusDate, setFocusDate]   = useState(() => new Date());
  const [editingRow, setEditingRow] = useState<RowData | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [creatingDate, setCreatingDate] = useState<string | null>(null);
  const draggingId = useRef<string | number | null>(null);
  const colorMap   = useRef(new Map<string, number>());

  // Reset color assignments when rows change so colors stay consistent
  useEffect(() => { colorMap.current = new Map(); }, [rows]);

  const fetchRows = useCallback(async () => {
    setLoading(true);
    try {
      const result = await getTableData(view.table_name, { page: 1, limit: 1000 });
      setRows(result.rows);
    } catch (err) {
      toast.error(t('common_toast.load_failed'), { description: String(err) });
    } finally {
      setLoading(false);
    }
  }, [view.table_name, t]);

  useEffect(() => { void fetchRows(); }, [fetchRows]);

  // ── Navigation ──────────────────────────────────────────────────────────────

  const go = (dir: -1 | 1) => setFocusDate(d => {
    if (viewMode === 'month') return dir < 0 ? subMonths(d, 1) : addMonths(d, 1);
    if (viewMode === 'week')  return dir < 0 ? subWeeks(d, 1)  : addWeeks(d, 1);
    return dir < 0 ? subDays(d, 1) : addDays(d, 1);
  });

  const periodLabel = useMemo(() => {
    const locale = i18n.language;
    if (viewMode === 'month') return focusDate.toLocaleString(locale, { year: 'numeric', month: 'long' });
    if (viewMode === 'day')   return focusDate.toLocaleString(locale, { year: 'numeric', month: 'long', day: 'numeric', weekday: 'long' });
    const ws = startOfWeek(focusDate, { weekStartsOn: 0 });
    const we = addDays(ws, 6);
    return `${ws.toLocaleString(locale, { month: 'short', day: 'numeric' })} – ${we.toLocaleString(locale, { month: 'short', day: 'numeric' })}`;
  }, [focusDate, viewMode, i18n.language]);

  // ── Event grouping ──────────────────────────────────────────────────────────

  const eventsByDate = useMemo(() => {
    if (!calendar) return {} as Record<string, RowData[]>;
    const { date_field, end_date_field } = calendar;
    const map: Record<string, RowData[]> = {};
    for (const row of rows) {
      const startStr = String(row[date_field] ?? '').slice(0, 10);
      if (!startStr) continue;
      if (end_date_field) {
        const endStr = String(row[end_date_field] ?? '').slice(0, 10);
        if (endStr && endStr >= startStr) {
          let cur = parseISO(startStr);
          const end = parseISO(endStr);
          while (!isAfter(cur, end)) {
            const k = format(cur, 'yyyy-MM-dd');
            (map[k] = map[k] ?? []).push(row);
            cur = addDays(cur, 1);
          }
          continue;
        }
      }
      (map[startStr] = map[startStr] ?? []).push(row);
    }
    return map;
  }, [rows, calendar]);

  // ── Handlers ────────────────────────────────────────────────────────────────

  const handleCreate = async (data: Record<string, unknown>) => {
    if (creatingDate && calendar) data[calendar.date_field] = creatingDate;
    try {
      await createRow(view.table_name, data);
      toast.success(t('common_toast.create_success'));
      setShowCreate(false); setCreatingDate(null);
      void fetchRows();
    } catch (err) {
      toast.error(t('common_toast.create_failed'), { description: String(err) });
    }
  };

  const handleUpdate = async (data: Record<string, unknown>) => {
    if (editingRow?.id == null) return;
    try {
      await updateRow(view.table_name, editingRow.id, data);
      toast.success(t('common_toast.update_success'));
      setEditingRow(null); void fetchRows();
    } catch (err) {
      toast.error(t('common_toast.update_failed'), { description: String(err) });
    }
  };

  const handleDrop = useCallback(async (dateStr: string) => {
    const id = draggingId.current;
    if (!id || !calendar) return;
    const row = rows.find(r => r.id === id);
    if (!row || String(row[calendar.date_field]).slice(0, 10) === dateStr) { draggingId.current = null; return; }
    try {
      await updateRow(view.table_name, id, { [calendar.date_field]: dateStr });
      toast.success(t('common_toast.update_success'));
      void fetchRows();
    } catch (err) {
      toast.error(t('common_toast.update_failed'), { description: String(err) });
    }
    draggingId.current = null;
  }, [calendar, rows, view.table_name, t, fetchRows]);

  const openCreate = useCallback((dateStr: string) => { setCreatingDate(dateStr); setShowCreate(true); }, []);

  // ── Form sizing ─────────────────────────────────────────────────────────────

  const visibleFieldCount = view.form.fields.filter(f => !f.hidden_in_form).length;
  const formColumns = view.form.columns ?? (visibleFieldCount >= 5 ? 2 : 1);
  const dialogWidthClass = formColumns === 3 ? 'max-w-4xl' : formColumns === 2 ? 'max-w-2xl' : 'max-w-lg';

  if (!calendar) {
    return <div className="flex h-full items-center justify-center text-sm text-muted-foreground">{t('calendar.missing_config')}</div>;
  }

  const weekdays   = t('calendar.weekdays', { returnObjects: true }) as string[];
  const moreLabel  = (n: number) => t('calendar.more_events', { count: n });

  const shared: CalShared = {
    titleField: calendar.title_field,
    colorField: calendar.color_field,
    colorMap:   colorMap.current,
    draggingId,
    eventsByDate,
    focusDate,
    viewMode,
    onEdit:      setEditingRow,
    openCreate,
    onDrop:      handleDrop,
  };

  return (
    <>
      <div className="flex h-full flex-col">
        {/* Toolbar */}
        <div className="flex shrink-0 items-center justify-between border-b px-6 py-3">
          <div className="flex items-center gap-1">
            <Button variant="outline" size="sm" onClick={() => setFocusDate(new Date())}>{t('calendar.today')}</Button>
            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => go(-1)}>
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => go(1)}>
              <ChevronRight className="h-4 w-4" />
            </Button>
            <span className="ml-1 min-w-[160px] text-sm font-semibold">{periodLabel}</span>
            {loading && <span className="ml-2 text-xs text-muted-foreground">{t('common.loading')}</span>}
          </div>
          <div className="flex rounded-md border">
            {(['month', 'week', 'day'] as ViewMode[]).map(mode => (
              <Button
                key={mode}
                variant={viewMode === mode ? 'secondary' : 'ghost'}
                size="sm"
                className="rounded-none first:rounded-l-md last:rounded-r-md border-0 h-8"
                onClick={() => setViewMode(mode)}
              >
                {t(`calendar.mode_${mode}`)}
              </Button>
            ))}
          </div>
        </div>

        {viewMode === 'month' && <MonthView shared={shared} weekdays={weekdays} moreLabel={moreLabel} />}
        {viewMode === 'week'  && <WeekView  shared={shared} weekdays={weekdays} moreLabel={moreLabel} />}
        {viewMode === 'day'   && <DayView   shared={shared} noDataLabel={t('common.no_data')} clickToAddLabel={t('calendar.click_to_add')} />}
      </div>

      <Dialog open={Boolean(editingRow)} onOpenChange={open => { if (!open) setEditingRow(null); }}>
        <DialogContent className={dialogWidthClass}>
          <DialogHeader>
            <DialogTitle>{t('table.view.edit_dialog_title', { name: entityName })}</DialogTitle>
            <DialogDescription>{t('table.view.edit_dialog_desc')}</DialogDescription>
          </DialogHeader>
          {editingRow && <FormView fields={view.form.fields} columns={formColumns} initialValues={editingRow} onSubmit={handleUpdate} onCancel={() => setEditingRow(null)} />}
        </DialogContent>
      </Dialog>

      <Dialog open={showCreate} onOpenChange={open => { if (!open) { setShowCreate(false); setCreatingDate(null); } }}>
        <DialogContent className={dialogWidthClass}>
          <DialogHeader>
            <DialogTitle>{t('table.view.create_dialog_title', { name: entityName })}</DialogTitle>
            <DialogDescription>{t('table.view.create_dialog_desc')}</DialogDescription>
          </DialogHeader>
          <FormView fields={view.form.fields} columns={formColumns} onSubmit={handleCreate} onCancel={() => { setShowCreate(false); setCreatingDate(null); }} />
        </DialogContent>
      </Dialog>
    </>
  );
}
