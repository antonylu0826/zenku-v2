import type { CSSProperties } from 'react';
import { Input } from '../ui/input';
import { Textarea } from '../ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../ui/select';
import { Checkbox } from '../ui/checkbox';
import { Label } from '../ui/label';
import { RelationField } from './RelationField';
import { DynamicSelectField } from './DynamicSelectField';
import { ComputedField } from './ComputedField';
import { DatePickerField } from './DatePickerField';
import { FileInput } from './FileInput';
import type { FieldDef } from '../../types';
import type { AppearanceEffect } from '../../types';
import { cn } from '../../lib/cn';

export interface FieldInputProps {
  field: FieldDef;
  value: unknown;
  /** 整個表單的目前值（計算欄位依賴追蹤用） */
  formValues: Record<string, unknown>;
  onChange: (value: unknown) => void;
  /** 條件外觀效果（由 FormView 求值後傳入） */
  appearance?: AppearanceEffect;
}

export function FieldInput({ field, value, formValues, onChange, appearance }: FieldInputProps) {
  const id = field.key;
  const stringValue = String(value ?? '');
  const isDisabled = appearance?.enabled === false;

  // 包裝容器的樣式（text_color / font_weight 透過 CSS 繼承傳遞給子元素）
  const hasWrapper = isDisabled || appearance?.text_color || appearance?.font_weight || appearance?.bg_color;
  const wrapperStyle: CSSProperties = {};
  if (appearance?.text_color)  wrapperStyle.color      = appearance.text_color;
  if (appearance?.font_weight) wrapperStyle.fontWeight = appearance.font_weight;

  // 計算欄位優先（不論 type）
  if (field.computed) {
    const el = <ComputedField field={field} formValues={formValues} onChange={onChange} />;
    return hasWrapper ? <AppearanceWrapper style={wrapperStyle} bgColor={appearance?.bg_color} disabled={isDisabled}>{el}</AppearanceWrapper> : el;
  }

  // 附件欄位
  if (field.type === 'file' || field.type === 'image') {
    const el = <FileInput field={field} value={value} onChange={onChange} disabled={isDisabled} />;
    return hasWrapper ? <AppearanceWrapper style={wrapperStyle} bgColor={appearance?.bg_color} disabled={isDisabled}>{el}</AppearanceWrapper> : el;
  }

  // 關聯欄位（搜尋式下拉）
  if (field.type === 'relation' && field.relation) {
    const el = <RelationField field={field} value={value} onChange={onChange} />;
    return hasWrapper ? <AppearanceWrapper style={wrapperStyle} bgColor={appearance?.bg_color} disabled={isDisabled}>{el}</AppearanceWrapper> : el;
  }

  // 動態下拉（select + source）
  if (field.type === 'select' && field.source) {
    const el = <DynamicSelectField field={field} value={value} onChange={onChange} />;
    return hasWrapper ? <AppearanceWrapper style={wrapperStyle} bgColor={appearance?.bg_color} disabled={isDisabled}>{el}</AppearanceWrapper> : el;
  }

  // 靜態下拉
  if (field.type === 'select') {
    return (
      <AppearanceWrapper style={wrapperStyle} bgColor={appearance?.bg_color} disabled={isDisabled} skip={!hasWrapper}>
        <Select value={stringValue} onValueChange={v => onChange(v)} disabled={isDisabled}>
          <SelectTrigger id={id}>
            <SelectValue placeholder={field.placeholder ?? '請選擇...'} />
          </SelectTrigger>
          <SelectContent>
            {(field.options ?? []).map(opt => (
              <SelectItem key={opt} value={opt}>{opt}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </AppearanceWrapper>
    );
  }

  switch (field.type) {
    case 'textarea':
      return (
        <AppearanceWrapper style={wrapperStyle} bgColor={appearance?.bg_color} disabled={isDisabled} skip={!hasWrapper}>
          <Textarea
            id={id}
            value={stringValue}
            placeholder={field.placeholder}
            onChange={e => onChange(e.target.value)}
            className="min-h-24"
            disabled={isDisabled}
          />
        </AppearanceWrapper>
      );

    case 'boolean':
      return (
        <AppearanceWrapper style={wrapperStyle} bgColor={appearance?.bg_color} disabled={isDisabled} skip={!hasWrapper}>
          <div className="flex items-center gap-2">
            <Checkbox
              id={id}
              checked={Boolean(value)}
              onCheckedChange={checked => onChange(checked === true)}
              disabled={isDisabled}
            />
            <Label htmlFor={id} className="cursor-pointer font-normal">是</Label>
          </div>
        </AppearanceWrapper>
      );

    case 'date':
      return (
        <AppearanceWrapper style={wrapperStyle} bgColor={appearance?.bg_color} disabled={isDisabled} skip={!hasWrapper}>
          <DatePickerField value={value} onChange={onChange} placeholder={field.placeholder} />
        </AppearanceWrapper>
      );

    case 'number':
    case 'currency':
      return (
        <AppearanceWrapper style={wrapperStyle} bgColor={appearance?.bg_color} disabled={isDisabled} skip={!hasWrapper}>
          <Input
            id={id}
            type="number"
            value={stringValue}
            placeholder={field.placeholder}
            onChange={e => onChange(e.target.value === '' ? '' : Number(e.target.value))}
            disabled={isDisabled}
            style={appearance?.text_color ? { color: appearance.text_color } : undefined}
          />
        </AppearanceWrapper>
      );

    case 'email':
      return (
        <AppearanceWrapper style={wrapperStyle} bgColor={appearance?.bg_color} disabled={isDisabled} skip={!hasWrapper}>
          <Input
            id={id}
            type="email"
            value={stringValue}
            placeholder={field.placeholder}
            onChange={e => onChange(e.target.value)}
            disabled={isDisabled}
            style={appearance?.text_color ? { color: appearance.text_color } : undefined}
          />
        </AppearanceWrapper>
      );

    case 'url':
      return (
        <AppearanceWrapper style={wrapperStyle} bgColor={appearance?.bg_color} disabled={isDisabled} skip={!hasWrapper}>
          <Input
            id={id}
            type="url"
            value={stringValue}
            placeholder={field.placeholder}
            onChange={e => onChange(e.target.value)}
            disabled={isDisabled}
            style={appearance?.text_color ? { color: appearance.text_color } : undefined}
          />
        </AppearanceWrapper>
      );

    case 'phone':
      return (
        <AppearanceWrapper style={wrapperStyle} bgColor={appearance?.bg_color} disabled={isDisabled} skip={!hasWrapper}>
          <Input
            id={id}
            type="tel"
            value={stringValue}
            placeholder={field.placeholder}
            onChange={e => onChange(e.target.value)}
            disabled={isDisabled}
            style={appearance?.text_color ? { color: appearance.text_color } : undefined}
          />
        </AppearanceWrapper>
      );

    default:
      return (
        <AppearanceWrapper style={wrapperStyle} bgColor={appearance?.bg_color} disabled={isDisabled} skip={!hasWrapper}>
          <Input
            id={id}
            value={stringValue}
            placeholder={field.placeholder}
            onChange={e => onChange(e.target.value)}
            disabled={isDisabled}
            style={appearance?.text_color ? { color: appearance.text_color } : undefined}
          />
        </AppearanceWrapper>
      );
  }
}

// ─── Wrapper helper ───────────────────────────────────────────────────────────

interface WrapperProps {
  children: React.ReactNode;
  style?: CSSProperties;
  bgColor?: string;
  disabled?: boolean;
  skip?: boolean;
}

function AppearanceWrapper({ children, style, bgColor, disabled, skip }: WrapperProps) {
  if (skip) return <>{children}</>;
  return (
    <div
      style={{
        ...style,
        ...(bgColor ? { backgroundColor: bgColor, borderRadius: '6px', padding: '2px' } : {}),
      }}
      className={cn(disabled && 'pointer-events-none opacity-60')}
    >
      {children}
    </div>
  );
}
