/** Supported UI languages by global reach (web + speakers); BCP 47 tags. */
export const SUPPORTED_LOCALES = [
    'en',
    'es',
    'zh-CN',
    'ar',
    'fr',
    'de',
    'pt',
    'ru',
    'ja',
    'hi',
    'ko'
] as const;

export type SupportedLocale = (typeof SUPPORTED_LOCALES)[number];

/** UI labels for the language picker (in each language's own name). */
export const LOCALE_LABELS: Record<SupportedLocale, string> = {
    en: 'English',
    es: 'Español',
    'zh-CN': '简体中文',
    ar: 'العربية',
    fr: 'Français',
    de: 'Deutsch',
    pt: 'Português',
    ru: 'Русский',
    ja: '日本語',
    hi: 'हिन्दी',
    ko: '한국어'
};

/** Regional flag emoji for the picker (decorative; not all locales map 1:1 to a state). */
export const LOCALE_FLAGS: Record<SupportedLocale, string> = {
    en: '🇺🇸',
    es: '🇪🇸',
    'zh-CN': '🇨🇳',
    ar: '🇸🇦',
    fr: '🇫🇷',
    de: '🇩🇪',
    pt: '🇧🇷',
    ru: '🇷🇺',
    ja: '🇯🇵',
    hi: '🇮🇳',
    ko: '🇰🇷'
};

export function isSupportedLocale(value: string | null | undefined): value is SupportedLocale {
    return Boolean(value && (SUPPORTED_LOCALES as readonly string[]).includes(value));
}
