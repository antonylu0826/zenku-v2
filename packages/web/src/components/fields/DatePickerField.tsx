import { format } from 'date-fns';
import { zhTW } from 'date-fns/locale';
import { useTranslation } from 'react-i18next';
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
  includeTime?: boolean;
}

export function DatePickerField({ value, onChange, placeholder, disabled, includeTime = false }: Props) {
  const { t, i18n } = useTranslation();
  const calLocale = i18n.language === 'zh-TW' ? zhTW : undefined;
  const dateValue = value ? new Date(String(value)) : undefined;
  const isValidDate = dateValue && !isNaN(dateValue.getTime());

  const hours = isValidDate ? String(dateValue.getHours()).padStart(2, '0') : '00';
  const minutes = isValidDate ? String(dateValue.getMinutes()).padStart(2, '0') : '00';

  const displayFormat = includeTime ? 'yyyy/MM/dd HH:mm' : 'yyyy/MM/dd';
  const displayValue = isValidDate ? format(dateValue, displayFormat) : (placeholder ?? (includeTime ? t('common.select_datetime') : t('common.select_date')));

  const handleDateSelect = (date: Date | undefined) => {
    if (date) {
      if (includeTime) {
        const newDate = new Date(date);
        newDate.setHours(parseInt(hours), parseInt(minutes));
        onChange(format(newDate, "yyyy-MM-dd'T'HH:mm:ss"));
      } else {
        onChange(format(date, 'yyyy-MM-dd'));
      }
    }
  };

  const handleTimeChange = (type: 'hours' | 'minutes', value: string) => {
    if (!isValidDate) return;
    const newDate = new Date(dateValue);
    if (type === 'hours') newDate.setHours(parseInt(value) || 0);
    else newDate.setMinutes(parseInt(value) || 0);
    onChange(format(newDate, "yyyy-MM-dd'T'HH:mm:ss"));
  };

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
          <span>{displayValue}</span>
          <CalendarIcon className="h-4 w-4 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-0" align="start" side="top" sideOffset={4}>
        <div className="p-3">
          <Calendar
            mode="single"
            selected={isValidDate ? dateValue : undefined}
            onSelect={handleDateSelect}
            locale={calLocale}
            autoFocus
          />
          {includeTime && (
            <div className="mt-3 flex gap-2 border-t pt-3">
              <div className="flex-1">
                <label className="block text-xs font-medium mb-1">Hour</label>
                <input
                  type="number"
                  min="0"
                  max="23"
                  value={hours}
                  onChange={e => handleTimeChange('hours', e.target.value)}
                  className="w-full border rounded px-2 py-1 text-sm"
                />
              </div>
              <div className="flex-1">
                <label className="block text-xs font-medium mb-1">Minute</label>
                <input
                  type="number"
                  min="0"
                  max="59"
                  value={minutes}
                  onChange={e => handleTimeChange('minutes', e.target.value)}
                  className="w-full border rounded px-2 py-1 text-sm"
                />
              </div>
            </div>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}
