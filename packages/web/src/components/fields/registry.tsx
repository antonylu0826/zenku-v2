import type { CSSProperties } from 'react';
import { lazy, Suspense } from 'react';
import { useTranslation } from 'react-i18next';
import { Input } from '../ui/input';
import { Textarea } from '../ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../ui/select';
import { Checkbox } from '../ui/checkbox';
import { Label } from '../ui/label';
import { RelationField } from './RelationField';
import { DynamicSelectField } from './DynamicSelectField';
import { DatePickerField } from './DatePickerField';
import { FileInput, FileReadonlyList } from './FileInput';
import { MultiSelectField, MultiSelectReadonly } from './MultiSelectField';
import { RatingField, RatingReadonly } from './RatingField';
import { ProgressField, ProgressReadonly } from './ProgressField';
import { ColorField, ColorReadonly } from './ColorField';
import { TimeField, TimeReadonly } from './TimeField';
import { ImageField, ImageReadonly } from './ImageField';
import { AutoNumberField, AutoNumberReadonly } from './AutoNumberField';
import { MarkdownInput, MarkdownReadonly } from './MarkdownField';
import { JsonInput, JsonReadonly } from './JsonField';
import type { FieldDef, FieldType } from '../../types';

// ─── Sheet field (lazy-loaded — Univer bundle is large) ───────────────────────

const LazySheetInput    = lazy(() => import('./SheetField').then(m => ({ default: m.SheetInput })));
const LazySheetReadonly = lazy(() => import('./SheetField').then(m => ({ default: m.SheetReadonly })));

function SheetInputWrapper(props: FieldInputInnerProps) {
  const { t } = useTranslation();
  return (
    <Suspense fallback={
      <div className="flex h-[420px] items-center justify-center rounded-md border bg-muted/30 text-sm text-muted-foreground">
        {t('common.loading')}
      </div>
    }>
      <LazySheetInput {...props} />
    </Suspense>
  );
}

function SheetReadonlyWrapper(props: FieldReadonlyProps) {
  return (
    <Suspense fallback={<div className="h-[420px] rounded-md border bg-muted/30" />}>
      <LazySheetReadonly {...props} />
    </Suspense>
  );
}
import { cn } from '../../lib/cn';

// ─── Shared prop types ────────────────────────────────────────────────────────

export interface FieldInputInnerProps {
  field: FieldDef;
  value: unknown;
  formValues: Record<string, unknown>;
  onChange: (value: unknown) => void;
  disabled?: boolean;
}

export interface FieldReadonlyProps {
  field: FieldDef;
  value: unknown;
  allValues: Record<string, unknown>;
  textStyle?: CSSProperties;
  bgClass?: string;
  bgStyle?: CSSProperties;
}

// ─── Registry entry ───────────────────────────────────────────────────────────

export interface FieldEntry {
  input: React.ComponentType<FieldInputInnerProps>;
  readonly: React.ComponentType<FieldReadonlyProps>;
  /** Force full row span in multi-column forms */
  fullWidth?: boolean;
}

// ─── Input components ─────────────────────────────────────────────────────────

function TextInput({ field, value, onChange, disabled }: FieldInputInnerProps) {
  return (
    <Input
      id={field.key}
      value={String(value ?? '')}
      placeholder={field.placeholder}
      onChange={e => onChange(e.target.value)}
      disabled={disabled}
    />
  );
}

function NumberInput({ field, value, onChange, disabled }: FieldInputInnerProps) {
  return (
    <Input
      id={field.key}
      type="number"
      value={String(value ?? '')}
      placeholder={field.placeholder}
      onChange={e => onChange(e.target.value === '' ? '' : Number(e.target.value))}
      disabled={disabled}
    />
  );
}

function TextareaInput({ field, value, onChange, disabled }: FieldInputInnerProps) {
  return (
    <Textarea
      id={field.key}
      value={String(value ?? '')}
      placeholder={field.placeholder}
      onChange={e => onChange(e.target.value)}
      className="min-h-24"
      disabled={disabled}
    />
  );
}

function BooleanInput({ field, value, onChange, disabled }: FieldInputInnerProps) {
  return (
    <div className="flex items-center space-x-2 h-10">
      <Checkbox
        id={field.key}
        checked={Boolean(value)}
        onCheckedChange={checked => onChange(checked === true)}
        disabled={disabled}
      />
    </div>
  );
}

