import { useCallback, useEffect, useRef, useState } from 'react';
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  useSensor,
  useSensors,
  useDroppable,
  useDraggable,
} from '@dnd-kit/core';
import type { DragEndEvent, DragStartEvent } from '@dnd-kit/core';
import { Plus } from 'lucide-react';
import { toast } from 'sonner';
import { getTableData, updateRow, createRow } from '../../api';
import type { ViewDefinition } from '../../types';
import { Badge } from '../ui/badge';
import { Button } from '../ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '../ui/dialog';
import { FormView } from './FormView';

interface Props {
  view: ViewDefinition;
}

type RowData = Record<string, unknown>;

export function KanbanView({ view }: Props) {
  const kanban = view.kanban;
  const [rows, setRows] = useState<RowData[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeRow, setActiveRow] = useState<RowData | null>(null);
  const [editingRow, setEditingRow] = useState<RowData | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [creatingGroup, setCreatingGroup] = useState<string | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } })
  );

  const fetchRows = useCallback(async () => {
    setLoading(true);
    try {
      const result = await getTableData(view.table_name, { page: 1, limit: 200 });
      setRows(result.rows);
    } catch (err) {
      toast.error('載入失敗', { description: String(err) });
    } finally {
      setLoading(false);
    }
  }, [view.table_name]);

  const handleUpdate = async (data: Record<string, unknown>) => {
    const id = editingRow?.id;
    if (id === undefined || id === null) return;
    try {
      await updateRow(view.table_name, id, data);
      toast.success('更新成功');
      setEditingRow(null);
      void fetchRows();
    } catch (err) {
      toast.error('更新失敗', { description: String(err) });
    }
  };

  const handleCreate = async (data: Record<string, unknown>) => {
    try {
      if (creatingGroup && kanban) {
        data[kanban.group_field] = creatingGroup;
      }
      await createRow(view.table_name, data);
      toast.success('新增成功');
      setShowCreate(false);
      setCreatingGroup(null);
      void fetchRows();
    } catch (err) {
      toast.error('新增失敗', { description: String(err) });
    }
  };

  useEffect(() => { void fetchRows(); }, [fetchRows]);

  if (!kanban) {
    return <div className="flex h-full items-center justify-center text-sm text-muted-foreground">Kanban 設定缺失</div>;
  }

  // Derive groups from field options or distinct values in data
  const groupField = kanban.group_field;
  const titleField = kanban.title_field;
  const descField = kanban.description_field;

  // Get groups: first try form field options, then distinct values from data
  const formField = view.form.fields.find(f => f.key === groupField);
  let groups: string[] = [];
  if (formField?.options && formField.options.length > 0) {
    groups = formField.options;
  } else {
    const seen = new Set<string>();
    for (const row of rows) {
      const val = String(row[groupField] ?? '');
      if (val) seen.add(val);
    }
    groups = [...seen];
  }

  const grouped: Record<string, RowData[]> = {};
  for (const g of groups) grouped[g] = [];
  for (const row of rows) {
    const key = String(row[groupField] ?? '');
    if (!key) continue; // skip rows with empty group field
    if (key in grouped) {
      grouped[key].push(row);
    } else {
      grouped[key] = [row]; // value exists in data but not in options → create column
    }
  }
  // Ensure all groups with data are shown (even if not in options)
  const allGroups = [
    ...groups,
    ...Object.keys(grouped).filter(k => !groups.includes(k)),
  ];

  const handleDragStart = (event: DragStartEvent) => {
    const row = rows.find(r => String(r.id) === String(event.active.id));
    setActiveRow(row ?? null);
  };

  const handleDragEnd = async (event: DragEndEvent) => {
    setActiveRow(null);
    const { active, over } = event;
    if (!over) return;

    const draggedIdStr = String(active.id);
    const targetGroup = String(over.id);
    const draggedRow = rows.find(r => String(r.id) === draggedIdStr);
    if (!draggedRow || String(draggedRow[groupField]) === targetGroup) return;

    // Optimistic update
    setRows(prev => prev.map(r => String(r.id) === draggedIdStr ? { ...r, [groupField]: targetGroup } : r));

    try {
      await updateRow(view.table_name, draggedIdStr, { [groupField]: targetGroup });
    } catch (err) {
      toast.error('更新失敗', { description: String(err) });
      void fetchRows(); // revert
    }
  };

  if (loading) {
    return <div className="flex h-full items-center justify-center text-sm text-muted-foreground">載入中...</div>;
  }

  // Calculate dialog width based on form columns
  const visibleFieldCount = view.form.fields.filter(f => !f.hidden_in_form).length;
  const formColumns = view.form.columns ?? (visibleFieldCount >= 5 ? 2 : 1);
  const dialogWidthClass = formColumns === 3 ? 'max-w-4xl' : formColumns === 2 ? 'max-w-2xl' : 'max-w-lg';

  return (
    <DndContext sensors={sensors} onDragStart={handleDragStart} onDragEnd={handleDragEnd}>
      <div className="flex h-full items-start gap-3 overflow-auto p-4">
        {allGroups.map(group => (
          <KanbanColumn
            key={group}
            group={group}
            rows={grouped[group] ?? []}
            titleField={titleField}
            descField={descField}
            onEdit={setEditingRow}
            onAddRow={() => {
              setCreatingGroup(group);
              setShowCreate(true);
            }}
          />
        ))}
      </div>

      <DragOverlay>
        {activeRow ? (
          <KanbanCard row={activeRow} titleField={titleField} descField={descField} isDragging />
        ) : null}
      </DragOverlay>

      <Dialog open={Boolean(editingRow)} onOpenChange={open => (!open ? setEditingRow(null) : null)}>
        <DialogContent className={dialogWidthClass}>
          <DialogHeader>
            <DialogTitle>編輯 {view.name}</DialogTitle>
            <DialogDescription>更新資料後按下儲存。</DialogDescription>
          </DialogHeader>
          {editingRow ? (
            <FormView
              fields={view.form.fields}
              columns={formColumns}
              initialValues={editingRow}
              onSubmit={handleUpdate}
              onCancel={() => setEditingRow(null)}
            />
          ) : null}
        </DialogContent>
      </Dialog>

      <Dialog open={showCreate} onOpenChange={setShowCreate}>
        <DialogContent className={dialogWidthClass}>
          <DialogHeader>
            <DialogTitle>新增 {view.name}</DialogTitle>
            <DialogDescription>填寫資料後按下儲存。</DialogDescription>
          </DialogHeader>
          <FormView
            fields={view.form.fields}
            columns={formColumns}
            onSubmit={handleCreate}
            onCancel={() => setShowCreate(false)}
          />
        </DialogContent>
      </Dialog>
    </DndContext>
  );
}

