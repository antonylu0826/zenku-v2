import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { PaginationState } from '@tanstack/react-table';
import { ChevronLeft, ChevronRight, Plus, Search } from 'lucide-react';
import { getTableData, updateRow, createRow } from '../../api';
import type { ViewDefinition } from '../../types';
import { AuthImage } from '../fields/ImageField';
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
  const { t } = useTranslation();
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
      toast.error(t('common_toast.load_failed'), { description: String(err) });
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
    return <div className="flex h-full items-center justify-center text-sm text-muted-foreground">Gallery configuration is missing</div>;
  }

  const handleUpdate = async (data: Record<string, unknown>) => {
    const id = editingRow?.id;
    if (!id) return;
    try {
      await updateRow(view.table_name, id, data);
      toast.success(t('common_toast.update_success'));
      setEditingRow(null);
      void fetchRows();
    } catch (err) {
      toast.error(t('common_toast.update_failed'), { description: String(err) });
    }
  };

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

  const visibleFieldCount = view.form.fields.filter(f => !f.hidden_in_form).length;
  const formColumns = view.form.columns ?? (visibleFieldCount >= 5 ? 2 : 1);
  const dialogWidthClass = formColumns === 3 ? 'max-w-4xl' : formColumns === 2 ? 'max-w-2xl' : 'max-w-lg';

  const totalPages = Math.max(1, Math.ceil(total / pagination.pageSize));
  const currentPage = pagination.pageIndex + 1;

  const parseImageValue = (imageVal: unknown): { type: 'id'; value: string } | { type: 'url'; value: string } | null => {
    if (!imageVal || imageVal === '') return null;
    let candidate: string | null = null;
    try {
      const parsed = typeof imageVal === 'string' ? JSON.parse(imageVal) : imageVal;
      if (Array.isArray(parsed) && parsed[0]) candidate = String(parsed[0]);
    } catch { /* ignore */ }
    if (!candidate && typeof imageVal === 'string') candidate = imageVal;
    if (!candidate) return null;
    if (candidate.startsWith('http://') || candidate.startsWith('https://') || candidate.startsWith('/')) {
      return { type: 'url', value: candidate };
    }
    return { type: 'id', value: candidate };
  };

  return (
    <div className="flex h-full flex-col">
      {/* Toolbar */}
      <div className="flex items-center justify-between gap-2 border-b px-4 py-2.5">
        <div className="flex flex-1 items-center gap-2">
          <div className="relative w-64">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={searchInput}
              onChange={e => setSearchInput(e.target.value)}
              placeholder={t('table.view.search_placeholder')}
              className="h-9 pl-8"
            />
          </div>
        </div>
        {canCreate && (
          <Button size="sm" onClick={() => setShowCreate(true)}>
            <Plus className="h-3.5 w-3.5" />
            {t('table.view.create_button')}
          </Button>
        )}
      </div>

      {/* Gallery Grid */}
      <div className="flex-1 overflow-auto">
        {loading ? (
          <div className="flex h-full items-center justify-center text-muted-foreground">{t('common.loading')}</div>
        ) : rows.length === 0 ? (
          <div className="flex h-full items-center justify-center text-muted-foreground">{t('common.no_data')}</div>
        ) : (
          <div className="grid grid-cols-2 gap-4 p-4 md:p-6 sm:grid-cols-3 lg:grid-cols-4">
            {rows.map(row => {
              const image = parseImageValue(row[gallery.image_field]);
              const title = String(row[gallery.title_field] || '');
              const subtitle = gallery.subtitle_field ? String(row[gallery.subtitle_field] || '') : '';

              return (
                <div
                  key={String(row.id)}
                  className="group cursor-pointer overflow-hidden rounded-lg border bg-card shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-md"
                  onClick={() => setEditingRow(row)}
                >
                  <div className="flex aspect-square items-center justify-center overflow-hidden bg-muted">
                    {image?.type === 'id' ? (
                      <AuthImage
                        id={image.value}
                        alt={title}
                        className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
                      />
                    ) : image?.type === 'url' ? (
                      <img
                        src={image.value}
                        alt={title}
                        className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
                      />
                    ) : (
                      <div className="h-full w-full bg-muted-foreground/10" />
                    )}
                  </div>
                  <div className="p-3">
                    <p className="truncate text-sm font-medium">{title || '-'}</p>
                    {subtitle && <p className="mt-1 line-clamp-1 text-xs text-muted-foreground">{subtitle}</p>}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Pagination */}
      {!loading && totalPages > 1 && (
        <div className="flex items-center justify-center gap-2 border-t px-4 py-2.5">
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
            {t('table.view.page_info', { current: currentPage, total: totalPages })}
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

      {/* Create Dialog */}
      {canCreate && (
        <Dialog open={showCreate} onOpenChange={setShowCreate}>
          <DialogContent className={dialogWidthClass}>
            <DialogHeader>
              <DialogTitle>{t('table.view.create_dialog_title', { name: view.name })}</DialogTitle>
              <DialogDescription>{t('table.view.create_dialog_desc')}</DialogDescription>
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
