import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Loader2, Plus, X, ZoomIn } from 'lucide-react';
import { Button } from '../ui/button';
import { Dialog, DialogContent, DialogTitle, DialogDescription } from '../ui/dialog';
import type { FieldDef } from '../../types';
import { uploadFiles, deleteFile, getFileUrl, getFileMeta, type FileUploadResult } from '../../api';

// Authenticated image component
export function AuthImage({ id, alt, className }: { id: string; alt: string; className?: string }) {
  const [src, setSrc] = useState<string | null>(null);
  useEffect(() => {
    const token = localStorage.getItem('zenku-token');
    let objectUrl: string;
    fetch(getFileUrl(id), { headers: token ? { Authorization: `Bearer ${token}` } : {} })
      .then(r => r.ok ? r.blob() : null)
      .then(blob => {
        if (!blob) return;
        objectUrl = URL.createObjectURL(blob);
        setSrc(objectUrl);
      })
      .catch(() => {});
    return () => { if (objectUrl) URL.revokeObjectURL(objectUrl); };
  }, [id]);

  if (!src) return <div className={`flex items-center justify-center bg-muted ${className ?? ''}`}><Loader2 size={16} className="animate-spin text-muted-foreground" /></div>;
  return <img src={src} alt={alt} className={className} />;
}

function parseIds(value: unknown): string[] {
  if (!value || value === '') return [];
  try {
    const parsed = typeof value === 'string' ? JSON.parse(value) : value;
    if (Array.isArray(parsed)) return parsed.filter(Boolean);
  } catch { /* ignore */ }
  return [];
}

interface Props {
  field: FieldDef;
  value: unknown;
  onChange: (value: unknown) => void;
  readonly?: boolean;
  disabled?: boolean;
}

export function ImageField({ field, value, onChange, readonly, disabled }: Props) {
  const { t } = useTranslation();
  const [files, setFiles] = useState<FileUploadResult[]>([]);
  const [uploading, setUploading] = useState(false);
  const [lightboxId, setLightboxId] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const ids = parseIds(value);

  useEffect(() => {
    if (ids.length === 0) { setFiles([]); return; }
    Promise.all(ids.map(id => getFileMeta(id).catch(() => null)))
      .then(results => setFiles(results.filter((r): r is FileUploadResult => r !== null)));
  }, [JSON.stringify(ids)]);

  const maxMb = field.max_size_mb ?? 10;

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const picked = Array.from(e.target.files ?? []);
    if (picked.length === 0) return;
    e.target.value = '';

    const tooLarge = picked.filter(f => f.size > maxMb * 1024 * 1024);
    if (tooLarge.length > 0) {
      alert(t('common.file_too_large', { mb: maxMb, names: tooLarge.map(f => f.name).join(', ') }));
      return;
    }

    setUploading(true);
    try {
      const uploaded = await uploadFiles(picked, { field_name: field.key });
      const allIds = field.multiple === false ? uploaded.map(f => f.id) : [...ids, ...uploaded.map(f => f.id)];
      onChange(allIds.length > 0 ? JSON.stringify(allIds) : '');
    } catch (err) {
      alert(t('common.upload_failed', { error: String(err) }));
    } finally {
      setUploading(false);
    }
  };

  const handleRemove = async (id: string) => {
    try { await deleteFile(id); } catch { /* best effort */ }
    const remaining = ids.filter(i => i !== id);
    onChange(remaining.length > 0 ? JSON.stringify(remaining) : '');
  };

  if (ids.length === 0 && (readonly || disabled)) {
    return <p className="py-1 text-sm text-muted-foreground">-</p>;
  }

  return (
    <div className="space-y-2">
      {/* Image grid */}
      {ids.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {ids.map(id => {
            const meta = files.find(f => f.id === id);
            return (
              <div key={id} className="group relative h-20 w-20 overflow-hidden rounded-md border bg-muted">
                <AuthImage id={id} alt={meta?.filename ?? id} className="h-full w-full object-cover" />
                {/* Hover overlay */}
                <div className="absolute inset-0 flex items-center justify-center gap-1 bg-black/40 opacity-0 transition group-hover:opacity-100">
                  <button
                    type="button"
                    onClick={() => setLightboxId(id)}
                    className="rounded-full bg-white/20 p-1 text-white hover:bg-white/40"
                  >
                    <ZoomIn size={14} />
                  </button>
                  {!readonly && !disabled && (
                    <button
                      type="button"
                      onClick={() => void handleRemove(id)}
                      className="rounded-full bg-white/20 p-1 text-white hover:bg-red-500/80"
                    >
                      <X size={14} />
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Upload button */}
      {!readonly && !disabled && (
        <div>
          <input
            ref={inputRef}
            type="file"
            accept={field.accept ?? 'image/*'}
            multiple={field.multiple !== false}
            className="hidden"
            onChange={e => void handleFileChange(e)}
          />
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => inputRef.current?.click()}
            disabled={uploading}
            className="gap-1.5"
          >
            {uploading ? <Loader2 size={13} className="animate-spin" /> : <Plus size={13} />}
            {t('common.upload_image')}
          </Button>
          {ids.length === 0 && !uploading && (
            <p className="mt-1 text-xs text-muted-foreground">{t('common.max_size_mb', { mb: maxMb })}</p>
          )}
        </div>
      )}

      {/* Lightbox */}
      <Dialog open={lightboxId !== null} onOpenChange={open => !open && setLightboxId(null)}>
        <DialogContent className="max-w-4xl p-2">
          <DialogTitle className="sr-only">Image Preview</DialogTitle>
          <DialogDescription className="sr-only">Image preview lightbox</DialogDescription>
          {lightboxId && (
            <AuthImage
              id={lightboxId}
              alt="preview"
              className="max-h-[80vh] w-full rounded object-contain"
            />
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

export function ImageReadonly({ field, value }: { field: FieldDef; value: unknown }) {
  return <ImageField field={field} value={value} onChange={() => {}} readonly />;
}
