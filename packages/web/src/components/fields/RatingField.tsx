import { Star } from 'lucide-react';
import type { FieldDef } from '../../types';

interface Props {
  field: FieldDef;
  value: unknown;
  onChange: (value: unknown) => void;
  readonly?: boolean;
}

export function RatingField({ value, onChange, readonly }: Props) {
  const max = 5;
  const current = Number(value ?? 0);

  if (readonly) {
    return (
      <div className="flex gap-1">
        {Array.from({ length: max }).map((_, i) => (
          <Star key={i} className={`h-4 w-4 ${i < current ? 'fill-yellow-400 text-yellow-400' : 'text-muted-foreground'}`} />
        ))}
      </div>
    );
  }

  return (
    <div className="flex gap-1">
      {Array.from({ length: max }).map((_, i) => (
        <button
          key={i}
          type="button"
          onClick={() => onChange(i + 1)}
          className="cursor-pointer focus:outline-none"
        >
          <Star className={`h-5 w-5 transition ${i < current ? 'fill-yellow-400 text-yellow-400' : 'text-muted-foreground hover:text-yellow-300'}`} />
        </button>
      ))}
    </div>
  );
}

export function RatingReadonly({ value }: { value: unknown }) {
  return <RatingField field={{} as FieldDef} value={value} onChange={() => {}} readonly />;
}
