import * as React from 'react';
import { Input } from '../ui/input';
import { Label } from '../ui/label';

interface TimePickerProps {
  value: string; // HH:mm
  onChange: (value: string) => void;
}

export function TimePicker({ value, onChange }: TimePickerProps) {
  const [hours, minutes] = (value || '00:00').split(':');

  const handleHoursChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    let val = e.target.value.replace(/\D/g, '');
    if (val.length > 2) val = val.slice(-2);
    const num = Math.min(23, parseInt(val || '0'));
    const formatted = String(num).padStart(2, '0');
    onChange(`${formatted}:${minutes}`);
  };

  const handleMinutesChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    let val = e.target.value.replace(/\D/g, '');
    if (val.length > 2) val = val.slice(-2);
    const num = Math.min(59, parseInt(val || '0'));
    const formatted = String(num).padStart(2, '0');
    onChange(`${hours}:${formatted}`);
  };

  return (
    <div className="flex items-end gap-2 p-4 bg-popover rounded-md">
      <div className="grid gap-1 text-center">
        <Label htmlFor="hours" className="text-xs">小時</Label>
        <Input
          id="hours"
          className="w-14 text-center font-mono text-base"
          value={hours}
          onChange={handleHoursChange}
          onBlur={() => onChange(`${hours.padStart(2, '0')}:${minutes}`)}
        />
      </div>
      <div className="text-xl font-bold pb-2">:</div>
      <div className="grid gap-1 text-center">
        <Label htmlFor="minutes" className="text-xs">分鐘</Label>
        <Input
          id="minutes"
          className="w-14 text-center font-mono text-base"
          value={minutes}
          onChange={handleMinutesChange}
          onBlur={() => onChange(`${hours}:${minutes.padStart(2, '0')}`)}
        />
      </div>
    </div>
  );
}