function SelectInput({ field, value, onChange, disabled }: FieldInputInnerProps) {
  const { t } = useTranslation();
  if (field.source) return <DynamicSelectField field={field} value={value} onChange={onChange} />;
  return (
    <Select value={String(value ?? '')} onValueChange={v => onChange(v)} disabled={disabled}>
      <SelectTrigger id={field.key}>
        <SelectValue placeholder={field.placeholder || t('relation.placeholder')} />
      </SelectTrigger>
      <SelectContent>
        {(field.options ?? []).map((opt, i) => {
          const optObj = typeof opt === 'object' && opt !== null ? opt as { value: string; label: string } : null;
          const val = optObj ? optObj.value : opt;
          const label = field.option_labels?.[val] ?? (optObj ? optObj.label : opt);
          return (
            <SelectItem key={`${val}-${i}`} value={val}>{label}</SelectItem>
          );
        })}
      </SelectContent>
    </Select>
  );
}

function EmailInput({ field, value, onChange, disabled }: FieldInputInnerProps) {
  return (
    <Input
      id={field.key}
      type="email"
      value={String(value ?? '')}
      placeholder={field.placeholder}
      onChange={e => onChange(e.target.value)}
      disabled={disabled}
    />
  );
}

function UrlInput({ field, value, onChange, disabled }: FieldInputInnerProps) {
  return (
    <Input
      id={field.key}
      type="url"
      value={String(value ?? '')}
      placeholder={field.placeholder}
      onChange={e => onChange(e.target.value)}
      disabled={disabled}
    />
  );
}

function PhoneInput({ field, value, onChange, disabled }: FieldInputInnerProps) {
  return (
    <Input
      id={field.key}
      type="tel"
      value={String(value ?? '')}
      placeholder={field.placeholder}
      onChange={e => onChange(e.target.value)}
      disabled={disabled}
    />
  );
}

function DateInput({ field, value, onChange, disabled }: FieldInputInnerProps) {
  return <DatePickerField value={value} onChange={onChange} placeholder={field.placeholder} disabled={disabled} />;
}

function DateTimeInput({ field, value, onChange, disabled }: FieldInputInnerProps) {
  return <DatePickerField value={value} onChange={onChange} placeholder={field.placeholder} disabled={disabled} includeTime />;
}

function RelationInput({ field, value, onChange }: FieldInputInnerProps) {
  return <RelationField field={field} value={value} onChange={onChange} />;
}

function FileFieldInput({ field, value, onChange, disabled }: FieldInputInnerProps) {
  return <FileInput field={field} value={value} onChange={onChange} disabled={disabled} />;
}

// ─── Readonly components ──────────────────────────────────────────────────────

function EmptyValue() {
  return <p className="py-1 text-sm text-muted-foreground">-</p>;
}

export function TextReadonly({ value, textStyle, bgClass, bgStyle }: FieldReadonlyProps) {
  if (value === null || value === undefined || value === '') return <EmptyValue />;
  return <p className={cn('py-1 text-sm', bgClass)} style={{ ...textStyle, ...bgStyle }}>{String(value)}</p>;
}

function BooleanReadonly({ value, textStyle, bgClass, bgStyle }: FieldReadonlyProps) {
  const { t } = useTranslation();
  if (value === null || value === undefined) return <EmptyValue />;
  return (
    <p className={cn('py-1 text-sm font-medium', bgClass)} style={{ ...textStyle, ...bgStyle }}>
      {Boolean(value) ? t('common.boolean_yes') : t('common.boolean_no')}
    </p>
  );
}

function CurrencyReadonly({ value, textStyle, bgClass, bgStyle }: FieldReadonlyProps) {
  if (value === null || value === undefined || value === '') return <EmptyValue />;
  const num = Number(value);
  return (
    <p className={cn('py-1 text-sm', bgClass)} style={{ ...textStyle, ...bgStyle }}>
      {isFinite(num)
        ? `$${num.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`
        : String(value)}
    </p>
  );
}

function PhoneReadonly({ value, textStyle, bgClass, bgStyle }: FieldReadonlyProps) {
  if (value === null || value === undefined || value === '') return <EmptyValue />;
  return (
    <a href={`tel:${value}`} className={cn('py-1 text-sm text-primary hover:underline', bgClass)} style={{ ...textStyle, ...bgStyle }}>
      {String(value)}
    </a>
  );
}

function EmailReadonly({ value, textStyle, bgClass, bgStyle }: FieldReadonlyProps) {
  if (value === null || value === undefined || value === '') return <EmptyValue />;
  return (
    <a href={`mailto:${value}`} className={cn('py-1 text-sm text-primary hover:underline', bgClass)} style={{ ...textStyle, ...bgStyle }}>
      {String(value)}
    </a>
  );
}

