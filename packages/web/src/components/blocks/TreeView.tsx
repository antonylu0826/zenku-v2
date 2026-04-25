import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ChevronDown, ChevronRight, ChevronsDownUp, ChevronsUpDown, Pencil, Plus, Search } from 'lucide-react';
import { createRow, getTableData, updateRow } from '../../api';
import type { ViewDefinition } from '../../types';
import { Button } from '../ui/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '../ui/dialog';
import { DynamicIcon } from '../ui/dynamic-icon';
import { Input } from '../ui/input';
import { toast } from 'sonner';
import { FormView } from './FormView';

type RowData = Record<string, unknown>;

interface TreeNode {
  data: RowData;
  children: TreeNode[];
}

function buildTree(rows: RowData[], parentField: string): TreeNode[] {
  const nodeMap = new Map<string | number, TreeNode>();
  for (const row of rows) {
    nodeMap.set(row.id as string | number, { data: row, children: [] });
  }
  const roots: TreeNode[] = [];
  for (const row of rows) {
    const parentId = row[parentField] as string | number | null | undefined;
    const node = nodeMap.get(row.id as string | number)!;
    if (parentId != null && nodeMap.has(parentId)) {
      nodeMap.get(parentId)!.children.push(node);
    } else {
      roots.push(node);
    }
  }
  return roots;
}

function collectAllIds(nodes: TreeNode[]): Set<string | number> {
  const ids = new Set<string | number>();
  function walk(list: TreeNode[]) {
    for (const n of list) {
      if (n.children.length > 0) {
        ids.add(n.data.id as string | number);
        walk(n.children);
      }
    }
  }
  walk(nodes);
  return ids;
}

interface Props {
  view: ViewDefinition;
}

