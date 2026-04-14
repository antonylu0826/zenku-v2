import { useCallback, useEffect, useState } from 'react';
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
import { toast } from 'sonner';
import { getTableData, updateRow } from '../../api';
import type { ViewDefinition } from '../../types';
import { Badge } from '../ui/badge';

interface Props {
  view: ViewDefinition;
}

type RowData = Record<string, unknown>;

export function KanbanView({ view }: Props) {
  const kanban = view.kanban;
  const [rows, setRows] = useState<RowData[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeRow, setActiveRow] = useState<RowData | null>(null);

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
    const row = rows.find(r => r.id === event.active.id);
    setActiveRow(row ?? null);
  };

  const handleDragEnd = async (event: DragEndEvent) => {
    setActiveRow(null);
    const { active, over } = event;
    if (!over) return;

    const draggedId = active.id;
    const targetGroup = String(over.id);
    const draggedRow = rows.find(r => r.id === draggedId);
    if (!draggedRow || draggedRow[groupField] === targetGroup) return;

    // Optimistic update
    setRows(prev => prev.map(r => r.id === draggedId ? { ...r, [groupField]: targetGroup } : r));

    try {
      await updateRow(view.table_name, String(draggedId), { [groupField]: targetGroup });
    } catch (err) {
      toast.error('更新失敗', { description: String(err) });
      void fetchRows(); // revert
    }
  };

  if (loading) {
    return <div className="flex h-full items-center justify-center text-sm text-muted-foreground">載入中...</div>;
  }

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
          />
        ))}
      </div>

      <DragOverlay>
        {activeRow ? (
          <KanbanCard row={activeRow} titleField={titleField} descField={descField} isDragging />
        ) : null}
      </DragOverlay>
    </DndContext>
  );
}

// ===== Column =====

function KanbanColumn({
  group, rows, titleField, descField,
}: {
  group: string;
  rows: RowData[];
  titleField: string;
  descField?: string;
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
          />
        ))}
      </div>
    </div>
  );
}

// ===== Card =====

function KanbanCard({
  row, titleField, descField, isDragging = false,
}: {
  row: RowData;
  titleField: string;
  descField?: string;
  isDragging?: boolean;
}) {
  const { attributes, listeners, setNodeRef, isDragging: dragging } = useDraggable({
    id: String(row.id),
  });

  const title = String(row[titleField] ?? row.id ?? '');
  const desc = descField ? String(row[descField] ?? '') : '';

  return (
    <div
      ref={setNodeRef}
      {...listeners}
      {...attributes}
      className={`cursor-grab rounded-md border bg-card p-3 shadow-sm transition-opacity active:cursor-grabbing ${
        dragging && !isDragging ? 'opacity-30' : ''
      } ${isDragging ? 'rotate-1 shadow-lg' : ''}`}
    >
      <p className="text-sm font-medium leading-snug">{title}</p>
      {desc && <p className="mt-1 text-xs text-muted-foreground line-clamp-2">{desc}</p>}
    </div>
  );
}
