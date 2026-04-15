import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import type { ColumnDef as TableColumnDef, PaginationState, SortingState } from '@tanstack/react-table';
import { flexRender, getCoreRowModel, useReactTable } from '@tanstack/react-table';
import { ArrowDown, ArrowUp, ArrowUpDown, Pencil, Plus, Search, Trash2 } from 'lucide-react';
import { createRow, deleteRow, getTableData, updateRow } from '../../api';
import type { ViewDefinition } from '../../types';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '../ui/alert-dialog';
import { Button } from '../ui/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '../ui/dialog';
import { Input } from '../ui/input';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../ui/table';
import { toast } from 'sonner';
import { FormView } from './FormView';

interface Props {
  view: ViewDefinition;
  /** Optional FK filter — key=field name, value=the value to filter by */
  filters?: Record<string, string | number>;
  /** Called after create when used inside DetailTable (to inject FK value) */
  onCreateData?: (data: Record<string, unknown>) => Record<string, unknown>;
}

type RowData = Record<string, unknown>;

export function TableView({ view, filters, onCreateData }: Props) {
  const navigate = useNavigate();
  const isMasterDetail = view.type === 'master-detail';

  const [rows, setRows] = useState<RowData[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [sorting, setSorting] = useState<SortingState>([]);
  const [pagination, setPagination] = useState<PaginationState>({ pageIndex: 0, pageSize: 20 });
  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  const [showCreate, setShowCreate] = useState(false);
  const [editingRow, setEditingRow] = useState<RowData | null>(null);
  const [deletingRow, setDeletingRow] = useState<RowData | null>(null);

  useEffect(() => {
    setPagination({ pageIndex: 0, pageSize: 20 });
    setSorting([]);
    setSearch('');
    setSearchInput('');
  }, [view.id, filters]);

  useEffect(() => {
    const timeout = window.setTimeout(() => {
      setSearch(searchInput.trim());
      setPagination(prev => ({ ...prev, pageIndex: 0 }));
    }, 300);
    return () => window.clearTimeout(timeout);
  }, [searchInput]);

  const fetchRows = useCallback(async () => {
    setLoading(true);
    try {
      const sort = sorting[0];
      const result = await getTableData(view.table_name, {
        page: pagination.pageIndex + 1,
        limit: pagination.pageSize,
        sort: sort?.id,
        order: sort ? (sort.desc ? 'desc' : 'asc') : undefined,
        search: search || undefined,
        filters,
      });

      setRows(result.rows);
      setTotal(result.total);
    } catch (error) {
      toast.error('載入資料失敗', { description: String(error) });
    } finally {
      setLoading(false);
    }
  }, [pagination.pageIndex, pagination.pageSize, search, sorting, view.table_name, filters]);

  useEffect(() => {
    void fetchRows();
  }, [fetchRows]);

  const canCreate = view.actions.includes('create');
  const canEdit = view.actions.includes('edit');
  const canDelete = view.actions.includes('delete');

  const columns = useMemo<TableColumnDef<RowData>[]>(() => {
    const dataColumns = view.columns.map(col => ({
      id: col.key,
      accessorFn: (row: RowData) => row[col.key],
      header: col.label,
      cell: ({ getValue, row }: { getValue: () => unknown; row: { original: RowData } }) => (
            <CellValue value={getValue()} colKey={col.key} type={col.type} row={row.original} />
          ),
      enableSorting: col.sortable !== false,
      size: col.width ?? 180,
      minSize: 120,
      maxSize: 480,
    }));

    if (!(canEdit || canDelete)) {
      return dataColumns;
    }

    const actionsColumn: TableColumnDef<RowData> = {
      id: '_actions',
      header: '操作',
      cell: ({ row }) => {
        const data = row.original;
        return (
          <div className="flex items-center justify-end gap-1" onClick={e => e.stopPropagation()}>
            {canEdit ? (
              <Button
                variant="ghost"
                size="icon"
                aria-label="編輯"
                onClick={() =>
                  isMasterDetail
                    ? navigate(`/view/${view.id}/${data.id}`)
                    : setEditingRow(data)
                }
              >
                <Pencil className="h-4 w-4" />
              </Button>
            ) : null}
            {canDelete ? (
              <Button variant="ghost" size="icon" onClick={() => setDeletingRow(data)} aria-label="刪除">
                <Trash2 className="h-4 w-4 text-destructive" />
              </Button>
            ) : null}
          </div>
        );
      },
      size: 80,
      minSize: 70,
      maxSize: 120,
      enableSorting: false,
    };

    return [...dataColumns, actionsColumn];
  }, [canDelete, canEdit, isMasterDetail, view.columns]);

  const table = useReactTable({
    data: rows,
    columns,
    state: { sorting, pagination },
    onSortingChange: setSorting,
    onPaginationChange: setPagination,
    getCoreRowModel: getCoreRowModel(),
    manualSorting: true,
    manualPagination: true,
    pageCount: Math.max(1, Math.ceil(total / pagination.pageSize)),
    columnResizeMode: 'onChange',
  });

  const totalPages = Math.max(1, Math.ceil(total / pagination.pageSize));
  const currentPage = pagination.pageIndex + 1;
  const pageStart = total === 0 ? 0 : pagination.pageIndex * pagination.pageSize + 1;
  const pageEnd = Math.min(total, pagination.pageIndex * pagination.pageSize + rows.length);

  const handleCreate = async (data: Record<string, unknown>) => {
    try {
      const payload = onCreateData ? onCreateData(data) : data;
      await createRow(view.table_name, payload);
      toast.success('儲存成功');
      setShowCreate(false);
      void fetchRows();
    } catch (error) {
      toast.error('新增失敗', { description: String(error) });
    }
  };

  const handleUpdate = async (data: Record<string, unknown>) => {
    const id = editingRow?.id;
    if (id === undefined || id === null) {
      toast.error('找不到資料識別碼');
      return;
    }

    try {
      await updateRow(view.table_name, id, data);
      toast.success('更新成功');
      setEditingRow(null);
      void fetchRows();
    } catch (error) {
      toast.error('更新失敗', { description: String(error) });
    }
  };

  const handleDelete = async () => {
    const id = deletingRow?.id;
    if (id === undefined || id === null) {
      toast.error('找不到資料識別碼');
      return;
    }

    try {
      await deleteRow(view.table_name, id);
      toast.success('刪除成功');
      setDeletingRow(null);
      void fetchRows();
    } catch (error) {
      toast.error('刪除失敗', { description: String(error) });
    }
  };

  const formColumns = view.form.columns ?? 1;
  const dialogWidthClass =
    formColumns === 3 ? 'max-w-4xl' : formColumns === 2 ? 'max-w-2xl' : 'max-w-lg';

  return (
    <div className="flex h-full flex-col">
      <div className="flex flex-wrap items-center justify-end gap-3 border-b px-6 py-3">
        <div className="flex items-center gap-2">
          <div className="relative w-64">
            <Search className="pointer-events-none absolute left-2.5 top-3 h-4 w-4 text-muted-foreground" />
            <Input
              value={searchInput}
              onChange={event => setSearchInput(event.target.value)}
              placeholder="搜尋文字欄位..."
              className="pl-8"
            />
          </div>
          {canCreate ? (
            <Button onClick={() => isMasterDetail ? navigate(`/view/${view.id}/new`) : setShowCreate(true)}>
              <Plus className="h-4 w-4" />
              新增
            </Button>
          ) : null}
        </div>
      </div>

      <div className="flex-1 overflow-auto">
        <Table>
          <TableHeader className="sticky top-0 z-10 bg-muted/70 backdrop-blur">
            {table.getHeaderGroups().map(headerGroup => (
              <TableRow key={headerGroup.id}>
                {headerGroup.headers.map(header => {
                  const canSort = header.column.getCanSort();
                  return (
                    <TableHead key={header.id} style={{ width: header.getSize() }} className="relative">
                      <div className={canSort ? 'flex cursor-pointer items-center gap-1 select-none' : 'flex items-center'} onClick={canSort ? header.column.getToggleSortingHandler() : undefined}>
                        {header.isPlaceholder ? null : flexRender(header.column.columnDef.header, header.getContext())}
                        {canSort ? <SortIcon state={header.column.getIsSorted()} /> : null}
                      </div>
                      {header.column.getCanResize() ? (
                        <div
                          onMouseDown={header.getResizeHandler()}
                          onTouchStart={header.getResizeHandler()}
                          className="absolute right-0 top-0 h-full w-1 cursor-col-resize select-none bg-border/20 opacity-0 transition hover:opacity-100"
                        />
                      ) : null}
                    </TableHead>
                  );
                })}
              </TableRow>
            ))}
          </TableHeader>

          <TableBody>
            {loading ? (
              <TableRow>
                <TableCell colSpan={columns.length} className="h-40 text-center text-muted-foreground">
                  載入資料中...
                </TableCell>
              </TableRow>
            ) : table.getRowModel().rows.length ? (
              table.getRowModel().rows.map(row => (
                <TableRow key={row.id}>
                  {row.getVisibleCells().map(cell => (
                    <TableCell key={cell.id}>{flexRender(cell.column.columnDef.cell, cell.getContext())}</TableCell>
                  ))}
                </TableRow>
              ))
            ) : (
              <TableRow>
                <TableCell colSpan={columns.length} className="h-40 text-center text-muted-foreground">
                  沒有符合條件的資料
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>

      <div className="flex items-center justify-between border-t px-6 py-3 text-sm text-muted-foreground">
        <span>
          顯示 {pageStart}-{pageEnd} / 共 {total}
        </span>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" disabled={currentPage <= 1} onClick={() => table.setPageIndex(currentPage - 2)}>
            上一頁
          </Button>
          <span>
            第 {currentPage} / {totalPages} 頁
          </span>
          <Button variant="outline" size="sm" disabled={currentPage >= totalPages} onClick={() => table.setPageIndex(currentPage)}>
            下一頁
          </Button>
        </div>
      </div>

      <Dialog open={showCreate} onOpenChange={setShowCreate}>
        <DialogContent className={dialogWidthClass}>
          <DialogHeader>
            <DialogTitle>新增 {view.name}</DialogTitle>
            <DialogDescription>填入欄位資料後儲存。</DialogDescription>
          </DialogHeader>
          <FormView fields={view.form.fields} columns={formColumns} onSubmit={handleCreate} onCancel={() => setShowCreate(false)} />
        </DialogContent>
      </Dialog>

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

      <AlertDialog open={Boolean(deletingRow)} onOpenChange={open => (!open ? setDeletingRow(null) : null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>確認刪除資料？</AlertDialogTitle>
            <AlertDialogDescription>刪除後無法還原。</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>取消</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete}>刪除</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function CellValue({ value, colKey, type, row }: { value: unknown; colKey: string; type: string; row: RowData }) {
  if (type === 'relation') {
    const display = row[`${colKey}__display`];
    const text = display ?? value;
    if (text === null || text === undefined || text === '') return <span className="text-muted-foreground">-</span>;
    return <span>{String(text)}</span>;
  }

  if (value === null || value === undefined || value === '') {
    return <span className="text-muted-foreground">-</span>;
  }

  switch (type) {
    case 'boolean':
      return <span>{Boolean(value) ? '是' : '否'}</span>;

    case 'currency': {
      const num = Number(value);
      return <span>{isFinite(num) ? `$${num.toLocaleString('zh-TW', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}` : String(value)}</span>;
    }

    case 'phone':
      return <a href={`tel:${value}`} className="text-primary hover:underline" onClick={e => e.stopPropagation()}>{String(value)}</a>;

    case 'email':
      return <a href={`mailto:${value}`} className="text-primary hover:underline" onClick={e => e.stopPropagation()}>{String(value)}</a>;

    case 'url':
      return (
        <a href={String(value)} target="_blank" rel="noreferrer" className="text-primary hover:underline" onClick={e => e.stopPropagation()}>
          連結
        </a>
      );

    case 'enum':
      return <span className="inline-flex items-center rounded-full bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary">{String(value)}</span>;

    default:
      return <span>{String(value)}</span>;
  }
}

function SortIcon({ state }: { state: false | 'asc' | 'desc' }) {
  if (state === 'asc') return <ArrowUp className="h-4 w-4" />;
  if (state === 'desc') return <ArrowDown className="h-4 w-4" />;
  return <ArrowUpDown className="h-4 w-4 text-muted-foreground" />;
}
