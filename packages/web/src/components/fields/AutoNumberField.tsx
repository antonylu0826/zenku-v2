import { Input } from '../ui/input';
import type { FieldInputInnerProps, FieldReadonlyProps } from './registry';

export function AutoNumberField({ field, value }: FieldInputInnerProps) {
  return (
    <Input
      id={field.key}
      value={value != null && value !== '' ? String(value) : ''}
      placeholder="（自動產生）"
      disabled
      className="bg-muted text-muted-foreground"
    />
  );
}

export function AutoNumberReadonly({ value }: FieldReadonlyProps) {
  if (value == null || value === '') return <p className="py-1 text-sm text-muted-foreground">-</p>;
  return <p className="py-1 font-mono text-sm tabular-nums">{String(value)}</p>;
}
