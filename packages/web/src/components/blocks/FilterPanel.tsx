import { Plus, Trash2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../ui/select';
import type { ColumnDef } from '../../types';
import type { Filter, FilterOperator } from '@zenku/shared';

interface Props {
  columns: ColumnDef[];
  filters: Filter[];
  onChange: (filters: Filter[]) => void;
}

type FieldType = ColumnDef['type'];

function getOperatorsByType(t: (key: string) => string): Record<string, { value: FilterOperator; label: string }[]> {
  const op = (key: string) => t(`table.filter.operators.${key}`);
  return {
    text: [
      { value: 'contains',     label: op('contains') },
      { value: 'not_contains', label: op('not_contains') },
      { value: 'eq',           label: op('eq') },
      { value: 'neq',          label: op('neq') },
      { value: 'is_empty',     label: op('is_empty') },
      { value: 'is_not_empty', label: op('is_not_empty') },
    ],
    textarea: [
      { value: 'contains',     label: op('contains') },
      { value: 'not_contains', label: op('not_contains') },
      { value: 'is_empty',     label: op('is_empty') },
      { value: 'is_not_empty', label: op('is_not_empty') },
    ],
    number: [
      { value: 'eq',           label: op('eq') },
      { value: 'neq',          label: op('neq') },
      { value: 'gt',           label: op('gt') },
      { value: 'gte',          label: op('gte') },
      { value: 'lt',           label: op('lt') },
      { value: 'lte',          label: op('lte') },
      { value: 'is_empty',     label: op('is_empty') },
      { value: 'is_not_empty', label: op('is_not_empty') },
    ],
    currency: [
      { value: 'eq',           label: op('eq') },
      { value: 'neq',          label: op('neq') },
      { value: 'gt',           label: op('gt') },
      { value: 'gte',          label: op('gte') },
      { value: 'lt',           label: op('lt') },
      { value: 'lte',          label: op('lte') },
      { value: 'is_empty',     label: op('is_empty') },
      { value: 'is_not_empty', label: op('is_not_empty') },
    ],
    date: [
      { value: 'eq',           label: op('eq') },
      { value: 'neq',          label: op('neq') },
      { value: 'gt',           label: op('gt_date') },
      { value: 'gte',          label: op('gte_date') },
      { value: 'lt',           label: op('lt_date') },
      { value: 'lte',          label: op('lte_date') },
      { value: 'is_empty',     label: op('is_empty') },
      { value: 'is_not_empty', label: op('is_not_empty') },
    ],
    datetime: [
      { value: 'eq',           label: op('eq') },
      { value: 'neq',          label: op('neq') },
      { value: 'gt',           label: op('gt_date') },
      { value: 'gte',          label: op('gte_date') },
      { value: 'lt',           label: op('lt_date') },
      { value: 'lte',          label: op('lte_date') },
      { value: 'is_empty',     label: op('is_empty') },
      { value: 'is_not_empty', label: op('is_not_empty') },
    ],
    boolean: [
      { value: 'eq',  label: op('eq') },
      { value: 'neq', label: op('neq') },
    ],
    select: [
      { value: 'eq',           label: op('eq') },
      { value: 'neq',          label: op('neq') },
      { value: 'is_empty',     label: op('is_empty') },
      { value: 'is_not_empty', label: op('is_not_empty') },
    ],
  };
}

function getOperators(type: FieldType, operatorsByType: Record<string, { value: FilterOperator; label: string }[]>) {
  return operatorsByType[type] ?? operatorsByType['text'];
}

function needsValue(op: FilterOperator): boolean {
  return op !== 'is_empty' && op !== 'is_not_empty';
}

function defaultOperator(type: FieldType, operatorsByType: Record<string, { value: FilterOperator; label: string }[]>): FilterOperator {
  const ops = getOperators(type, operatorsByType);
  return ops[0]?.value ?? 'eq';
}

export function FilterPanel({ columns, filters, onChange }: Props) {
  const { t } = useTranslation();
  const filterableColumns = columns.filter(c => !c.hidden_in_table);
  const operatorsByType = getOperatorsByType(t);

  const addFilter = () => {
    const firstCol = filterableColumns[0];
    if (!firstCol) return;
    onChange([...filters, { field: firstCol.key, operator: defaultOperator(firstCol.type, operatorsByType), value: '' }]);
  };

  const removeFilter = (index: number) => {
    onChange(filters.filter((_, i) => i !== index));
  };

  const updateFilter = (index: number, patch: Partial<Filter>) => {
    onChange(filters.map((f, i) => {
      if (i !== index) return f;
      const updated = { ...f, ...patch };
      // If operator changed to one that needs no value, reset value
      if (patch.operator && !needsValue(patch.operator)) updated.value = '';
      // If field changed, reset operator and value
      if (patch.field) {
        const newCol = filterableColumns.find(c => c.key === patch.field);
        updated.operator = newCol ? defaultOperator(newCol.type, operatorsByType) : 'eq';
        updated.value = '';
      }
      return updated;
    }));
  };

  if (filters.length === 0) {
    return (
      <div className="flex items-center gap-3 border-b bg-muted/30 px-6 py-2">
        <span className="text-xs text-muted-foreground">{t('table.filter.no_filters')}</span>
        <Button variant="ghost" size="sm" onClick={addFilter} disabled={filterableColumns.length === 0}>
          <Plus className="mr-1 h-3.5 w-3.5" />{t('table.filter.add_condition')}
        </Button>
      </div>
    );
  }

  return (
    <div className="border-b bg-muted/30 px-6 py-3 space-y-2">
      {filters.map((f, i) => {
        const col = filterableColumns.find(c => c.key === f.field) ?? filterableColumns[0];
        const operators = col ? getOperators(col.type, operatorsByType) : operatorsByType['text'];
        const showValue = needsValue(f.operator);

        return (
          <div key={i} className="flex items-center gap-2">
            {/* Field */}
            <Select value={f.field} onValueChange={v => updateFilter(i, { field: v })}>
              <SelectTrigger className="w-36 h-8 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {filterableColumns.map(c => (
                  <SelectItem key={c.key} value={c.key}>{c.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>

            {/* Operator */}
            <Select value={f.operator} onValueChange={v => updateFilter(i, { operator: v as FilterOperator })}>
              <SelectTrigger className="w-32 h-8 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {operators.map(op => (
                  <SelectItem key={op.value} value={op.value}>{op.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>

            {/* Value */}
            {showValue ? (
              col?.type === 'select' && col.options?.length ? (
                <Select value={String(f.value ?? '')} onValueChange={v => updateFilter(i, { value: v })}>
                  <SelectTrigger className="w-40 h-8 text-xs">
                    <SelectValue placeholder={t('table.filter.input_placeholder')} />
                  </SelectTrigger>
                  <SelectContent>
                    {col.options.map(opt => (
                      <SelectItem key={opt} value={opt}>{opt}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              ) : (
                <Input
                  className="h-8 text-xs w-40"
                  placeholder={t('table.filter.input_placeholder')}
                  value={String(f.value ?? '')}
                  onChange={e => updateFilter(i, { value: e.target.value })}
                />
              )
            ) : (
              <div className="w-40" />
            )}

            <Button variant="ghost" size="icon" className="h-8 w-8 shrink-0" onClick={() => removeFilter(i)}>
              <Trash2 className="h-3.5 w-3.5 text-muted-foreground" />
            </Button>
          </div>
        );
      })}

      <div className="flex items-center gap-2 pt-1">
        <Button variant="ghost" size="sm" onClick={addFilter}>
          <Plus className="mr-1 h-3.5 w-3.5" />{t('table.filter.add_condition')}
        </Button>
        <Button variant="ghost" size="sm" className="text-muted-foreground" onClick={() => onChange([])}>
          {t('table.filter.clear_all')}
        </Button>
      </div>
    </div>
  );
}
