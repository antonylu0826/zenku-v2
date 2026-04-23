import type React from 'react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import type { ColumnDef as TableColumnDef, PaginationState, SortingState, VisibilityState } from '@tanstack/react-table';
import { flexRender, getCoreRowModel, useReactTable } from '@tanstack/react-table';
import { ArrowDown, ArrowUp, ArrowUpDown, Filter, Eye, Pencil, Plus, Search, Trash2 } from 'lucide-react';
import { ApiError, createRow, deleteRow, executeViewAction, getTableData, updateRow } from '../../api';
import type { CustomViewAction, ViewDefinition } from '../../types';
import { resolveAppearance } from '../../types';
import { evaluateAppearanceCondition } from '@zenku/shared';
import type { Filter as FilterCondition } from '@zenku/shared';
import { FilterPanel } from './FilterPanel';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '../ui/alert-dialog';
import { Button } from '../ui/button';
import { Checkbox } from '../ui/checkbox';
import { DynamicIcon } from '../ui/dynamic-icon';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '../ui/dialog';
import { Input } from '../ui/input';
import { Popover, PopoverContent, PopoverTrigger } from '../ui/popover';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../ui/table';
import { toast } from 'sonner';
import { FormView } from './FormView';

interface Props {
  view: ViewDefinition;
  /** Optional FK filter — key=field name, value=the value to filter by */
  filters?: Record<string, string | number>;
  /** Called after create when used inside DetailTable (to inject FK value) */
  onCreateData?: (data: Record<string, unknown>) => Record<string, unknown>;
  /** Parent master record for cross-scope appearance rules */
  masterRecord?: Record<string, unknown>;
}

type RowData = Record<string, unknown>;

