import { useState, useEffect, useRef } from 'react';
import { Check, Search } from 'lucide-react';
import { Badge } from '../ui/badge';
import { Button } from '../ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '../ui/popover';
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

function getAuthHeaders(): Record<string, string> {
  const token = localStorage.getItem('zenku-token');
  return token ? { Authorization: `Bearer ${token}` } : {};
}

import { useTranslation } from 'react-i18next';

export function MultiSelectField({ field, value, onChange }: Props) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const [options, setOptions] = useState<Option[]>([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  const selected: string[] = Array.isArray(value) ? value.map(String) : (value ? [String(value)] : []);

  // Fetch options from source or use static options
  useEffect(() => {
    if (!open) { setSearch(''); return; }

    setLoading(true);

    if (field.source) {
      // Fetch from relation
      const params = new URLSearchParams({
        value_field: 'id',
        display_field: field.source.display_field || 'name'
      });
      fetch(`/api/data/${field.source.table}/options?${params}`, { headers: getAuthHeaders() })
        .then(r => { if (!r.ok) throw new Error(`HTTP ${r.status}`); return r.json(); })
        .then((data: unknown) => {
          if (Array.isArray(data)) setOptions(data);
        })
        .catch(() => {})
        .finally(() => setLoading(false));
    } else {
      // Use static options
      const opts = (field.options ?? []).map(opt => ({
        value: String(opt),
        label: field.option_labels?.[String(opt)] ?? String(opt),
      }));
      setOptions(opts);
      setLoading(false);
    }
  }, [open, field, field.source]);

  const toggle = (opt: string) => {
    const next = selected.includes(opt) ? selected.filter(s => s !== opt) : [...selected, opt];
    onChange(next.length ? next : null);
  };

  const filtered = options.filter(opt =>
    opt.label.toLowerCase().includes(search.toLowerCase())
  );

  const displayLabel = selected.length === 0 
    ? (field.placeholder || t('common.select_options')) 
    : t('common.selected_count_simple', { count: selected.length, defaultValue: `${selected.length} selected` });

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="outline" className="w-full justify-start text-left font-normal h-10 px-3">
          {selected.length === 0 ? (
            <span className="text-muted-foreground">{displayLabel}</span>
          ) : (
            <div className="flex flex-wrap gap-1">
              {selected.slice(0, 3).map(v => (
                <Badge key={v} variant="secondary" className="text-xs">
                  {v}
                </Badge>
              ))}
              {selected.length > 3 && (
                <Badge variant="secondary" className="text-xs">
                  +{selected.length - 3}
                </Badge>
              )}
            </div>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-64 p-0">
        <div className="p-3">
          <div className="relative mb-2">
            <Search className="pointer-events-none absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              ref={inputRef}
              placeholder={t('relation.search_placeholder')}
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="pl-8 h-8 text-sm"
            />
          </div>
          <div className="space-y-1 max-h-64 overflow-auto">
            {loading ? (
              <div className="px-2 py-1 text-sm text-muted-foreground">{t('common.loading')}</div>
            ) : filtered.length === 0 ? (
              <div className="px-2 py-1 text-sm text-muted-foreground">{t('relation.no_results')}</div>
            ) : (
              filtered.map(opt => (
                <button
                  key={opt.value}
                  className={cn(
                    'w-full text-left px-2 py-1.5 rounded text-sm flex items-center gap-2 hover:bg-accent',
                    selected.includes(opt.value) && 'bg-muted'
                  )}
                  onClick={() => toggle(opt.value)}
                >
                  <Check
                    className={cn(
                      'h-4 w-4 flex-shrink-0',
                      selected.includes(opt.value) ? 'opacity-100' : 'opacity-0'
                    )}
                  />
                  {opt.label}
                </button>
              ))
            )}
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}

export function MultiSelectReadonly({ value }: { value: unknown }) {
  let selected: string[] = [];
  if (Array.isArray(value)) {
    selected = value.map(String);
  } else if (typeof value === 'string' && value.startsWith('[')) {
    try {
      const parsed = JSON.parse(value);
      if (Array.isArray(parsed)) selected = parsed.map(String);
    } catch {
      selected = [value];
    }
  } else if (value) {
    selected = [String(value)];
  }

  if (selected.length === 0) return <p className="py-1 text-sm text-muted-foreground">-</p>;

  return (
    <div className="flex flex-wrap gap-1 py-1">
      {selected.map(v => (
        <Badge key={v} variant="secondary" className="rounded-full px-2 py-0">
          {v}
        </Badge>
      ))}
    </div>
  );
}
