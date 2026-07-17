import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import { RENDERER_NAMESPACES } from './namespaces';

const MAIN_ONLY_NAMESPACES = new Set(['menu', 'update']);

// Lazy glob: each locale JSON is a separate code-split chunk.
// Only the requested language (+ English fallback) are fetched at runtime.
const localeModules = import.meta.glob('./locales/*/*.json') as Record<
    string,
    () => Promise<{ default: Record<string, unknown> }>
>;

/**
 * Derive the full list of supported language codes from the glob path keys.
 * No files are loaded — this only reads the string paths that Vite resolved at build time.
 */
function getSupportedLanguages(): string[] {
    return [
        ...new Set(
            Object.keys(localeModules)
                .map((p) => p.match(/\.\/locales\/([^/]+)\//)?.[1])
                .filter((lng): lng is string => Boolean(lng))
        )
    ];
}

/**
 * Load only the namespaces for the requested languages (selected locale + 'en' fallback).
 * All other locales are left as lazy chunks and never fetched.
 */
async function loadLocaleResources(
    language: string
): Promise<Record<string, Record<string, Record<string, unknown>>>> {
    const targetLangs = new Set(['en']);
    if (language && language !== 'en') {
        // Also try the base language code (e.g. 'pt' for 'pt_BR').
        const base = language.split(/[-_]/)[0];
        if (base) {
            targetLangs.add(base);
        }
        targetLangs.add(language);
    }

    const resources: Record<string, Record<string, Record<string, unknown>>> = {};

    await Promise.all(
        Object.entries(localeModules).map(async ([path, loadFn]) => {
            const match = path.match(/\.\/locales\/([^/]+)\/([^/]+)\.json$/);
            if (!match) return;
            const [, lng, ns] = match;
            if (!lng || !ns || MAIN_ONLY_NAMESPACES.has(ns)) return;
            if (!targetLangs.has(lng)) return;

            const mod = await loadFn();
            if (!resources[lng]) resources[lng] = {};
            resources[lng][ns] = mod.default;
        })
    );

    return resources;
}

export async function initRendererI18n(language: string): Promise<typeof i18n> {
    const resources = await loadLocaleResources(language);
    const supportedLngs = getSupportedLanguages();

    if (!i18n.isInitialized) {
        await i18n.use(initReactI18next).init({
            lng: language,
            fallbackLng: 'en',
            supportedLngs,
            ns: [...RENDERER_NAMESPACES],
            defaultNS: 'common',
            resources,
            interpolation: { escapeValue: false },
            react: { useSuspense: false }
        });
        return i18n;
    }

    // On language change: load resources for the new language if not already present.
    if (!i18n.hasResourceBundle(language, 'common')) {
        const newResources = await loadLocaleResources(language);
        for (const [lng, namespaces] of Object.entries(newResources)) {
            for (const [ns, translations] of Object.entries(namespaces)) {
                i18n.addResourceBundle(lng, ns, translations, true, false);
            }
        }
    }

    await i18n.changeLanguage(language);
    return i18n;
}

export default i18n;
