import { useState, useEffect, useRef } from 'react';
import { Check, ChevronsUpDown } from 'lucide-react';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
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

export function RelationField({ field, value, onChange }: Props) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [options, setOptions] = useState<Option[]>([]);
  const [loading, setLoading] = useState(false);
  const [displayValue, setDisplayValue] = useState('');
  const containerRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);

  const { table, value_field, display_field } = field.relation!;

  // 初始化：取得目前值的顯示名稱
  useEffect(() => {
    if (!value) { setDisplayValue(''); return; }
    const params = new URLSearchParams({ value_field, display_field, id: String(value) });
    fetch(`/api/data/${table}/options?${params}`)
      .then(r => r.json())
      .then((data: Option[]) => { if (data[0]) setDisplayValue(data[0].label); })
      .catch(() => {});
  }, [value, table, value_field, display_field]);

  // 下拉開啟時、搜尋詞改變時載入選項
  useEffect(() => {
    if (!open) return;
    setLoading(true);
    const params = new URLSearchParams({ value_field, display_field });
    if (search) params.set('search', search);
    fetch(`/api/data/${table}/options?${params}`)
      .then(r => r.json())
      .then((data: Option[]) => setOptions(data))
      .catch(() => setOptions([]))
      .finally(() => setLoading(false));
  }, [open, search, table, value_field, display_field]);

  // 開啟時 focus 搜尋欄
  useEffect(() => {
    if (open) setTimeout(() => searchRef.current?.focus(), 50);
  }, [open]);

  // 點擊外部關閉
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const handleSelect = (opt: Option) => {
    onChange(opt.value);
    setDisplayValue(opt.label);
    setOpen(false);
    setSearch('');
  };

  return (
    <div ref={containerRef} className="relative">
      <Button
        type="button"
        variant="outline"
        className="w-full justify-between font-normal"
        onClick={() => { setOpen(o => !o); setSearch(''); }}
      >
        <span className={cn('truncate', !displayValue && 'text-muted-foreground')}>
          {displayValue || field.placeholder || '請選擇...'}
        </span>
        <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
      </Button>

      {open && (
        <div className="absolute z-50 mt-1 w-full rounded-md border bg-card shadow-lg">
          <div className="p-1.5 border-b">
            <Input
              ref={searchRef}
              placeholder="搜尋..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="h-8 text-sm"
            />
          </div>
          <div className="max-h-52 overflow-y-auto py-1">
            {loading ? (
              <div className="py-4 text-center text-sm text-muted-foreground">載入中...</div>
            ) : options.length === 0 ? (
              <div className="py-4 text-center text-sm text-muted-foreground">無符合結果</div>
            ) : (
              options.map(opt => (
                <button
                  key={opt.value}
                  type="button"
                  className={cn(
                    'flex w-full items-center gap-2 px-3 py-1.5 text-sm hover:bg-accent text-left',
                    String(value) === String(opt.value) && 'bg-accent',
                  )}
                  onClick={() => handleSelect(opt)}
                >
                  <Check
                    className={cn(
                      'h-3.5 w-3.5 shrink-0',
                      String(value) === String(opt.value) ? 'opacity-100' : 'opacity-0',
                    )}
                  />
                  {opt.label}
                </button>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}
