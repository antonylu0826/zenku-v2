import { useState, useEffect } from 'react';
import { Check, ChevronsUpDown } from 'lucide-react';
import { Button } from '../ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '../ui/popover';
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '../ui/command';
import { cn } from '../../lib/cn';
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

function getAuthHeaders(): Record<string, string> {
  const token = localStorage.getItem('zenku-token');
  return token ? { Authorization: `Bearer ${token}` } : {};
}

export function RelationField({ field, value, onChange }: Props) {
  const [open, setOpen] = useState(false);
  const [options, setOptions] = useState<Option[]>([]);
  const [loading, setLoading] = useState(false);
  const [displayValue, setDisplayValue] = useState('');

  const { table, value_field, display_field } = field.relation!;

  // 初始化：取得目前值的顯示名稱
  useEffect(() => {
    if (!value) { setDisplayValue(''); return; }
    const params = new URLSearchParams({ value_field, display_field, id: String(value) });
    fetch(`/api/data/${table}/options?${params}`, { headers: getAuthHeaders() })
      .then(r => { if (!r.ok) throw new Error(`HTTP ${r.status}`); return r.json(); })
      .then((data: unknown) => {
        if (Array.isArray(data) && data[0]) setDisplayValue((data[0] as Option).label);
      })
      .catch(() => {});
  }, [value, table, value_field, display_field]);

  // 下拉開啟時載入選項
  useEffect(() => {
    if (!open) return;
    setLoading(true);
    const params = new URLSearchParams({ value_field, display_field });
    fetch(`/api/data/${table}/options?${params}`, { headers: getAuthHeaders() })
      .then(r => { if (!r.ok) throw new Error(`HTTP ${r.status}`); return r.json(); })
      .then((data: unknown) => setOptions(Array.isArray(data) ? (data as Option[]) : []))
      .catch(() => setOptions([]))
      .finally(() => setLoading(false));
  }, [open, table, value_field, display_field]);

  const handleSelect = (opt: Option) => {
    onChange(opt.value);
    setDisplayValue(opt.label);
    setOpen(false);
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          role="combobox"
          aria-expanded={open}
          className="w-full justify-between font-normal"
        >
          <span className={cn('truncate', !displayValue && 'text-muted-foreground')}>
            {displayValue || field.placeholder || '請選擇...'}
          </span>
          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[--radix-popover-trigger-width] p-0" align="start">
        <Command>
          <CommandInput placeholder="搜尋..." />
          <CommandList>
            {loading ? (
              <div className="py-4 text-center text-sm text-muted-foreground">載入中...</div>
            ) : (
              <>
                <CommandEmpty>無符合結果</CommandEmpty>
                <CommandGroup>
                  {options.map(opt => (
                    <CommandItem
                      key={opt.value}
                      value={opt.label}
                      onSelect={() => handleSelect(opt)}
                    >
                      <Check
                        className={cn(
                          'mr-2 h-4 w-4',
                          String(value) === String(opt.value) ? 'opacity-100' : 'opacity-0',
                        )}
                      />
                      {opt.label}
                    </CommandItem>
                  ))}
                </CommandGroup>
              </>
            )}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
