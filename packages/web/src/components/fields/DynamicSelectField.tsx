import { useState, useEffect } from 'react';
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

export function DynamicSelectField({ field, value, onChange }: Props) {
  const [options, setOptions] = useState<Option[]>([]);

  const { table, value_field, display_field } = field.source!;

  useEffect(() => {
    const params = new URLSearchParams({ value_field, display_field });
    fetch(`/api/data/${table}/options?${params}`)
      .then(r => r.json())
      .then((data: Option[]) => setOptions(data))
      .catch(() => setOptions([]));
  }, [table, value_field, display_field]);

  return (
    <Select value={String(value ?? '')} onValueChange={v => onChange(v)}>
      <SelectTrigger>
        <SelectValue placeholder={field.placeholder ?? '請選擇...'} />
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
