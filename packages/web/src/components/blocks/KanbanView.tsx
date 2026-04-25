import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  DndContext, DragOverlay, PointerSensor,
  useSensor, useSensors, useDroppable,
} from '@dnd-kit/core';
import type { DragEndEvent, DragOverEvent, DragStartEvent } from '@dnd-kit/core';
import {
  SortableContext, arrayMove, useSortable, verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { Plus } from 'lucide-react';
import { toast } from 'sonner';
import { createRow, getTableData, updateRow } from '../../api';
import type { ViewDefinition } from '../../types';
import { Badge } from '../ui/badge';
import { Button } from '../ui/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '../ui/dialog';
import { FormView } from './FormView';
import { cn } from '../../lib/cn';

interface Props {
  view: ViewDefinition;
}

type RowData = Record<string, unknown>;

// ─── Helpers ──────────────────────────────────────────────────────────────────

function rowId(row: RowData) { return String(row.id); }

function buildGroups(rows: RowData[], groupField: string, defined: string[]): Record<string, RowData[]> {
  const result: Record<string, RowData[]> = {};
  for (const g of defined) result[g] = [];
  for (const row of rows) {
    const key = String(row[groupField] ?? '');
    if (!key) continue;
    if (key in result) result[key].push(row);
    else result[key] = [row];
  }
  return result;
}

function findGroup(groups: Record<string, RowData[]>, id: string): string | undefined {
  if (id in groups) return id; // id is a column name
  return Object.entries(groups).find(([, rows]) => rows.some(r => rowId(r) === id))?.[0];
}

// ─── KanbanView ────────────────────────────────────────────────────────────────

export function KanbanView({ view }: Props) {
  const { t } = useTranslation();
  const kanban = view.kanban;
  const [rows, setRows]           = useState<RowData[]>([]);
  const [loading, setLoading]     = useState(true);
  const [localGroups, setLocal]   = useState<Record<string, RowData[]>>({});
  const [activeRow, setActiveRow] = useState<RowData | null>(null);
  const [editingRow, setEditingRow] = useState<RowData | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [creatingGroup, setCreatingGroup] = useState<string | null>(null);
  const pendingSave = useRef<ReturnType<typeof setTimeout> | null>(null);

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }));

  const fetchRows = useCallback(async () => {
    setLoading(true);
    try {
      const result = await getTableData(view.table_name, { page: 1, limit: 500 });
      setRows(result.rows);
    } catch (err) {
      toast.error(t('common_toast.load_failed'), { description: String(err) });
    } finally { setLoading(false); }
  }, [view.table_name, t]);

  useEffect(() => { void fetchRows(); }, [fetchRows]);

  // Derive groups from form field options or data
  const groupField = kanban?.group_field ?? '';
  const titleField = kanban?.title_field ?? '';
  const descField  = kanban?.description_field;
  const sortField  = kanban?.sort_field;

  const formField = view.form.fields.find(f => f.key === groupField);
  const definedGroups: string[] = formField?.options?.length
    ? formField.options
    : [...new Set(rows.map(r => String(r[groupField] ?? '')).filter(Boolean))];

  const allGroups = [
    ...definedGroups,
    ...Object.keys(localGroups).filter(k => !definedGroups.includes(k) && localGroups[k].length > 0),
  ];

  // Sync rows → localGroups (only when not mid-drag)
  useEffect(() => {
    if (activeRow) return;
    setLocal(buildGroups(rows, groupField, definedGroups));
  }, [rows, groupField]); // eslint-disable-line

  // ── Drag handlers ────────────────────────────────────────────────────────────

  const handleDragStart = ({ active }: DragStartEvent) => {
    const row = rows.find(r => rowId(r) === String(active.id));
    setActiveRow(row ?? null);
  };

  const handleDragOver = ({ active, over }: DragOverEvent) => {
    if (!over) return;
    const activeId = String(active.id);
    const overId   = String(over.id);
    const fromCol  = findGroup(localGroups, activeId);
    const toCol    = findGroup(localGroups, overId);
    if (!fromCol || !toCol || fromCol === toCol) return;

    setLocal(prev => {
      const fromRows = [...prev[fromCol]];
      const toRows   = [...(prev[toCol] ?? [])];
      const idx      = fromRows.findIndex(r => rowId(r) === activeId);
      if (idx === -1) return prev;
      const [moved]  = fromRows.splice(idx, 1);
      const overIdx  = toRows.findIndex(r => rowId(r) === overId);
      if (overIdx >= 0) toRows.splice(overIdx, 0, moved);
      else toRows.push(moved);
      return { ...prev, [fromCol]: fromRows, [toCol]: toRows };
    });
  };

  const handleDragEnd = async ({ active, over }: DragEndEvent) => {
    setActiveRow(null);
    if (!over) return;
    const activeId = String(active.id);
    const overId   = String(over.id);
    const fromCol  = findGroup(localGroups, activeId);
    const toCol    = findGroup(localGroups, overId);
    if (!fromCol || !toCol) return;

    // Within-column reorder
    if (fromCol === toCol) {
      const colRows = localGroups[fromCol];
      const oldIdx  = colRows.findIndex(r => rowId(r) === activeId);
      const newIdx  = colRows.findIndex(r => rowId(r) === overId);
      if (oldIdx === -1 || newIdx === -1 || oldIdx === newIdx) return;
      const reordered = arrayMove(colRows, oldIdx, newIdx);
      setLocal(prev => ({ ...prev, [fromCol]: reordered }));

      // Persist sort if sort_field configured
      if (sortField) {
        if (pendingSave.current) clearTimeout(pendingSave.current);
        pendingSave.current = setTimeout(async () => {
          try {
            await Promise.all(reordered.map((r, i) =>
              updateRow(view.table_name, r.id, { [sortField]: (i + 1) * 1000 })
            ));
          } catch (err) {
            toast.error(t('common_toast.update_failed'), { description: String(err) });
          }
        }, 400);
      }
      return;
    }

    // Cross-column move: the row is already in toCol via handleDragOver
    const draggedRow = rows.find(r => rowId(r) === activeId);
    if (!draggedRow) return;
    setRows(prev => prev.map(r => rowId(r) === activeId ? { ...r, [groupField]: toCol } : r));
    try {
      await updateRow(view.table_name, activeId, { [groupField]: toCol });
    } catch (err) {
      toast.error(t('common_toast.update_failed'), { description: String(err) });
      void fetchRows();
    }
  };

  // ── CRUD ─────────────────────────────────────────────────────────────────────

  const handleCreate = async (data: Record<string, unknown>) => {
    if (creatingGroup && kanban) data[groupField] = creatingGroup;
    try {
      await createRow(view.table_name, data);
      toast.success(t('common_toast.create_success'));
      setShowCreate(false); setCreatingGroup(null);
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
      setEditingRow(null); void fetchRows();
    } catch (err) {
      toast.error(t('common_toast.update_failed'), { description: String(err) });
    }
  };

  // ── Render ────────────────────────────────────────────────────────────────────

  if (!kanban) return <div className="flex h-full items-center justify-center text-sm text-muted-foreground">Kanban configuration is missing</div>;
  if (loading)  return <div className="flex h-full items-center justify-center text-sm text-muted-foreground">{t('common.loading')}</div>;

  const visibleFieldCount = view.form.fields.filter(f => !f.hidden_in_form).length;
  const formColumns = view.form.columns ?? (visibleFieldCount >= 5 ? 2 : 1);
  const dialogWidthClass = formColumns === 3 ? 'max-w-4xl' : formColumns === 2 ? 'max-w-2xl' : 'max-w-lg';

  return (
    <DndContext sensors={sensors} onDragStart={handleDragStart} onDragOver={handleDragOver} onDragEnd={handleDragEnd}>
      <div className="flex h-full items-start gap-3 overflow-auto p-4">
        {allGroups.map(group => (
          <KanbanColumn
            key={group}
            group={group}
            rows={localGroups[group] ?? []}
            titleField={titleField}
            descField={descField}
            columnColor={kanban.column_color_map?.[group]}
            onEdit={setEditingRow}
            onAddRow={() => { setCreatingGroup(group); setShowCreate(true); }}
          />
        ))}
      </div>

      <DragOverlay>
        {activeRow && <KanbanCard row={activeRow} titleField={titleField} descField={descField} isDragging />}
      </DragOverlay>

      <Dialog open={Boolean(editingRow)} onOpenChange={open => { if (!open) setEditingRow(null); }}>
        <DialogContent className={dialogWidthClass}>
          <DialogHeader>
            <DialogTitle>{t('table.view.edit_dialog_title', { name: view.name })}</DialogTitle>
            <DialogDescription>{t('table.view.edit_dialog_desc')}</DialogDescription>
          </DialogHeader>
          {editingRow && <FormView fields={view.form.fields} columns={formColumns} initialValues={editingRow} onSubmit={handleUpdate} onCancel={() => setEditingRow(null)} />}
        </DialogContent>
      </Dialog>

      <Dialog open={showCreate} onOpenChange={setShowCreate}>
        <DialogContent className={dialogWidthClass}>
          <DialogHeader>
            <DialogTitle>{t('table.view.create_dialog_title', { name: view.name })}</DialogTitle>
            <DialogDescription>{t('table.view.create_dialog_desc')}</DialogDescription>
          </DialogHeader>
          <FormView fields={view.form.fields} columns={formColumns} onSubmit={handleCreate} onCancel={() => setShowCreate(false)} />
        </DialogContent>
      </Dialog>
    </DndContext>
  );
}

