import { Progress } from '../ui/progress';
import type { FieldDef } from '../../types';

interface Props {
  field: FieldDef;
  value: unknown;
  onChange: (value: unknown) => void;
  readonly?: boolean;
}

export function ProgressField({ value, onChange, readonly }: Props) {
  const current = Number(value ?? 0);
  const percentage = Math.max(0, Math.min(100, current));

  if (readonly) {
    return (
      <div className="space-y-1">
        <Progress value={percentage} className="h-2" />
        <p className="text-xs text-muted-foreground">{percentage}%</p>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <input
        type="range"
        min="0"
        max="100"
        value={percentage}
        onChange={e => onChange(Number(e.target.value))}
        className="w-full h-2 bg-muted rounded-full appearance-none cursor-pointer [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-4 [&::-webkit-slider-thumb]:h-4 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-primary [&::-moz-range-thumb]:w-4 [&::-moz-range-thumb]:h-4 [&::-moz-range-thumb]:rounded-full [&::-moz-range-thumb]:bg-primary [&::-moz-range-thumb]:border-0"
      />
      <div className="flex items-center justify-between">
        <Progress value={percentage} className="h-2 flex-1 mr-2" />
        <span className="text-sm font-medium w-12 text-right">{percentage}%</span>
      </div>
    </div>
  );
}

export function ProgressReadonly({ value }: { value: unknown }) {
  return <ProgressField field={{} as FieldDef} value={value} onChange={() => {}} readonly />;
}
