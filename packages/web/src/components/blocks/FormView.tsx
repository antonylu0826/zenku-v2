import type React from 'react';
import { useState } from 'react';
import { Loader2, Pencil } from 'lucide-react';
import type { FieldDef } from '../../types';
import { Button } from '../ui/button';
import { FormItem, FormMessage } from '../ui/form';
import { Label } from '../ui/label';
import { FieldInput } from '../fields';

export type FormMode = 'create' | 'edit' | 'view';

interface Props {
  fields: FieldDef[];
  initialValues?: Record<string, unknown>;
  mode?: FormMode;
  onSubmit?: (data: Record<string, unknown>) => Promise<void>;
  onCancel?: () => void;
}

type ErrorMap = Record<string, string | null>;

export function FormView({ fields, initialValues = {}, mode = 'create', onSubmit, onCancel }: Props) {
  const visibleFields = fields.filter(field => !field.hidden_in_form);

  const [values, setValues] = useState<Record<string, unknown>>(() => {
    const init: Record<string, unknown> = {};
    for (const field of visibleFields) {
      init[field.key] = initialValues[field.key] ?? (field.type === 'boolean' ? false : '');
    }
    return init;
  });
  const [errors, setErrors] = useState<ErrorMap>({});
  const [submitting, setSubmitting] = useState(false);
  const [currentMode, setCurrentMode] = useState<FormMode>(mode);

  // Sync values when initialValues change (e.g. after save)
  const isViewMode = currentMode === 'view';

  const validateField = (field: FieldDef, value: unknown): string | null => {
    if (field.computed) return null;
    const stringValue = String(value ?? '').trim();
    if (field.required && (value === null || value === undefined || stringValue === '')) {
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
      await onSubmit(values);
      if (mode === 'view') setCurrentMode('view'); // go back to view after save
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

      {visibleFields.map(field => (
        <FormItem key={field.key}>
          <Label htmlFor={field.key}>
            {field.label}
            {field.required && !field.computed && !isViewMode ? ' *' : ''}
            {field.computed ? <span className="ml-1 text-xs text-muted-foreground">（自動計算）</span> : null}
          </Label>
          {isViewMode ? (
            <ReadonlyValue field={field} value={values[field.key]} />
          ) : (
            <FieldInput
              field={field}
              value={values[field.key]}
              formValues={values}
              onChange={value => updateValue(field, value)}
            />
          )}
          {!isViewMode && errors[field.key] ? <FormMessage>{errors[field.key]}</FormMessage> : null}
        </FormItem>
      ))}

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

function ReadonlyValue({ field, value }: { field: FieldDef; value: unknown }) {
  if (value === null || value === undefined || value === '') {
    return <p className="py-1 text-sm text-muted-foreground">-</p>;
  }
  switch (field.type) {
    case 'boolean':
      return <p className="py-1 text-sm">{Boolean(value) ? '是' : '否'}</p>;
    case 'currency': {
      const num = Number(value);
      return <p className="py-1 text-sm">{isFinite(num) ? `$${num.toLocaleString('zh-TW', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}` : String(value)}</p>;
    }
    default:
      return <p className="py-1 text-sm">{String(value)}</p>;
  }
}
