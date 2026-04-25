import { LocaleType } from '@univerjs/core';
import { mergeLocales } from '@univerjs/presets';

import UniverPresetSheetsCoreZhTW from '@univerjs/preset-sheets-core/locales/zh-TW';
import UniverPresetDocsCoreZhTW  from '@univerjs/preset-docs-core/locales/zh-TW';
import DesignZhTW                from '@univerjs/design/locale/zh-TW';
import UIZhTW                    from '@univerjs/ui/locale/zh-TW';
import DocsUIZhTW                from '@univerjs/docs-ui/locale/zh-TW';
import SheetsUIZhTW              from '@univerjs/sheets-ui/locale/zh-TW';

import UniverPresetSheetsCoreEnUS from '@univerjs/preset-sheets-core/locales/en-US';
import UniverPresetDocsCoreEnUS   from '@univerjs/preset-docs-core/locales/en-US';
import DesignEnUS                 from '@univerjs/design/locale/en-US';
import UIEnUS                     from '@univerjs/ui/locale/en-US';
import DocsUIEnUS                 from '@univerjs/docs-ui/locale/en-US';
import SheetsUIEnUS               from '@univerjs/sheets-ui/locale/en-US';

export function getUniverLocales() {
  return {
    [LocaleType.ZH_TW]: mergeLocales(
      DesignZhTW, UIZhTW, DocsUIZhTW, SheetsUIZhTW,
      UniverPresetSheetsCoreZhTW, UniverPresetDocsCoreZhTW,
    ),
    [LocaleType.EN_US]: mergeLocales(
      DesignEnUS, UIEnUS, DocsUIEnUS, SheetsUIEnUS,
      UniverPresetSheetsCoreEnUS, UniverPresetDocsCoreEnUS,
    ),
  };
}

const DEFAULT_SNAPSHOT = {
  id: 'workbook-1',
  sheetOrder: ['sheet-1'],
  name: 'Workbook',
  appVersion: '3.0.0-alpha',
  sheets: {
    'sheet-1': { id: 'sheet-1', name: 'Sheet1', cellData: {} },
  },
};

export function parseWorkbookData(value: unknown): typeof DEFAULT_SNAPSHOT {
  if (!value || typeof value !== 'string' || value.trim() === '') return DEFAULT_SNAPSHOT;
  try { return JSON.parse(value); } catch { return DEFAULT_SNAPSHOT; }
}

export const READONLY_EVENTS_TO_BLOCK = [
  'keydown', 'keypress', 'keyup',
  'mousedown', 'pointerdown',
  'click', 'dblclick',
] as const;
