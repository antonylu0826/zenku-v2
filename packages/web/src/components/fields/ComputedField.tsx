import { useEffect, useRef } from 'react';
import { Input } from '../ui/input';
import { evaluateFormula } from '@zenku/shared';
import type { FieldDef } from '../../types';

interface Props {
  field: FieldDef;
  formValues: Record<string, unknown>;
  onChange: (value: unknown) => void;
}

function formatValue(value: number, format?: string): string {
  if (!isFinite(value)) return '';
  switch (format) {
    case 'currency':
      return `$${value.toLocaleString('zh-TW', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;
    case 'percent':
      return `${(value * 100).toFixed(1)}%`;
    default:
      return value % 1 === 0 ? String(value) : value.toFixed(2);
  }
}

export function ComputedField({ field, formValues, onChange }: Props) {
  const computed = field.computed!;
  // 用 ref 追蹤 onChange，避免 effect 依賴它
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

  // 依賴的值序列化為字串，只在值真正改變時重算
  const depValuesKey = computed.dependencies
    .map(d => String(formValues[d] ?? ''))
    .join('|');

  useEffect(() => {
    try {
      const depValues: Record<string, number> = {};
      for (const dep of computed.dependencies) {
        depValues[dep] = Number(formValues[dep]) || 0;
      }
      const result = evaluateFormula(computed.formula, depValues);
      onChangeRef.current(result);
    } catch {
      // 公式錯誤時不更新
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [depValuesKey, computed.formula]);

  // 計算顯示值
  let displayValue = '';
  try {
    const depValues: Record<string, number> = {};
    for (const dep of computed.dependencies) {
      depValues[dep] = Number(formValues[dep]) || 0;
    }
    const result = evaluateFormula(computed.formula, depValues);
    displayValue = formatValue(result, computed.format);
  } catch {
    displayValue = '';
  }

  return (
    <Input
      value={displayValue}
      disabled
      className="bg-muted/50 text-muted-foreground"
      placeholder="自動計算"
    />
  );
}
