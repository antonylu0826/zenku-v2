import { useRef, useCallback } from 'react';
import { evaluateOnChange } from '../api/rules';
import type { FieldDef } from '../types';

export interface UseOnChangeEvaluationOptions<T> {
  tableName?: string;
  setValues: React.Dispatch<React.SetStateAction<T>>;
  setErrors: React.Dispatch<React.SetStateAction<Record<string, string | null>>>;
  debounceMs?: number;
}

export function useOnChangeEvaluation<T extends Record<string, unknown>>({
  tableName,
  setValues,
  setErrors,
  debounceMs = 300,
}: UseOnChangeEvaluationOptions<T>) {
  const isSystemSetRef = useRef(false);
  const onChangeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const triggerOnChange = useCallback(
    (field: FieldDef, nextValues: T) => {
      // 1. Skip if no table name, or if this is triggered by the system itself (to prevent infinite loops).
      // 2. Auto-number and computed fields do not trigger on_change events proactively.
      if (!tableName || isSystemSetRef.current || field.computed || field.type === 'auto_number') {
        return;
      }

      if (onChangeTimerRef.current) clearTimeout(onChangeTimerRef.current);

      onChangeTimerRef.current = setTimeout(async () => {
        try {
          const result = await evaluateOnChange(tableName, field.key, nextValues);

          // Apply field updates, and use a flag to prevent this setValues call from triggering another onChange
          if (Object.keys(result.updates).length > 0) {
            isSystemSetRef.current = true;
            setValues((prev) => ({ ...prev, ...result.updates }));
            // Note: Since setValues is asynchronous but React guarantees dispatch order in the same event loop,
            // simply resetting the flag synchronously here is safe. The next actual onChange will happen in a future interaction cycle.
            isSystemSetRef.current = false;
          }

          if (result.errors.length > 0) {
            setErrors((prev) => ({ ...prev, [field.key]: result.errors[0] }));
          }
        } catch (err) {
          console.error('Failed to evaluate on_change rules', err);
        }
      }, debounceMs);
    },
    [tableName, setValues, setErrors, debounceMs]
  );

  return { triggerOnChange };
}