function UrlReadonly({ value, textStyle, bgClass, bgStyle }: FieldReadonlyProps) {
  if (value === null || value === undefined || value === '') return <EmptyValue />;
  return (
    <a href={String(value)} target="_blank" rel="noreferrer" className={cn('py-1 text-sm text-primary hover:underline', bgClass)} style={{ ...textStyle, ...bgStyle }}>
      {String(value)}
    </a>
  );
}

function RelationReadonly({ field, value, allValues, textStyle, bgClass, bgStyle }: FieldReadonlyProps) {
  const display = allValues[`${field.key}__display`] ?? value;
  if (display === null || display === undefined || display === '') return <EmptyValue />;
  return <p className={cn('py-1 text-sm', bgClass)} style={{ ...textStyle, ...bgStyle }}>{String(display)}</p>;
}

function EnumReadonly({ value }: FieldReadonlyProps) {
  if (value === null || value === undefined || value === '') return <EmptyValue />;
  return (
    <span className="inline-flex items-center rounded-full bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary">
      {String(value)}
    </span>
  );
}

function FileReadonly({ value }: FieldReadonlyProps) {
  if (value === null || value === undefined || value === '') return <EmptyValue />;
  return <FileReadonlyList value={value} />;
}

// ─── Registry ─────────────────────────────────────────────────────────────────

function MultiSelectInputWrapper({ field, value, onChange }: FieldInputInnerProps) {
  return <MultiSelectField field={field} value={value} onChange={onChange} />;
}

function RatingInputWrapper({ field, value, onChange }: FieldInputInnerProps) {
  return <RatingField field={field} value={value} onChange={onChange} />;
}

function ProgressInputWrapper({ field, value, onChange }: FieldInputInnerProps) {
  return <ProgressField field={field} value={value} onChange={onChange} />;
}

function ColorInputWrapper({ value, onChange }: FieldInputInnerProps) {
  return <ColorField value={value} onChange={onChange} />;
}

function TimeInputWrapper({ field, value, onChange }: FieldInputInnerProps) {
  return <TimeField field={field} value={value} onChange={onChange} />;
}

function ImageInputWrapper({ field, value, onChange, disabled }: FieldInputInnerProps) {
  return <ImageField field={field} value={value} onChange={onChange} disabled={disabled} />;
}

function ImageReadonlyWrapper({ field, value }: FieldReadonlyProps) {
  return <ImageReadonly field={field} value={value} />;
}

export const FIELD_REGISTRY: Record<FieldType, FieldEntry> = {
  text:     { input: TextInput,            readonly: TextReadonly },
  number:   { input: NumberInput,          readonly: TextReadonly },
  currency: { input: NumberInput,          readonly: CurrencyReadonly },
  textarea: { input: TextareaInput,        readonly: TextReadonly,    fullWidth: true },
  richtext: { input: TextareaInput,        readonly: TextReadonly,    fullWidth: true },
  markdown: { input: MarkdownInput,        readonly: MarkdownReadonly, fullWidth: true },
  boolean:  { input: BooleanInput,         readonly: BooleanReadonly },
  date:     { input: DateInput,            readonly: TextReadonly },
  datetime: { input: DateTimeInput,        readonly: TextReadonly },
  select:   { input: SelectInput,          readonly: TextReadonly },
  multiselect: { input: MultiSelectInputWrapper, readonly: MultiSelectReadonly },
  enum:     { input: SelectInput,          readonly: EnumReadonly },
  relation: { input: RelationInput,        readonly: RelationReadonly },
  email:    { input: EmailInput,           readonly: EmailReadonly },
  phone:    { input: PhoneInput,           readonly: PhoneReadonly },
  url:      { input: UrlInput,             readonly: UrlReadonly },
  file:     { input: FileFieldInput,       readonly: FileReadonly,    fullWidth: true },
  image:    { input: ImageInputWrapper,     readonly: ImageReadonlyWrapper, fullWidth: true },
  rating:   { input: RatingInputWrapper,   readonly: RatingReadonly },
  progress: { input: ProgressInputWrapper, readonly: ProgressReadonly },
  color:       { input: ColorInputWrapper,    readonly: ColorReadonly },
  time:        { input: TimeInputWrapper,     readonly: TimeReadonly },
  auto_number: { input: AutoNumberField,      readonly: AutoNumberReadonly },
  sheet:       { input: SheetInputWrapper,    readonly: SheetReadonlyWrapper, fullWidth: true },
  json:        { input: JsonInput,            readonly: JsonReadonly,         fullWidth: true },
};
