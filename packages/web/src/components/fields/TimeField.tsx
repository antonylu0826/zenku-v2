import { Popover, PopoverContent, PopoverTrigger } from '../ui/popover';
import { Button } from '../ui/button';
import { TimePicker } from './TimePicker';
import { cn } from '@/lib/utils';
import { Clock } from 'lucide-react';
import type { FieldDef } from '../../types';

interface Props {
  field: FieldDef;
  value: unknown;
  onChange: (value: unknown) => void;
  readonly?: boolean;
}

export function TimeField({ value, onChange, readonly }: Props) {
  const time = String(value ?? '00:00');

  if (readonly) {
    return (
      <div className="flex items-center gap-2 text-sm">
        <Clock className="h-4 w-4 text-muted-foreground" />
        <span>{time || '-'}</span>
      </div>
    );
  }

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          className={cn(
            "w-full justify-between text-left font-normal h-10 px-3",
            !value && "text-muted-foreground"
          )}
        >
          {time || "選擇時間"}
          <Clock className="h-4 w-4 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent 
        className="w-auto p-0" 
        align="start"
      >
        <TimePicker value={time} onChange={onChange} />
      </PopoverContent>
    </Popover>
  );
}

export function TimeReadonly({ value }: { value: unknown }) {
  return <TimeField field={{} as FieldDef} value={value} onChange={() => {}} readonly />;
}