export function TableView({ view, filters, onCreateData, masterRecord }: Props) {
  const { t } = useTranslation();
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
  const [rowSelection, setRowSelection] = useState<Record<string, boolean>>({});
  const [advFilters, setAdvFilters] = useState<FilterCondition[]>([]);
  const [showFilterPanel, setShowFilterPanel] = useState(false);
  const [columnVisibility, setColumnVisibility] = useState<VisibilityState>({});

  useEffect(() => {
    setPagination({ pageIndex: 0, pageSize: 20 });
    setSorting([]);
    setSearch('');
    setSearchInput('');
    setRowSelection({});
    setAdvFilters([]);
    setShowFilterPanel(false);
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
        advFilters: advFilters.length ? advFilters : undefined,
      });

      setRows(result.rows);
      setTotal(result.total);
    } catch (error) {
      toast.error(t('table.view.load_data_error'), { description: String(error) });
    } finally {
      setLoading(false);
    }
  }, [pagination.pageIndex, pagination.pageSize, search, sorting, view.table_name, filters, advFilters]);

  useEffect(() => {
    void fetchRows();
  }, [fetchRows]);

  const builtinActions = view.actions.filter((a): a is import('../../types').BuiltinAction => typeof a === 'string');
  const canCreate = builtinActions.includes('create');
  const canEdit = builtinActions.includes('edit');
  const canDelete = builtinActions.includes('delete');

  const listCustomActions = view.actions
    .filter((a): a is CustomViewAction => typeof a === 'object')
    .filter(a => a.context === 'list' || a.context === 'both');

  const [confirmListAction, setConfirmListAction] = useState<{ action: CustomViewAction; row: RowData } | null>(null);

  const handleListCustomAction = useCallback(async (action: CustomViewAction, row: RowData) => {
    if (action.behavior.type === 'navigate') {
      const nav = action.behavior as { type: string; view_id: string; filter_field?: string; filter_value_from?: string };
      const filterVal = nav.filter_value_from ? row[nav.filter_value_from] : undefined;
      const query = nav.filter_field && filterVal !== undefined ? `?filter[${nav.filter_field}]=${String(filterVal)}` : '';
      navigate(`/view/${nav.view_id}${query}`);
      return;
    }
    try {
      await executeViewAction(view.id, action.id, row.id as string | number);
      toast.success(t('table.view.toast_action_success', { action: action.label }));
      void fetchRows();
    } catch (error) {
      toast.error(t('table.view.toast_action_failed', { action: action.label }), { description: String(error) });
    }
  }, [view.id, navigate, fetchRows]);

  const columns = useMemo<TableColumnDef<RowData>[]>(() => {
    const selectColumn: TableColumnDef<RowData> = {
      id: '_select',
      header: ({ table }) => (
        <Checkbox
          checked={table.getIsAllPageRowsSelected()}
          onCheckedChange={v => table.toggleAllPageRowsSelected(!!v)}
          aria-label={t('table.view.select_all')}
        />
      ),
      cell: ({ row }) => (
        <div onClick={e => e.stopPropagation()}>
          <Checkbox
            checked={row.getIsSelected()}
            onCheckedChange={v => row.toggleSelected(!!v)}
            aria-label={t('table.view.select_row')}
          />
        </div>
      ),
      size: 44, minSize: 44, maxSize: 44, enableSorting: false,
    };

    const dataColumns = view.columns.filter(col => !col.hidden_in_table).map(col => ({
      id: col.key,
      accessorFn: (row: RowData) => row[col.key],
      header: col.label,
      cell: ({ getValue, row }: { getValue: () => unknown; row: { original: RowData } }) => {
        const rowData = row.original;
        const appearance = col.appearance?.length
          ? resolveAppearance(col.appearance, rowData)
          : undefined;
        return (
          <CellValue
            value={getValue()}
            colKey={col.key}
            type={col.type}
            row={rowData}
            appearance={appearance}
          />
        );
      },
      enableSorting: col.sortable !== false,
      enableHiding: true,
      size: col.width ?? 180,
      minSize: 120,
      maxSize: 480,
    }));

    if (!(canEdit || canDelete || listCustomActions.length > 0)) {
      return dataColumns;
    }

    const actionsColumn: TableColumnDef<RowData> = {
      id: '_actions',
      header: t('table.view.actions_col'),
      cell: ({ row }) => {
        const data = row.original;
        const visibleCustom = listCustomActions.filter(
          a => !a.visible_when || evaluateAppearanceCondition(a.visible_when, data)
        );
        return (
          <div className="flex items-center justify-end gap-1" onClick={e => e.stopPropagation()}>
            {visibleCustom.map(a => {
              const isEnabled = !a.enabled_when || evaluateAppearanceCondition(a.enabled_when, data);
              return (
                <Button
                  key={a.id}
                  variant={(a.variant === 'warning' ? 'outline' : a.variant) ?? 'outline'}
                  size="sm"
                  disabled={!isEnabled}
                  onClick={() => {
                    if (a.confirm) {
                      setConfirmListAction({ action: a, row: data });
                    } else {
                      void handleListCustomAction(a, data);
                    }
                  }}
                >
                  {a.icon && <DynamicIcon name={a.icon} className="mr-1 h-4 w-4" />}
                  {a.label}
                </Button>
              );
            })}
            {canEdit ? (
              <Button
                variant="ghost"
                size="icon"
                aria-label={t('table.view.edit')}
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
              <Button variant="ghost" size="icon" onClick={() => setDeletingRow(data)} aria-label={t('table.view.delete')}>
                <Trash2 className="h-4 w-4 text-destructive" />
              </Button>
            ) : null}
          </div>
        );
      },
      size: 80 + listCustomActions.length * 64,
      minSize: 70,
      maxSize: 400,
      enableSorting: false,
    };

    return [selectColumn, ...dataColumns, actionsColumn];
  }, [canDelete, canEdit, isMasterDetail, listCustomActions, handleListCustomAction, view.columns]);

  const table = useReactTable({
    data: rows,
    columns,
    state: { sorting, pagination, rowSelection, columnVisibility },
    onSortingChange: setSorting,
    onPaginationChange: setPagination,
    onRowSelectionChange: setRowSelection,
    onColumnVisibilityChange: setColumnVisibility,
    getCoreRowModel: getCoreRowModel(),
    manualSorting: true,
    manualPagination: true,
    pageCount: Math.max(1, Math.ceil(total / pagination.pageSize)),
    columnResizeMode: 'onChange',
    enableRowSelection: true,
  });

  const totalPages = Math.max(1, Math.ceil(total / pagination.pageSize));
  const currentPage = pagination.pageIndex + 1;

  const handleCreate = async (data: Record<string, unknown>) => {
    try {
      const payload = onCreateData ? onCreateData(data) : data;
      await createRow(view.table_name, payload);
      toast.success(t('table.view.toast_save_success'));
      setShowCreate(false);
      void fetchRows();
    } catch (error) {
      const desc = error instanceof ApiError
        ? (error.params?.details || error.params?.detail || error.code)
        : String(error);
      toast.error(t('table.view.toast_create_failed'), { description: desc });
    }
  };

  const handleUpdate = async (data: Record<string, unknown>) => {
    const id = editingRow?.id;
    if (id === undefined || id === null) {
      toast.error(t('table.view.toast_id_not_found'));
      return;
    }

    try {
      await updateRow(view.table_name, id, data);
      toast.success(t('table.view.toast_update_success'));
      setEditingRow(null);
      void fetchRows();
    } catch (error) {
      const desc = error instanceof ApiError
        ? (error.params?.details || error.params?.detail || error.code)
        : String(error);
      toast.error(t('table.view.toast_update_failed'), { description: desc });
    }
  };

  const handleDelete = async () => {
    const id = deletingRow?.id;
    if (id === undefined || id === null) {
      toast.error(t('table.view.toast_id_not_found'));
      return;
    }

    try {
      await deleteRow(view.table_name, id);
      toast.success(t('table.view.toast_delete_success'));
      setDeletingRow(null);
      void fetchRows();
    } catch (error) {
      toast.error(t('table.view.toast_delete_failed'), { description: String(error) });
    }
  };

  const selectedIds = Object.keys(rowSelection)
    .filter(k => rowSelection[k])
    .map(k => rows[Number(k)]?.id)
    .filter((id): id is string | number => id !== undefined);

  const handleBulkDelete = async () => {
    try {
      await Promise.all(selectedIds.map(id => deleteRow(view.table_name, id)));
      toast.success(t('table.view.toast_batch_delete_success', { count: selectedIds.length }));
      setRowSelection({});
      void fetchRows();
    } catch (err) {
      toast.error(t('table.view.toast_batch_delete_failed'), { description: String(err) });
    }
  };

  const visibleFieldCount = view.form.fields.filter(f => !f.hidden_in_form).length;
  const formColumns = (view.form.columns ?? (visibleFieldCount >= 5 ? 2 : 1)) as 1 | 2 | 3 | 4;
  const dialogWidthClass =
    formColumns === 4 ? 'max-w-6xl' : formColumns === 3 ? 'max-w-4xl' : formColumns === 2 ? 'max-w-2xl' : 'max-w-lg';

  return (
    <div className="flex h-full flex-col">
      {selectedIds.length > 0 && (
        <div className="flex items-center gap-3 border-b bg-muted/50 px-6 py-2 text-sm">
          <span className="text-muted-foreground" dangerouslySetInnerHTML={{ __html: t('table.view.selected_count', { count: selectedIds.length }) }} />
          {canDelete && (
            <Button variant="destructive" size="sm" onClick={handleBulkDelete}>
              <Trash2 className="mr-1 h-4 w-4" />{t('table.view.batch_delete')}
            </Button>
          )}
          <Button variant="ghost" size="sm" onClick={() => setRowSelection({})}>{t('table.view.deselect')}</Button>
        </div>
      )}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b px-6 py-3">
        <div className="flex items-center gap-2">
          <div className="relative w-64">
            <Search className="pointer-events-none absolute left-2.5 top-3 h-4 w-4 text-muted-foreground" />
            <Input
              value={searchInput}
              onChange={event => setSearchInput(event.target.value)}
              placeholder={t('table.view.search_placeholder')}
              className="pl-8"
            />
          </div>
          <Button
            variant={showFilterPanel || advFilters.length > 0 ? 'default' : 'outline'}
            onClick={() => setShowFilterPanel(v => !v)}
            className="relative"
          >
            <Filter className="mr-1.5 h-4 w-4" />
            {t('table.filter.button_label')}
            {advFilters.length > 0 && (
              <span className="ml-1.5 inline-flex h-4 w-4 items-center justify-center rounded-full bg-primary-foreground text-[10px] font-bold text-primary">
                {advFilters.length}
              </span>
            )}
          </Button>
        </div>
        <div className="flex items-center gap-2">
          <Select value={String(pagination.pageSize)} onValueChange={v => setPagination({ ...pagination, pageSize: Number(v), pageIndex: 0 })}>
            <SelectTrigger className="w-32">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="20">{t('table.view.page_size_20')}</SelectItem>
              <SelectItem value="50">{t('table.view.page_size_50')}</SelectItem>
              <SelectItem value="100">{t('table.view.page_size_100')}</SelectItem>
            </SelectContent>
          </Select>
          <ColumnVisibilityButton table={table} />
          {canCreate ? (
            <Button onClick={() => isMasterDetail ? navigate(`/view/${view.id}/new`) : setShowCreate(true)}>
              <Plus className="h-4 w-4" />
              {t('table.view.create_button')}
            </Button>
          ) : null}
        </div>
      </div>

      {showFilterPanel && (
        <FilterPanel
          columns={view.columns}
          filters={advFilters}
          onChange={filters => {
            setAdvFilters(filters);
            setPagination(p => ({ ...p, pageIndex: 0 }));
          }}
        />
      )}

      <div className="flex-1 overflow-auto px-6 py-3">
        <div className="rounded-md border">
        <Table style={{ minWidth: table.getCenterTotalSize() }}>
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
                  {t('table.view.loading')}
                </TableCell>
              </TableRow>
            ) : table.getRowModel().rows.length ? (
              table.getRowModel().rows.map(row => (
                <TableRow key={row.id}>
                  {row.getVisibleCells().map(cell => (
                    <TableCell key={cell.id} style={{ width: cell.column.getSize() }}>{flexRender(cell.column.columnDef.cell, cell.getContext())}</TableCell>
                  ))}
                </TableRow>
              ))
            ) : (
              <TableRow>
                <TableCell colSpan={columns.length} className="h-40 text-center text-muted-foreground">
                  {t('table.view.no_matching_data')}
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
        </div>
        <div className="flex items-center justify-end py-3 text-sm text-muted-foreground">
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" disabled={currentPage <= 1} onClick={() => table.setPageIndex(currentPage - 2)}>
              {t('table.view.prev_page')}
            </Button>
            <span>
              {t('table.view.page_info', { current: currentPage, total: totalPages })}
            </span>
            <Button variant="outline" size="sm" disabled={currentPage >= totalPages} onClick={() => table.setPageIndex(currentPage)}>
              {t('table.view.next_page')}
            </Button>
          </div>
        </div>
      </div>

      <Dialog open={showCreate} onOpenChange={setShowCreate}>
        <DialogContent className={dialogWidthClass}>
          <DialogHeader>
            <DialogTitle>{t('table.view.create_dialog_title', { name: view.name })}</DialogTitle>
            <DialogDescription>{t('table.view.create_dialog_desc')}</DialogDescription>
          </DialogHeader>
          <div className="flex-1 min-h-0 overflow-y-auto -mx-6 px-6">
            <FormView fields={view.form.fields} columns={formColumns} masterRecord={masterRecord} onSubmit={handleCreate} onCancel={() => setShowCreate(false)} />
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={Boolean(editingRow)} onOpenChange={open => (!open ? setEditingRow(null) : null)}>
        <DialogContent className={dialogWidthClass}>
          <DialogHeader>
            <DialogTitle>{t('table.view.edit_dialog_title', { name: view.name })}</DialogTitle>
            <DialogDescription>{t('table.view.edit_dialog_desc')}</DialogDescription>
          </DialogHeader>
          {editingRow ? (
            <div className="flex-1 min-h-0 overflow-y-auto -mx-6 px-6">
              <FormView
                fields={view.form.fields}
                columns={formColumns}
                initialValues={editingRow}
                masterRecord={masterRecord}
                onSubmit={handleUpdate}
                onCancel={() => setEditingRow(null)}
              />
            </div>
          ) : null}
        </DialogContent>
      </Dialog>

      <AlertDialog open={Boolean(deletingRow)} onOpenChange={open => (!open ? setDeletingRow(null) : null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('table.view.delete_confirm_title')}</AlertDialogTitle>
            <AlertDialogDescription>{t('table.view.delete_confirm_desc')}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t('table.view.cancel')}</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete}>{t('table.view.delete')}</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={Boolean(confirmListAction)} onOpenChange={open => { if (!open) setConfirmListAction(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{confirmListAction?.action.confirm?.title}</AlertDialogTitle>
            <AlertDialogDescription>{confirmListAction?.action.confirm?.description}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t('common.cancel')}</AlertDialogCancel>
            <AlertDialogAction onClick={() => {
              if (confirmListAction) {
                void handleListCustomAction(confirmListAction.action, confirmListAction.row);
                setConfirmListAction(null);
              }
            }}>
              {t('table.view.confirm')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function ColumnVisibilityButton({ table }: { table: ReturnType<typeof useReactTable<any>> }) {
  const { t } = useTranslation();
  const allColumns = table.getAllColumns().filter(col => col.getCanHide());

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="outline">
          <Eye className="mr-1.5 h-4 w-4" />
          {t('table.view.column_visibility_button')}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-48 p-2">
        {allColumns.map(col => (
          <label key={col.id} className="flex cursor-pointer items-center gap-2 rounded px-2 py-1.5 text-sm hover:bg-muted">
            <Checkbox
              checked={col.getIsVisible()}
              onCheckedChange={v => col.toggleVisibility(!!v)}
            />
            {typeof col.columnDef.header === 'function' ? col.id : col.columnDef.header as string}
          </label>
        ))}
      </PopoverContent>
    </Popover>
  );
}

function CellValue({
  value, colKey, type, row, appearance,
}: {
  value: unknown;
  colKey: string;
  type: string;
  row: RowData;
  appearance?: import('../../types').AppearanceEffect;
}) {
  const { t } = useTranslation();
  const textStyle: React.CSSProperties = {};
  if (appearance?.text_color)  textStyle.color      = appearance.text_color;
  if (appearance?.font_weight) textStyle.fontWeight = appearance.font_weight;
  if (appearance?.bg_color)    textStyle.backgroundColor = appearance.bg_color;

  const hasStyle = Object.keys(textStyle).length > 0;
  const wrap = (node: React.ReactNode) =>
    hasStyle ? <span style={textStyle} className="rounded px-0.5">{node}</span> : <>{node}</>;

  if (type === 'relation') {
    const display = row[`${colKey}__display`];
    const text = display ?? value;
    if (text === null || text === undefined || text === '') return <span className="text-muted-foreground">-</span>;
    return wrap(<span>{String(text)}</span>);
  }

  if (value === null || value === undefined || value === '') {
    return <span className="text-muted-foreground">-</span>;
  }

  switch (type) {
    case 'boolean':
      return wrap(<span>{Boolean(value) ? t('table.view.boolean_yes') : t('table.view.boolean_no')}</span>);

    case 'currency': {
      const num = Number(value);
      return wrap(
        <span>{isFinite(num) ? `$${num.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 2 })}` : String(value)}</span>
      );
    }

    case 'phone':
      return wrap(<a href={`tel:${value}`} className="text-primary hover:underline" onClick={e => e.stopPropagation()}>{String(value)}</a>);

    case 'email':
      return wrap(<a href={`mailto:${value}`} className="text-primary hover:underline" onClick={e => e.stopPropagation()}>{String(value)}</a>);

    case 'url':
      return wrap(
        <a href={String(value)} target="_blank" rel="noreferrer" className="text-primary hover:underline" onClick={e => e.stopPropagation()}>
          {t('table.view.attachment')}
        </a>
      );

    case 'enum':
      return <span className="inline-flex items-center rounded-full bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary">{String(value)}</span>;

    case 'progress': {
      const pct = Math.min(100, Math.max(0, Number(value)));
      return (
        <div className="flex items-center gap-2 min-w-[80px]">
          <div className="h-1.5 flex-1 rounded-full bg-muted overflow-hidden">
            <div className="h-full rounded-full bg-primary transition-all" style={{ width: `${pct}%` }} />
          </div>
          <span className="shrink-0 text-xs tabular-nums text-muted-foreground">{pct}%</span>
        </div>
      );
    }

    case 'rating': {
      const rating = Math.min(5, Math.max(0, Math.round(Number(value))));
      return (
        <span className="inline-flex gap-0.5">
          {Array.from({ length: 5 }, (_, i) => (
            <span key={i} className={i < rating ? 'text-amber-400' : 'text-muted-foreground/30'}>★</span>
          ))}
        </span>
      );
    }

    case 'color': {
      const hex = String(value);
      return (
        <span className="inline-flex items-center gap-1.5">
          <span className="h-4 w-4 shrink-0 rounded-sm border border-border" style={{ backgroundColor: hex }} />
          <span className="text-xs text-muted-foreground">{hex}</span>
        </span>
      );
    }

    case 'file':
    case 'image': {
      let ids: string[] = [];
      try { ids = JSON.parse(String(value)); } catch { ids = [String(value)].filter(Boolean); }
      if (ids.length === 0) return <span className="text-muted-foreground">-</span>;
      return (
        <span className="inline-flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">
          📎 {ids.length}
        </span>
      );
    }

    default:
      return wrap(<span>{String(value)}</span>);
  }
}

function SortIcon({ state }: { state: false | 'asc' | 'desc' }) {
  if (state === 'asc') return <ArrowUp className="h-4 w-4" />;
  if (state === 'desc') return <ArrowDown className="h-4 w-4" />;
  return <ArrowUpDown className="h-4 w-4 text-muted-foreground" />;
}
