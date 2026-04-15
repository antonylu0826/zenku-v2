import { format } from 'date-fns';
import { Calendar as CalendarIcon } from 'lucide-react';
import { cn } from '../../lib/cn';
import { Button } from '../ui/button';
import { Calendar } from '../ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '../ui/popover';

interface Props {
  value: unknown;
  onChange: (value: unknown) => void;
  placeholder?: string;
  disabled?: boolean;
}

export function DatePickerField({ value, onChange, placeholder, disabled }: Props) {
  const dateValue = value ? new Date(String(value)) : undefined;
  const isValidDate = dateValue && !isNaN(dateValue.getTime());

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          disabled={disabled}
          className={cn(
            'w-full justify-between text-left font-normal',
            !isValidDate && 'text-muted-foreground',
          )}
        >
          <span>{isValidDate ? format(dateValue, 'yyyy/MM/dd') : (placeholder ?? '選擇日期')}</span>
          <CalendarIcon className="h-4 w-4 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-0" align="start">
        <Calendar
          mode="single"
          selected={isValidDate ? dateValue : undefined}
          onSelect={date => {
            if (date) {
              onChange(format(date, 'yyyy-MM-dd'));
            }
          }}
          autoFocus
        />
      </PopoverContent>
    </Popover>
  );
}