// ─── Column ────────────────────────────────────────────────────────────────────

function KanbanColumn({ group, rows, titleField, descField, onEdit, onAddRow, columnColor }: {
  group: string; rows: RowData[]; titleField: string; descField?: string;
  onEdit?: (row: RowData) => void; onAddRow?: () => void; columnColor?: string;
}) {
  const { t } = useTranslation();
  const { setNodeRef, isOver } = useDroppable({ id: group });
  const bgStyle = columnColor ? { backgroundColor: columnColor + '14' } : undefined;

  return (
    <div
      ref={setNodeRef}
      style={bgStyle}
      className={cn('w-64 shrink-0 rounded-lg border transition-colors',
        !columnColor && 'bg-muted/40', isOver && 'border-primary/50')}
    >
      <div className="flex items-center justify-between px-3 py-2.5">
        <span className="text-sm font-medium">{group}</span>
        <Badge variant="secondary" className="text-xs">{rows.length}</Badge>
      </div>

      <SortableContext items={rows.map(r => rowId(r))} strategy={verticalListSortingStrategy}>
        <div className="space-y-2 p-2">
          {rows.map(row => (
            <KanbanCard key={rowId(row)} row={row} titleField={titleField} descField={descField} onEdit={onEdit} />
          ))}
        </div>
      </SortableContext>

      {onAddRow && (
        <div className="p-2">
          <Button variant="ghost" size="sm" className="w-full justify-start text-muted-foreground" onClick={onAddRow}>
            <Plus className="mr-2 h-4 w-4" />
            {t('common.add')}
          </Button>
        </div>
      )}
    </div>
  );
}

// ─── Card ──────────────────────────────────────────────────────────────────────

function KanbanCard({ row, titleField, descField, isDragging = false, onEdit }: {
  row: RowData; titleField: string; descField?: string; isDragging?: boolean; onEdit?: (row: RowData) => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging: sorting } = useSortable({ id: rowId(row) });
  const justDragged = useRef(false);
  useEffect(() => { if (sorting) justDragged.current = true; }, [sorting]);

  const style = { transform: CSS.Transform.toString(transform), transition };
  const title = String(row[titleField] ?? row.id ?? '');
  const desc  = descField ? String(row[descField] ?? '') : '';

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...listeners}
      {...attributes}
      onClick={() => { if (justDragged.current) { justDragged.current = false; return; } onEdit?.(row); }}
      className={cn(
        'cursor-grab rounded-md border bg-card p-3 shadow-sm transition-opacity active:cursor-grabbing',
        sorting && !isDragging ? 'opacity-30' : '',
        isDragging ? 'rotate-1 shadow-lg' : '',
      )}
    >
      <p className="text-sm font-medium leading-snug">{title}</p>
      {desc && <p className="mt-1 text-xs text-muted-foreground line-clamp-2">{desc}</p>}
    </div>
  );
}
