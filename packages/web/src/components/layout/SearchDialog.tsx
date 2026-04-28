import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Search } from 'lucide-react';
import { Dialog, DialogContent, DialogTitle, DialogDescription } from '../ui/dialog';
import { Input } from '../ui/input';

export function SearchDialog() {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setOpen(o => !o);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="flex items-center gap-2 rounded-md border bg-muted/40 px-3 py-1.5 text-xs text-muted-foreground hover:bg-muted"
      >
        <Search className="size-3.5" />
        <span>{t('common.search', { defaultValue: 'Search…' })}</span>
        <kbd className="ml-2 rounded border bg-background px-1 font-mono text-[10px]">⌘K</kbd>
      </button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogTitle>{t('common.search', { defaultValue: 'Search' })}</DialogTitle>
          <DialogDescription>
            {t('common.search_placeholder', {
              defaultValue: 'Search across views, fields, and records (coming soon).',
            })}
          </DialogDescription>
          <Input
            value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder={t('common.search', { defaultValue: 'Search…' })}
            autoFocus
          />
        </DialogContent>
      </Dialog>
    </>
  );
}
