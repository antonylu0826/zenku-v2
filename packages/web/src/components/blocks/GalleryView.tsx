import { useCallback, useEffect, useState } from 'react';
import type { PaginationState } from '@tanstack/react-table';
import { ChevronLeft, ChevronRight, Plus, Search } from 'lucide-react';
import { getTableData, updateRow, createRow } from '../../api';
import type { ViewDefinition } from '../../types';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '../ui/dialog';
import { toast } from 'sonner';
import { FormView } from './FormView';

interface Props {
  view: ViewDefinition;
}

type RowData = Record<string, unknown>;

export function GalleryView({ view }: Props) {
  const gallery = view.gallery;
  const canCreate = view.actions?.includes('create');

  const [rows, setRows] = useState<RowData[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [pagination, setPagination] = useState<PaginationState>({ pageIndex: 0, pageSize: 20 });
  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  const [showCreate, setShowCreate] = useState(false);
  const [editingRow, setEditingRow] = useState<RowData | null>(null);

  const fetchRows = useCallback(async () => {
    setLoading(true);
    try {
      const result = await getTableData(view.table_name, {
        page: pagination.pageIndex + 1,
        limit: pagination.pageSize,
        search,
      });
      setRows(result.rows);
      setTotal(result.total);
    } catch (err) {
      toast.error('載入失敗', { description: String(err) });
    } finally {
      setLoading(false);
    }
  }, [view.table_name, pagination, search]);

  useEffect(() => {
    void fetchRows();
  }, [fetchRows]);

  useEffect(() => {
    const timeout = window.setTimeout(() => setSearch(searchInput.trim()), 300);
    return () => window.clearTimeout(timeout);
  }, [searchInput]);

  useEffect(() => {
    setPagination({ pageIndex: 0, pageSize: 20 });
    setSearch('');
    setSearchInput('');
  }, [view.id]);

  if (!gallery) {
    return <div className="flex h-full items-center justify-center text-sm text-muted-foreground">Gallery 設定缺失</div>;
  }

  const handleUpdate = async (data: Record<string, unknown>) => {
    const id = editingRow?.id;
    if (!id) return;
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
      await createRow(view.table_name, data);
      toast.success('新增成功');
      setShowCreate(false);
      void fetchRows();
    } catch (err) {
      toast.error('新增失敗', { description: String(err) });
    }
  };

  const visibleFieldCount = view.form.fields.filter(f => !f.hidden_in_form).length;
  const formColumns = view.form.columns ?? (visibleFieldCount >= 5 ? 2 : 1);
  const dialogWidthClass = formColumns === 3 ? 'max-w-4xl' : formColumns === 2 ? 'max-w-2xl' : 'max-w-lg';

  const totalPages = Math.max(1, Math.ceil(total / pagination.pageSize));
  const currentPage = pagination.pageIndex + 1;

  const getImageUrl = (imageVal: unknown): string | null => {
    if (!imageVal) return null;
    if (Array.isArray(imageVal)) {
      const firstItem = imageVal[0];
      return firstItem ? String(firstItem) : null;
    }
    const strVal = String(imageVal);
    return strVal ? strVal : null;
  };

  return (
    <div className="flex h-full flex-col">
      {/* Toolbar */}
      <div className="flex items-center justify-between gap-3 border-b px-6 py-3">
        <div className="flex items-center gap-2 flex-1">
          <div className="relative w-64">
            <Search className="pointer-events-none absolute left-2.5 top-3 h-4 w-4 text-muted-foreground" />
            <Input
              value={searchInput}
              onChange={e => setSearchInput(e.target.value)}
              placeholder="搜尋..."
              className="pl-8"
            />
          </div>
        </div>
        {canCreate && (
          <Button onClick={() => setShowCreate(true)}>
            <Plus className="h-4 w-4" />
            新增
          </Button>
        )}
      </div>

      {/* Gallery Grid */}
      <div className="flex-1 overflow-auto">
        {loading ? (
          <div className="flex h-full items-center justify-center text-muted-foreground">載入中...</div>
        ) : rows.length === 0 ? (
          <div className="flex h-full items-center justify-center text-muted-foreground">無資料</div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4 p-6">
            {rows.map(row => {
              const imageUrl = getImageUrl(row[gallery.image_field]);
              const title = String(row[gallery.title_field] || '');
              const subtitle = gallery.subtitle_field ? String(row[gallery.subtitle_field] || '') : '';

              return (
                <div
                  key={String(row.id)}
                  className="group rounded-lg border bg-card overflow-hidden cursor-pointer hover:shadow-md transition"
                  onClick={() => setEditingRow(row)}
                >
                  <div className="aspect-square bg-muted overflow-hidden flex items-center justify-center">
                    {imageUrl ? (
                      <img
                        src={imageUrl}
                        alt={title}
                        className="w-full h-full object-cover group-hover:scale-105 transition"
                      />
                    ) : (
                      <div className="w-full h-full bg-muted-foreground/10" />
                    )}
                  </div>
                  <div className="p-3">
                    <p className="font-medium truncate text-sm">{title || '-'}</p>
                    {subtitle && <p className="text-xs text-muted-foreground line-clamp-1 mt-1">{subtitle}</p>}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Pagination */}
      {!loading && totalPages > 1 && (
        <div className="flex items-center justify-center gap-2 border-t px-6 py-3">
          <Button
            variant="outline"
            size="icon"
            className="h-8 w-8"
            disabled={currentPage === 1}
            onClick={() => setPagination(p => ({ ...p, pageIndex: Math.max(0, p.pageIndex - 1) }))}
          >
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <span className="text-sm text-muted-foreground min-w-max">
            第 {currentPage} / {totalPages} 頁
          </span>
          <Button
            variant="outline"
            size="icon"
            className="h-8 w-8"
            disabled={currentPage >= totalPages}
            onClick={() => setPagination(p => ({ ...p, pageIndex: Math.min(totalPages - 1, p.pageIndex + 1) }))}
          >
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      )}

      {/* Edit Dialog */}
      <Dialog open={Boolean(editingRow)} onOpenChange={open => (!open ? setEditingRow(null) : null)}>
        <DialogContent className={dialogWidthClass}>
          <DialogHeader>
            <DialogTitle>編輯 {view.name}</DialogTitle>
            <DialogDescription>更新資料後按下儲存。</DialogDescription>
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

      {/* Create Dialog */}
      {canCreate && (
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
      )}
    </div>
  );
}
