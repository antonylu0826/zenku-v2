import { useRef, useState } from 'react';
import { Paperclip, X, Download, Loader2, FileText } from 'lucide-react';
import { Button } from '../ui/button';
import type { FieldDef } from '../../types';
import { uploadFiles, deleteFile, getFileUrl } from '../../api';

export interface FileRecord {
  id: string;
  filename: string;
  mime_type: string;
  size: number;
  url: string;
}

interface Props {
  field: FieldDef;
  value: unknown;
  onChange: (value: unknown) => void;
  disabled?: boolean;
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

export function FileInput({ field, value, onChange, disabled }: Props) {
  const [files, setFiles] = useState<FileRecord[]>([]);
  const [uploading, setUploading] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const ids = parseIds(value);

  const maxMb = field.max_size_mb ?? 20;
  const accept = field.accept ?? (field.type === 'image' ? 'image/*' : undefined);

  const handlePick = () => {
    if (disabled) return;
    inputRef.current?.click();
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const picked = Array.from(e.target.files ?? []);
    if (picked.length === 0) return;
    e.target.value = '';

    const tooLarge = picked.filter(f => f.size > maxMb * 1024 * 1024);
    if (tooLarge.length > 0) {
      alert(`檔案超過 ${maxMb} MB：${tooLarge.map(f => f.name).join(', ')}`);
      return;
    }

    setUploading(true);
    try {
      const uploaded = await uploadFiles(picked, { field_name: field.key });
      const updated = field.multiple === false
        ? uploaded
        : [...files, ...uploaded];
      setFiles(updated);
      const newIds = updated.map(f => f.id);
      onChange(JSON.stringify(newIds));
    } catch (err) {
      alert(`上傳失敗：${String(err)}`);
    } finally {
      setUploading(false);
    }
  };

  const handleRemove = async (id: string) => {
    try {
      await deleteFile(id);
    } catch { /* best effort */ }
    const updated = files.filter(f => f.id !== id);
    setFiles(updated);
    const remaining = ids.filter(i => i !== id);
    onChange(remaining.length > 0 ? JSON.stringify(remaining) : '');
  };

  const isImage = (mime: string) => mime.startsWith('image/');

  return (
    <div className="space-y-2">
      {/* Existing file ids not yet in local state (loaded from DB) */}
      {ids.filter(id => !files.find(f => f.id === id)).map(id => (
        <ExistingFileRow key={id} id={id} onRemove={disabled ? undefined : () => handleRemove(id)} />
      ))}

      {/* Locally uploaded files */}
      {files.map(f => (
        <div key={f.id} className="flex items-center gap-2 rounded-md border px-3 py-2 text-sm">
          {isImage(f.mime_type) ? (
            <img
              src={getFileUrl(f.id)}
              alt={f.filename}
              className="h-8 w-8 rounded object-cover"
            />
          ) : (
            <FileText size={16} className="shrink-0 text-muted-foreground" />
          )}
          <span className="min-w-0 flex-1 truncate">{f.filename}</span>
          <span className="shrink-0 text-xs text-muted-foreground">{formatSize(f.size)}</span>
          <a href={getFileUrl(f.id)} target="_blank" rel="noreferrer">
            <Download size={13} className="text-muted-foreground hover:text-foreground" />
          </a>
          {!disabled && (
            <button onClick={() => void handleRemove(f.id)} className="text-muted-foreground hover:text-destructive">
              <X size={13} />
            </button>
          )}
        </div>
      ))}

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
            onClick={handlePick}
            disabled={uploading}
            className="gap-1.5"
          >
            {uploading ? <Loader2 size={13} className="animate-spin" /> : <Paperclip size={13} />}
            {field.type === 'image' ? '上傳圖片' : '上傳檔案'}
          </Button>
          {ids.length === 0 && !uploading && (
            <p className="mt-1 text-xs text-muted-foreground">最大 {maxMb} MB</p>
          )}
        </div>
      )}
    </div>
  );
}

// Shows a file loaded from DB (by id only — fetches metadata lazily)
function ExistingFileRow({ id, onRemove }: { id: string; onRemove?: () => void }) {
  return (
    <div className="flex items-center gap-2 rounded-md border px-3 py-2 text-sm">
      <FileText size={16} className="shrink-0 text-muted-foreground" />
      <span className="min-w-0 flex-1 truncate text-muted-foreground text-xs">{id}</span>
      <a href={getFileUrl(id)} target="_blank" rel="noreferrer">
        <Download size={13} className="text-muted-foreground hover:text-foreground" />
      </a>
      {onRemove && (
        <button onClick={onRemove} className="text-muted-foreground hover:text-destructive">
          <X size={13} />
        </button>
      )}
    </div>
  );
}