// ===== Column =====

function KanbanColumn({
  group, rows, titleField, descField, onEdit, onAddRow,
}: {
  group: string;
  rows: RowData[];
  titleField: string;
  descField?: string;
  onEdit?: (row: RowData) => void;
  onAddRow?: () => void;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: group });

  return (
    <div
      ref={setNodeRef}
      className={`w-64 shrink-0 rounded-lg border bg-muted/40 transition-colors ${
        isOver ? 'border-primary/50 bg-primary/5' : ''
      }`}
    >
      {/* Column header */}
      <div className="flex items-center justify-between px-3 py-2.5">
        <span className="text-sm font-medium">{group}</span>
        <Badge variant="secondary" className="text-xs">{rows.length}</Badge>
      </div>

      {/* Cards */}
      <div className="space-y-2 p-2">
        {rows.map(row => (
          <KanbanCard
            key={String(row.id)}
            row={row}
            titleField={titleField}
            descField={descField}
            onEdit={onEdit}
          />
        ))}
      </div>

      {/* Add button */}
      {onAddRow && (
        <div className="p-2">
          <Button
            variant="ghost"
            size="sm"
            className="w-full justify-start text-muted-foreground"
            onClick={onAddRow}
          >
            <Plus className="mr-2 h-4 w-4" />
            新增
          </Button>
        </div>
      )}
    </div>
  );
}

// ===== Card =====

function KanbanCard({
  row, titleField, descField, isDragging = false, onEdit,
}: {
  row: RowData;
  titleField: string;
  descField?: string;
  isDragging?: boolean;
  onEdit?: (row: RowData) => void;
}) {
  const { attributes, listeners, setNodeRef, isDragging: dragging } = useDraggable({
    id: String(row.id),
  });

  const justDragged = useRef(false);
  useEffect(() => {
    if (dragging) justDragged.current = true;
  }, [dragging]);

  const title = String(row[titleField] ?? row.id ?? '');
  const desc = descField ? String(row[descField] ?? '') : '';

  const handleClick = () => {
    if (justDragged.current) {
      justDragged.current = false;
      return;
    }
    onEdit?.(row);
  };

  return (
    <div
      ref={setNodeRef}
      {...listeners}
      {...attributes}
      onClick={handleClick}
      className={`cursor-grab rounded-md border bg-card p-3 shadow-sm transition-opacity active:cursor-grabbing ${
        dragging && !isDragging ? 'opacity-30' : ''
      } ${isDragging ? 'rotate-1 shadow-lg' : ''}`}
    >
      <p className="text-sm font-medium leading-snug">{title}</p>
      {desc && <p className="mt-1 text-xs text-muted-foreground line-clamp-2">{desc}</p>}
    </div>
  );
}
