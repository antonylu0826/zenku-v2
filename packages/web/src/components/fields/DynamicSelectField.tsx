import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../ui/select';
import type { FieldDef } from '../../types';

interface Option {
  value: string;
  label: string;
}

interface Props {
  field: FieldDef;
  value: unknown;
  onChange: (value: unknown) => void;
}

function getAuthHeaders(): Record<string, string> {
  const token = localStorage.getItem('zenku-token');
  return token ? { Authorization: `Bearer ${token}` } : {};
}

export function DynamicSelectField({ field, value, onChange }: Props) {
  const { t } = useTranslation();
  const [options, setOptions] = useState<Option[]>([]);

  const { table, value_field, display_field } = field.source!;

  useEffect(() => {
    const params = new URLSearchParams({ value_field, display_field });
    fetch(`/api/data/${table}/options?${params}`, { headers: getAuthHeaders() })
      .then(r => { if (!r.ok) throw new Error(`HTTP ${r.status}`); return r.json(); })
      .then((data: unknown) => setOptions(Array.isArray(data) ? (data as Option[]) : []))
      .catch(() => setOptions([]));
  }, [table, value_field, display_field]);

  // Radix SelectValue only knows the label when SelectItem is mounted (requires dropdown open).
  // Pass the computed label as children so it shows correctly on controlled pre-set values.
  const selectedLabel = options.find(o => o.value === String(value ?? ''))?.label;

  return (
    <Select value={String(value ?? '')} onValueChange={v => onChange(v)}>
      <SelectTrigger>
        <SelectValue placeholder={field.placeholder || t('relation.placeholder')} />
      </SelectTrigger>
      <SelectContent>
        {options.map(opt => (
          <SelectItem key={opt.value} value={opt.value}>
            {opt.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
