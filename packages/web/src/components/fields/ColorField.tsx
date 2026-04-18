import { Copy, Check } from 'lucide-react';
import { useState } from 'react';
import type { FieldDef } from '../../types';

interface Props {
  field: FieldDef;
  value: unknown;
  onChange: (value: unknown) => void;
  readonly?: boolean;
}

export function ColorField({ value, onChange, readonly }: Props) {
  const [copied, setCopied] = useState(false);
  const hex = String(value ?? '#000000');

  const handleCopy = () => {
    navigator.clipboard.writeText(hex);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  if (readonly) {
    return (
      <div className="flex items-center gap-2">
        <div
          className="h-8 w-8 rounded border border-muted-foreground"
          style={{ backgroundColor: hex }}
        />
        <code className="text-sm">{hex}</code>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-2">
      <input
        type="color"
        value={hex}
        onChange={e => onChange(e.target.value)}
        className="h-10 w-12 cursor-pointer rounded border border-input"
      />
      <div className="flex items-center gap-1 flex-1">
        <input
          type="text"
          value={hex}
          onChange={e => onChange(e.target.value)}
          placeholder="#000000"
          className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
        />
        <button
          type="button"
          onClick={handleCopy}
          className="inline-flex items-center justify-center rounded-md border border-input bg-background px-2 py-2 text-sm text-muted-foreground hover:bg-muted"
        >
          {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
        </button>
      </div>
    </div>
  );
}

export function ColorReadonly({ value }: { value: unknown }) {
  return <ColorField field={{} as FieldDef} value={value} onChange={() => {}} readonly />;
}
