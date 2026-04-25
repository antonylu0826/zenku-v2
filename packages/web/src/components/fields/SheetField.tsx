import { memo, useCallback, useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { LocaleType, Workbook } from '@univerjs/core';
import { defaultTheme } from '@univerjs/design';
import { createUniver } from '@univerjs/presets';
import { UniverSheetsCorePreset } from '@univerjs/preset-sheets-core';
import { UniverDocsCorePreset } from '@univerjs/preset-docs-core';
import { getUniverLocales, parseWorkbookData, READONLY_EVENTS_TO_BLOCK } from './univer-utils';
import { cn } from '../../lib/cn';
import type { FieldInputInnerProps, FieldReadonlyProps } from './registry';

// Univer CSS — loaded only when this chunk is imported (lazy-loaded from registry)
import '@univerjs/presets/lib/styles/preset-sheets-core.css';

// ─── SheetInput ───────────────────────────────────────────────────────────────

export const SheetInput = memo(function SheetInput({ value, onChange, disabled }: FieldInputInnerProps) {
  const { i18n } = useTranslation();
  const containerRef   = useRef<HTMLDivElement>(null);
  const workbookRef    = useRef<Workbook | null>(null);
  const lastJsonRef    = useRef<string>('');
  const apiRef         = useRef<any>(null);
  // Stable ref for onChange — prevents effect re-run when parent re-renders
  const onChangeRef    = useRef(onChange);
  useEffect(() => { onChangeRef.current = onChange; }, [onChange]);

  const locale = i18n.language.startsWith('zh') ? LocaleType.ZH_TW : LocaleType.EN_US;

  // syncToForm only depends on disabled, not on onChange (use ref instead)
  const syncToForm = useCallback(() => {
    if (!workbookRef.current || disabled) return;
    try {
      const snapshot = workbookRef.current.save();
      const json = JSON.stringify(snapshot);
      if (json !== lastJsonRef.current) {
        lastJsonRef.current = json;
        onChangeRef.current?.(json);
      }
    } catch (e) {
      console.error('[SheetField] sync failed:', e);
    }
  }, [disabled]);

  useEffect(() => {
    if (!containerRef.current) return;

    let univerInst: any = null;
    let cancelled = false;
    const disposables: { dispose: () => void }[] = [];

    const handleGlobalPointerDown = async () => {
      if (!apiRef.current || disabled) return;
      try {
        const wb = apiRef.current.getActiveWorkbook();
        if (wb) { await wb.endEditingAsync(true); syncToForm(); }
      } catch { /* ignore */ }
    };

    const blockEdit = (e: Event) => {
      if (!disabled) return;
      if (containerRef.current?.contains(e.target as Node)) {
        if (e.type === 'wheel' || e.type === 'scroll') return;
        e.preventDefault();
        e.stopImmediatePropagation();
      }
    };

    const timer = setTimeout(() => {
      if (cancelled) return;

      const { univer, univerAPI } = createUniver({
        theme: defaultTheme,
        locale,
        locales: getUniverLocales(),
        presets: [
          UniverDocsCorePreset(),
          UniverSheetsCorePreset({
            container: containerRef.current!,
            header:      !disabled,
            toolbar:     !disabled,
            footer:      disabled ? false : { sheetBar: true, statisticBar: true },
            contextMenu: !disabled,
          }),
        ],
      });

      univerInst = univer;
      apiRef.current = univerAPI;

      const snapshot = parseWorkbookData(value);
      const wb = univer.createUnit(2, snapshot) as Workbook;
      workbookRef.current = wb;
      lastJsonRef.current = JSON.stringify(snapshot);

      if (disabled) {
        try {
          const activeWb = univerAPI.getActiveWorkbook();
          if (activeWb?.setEditable) activeWb.setEditable(false);
        } catch { /* ignore SDK mismatch */ }
        READONLY_EVENTS_TO_BLOCK.forEach(type =>
          window.addEventListener(type, blockEdit, true)
        );
      } else {
        disposables.push(univerAPI.onCommandExecuted(() => syncToForm()));
        window.addEventListener('pointerdown', handleGlobalPointerDown, true);
      }
    }, 50);

    return () => {
      cancelled = true;
      clearTimeout(timer);
      window.removeEventListener('pointerdown', handleGlobalPointerDown, true);
      READONLY_EVENTS_TO_BLOCK.forEach(type =>
        window.removeEventListener(type, blockEdit, true)
      );
      disposables.forEach(d => d.dispose());
      if (workbookRef.current && !disabled) {
        onChangeRef.current?.(JSON.stringify(workbookRef.current.save()));
      }
      if (univerInst) setTimeout(() => univerInst.dispose(), 0);
      workbookRef.current = null;
      apiRef.current = null;
    };
  }, [syncToForm, locale, disabled]); // intentionally exclude value — Univer owns state after mount

  return (
    <div
      ref={containerRef}
      className={cn(
        'relative w-full overflow-hidden rounded-md border transition-opacity',
        disabled ? 'bg-muted/5 opacity-90' : 'bg-background',
      )}
      style={{ height: '420px', overscrollBehavior: 'contain' }}
      onWheel={e => e.stopPropagation()}
      onClick={e => {
        e.stopPropagation();
        if (disabled) return;
        const t = e.target as HTMLElement;
        if (t.tagName === 'BUTTON' || t.closest('button')) e.preventDefault();
      }}
    />
  );
});

// ─── SheetReadonly ────────────────────────────────────────────────────────────

export function SheetReadonly({ value }: FieldReadonlyProps) {
  return <SheetInput field={{} as any} value={value} formValues={{}} onChange={() => {}} disabled />;
}
