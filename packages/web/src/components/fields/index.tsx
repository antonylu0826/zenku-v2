import { Input } from '../ui/input';
import { Textarea } from '../ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../ui/select';
import { Checkbox } from '../ui/checkbox';
import { Label } from '../ui/label';
import { RelationField } from './RelationField';
import { DynamicSelectField } from './DynamicSelectField';
import { ComputedField } from './ComputedField';
import { DatePickerField } from './DatePickerField';
import type { FieldDef } from '../../types';

export interface FieldInputProps {
  field: FieldDef;
  value: unknown;
  /** 整個表單的目前值（計算欄位依賴追蹤用） */
  formValues: Record<string, unknown>;
  onChange: (value: unknown) => void;
}

export function FieldInput({ field, value, formValues, onChange }: FieldInputProps) {
  const id = field.key;
  const stringValue = String(value ?? '');
  // 計算欄位優先（不論 type）
  if (field.computed) {
    return <ComputedField field={field} formValues={formValues} onChange={onChange} />;
  }

  // 關聯欄位（搜尋式下拉）
  if (field.type === 'relation' && field.relation) {
    return <RelationField field={field} value={value} onChange={onChange} />;
  }

  // 動態下拉（select + source）
  if (field.type === 'select' && field.source) {
    return <DynamicSelectField field={field} value={value} onChange={onChange} />;
  }

  // 靜態下拉
  if (field.type === 'select') {
    return (
      <Select value={stringValue} onValueChange={v => onChange(v)}>
        <SelectTrigger id={id}>
          <SelectValue placeholder={field.placeholder ?? '請選擇...'} />
        </SelectTrigger>
        <SelectContent>
          {(field.options ?? []).map(opt => (
            <SelectItem key={opt} value={opt}>{opt}</SelectItem>
          ))}
        </SelectContent>
      </Select>
    );
  }

  switch (field.type) {
    case 'textarea':
      return (
        <Textarea
          id={id}
          value={stringValue}
          placeholder={field.placeholder}
          onChange={e => onChange(e.target.value)}
          className="min-h-24"
        />
      );

    case 'boolean':
      return (
        <div className="flex items-center gap-2">
          <Checkbox
            id={id}
            checked={Boolean(value)}
            onCheckedChange={checked => onChange(checked === true)}
          />
          <Label htmlFor={id} className="cursor-pointer font-normal">是</Label>
        </div>
      );

    case 'number':
    case 'currency':
      return (
        <Input
          id={id}
          type="number"
          value={stringValue}
          placeholder={field.placeholder}
          onChange={e => onChange(e.target.value === '' ? '' : Number(e.target.value))}
        />
      );

    case 'date':
      return <DatePickerField value={value} onChange={onChange} placeholder={field.placeholder} />;

    case 'email':
      return (
        <Input
          id={id}
          type="email"
          value={stringValue}
          placeholder={field.placeholder}
          onChange={e => onChange(e.target.value)}
        />
      );

    case 'url':
      return (
        <Input
          id={id}
          type="url"
          value={stringValue}
          placeholder={field.placeholder}
          onChange={e => onChange(e.target.value)}
        />
      );

    case 'phone':
      return (
        <Input
          id={id}
          type="tel"
          value={stringValue}
          placeholder={field.placeholder}
          onChange={e => onChange(e.target.value)}
        />
      );

    default:
      return (
        <Input
          id={id}
          value={stringValue}
          placeholder={field.placeholder}
          onChange={e => onChange(e.target.value)}
        />
      );
  }
}
