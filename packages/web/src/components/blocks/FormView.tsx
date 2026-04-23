import type React from 'react';
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Loader2, Pencil } from 'lucide-react';
import type { FieldDef, FieldType } from '../../types';
import type { AppearanceEffect } from '../../types';
import { resolveAppearance } from '../../types';
import { Button } from '../ui/button';
import { FormItem, FormMessage } from '../ui/form';
import { Label } from '../ui/label';
import { FieldInput, FIELD_REGISTRY } from '../fields';
import { cn } from '../../lib/cn';

export type FormMode = 'create' | 'edit' | 'view';

interface Props {
  fields: FieldDef[];
  initialValues?: Record<string, unknown>;
  mode?: FormMode;
  /** Number of form columns (default 1). textarea / computed fields always span the full row */
  columns?: 1 | 2 | 3 | 4;
  onSubmit?: (data: Record<string, unknown>) => Promise<void>;
  onCancel?: () => void;
  /** Parent master record for cross-scope appearance rules */
  masterRecord?: Record<string, unknown>;
}

function isFullWidth(field: FieldDef): boolean {
  return !!FIELD_REGISTRY[field.type as FieldType]?.fullWidth || !!field.computed;
}

type ErrorMap = Record<string, string | null>;

export function FormView({ fields, initialValues = {}, mode = 'create', columns = 1, onSubmit, onCancel, masterRecord }: Props) {
  const { t } = useTranslation();
  // Initialize values for all non-statically-hidden fields (including conditionally hidden fields, to keep tracking their values)
  const allFormFields = useMemo(() => fields.filter(f => !f.hidden_in_form), [fields]);

  const [values, setValues] = useState<Record<string, unknown>>(() => {
    const init: Record<string, unknown> = {};
    // First copy all __display fields (used for relation display)
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

  // ─── Conditional Appearance ──────────────────────────────────────────────────
  // Re-evaluate appearance effects for all fields whenever values change
  const fieldAppearance = useMemo(() => {
    const map = new Map<string, AppearanceEffect>();
    for (const field of allFormFields) {
      if (field.appearance?.length) {
        const effect = resolveAppearance(field.appearance, values, { master: masterRecord });
        if (Object.keys(effect).length > 0) map.set(field.key, effect);
      }
    }
    return map;
  }, [allFormFields, values, masterRecord]);

  // Visible fields: exclude statically hidden + conditionally hidden
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
    if (field.type === 'auto_number') return null;
    const app = fieldAppearance.get(field.key);
    // If the field is conditionally hidden, skip validation
    if (app?.visibility === 'hidden') return null;
    // Required: originally required OR required by conditional appearance
    const isRequired = field.required || app?.required;
    const stringValue = String(value ?? '').trim();
    if (isRequired && (value === null || value === undefined || stringValue === '')) {
      return t('form.required_error', { label: field.label });
    }
    if (!field.validation) return null;
    if (typeof value === 'number') {
      if (field.validation.min !== undefined && value < field.validation.min) {
        return field.validation.message ?? t('form.min_error', { label: field.label, min: field.validation.min });
      }
      if (field.validation.max !== undefined && value > field.validation.max) {
        return field.validation.message ?? t('form.max_error', { label: field.label, max: field.validation.max });
      }
    }
    if (field.validation.pattern && stringValue) {
      const regex = new RegExp(field.validation.pattern);
      if (!regex.test(stringValue)) {
        return field.validation.message ?? t('form.pattern_error', { label: field.label });
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
    columns === 2 && 'grid-cols-1 sm:grid-cols-2',
    columns === 3 && 'grid-cols-1 sm:grid-cols-3',
    columns === 4 && 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-4',
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
              {t('form.edit_btn')}
            </Button>
          ) : (
            <Button type="button" size="sm" variant="outline" onClick={() => setCurrentMode('view')}>
              {t('form.cancel_edit_btn')}
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
                {effectiveRequired && !field.computed && field.type !== 'auto_number' && !isViewMode
                  ? <span className="ml-0.5 text-destructive">*</span>
                  : null}
                {field.computed
                  ? <span className="ml-1 text-xs text-muted-foreground">{t('form.auto_calculated')}</span>
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
              {t('common.cancel')}
            </Button>
          )}
          {mode === 'view' && (
            <Button type="button" variant="outline" onClick={() => setCurrentMode('view')} disabled={submitting}>
              {t('common.cancel')}
            </Button>
          )}
          <Button type="submit" disabled={submitting}>
            {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            {submitting ? t('common.saving') : t('common.save')}
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

  const entry = FIELD_REGISTRY[field.type as FieldType];
  const ReadonlyComponent = entry?.readonly;
  if (!ReadonlyComponent) return <p className="py-1 text-sm text-muted-foreground">-</p>;

  return (
    <ReadonlyComponent
      field={field}
      value={value}
      allValues={allValues}
      textStyle={textStyle}
      bgClass={bgClass}
      bgStyle={bgStyle}
    />
  );
}
