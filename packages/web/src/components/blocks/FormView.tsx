import type React from 'react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Loader2, Pencil } from 'lucide-react';
import type { AppearanceEffect, CustomViewAction, FieldDef, FieldType, ViewAction } from '../../types';
import { evaluateAppearanceCondition, resolveAppearance } from '../../types';
import { executeViewAction } from '../../api';
import { Button } from '../ui/button';
import { FormItem, FormMessage } from '../ui/form';
import { Label } from '../ui/label';
import { FieldInput, FIELD_REGISTRY } from '../fields';
import { cn } from '../../lib/cn';
import { useOnChangeEvaluation } from '../../hooks/useOnChangeEvaluation';
import { StatusStepper, type StateMachineConfig } from '../ui/status-stepper';
import { DynamicIcon } from '../ui/dynamic-icon';
import { toast } from 'sonner';

// ─── Types ───────────────────────────────────────────────────────────────────

export type FormMode = 'create' | 'edit' | 'view';

type ErrorMap = Record<string, string | null>;

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
  /** View ID — required for executing custom view actions */
  viewId?: string;
  /** Table name — enables on_change rule evaluation when provided */
  tableName?: string;
  /** Injected table traits (e.g. state_machine) */
  traits?: Array<{ trait_name: string; config: unknown }>;
  /** All view actions — custom (non-string) actions are rendered as footer buttons */
  actions?: ViewAction[];
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function isFullWidth(field: FieldDef): boolean {
  return !!FIELD_REGISTRY[field.type as FieldType]?.fullWidth || !!field.computed;
}

function buildInitValues(
  initialValues: Record<string, unknown>,
  allFormFields: FieldDef[],
): Record<string, unknown> {
  const init: Record<string, unknown> = { ...initialValues };
  for (const field of allFormFields) {
    init[field.key] = initialValues[field.key] ?? (field.type === 'boolean' ? false : '');
  }
  return init;
}

// ─── Component ───────────────────────────────────────────────────────────────

