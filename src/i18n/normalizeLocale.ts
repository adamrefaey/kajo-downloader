import { isSupportedLocale, SUPPORTED_LOCALES, type SupportedLocale } from './supportedLocales';

function normalizeTag(raw: string): string {
    return raw.trim().replace(/_/g, '-').replace(/\s+/g, '');
}

/** Map a single preference tag to a supported locale, or null if unrecognized. */
export function matchNavigatorLocale(raw: string | null | undefined): SupportedLocale | null {
    if (!raw) {
        return null;
    }
    const tag = normalizeTag(raw).toLowerCase();
    if (isSupportedLocale(tag)) {
        return tag;
    }

    const primary = tag.split('-')[0] ?? tag;

    if (primary === 'zh') {
        return 'zh-CN';
    }
    if (tag.startsWith('pt')) {
        return 'pt';
    }
    if (primary === 'en') {
        return 'en';
    }
    if (primary === 'es') {
        return 'es';
    }
    if (primary === 'ar') {
        return 'ar';
    }
    if (primary === 'fr') {
        return 'fr';
    }
    if (primary === 'de') {
        return 'de';
    }
    if (primary === 'ru') {
        return 'ru';
    }
    if (primary === 'ja') {
        return 'ja';
    }
    if (primary === 'hi') {
        return 'hi';
    }

    for (const candidate of SUPPORTED_LOCALES) {
        if (candidate.toLowerCase() === tag) {
            return candidate;
        }
    }

    return null;
}

/** First supported locale from an ordered preference list (e.g. `navigator.languages`). */
export function bestLocaleFromNavigatorLanguages(
    languages: readonly string[] | null | undefined
): SupportedLocale {
    if (!languages?.length) {
        return 'en';
    }
    for (const raw of languages) {
        const m = matchNavigatorLocale(raw);
        if (m) {
            return m;
        }
    }
    return 'en';
}

/** Map system / browser tags to a supported locale, defaulting to English. */
export function normalizeLocale(raw: string | null | undefined): SupportedLocale {
    return matchNavigatorLocale(raw) ?? 'en';
}
