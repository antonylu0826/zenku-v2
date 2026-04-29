import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Paperclip, X, Download, Loader2, FileText } from 'lucide-react';
import { Button } from '../ui/button';
import type { FieldDef } from '../../types';
import { uploadFiles, deleteFile, getFileUrl, getFileMeta, type FileUploadResult } from '../../api';

// Fetches image through auth-aware endpoint and renders via blob URL
function AuthImage({ id, alt }: { id: string; alt: string }) {
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

  if (!src) return <FileText size={16} className="shrink-0 text-muted-foreground" />;
  return <img src={src} alt={alt} className="h-8 w-8 rounded object-cover" />;
}

interface Props {
  field: FieldDef;
  value: unknown;
  onChange: (value: unknown) => void;
  disabled?: boolean;
}

async function downloadFile(id: string, filename: string) {
  const token = localStorage.getItem('zenku-token');
  const res = await fetch(getFileUrl(id), { headers: token ? { Authorization: `Bearer ${token}` } : {} });
  if (!res.ok) return;
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

function parseIds(value: unknown): string[] {
  if (!value || value === '') return [];
  try {
    const parsed = typeof value === 'string' ? JSON.parse(value) : value;
    if (Array.isArray(parsed)) return parsed.filter(Boolean);
  } catch { /* ignore */ }
  return [];
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

// ── Shared row component (used both in edit mode and readonly) ────────────────

export function FileRow({
  file,
  onRemove,
}: {
  file: FileUploadResult;
  onRemove?: () => void;
}) {
  const isImg = file.mime_type.startsWith('image/');
  return (
    <div className="flex items-center gap-2 rounded-md border px-3 py-2 text-sm">
      {isImg ? <AuthImage id={file.id} alt={file.filename} /> : <FileText size={16} className="shrink-0 text-muted-foreground" />}
      <span className="min-w-0 flex-1 truncate">{file.filename}</span>
      {file.size > 0 && (
        <span className="shrink-0 text-xs text-muted-foreground">{formatSize(file.size)}</span>
      )}
      <button
        onClick={() => void downloadFile(file.id, file.filename)}
        className="text-muted-foreground hover:text-foreground"
        title="Download"
      >
        <Download size={13} />
      </button>
      {onRemove && (
        <button onClick={onRemove} className="text-muted-foreground hover:text-destructive">
          <X size={13} />
        </button>
      )}
    </div>
  );
}

// ── Readonly list — fetches metadata for each id ──────────────────────────────

export function FileReadonlyList({ value }: { value: unknown }) {
  const ids = parseIds(value);
  const [files, setFiles] = useState<FileUploadResult[]>([]);

  useEffect(() => {
    if (ids.length === 0) { setFiles([]); return; }
    Promise.all(ids.map(id => getFileMeta(id).catch(() => null)))
      .then(results => setFiles(results.filter((r): r is FileUploadResult => r !== null)));
  }, [JSON.stringify(ids)]);

  if (ids.length === 0) return <p className="py-1 text-sm text-muted-foreground">-</p>;

  return (
    <div className="space-y-1.5 py-1">
      {files.map(f => <FileRow key={f.id} file={f} />)}
      {files.length === 0 && ids.length > 0 && (
        <div className="flex items-center gap-1 text-xs text-muted-foreground">
          <Loader2 size={12} className="animate-spin" /> Loading...
        </div>
      )}
    </div>
  );
}

// ── Edit mode component ───────────────────────────────────────────────────────

export function FileInput({ field, value, onChange, disabled }: Props) {
  const { t } = useTranslation();
  const [newFiles, setNewFiles] = useState<FileUploadResult[]>([]);
  const [existingFiles, setExistingFiles] = useState<FileUploadResult[]>([]);
  const [uploading, setUploading] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const ids = parseIds(value);
  const newIds = newFiles.map(f => f.id);
  const existingIds = ids.filter(id => !newIds.includes(id));

  // Fetch metadata for ids that were already in DB (not just uploaded this session)
  useEffect(() => {
    if (existingIds.length === 0) { setExistingFiles([]); return; }
    Promise.all(existingIds.map(id => getFileMeta(id).catch(() => null)))
      .then(results => setExistingFiles(results.filter((r): r is FileUploadResult => r !== null)));
  }, [JSON.stringify(existingIds)]);

  const maxMb = field.max_size_mb ?? 20;
  const accept = field.accept ?? (field.type === 'image' ? 'image/*' : undefined);

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
      const updated = field.multiple === false ? uploaded : [...newFiles, ...uploaded];
      setNewFiles(updated);
      const allIds = [...existingIds, ...updated.map(f => f.id)];
      onChange(allIds.length > 0 ? JSON.stringify(allIds) : '');
    } catch (err) {
      alert(t('common.upload_failed', { error: String(err) }));
    } finally {
      setUploading(false);
    }
  };

  const handleRemove = async (id: string) => {
    try { await deleteFile(id); } catch { /* best effort */ }
    const updatedNew = newFiles.filter(f => f.id !== id);
    const updatedExisting = existingFiles.filter(f => f.id !== id);
    setNewFiles(updatedNew);
    setExistingFiles(updatedExisting);
    const remaining = [...updatedExisting.map(f => f.id), ...updatedNew.map(f => f.id)];
    onChange(remaining.length > 0 ? JSON.stringify(remaining) : '');
  };

  const allFiles = [...existingFiles, ...newFiles];

  return (
    <div className="space-y-2">
      {allFiles.map(f => (
        <FileRow key={f.id} file={f} onRemove={disabled ? undefined : () => void handleRemove(f.id)} />
      ))}
      {/* Loading placeholder for ids not yet fetched */}
      {existingIds.length > existingFiles.length && (
        <div className="flex items-center gap-1 text-xs text-muted-foreground">
          <Loader2 size={12} className="animate-spin" /> Loading...
        </div>
      )}

      {!disabled && (
        <div>
          <input
            ref={inputRef}
            type="file"
            accept={accept}
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
            {uploading ? <Loader2 size={13} className="animate-spin" /> : <Paperclip size={13} />}
            {field.type === 'image' ? t('common.upload_image') : t('common.upload_file')}
          </Button>
          {allFiles.length === 0 && !uploading && (
            <p className="mt-1 text-xs text-muted-foreground">{t('common.max_size_mb', { mb: maxMb })}</p>
          )}
        </div>
      )}
    </div>
  );
}
