import { Clock } from 'lucide-react';
import type { FieldDef } from '../../types';

interface Props {
  field: FieldDef;
  value: unknown;
  onChange: (value: unknown) => void;
  readonly?: boolean;
}

export function TimeField({ field, value, onChange, readonly }: Props) {
  const time = String(value ?? '');

  if (readonly) {
    return (
      <div className="flex items-center gap-2 text-sm">
        <Clock className="h-4 w-4 text-muted-foreground" />
        <span>{time || '-'}</span>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-2">
      <Clock className="h-4 w-4 text-muted-foreground" />
      <input
        id={field.key}
        type="time"
        value={time}
        onChange={e => onChange(e.target.value)}
        className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
      />
    </div>
  );
}

export function TimeReadonly({ value }: { value: unknown }) {
  return <TimeField field={{} as FieldDef} value={value} onChange={() => {}} readonly />;
}
