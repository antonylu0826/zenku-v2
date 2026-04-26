import { ZenkuTool } from '../types';
import { bulkSetTranslations } from '../../i18n';

interface TranslationEntry {
  key: string;
  locale: string;
  content: string;
}

export const setTranslationsTool: ZenkuTool = {
  definition: {
    name: 'set_translations',
    description: `Register or update translation entries for user-defined content ($key → display text per locale).
Call this after creating schema or views when the user's language is not English, to register translations for field labels, view names, and select option labels.

Each entry must have:
- key: translation key starting with $ (e.g. "$field.tasks.title", "$view.task_list", "$opt.tasks.status.todo")
- locale: language code (e.g. "en", "zh-TW", "vi")
- content: the display text in that locale`,
    input_schema: {
      type: 'object' as const,
      properties: {
        entries: {
          type: 'array',
          description: 'Array of translation entries to upsert.',
          items: {
            type: 'object',
            properties: {
              key:     { type: 'string', description: 'Translation key, must start with $' },
              locale:  { type: 'string', description: 'Locale code, e.g. en, zh-TW' },
              content: { type: 'string', description: 'Display text for this locale' },
            },
            required: ['key', 'locale', 'content'],
          },
        },
      },
      required: ['entries'],
    },
  },

  execute: async (input: { entries?: TranslationEntry[] }) => {
    const { entries = [] } = input;
    if (!Array.isArray(entries) || entries.length === 0) {
      return { success: false, message: 'entries array is required and must not be empty.' };
    }

    const invalid = entries.filter(e => !e.key?.startsWith('$') || !e.locale || e.content === undefined);
    if (invalid.length > 0) {
      return { success: false, message: `Invalid entries: ${invalid.map(e => e.key).join(', ')}. Keys must start with $.` };
    }

    await bulkSetTranslations(entries);

    return {
      success: true,
      message: `Saved ${entries.length} translation entries.`,
      data: { count: entries.length },
    };
  },
};
