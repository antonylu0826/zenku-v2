import type React from 'react';
import { useMemo, useState } from 'react';
import { Loader2, Pencil } from 'lucide-react';
import type { FieldDef } from '../../types';
import type { AppearanceEffect } from '../../types';
import { resolveAppearance } from '../../types';
import { Button } from '../ui/button';
import { FormItem, FormMessage } from '../ui/form';
import { Label } from '../ui/label';
import { FieldInput } from '../fields';
import { cn } from '../../lib/cn';

export type FormMode = 'create' | 'edit' | 'view';

interface Props {
  fields: FieldDef[];
  initialValues?: Record<string, unknown>;
  mode?: FormMode;
  /** 表單欄數（預設 1）。textarea / computed 欄位永遠佔滿整行 */
  columns?: 1 | 2 | 3;
  onSubmit?: (data: Record<string, unknown>) => Promise<void>;
  onCancel?: () => void;
}

/** 哪些欄位需要佔滿全行 */
function isFullWidth(field: FieldDef): boolean {
  return field.type === 'textarea' || field.type === 'richtext' || field.type === 'file' || field.type === 'image' || !!field.computed;
}

type ErrorMap = Record<string, string | null>;

export function FormView({ fields, initialValues = {}, mode = 'create', columns = 1, onSubmit, onCancel }: Props) {
  // 初始化包含所有非靜態隱藏欄位的值（含條件隱藏欄位，確保其值仍追蹤）
  const allFormFields = useMemo(() => fields.filter(f => !f.hidden_in_form), [fields]);

  const [values, setValues] = useState<Record<string, unknown>>(() => {
    const init: Record<string, unknown> = {};
    // 先複製所有 __display 欄位（relation 顯示用）
    for (const [key, val] of Object.entries(initialValues)) {
      if (key.endsWith('__display')) init[key] = val;
    }
    for (const field of allFormFields) {
      init[field.key] = initialValues[field.key] ?? (field.type === 'boolean' ? false : '');
    }
    return init;
  });
  const [errors, setErrors] = useState<ErrorMap>({});
  const [submitting, setSubmitting] = useState(false);
  const [currentMode, setCurrentMode] = useState<FormMode>(mode);

  const isViewMode = currentMode === 'view';

  // ─── Conditional Appearance ─────────────────��───────────────────────────────
  // 每當 values 改變就重新求值所有欄位的外觀效果
  const fieldAppearance = useMemo(() => {
    const map = new Map<string, AppearanceEffect>();
    for (const field of allFormFields) {
      if (field.appearance?.length) {
        const effect = resolveAppearance(field.appearance, values);
        if (Object.keys(effect).length > 0) map.set(field.key, effect);
      }
    }
    return map;
  }, [allFormFields, values]);

  // 可見欄位：排除靜態隱藏 + 條件隱藏
  const visibleFields = useMemo(
    () => allFormFields.filter(f => {
      const app = fieldAppearance.get(f.key);
      return app?.visibility !== 'hidden';
    }),
    [allFormFields, fieldAppearance],
  );

  // ─── Validation ─────────────────────────────────────────────────────────────

  const validateField = (field: FieldDef, value: unknown): string | null => {
    if (field.computed) return null;
    const app = fieldAppearance.get(field.key);
    // 欄位若被條件隱藏，不驗證
    if (app?.visibility === 'hidden') return null;
    // 必填：原始必填 OR 條件外觀要求必填
    const isRequired = field.required || app?.required;
    const stringValue = String(value ?? '').trim();
    if (isRequired && (value === null || value === undefined || stringValue === '')) {
      return `${field.label} 為必填`;
    }
    if (!field.validation) return null;
    if (typeof value === 'number') {
      if (field.validation.min !== undefined && value < field.validation.min) {
        return field.validation.message ?? `${field.label} 不可小於 ${field.validation.min}`;
      }
      if (field.validation.max !== undefined && value > field.validation.max) {
        return field.validation.message ?? `${field.label} 不可大於 ${field.validation.max}`;
      }
    }
    if (field.validation.pattern && stringValue) {
      const regex = new RegExp(field.validation.pattern);
      if (!regex.test(stringValue)) {
        return field.validation.message ?? `${field.label} 格式不正確`;
      }
    }
    return null;
  };

  const validateAll = (): boolean => {
    const nextErrors: ErrorMap = {};
    for (const field of visibleFields) {
      nextErrors[field.key] = validateField(field, values[field.key]);
    }
    setErrors(nextErrors);
    return Object.values(nextErrors).every(e => !e);
  };

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!validateAll()) return;
    if (!onSubmit) return;
    setSubmitting(true);
    try {
      const payload: Record<string, unknown> = {};
      for (const field of visibleFields) {
        const value = values[field.key];
        if (value === '' || value === undefined || field.key.endsWith('__display')) continue;
        payload[field.key] = value;
      }
      await onSubmit(payload);
      if (mode === 'view') setCurrentMode('view');
    } finally {
      setSubmitting(false);
    }
  };

  const updateValue = (field: FieldDef, value: unknown) => {
    setValues(prev => ({ ...prev, [field.key]: value }));
    if (!field.computed) {
      setErrors(prev => ({ ...prev, [field.key]: validateField(field, value) }));
    }
  };

  const gridClass = cn(
    'grid gap-x-6 gap-y-4',
    columns === 2 && 'grid-cols-2',
    columns === 3 && 'grid-cols-3',
    columns === 1 && 'grid-cols-1',
  );

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {/* View mode header */}
      {mode === 'view' && (
        <div className="flex items-center justify-end">
          {isViewMode ? (
            <Button type="button" size="sm" variant="outline" onClick={() => setCurrentMode('edit')}>
              <Pencil className="mr-1 h-3.5 w-3.5" />
              編輯
            </Button>
          ) : (
            <Button type="button" size="sm" variant="ghost" onClick={() => setCurrentMode('view')}>
              取消編輯
            </Button>
          )}
        </div>
      )}

      <div className={gridClass}>
        {visibleFields.map(field => {
          const app = fieldAppearance.get(field.key);
          const effectiveRequired = field.required || app?.required;

          return (
            <FormItem
              key={field.key}
              className={cn(isFullWidth(field) && columns > 1 && 'col-span-full')}
            >
              <Label
                htmlFor={field.key}
                style={app?.text_color ? { color: app.text_color } : undefined}
              >
                {field.label}
                {effectiveRequired && !field.computed && !isViewMode
                  ? <span className="ml-0.5 text-destructive">*</span>
                  : null}
                {field.computed
                  ? <span className="ml-1 text-xs text-muted-foreground">（自動計算）</span>
                  : null}
              </Label>
              {isViewMode ? (
                <ReadonlyValue field={field} value={values[field.key]} allValues={values} appearance={app} />
              ) : (
                <FieldInput
                  field={field}
                  value={values[field.key]}
                  formValues={values}
                  onChange={value => updateValue(field, value)}
                  appearance={app}
                />
              )}
              {!isViewMode && errors[field.key]
                ? <FormMessage>{errors[field.key]}</FormMessage>
                : null}
            </FormItem>
          );
        })}
      </div>

      {!isViewMode && onSubmit && (
        <div className="flex justify-end gap-2 pt-2">
          {onCancel && (
            <Button type="button" variant="outline" onClick={onCancel} disabled={submitting}>
              取消
            </Button>
          )}
          {mode === 'view' && (
            <Button type="button" variant="ghost" onClick={() => setCurrentMode('view')} disabled={submitting}>
              取消
            </Button>
          )}
          <Button type="submit" disabled={submitting}>
            {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            {submitting ? '儲存中...' : '儲存'}
          </Button>
        </div>
      )}
    </form>
  );
}