export function FormView({
  fields,
  initialValues = {},
  mode = 'create',
  columns = 1,
  onSubmit,
  onCancel,
  masterRecord,
  viewId,
  tableName,
  traits,
  actions = [],
}: Props) {
  const { t } = useTranslation();

  // ── Derived config ──────────────────────────────────────────────────────────
  const smConfig = useMemo<StateMachineConfig | undefined>(
    () => traits?.find(tr => tr.trait_name === 'state_machine')?.config as StateMachineConfig | undefined,
    [traits],
  );

  const allFormFields = useMemo(() => fields.filter(f => !f.hidden_in_form), [fields]);

  const customActions = useMemo(
    () => actions.filter((a): a is CustomViewAction => typeof a !== 'string'),
    [actions],
  );

  // ── State ───────────────────────────────────────────────────────────────────
  const [values, setValues] = useState<Record<string, unknown>>(() =>
    buildInitValues(initialValues, allFormFields),
  );
  const [errors, setErrors]       = useState<ErrorMap>({});
  const [submitting, setSubmitting] = useState(false);
  const [currentMode, setCurrentMode] = useState<FormMode>(mode);

  // Sync values when initialValues actually changes (e.g. modal reopened with a different row,
  // or a custom action updates the record externally). Uses deep-compare to skip no-op re-renders.
  const prevInitRef = useRef(initialValues);
  useEffect(() => {
    if (JSON.stringify(prevInitRef.current) === JSON.stringify(initialValues)) return;
    prevInitRef.current = initialValues;
    setValues(prev => {
      const next = { ...prev };
      let changed = false;
      for (const [key, val] of Object.entries(initialValues)) {
        if (next[key] !== val) { next[key] = val; changed = true; }
      }
      for (const field of allFormFields) {
        const newVal = initialValues[field.key] ?? (field.type === 'boolean' ? false : '');
        if (next[field.key] !== newVal) { next[field.key] = newVal; changed = true; }
      }
      return changed ? next : prev;
    });
  }, [initialValues, allFormFields]);

  const { triggerOnChange } = useOnChangeEvaluation({ tableName, setValues, setErrors });

  // ── State Machine ───────────────────────────────────────────────────────────
  const currentSmState = useMemo(() => {
    if (!smConfig || !values.status) return undefined;
    return smConfig.states[values.status as string];
  }, [smConfig, values.status]);

  const stateIsEditable = !currentSmState || (currentSmState.is_editable !== false && !currentSmState.is_final);
  const isViewMode      = currentMode === 'view' || !stateIsEditable;

  // ── Appearance ──────────────────────────────────────────────────────────────
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

  const visibleFields = useMemo(
    () => allFormFields.filter(f => fieldAppearance.get(f.key)?.visibility !== 'hidden'),
    [allFormFields, fieldAppearance],
  );

  // ── Validation ──────────────────────────────────────────────────────────────
  const validateField = useCallback((field: FieldDef, value: unknown): string | null => {
    if (field.computed || field.type === 'auto_number') return null;
    const app = fieldAppearance.get(field.key);
    if (app?.visibility === 'hidden') return null;
    const isRequired = field.required || app?.required;
    const stringValue = String(value ?? '').trim();
    if (isRequired && (value === null || value === undefined || stringValue === '')) {
      return t('form.required_error', { label: field.label });
    }
    if (!field.validation) return null;
    if (typeof value === 'number') {
      if (field.validation.min !== undefined && value < field.validation.min)
        return field.validation.message ?? t('form.min_error', { label: field.label, min: field.validation.min });
      if (field.validation.max !== undefined && value > field.validation.max)
        return field.validation.message ?? t('form.max_error', { label: field.label, max: field.validation.max });
    }
    if (field.validation.pattern && stringValue) {
      if (!new RegExp(field.validation.pattern).test(stringValue))
        return field.validation.message ?? t('form.pattern_error', { label: field.label });
    }
    return null;
  }, [fieldAppearance, t]);

  const validateAll = useCallback((): boolean => {
    const nextErrors: ErrorMap = {};
    for (const field of visibleFields) {
      nextErrors[field.key] = validateField(field, values[field.key]);
    }
    setErrors(nextErrors);
    return Object.values(nextErrors).every(e => !e);
  }, [visibleFields, values, validateField]);

  // ── Handlers ────────────────────────────────────────────────────────────────
  const updateValue = useCallback((field: FieldDef, value: unknown) => {
    setValues(prev => {
      const next = { ...prev, [field.key]: value };
      triggerOnChange(field, next);
      return next;
    });
    if (!field.computed) {
      setErrors(prev => ({ ...prev, [field.key]: validateField(field, value) }));
    }
  }, [triggerOnChange, validateField]);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!validateAll() || !onSubmit) return;
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

  const handleCustomAction = useCallback(async (action: CustomViewAction) => {
    if (!viewId) return;
    setSubmitting(true);
    try {
      const result = await executeViewAction(viewId, action.id, values.id as string | number);
      toast.success(`${action.label} 成功`);
      if (onSubmit) void onSubmit(result as Record<string, unknown>);
    } catch (err) {
      toast.error(`${action.label} 失敗: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setSubmitting(false);
    }
  }, [viewId, values.id, onSubmit]);

  // ── Layout ──────────────────────────────────────────────────────────────────
  const gridClass = cn(
    'grid gap-x-6 gap-y-4',
    columns === 1 && 'grid-cols-1',
    columns === 2 && 'grid-cols-1 sm:grid-cols-2',
    columns === 3 && 'grid-cols-1 sm:grid-cols-3',
    columns === 4 && 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-4',
  );

  // Render custom action buttons (filtered by visible_when / enabled_when)
  const customActionButtons = customActions
    .filter(a => !a.visible_when || evaluateAppearanceCondition(a.visible_when, values))
    .map(a => {
      const isEnabled = !a.enabled_when || evaluateAppearanceCondition(a.enabled_when, values);
      return (
        <Button
          key={a.id}
          type="button"
          variant={a.variant === 'warning' ? 'outline' : (a.variant ?? 'outline')}
          size="sm"
          disabled={!isEnabled || submitting}
          onClick={() => void handleCustomAction(a)}
          className="gap-1.5"
        >
          {a.icon && <DynamicIcon name={a.icon as never} className="h-4 w-4" />}
          {a.label}
        </Button>
      );
    });

  // ── Render ──────────────────────────────────────────────────────────────────
  return (
    <form onSubmit={handleSubmit} className="space-y-4">

      {/* View mode: header toolbar (edit toggle + custom actions) */}
      {mode === 'view' && (
        <div className="flex items-center justify-end gap-2">
          {customActionButtons}
          {isViewMode ? (
            <Button
              type="button" size="sm" variant="outline"
              onClick={() => setCurrentMode('edit')}
              disabled={!stateIsEditable}
            >
              <Pencil className="mr-1 h-3.5 w-3.5" />
              {stateIsEditable ? t('form.edit_btn') : '唯讀狀態'}
            </Button>
          ) : (
            <Button type="button" size="sm" variant="outline" onClick={() => setCurrentMode('view')}>
              {t('form.cancel_edit_btn')}
            </Button>
          )}
        </div>
      )}

      {/* State machine stepper */}
      {smConfig && (
        <div className="mb-6 rounded-lg border bg-muted/20 p-4">
          <StatusStepper
            currentStatus={String(values[smConfig.status_field] || smConfig.initial_state)}
            config={smConfig}
          />
        </div>
      )}

      {/* Fields grid */}
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

      {/* Footer */}
      <div className="flex justify-end gap-2 border-t pt-4">
        {isViewMode ? (
          // Read-only footer: show custom action buttons only
          customActionButtons
        ) : (
          // Edit footer: cancel + save
          <>
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
            {onSubmit && (
              <Button type="submit" disabled={submitting}>
                {submitting && <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />}
                {submitting ? t('common.saving') : t('common.save')}
              </Button>
            )}
          </>
        )}
      </div>
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
  const textStyle: React.CSSProperties | undefined =
    appearance?.text_color || appearance?.font_weight
      ? { color: appearance.text_color, fontWeight: appearance.font_weight }
      : undefined;
  const bgClass = appearance?.bg_color ? 'rounded px-1' : '';
  const bgStyle = appearance?.bg_color ? { backgroundColor: appearance.bg_color } : undefined;

  const ReadonlyComponent = FIELD_REGISTRY[field.type as FieldType]?.readonly;
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
