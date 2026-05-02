export const SUPPORTED_LANGUAGES = [
  { code: 'zh-TW', label: '中文', name: '繁體中文' },
  { code: 'en',    label: 'EN',   name: 'English'   },
] as const;

export type LanguageCode = (typeof SUPPORTED_LANGUAGES)[number]['code'];