// ─── ReadonlyValue ────────────────────────────────────────────────────────────

function ReadonlyValue({
  field,
  value,
  allValues,
  appearance,
}: {
  field: FieldDef;
  value: unknown;
  allValues: Record<string, unknown>;
  appearance?: AppearanceEffect;
}) {
  const textStyle = appearance?.text_color
    ? { color: appearance.text_color, fontWeight: appearance.font_weight }
    : appearance?.font_weight
    ? { fontWeight: appearance.font_weight }
    : undefined;

  const bgClass = appearance?.bg_color ? 'rounded px-1' : '';
  const bgStyle = appearance?.bg_color ? { backgroundColor: appearance.bg_color } : undefined;

  // relation: 優先顯示 __display 值
  if (field.type === 'relation') {
    const display = allValues[`${field.key}__display`] ?? value;
    if (display === null || display === undefined || display === '') {
      return <p className="py-1 text-sm text-muted-foreground">-</p>;
    }
    return (
      <p className={cn('py-1 text-sm', bgClass)} style={{ ...textStyle, ...bgStyle }}>
        {String(display)}
      </p>
    );
  }

  if (value === null || value === undefined || value === '') {
    return <p className="py-1 text-sm text-muted-foreground">-</p>;
  }

  switch (field.type) {
    case 'boolean':
      return (
        <p className={cn('py-1 text-sm', bgClass)} style={{ ...textStyle, ...bgStyle }}>
          {Boolean(value) ? '是' : '否'}
        </p>
      );
    case 'currency': {
      const num = Number(value);
      return (
        <p className={cn('py-1 text-sm', bgClass)} style={{ ...textStyle, ...bgStyle }}>
          {isFinite(num)
            ? `$${num.toLocaleString('zh-TW', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`
            : String(value)}
        </p>
      );
    }
    case 'phone':
      return (
        <a href={`tel:${value}`} className={cn('py-1 text-sm text-primary hover:underline', bgClass)} style={{ ...textStyle, ...bgStyle }}>
          {String(value)}
        </a>
      );
    case 'email':
      return (
        <a href={`mailto:${value}`} className={cn('py-1 text-sm text-primary hover:underline', bgClass)} style={{ ...textStyle, ...bgStyle }}>
          {String(value)}
        </a>
      );
    case 'url':
      return (
        <a href={String(value)} target="_blank" rel="noreferrer" className={cn('py-1 text-sm text-primary hover:underline', bgClass)} style={{ ...textStyle, ...bgStyle }}>
          {String(value)}
        </a>
      );
    default:
      return (
        <p className={cn('py-1 text-sm', bgClass)} style={{ ...textStyle, ...bgStyle }}>
          {String(value)}
        </p>
      );
  }
}