export function TreeView({ view }: Props) {
  const { t } = useTranslation();
  const treeConfig = view.tree;
  const builtinActions = view.actions.filter((a): a is import('../../types').BuiltinAction => typeof a === 'string');
  const canCreate = builtinActions.includes('create');
  const canEdit = builtinActions.includes('edit');

  const [rows, setRows] = useState<RowData[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  const [expanded, setExpanded] = useState<Set<string | number>>(new Set());
  const [editingRow, setEditingRow] = useState<RowData | null>(null);
  // undefined = closed, null = create root, string|number = create child of that id
  const [creatingParentId, setCreatingParentId] = useState<string | number | null | undefined>(undefined);

  const fetchRows = useCallback(async () => {
    setLoading(true);
    try {
      const result = await getTableData(view.table_name, {
        page: 1,
        limit: 2000,
        search: search || undefined,
      });
      setRows(result.rows);
    } catch (err) {
      toast.error(t('common_toast.load_failed'), { description: String(err) });
    } finally {
      setLoading(false);
    }
  }, [view.table_name, search, t]);

  useEffect(() => { void fetchRows(); }, [fetchRows]);

  useEffect(() => {
    const timeout = window.setTimeout(() => setSearch(searchInput.trim()), 300);
    return () => window.clearTimeout(timeout);
  }, [searchInput]);

  useEffect(() => {
    setSearch('');
    setSearchInput('');
    setExpanded(new Set());
  }, [view.id]);

  if (!treeConfig) {
    return (
      <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
        {t('tree.view.missing_config')}
      </div>
    );
  }

  const treeNodes = buildTree(rows, treeConfig.parent_field);

  const handleToggle = (id: string | number) => {
    setExpanded(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const handleExpandAll = () => setExpanded(collectAllIds(treeNodes));
  const handleCollapseAll = () => setExpanded(new Set());

  const handleCreate = async (data: Record<string, unknown>) => {
    const payload = creatingParentId !== null && creatingParentId !== undefined
      ? { ...data, [treeConfig.parent_field]: creatingParentId }
      : data;
    try {
      await createRow(view.table_name, payload);
      toast.success(t('common_toast.create_success'));
      setCreatingParentId(undefined);
      if (creatingParentId != null) {
        setExpanded(prev => new Set([...prev, creatingParentId]));
      }
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

  const visibleFieldCount = view.form.fields.filter(f => !f.hidden_in_form).length;
  const formColumns = view.form.columns ?? (visibleFieldCount >= 5 ? 2 : 1);
  const dialogWidthClass = formColumns === 3 ? 'max-w-4xl' : formColumns === 2 ? 'max-w-2xl' : 'max-w-lg';

  return (
    <div className="flex h-full flex-col">
      {/* Toolbar */}
      <div className="flex items-center justify-between gap-3 border-b px-6 py-3">
        <div className="flex items-center gap-2">
          <div className="relative w-64">
            <Search className="pointer-events-none absolute left-2.5 top-3 h-4 w-4 text-muted-foreground" />
            <Input
              value={searchInput}
              onChange={e => setSearchInput(e.target.value)}
              placeholder={t('table.view.search_placeholder')}
              className="pl-8"
            />
          </div>
          <Button variant="ghost" size="icon" title={t('tree.view.expand_all')} onClick={handleExpandAll}>
            <ChevronsUpDown className="h-4 w-4" />
          </Button>
          <Button variant="ghost" size="icon" title={t('tree.view.collapse_all')} onClick={handleCollapseAll}>
            <ChevronsDownUp className="h-4 w-4" />
          </Button>
        </div>
        {canCreate && (
          <Button onClick={() => setCreatingParentId(null)}>
            <Plus className="h-4 w-4" />
            {t('tree.view.add_root')}
          </Button>
        )}
      </div>

      {/* Tree content */}
      <div className="flex-1 overflow-auto px-2 py-2">
        {loading ? (
          <div className="flex h-full items-center justify-center text-muted-foreground text-sm">
            {t('common.loading')}
          </div>
        ) : treeNodes.length === 0 ? (
          <div className="flex h-full items-center justify-center text-muted-foreground text-sm">
            {t('common.no_data')}
          </div>
        ) : (
          treeNodes.map(node => (
            <TreeNodeRow
              key={String(node.data.id)}
              node={node}
              depth={0}
              expanded={expanded}
              onToggle={handleToggle}
              onEdit={setEditingRow}
              onAddChild={row => setCreatingParentId(row.id as string | number)}
              labelField={treeConfig.label_field}
              iconField={treeConfig.icon_field}
              canEdit={canEdit}
              canCreate={canCreate}
            />
          ))
        )}
      </div>

      {/* Edit Dialog */}
      <Dialog open={Boolean(editingRow)} onOpenChange={open => { if (!open) setEditingRow(null); }}>
        <DialogContent className={dialogWidthClass}>
          <DialogHeader>
            <DialogTitle>{t('table.view.edit_dialog_title', { name: view.name })}</DialogTitle>
            <DialogDescription>{t('table.view.edit_dialog_desc')}</DialogDescription>
          </DialogHeader>
          {editingRow && (
            <div className="flex-1 min-h-0 overflow-y-auto -mx-6 px-6">
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

      {/* Create Dialog */}
      <Dialog open={creatingParentId !== undefined} onOpenChange={open => { if (!open) setCreatingParentId(undefined); }}>
        <DialogContent className={dialogWidthClass}>
          <DialogHeader>
            <DialogTitle>{t('table.view.create_dialog_title', { name: view.name })}</DialogTitle>
            <DialogDescription>{t('table.view.create_dialog_desc')}</DialogDescription>
          </DialogHeader>
          <div className="flex-1 min-h-0 overflow-y-auto -mx-6 px-6">
            <FormView
              fields={view.form.fields}
              columns={formColumns}
              onSubmit={handleCreate}
              onCancel={() => setCreatingParentId(undefined)}
            />
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function TreeNodeRow({
  node, depth, expanded, onToggle, onEdit, onAddChild, labelField, iconField, canEdit, canCreate,
}: {
  node: TreeNode;
  depth: number;
  expanded: Set<string | number>;
  onToggle: (id: string | number) => void;
  onEdit: (row: RowData) => void;
  onAddChild: (row: RowData) => void;
  labelField: string;
  iconField?: string;
  canEdit: boolean;
  canCreate: boolean;
}) {
  const { t } = useTranslation();
  const id = node.data.id as string | number;
  const isExpanded = expanded.has(id);
  const hasChildren = node.children.length > 0;
  const label = String(node.data[labelField] ?? '-');
  const iconName = iconField ? String(node.data[iconField] ?? '') : '';

  return (
    <>
      <div
        className="flex items-center gap-1 rounded-md hover:bg-accent py-0.5 pr-1 group select-none"
        style={{ paddingLeft: `${depth * 20 + 4}px` }}
      >
        {/* Expand toggle */}
        <Button
          variant="ghost"
          size="icon"
          className="h-6 w-6 shrink-0 text-muted-foreground hover:text-foreground"
          disabled={!hasChildren}
          onClick={() => onToggle(id)}
        >
          {hasChildren
            ? isExpanded
              ? <ChevronDown className="h-3.5 w-3.5" />
              : <ChevronRight className="h-3.5 w-3.5" />
            : null
          }
        </Button>

        {/* Node icon */}
        {iconName && (
          <DynamicIcon name={iconName} className="h-4 w-4 shrink-0 text-muted-foreground" />
        )}

        {/* Label */}
        <span className="flex-1 text-sm truncate py-1">{label}</span>

        {/* Child count */}
        {hasChildren && (
          <span className="text-xs text-muted-foreground tabular-nums">{node.children.length}</span>
        )}

        {/* Hover actions */}
        <div className="hidden group-hover:flex items-center">
          {canCreate && (
            <Button
              variant="ghost"
              size="icon"
              className="h-6 w-6"
              title={t('tree.view.add_child')}
              onClick={() => onAddChild(node.data)}
            >
              <Plus className="h-3.5 w-3.5" />
            </Button>
          )}
          {canEdit && (
            <Button
              variant="ghost"
              size="icon"
              className="h-6 w-6"
              title={t('tree.view.edit')}
              onClick={() => onEdit(node.data)}
            >
              <Pencil className="h-3.5 w-3.5" />
            </Button>
          )}
        </div>
      </div>

      {/* Children */}
      {isExpanded && node.children.map(child => (
        <TreeNodeRow
          key={String(child.data.id)}
          node={child}
          depth={depth + 1}
          expanded={expanded}
          onToggle={onToggle}
          onEdit={onEdit}
          onAddChild={onAddChild}
          labelField={labelField}
          iconField={iconField}
          canEdit={canEdit}
          canCreate={canCreate}
        />
      ))}
    </>
  );
}
