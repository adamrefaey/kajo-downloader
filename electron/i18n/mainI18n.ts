import i18next from 'i18next';
import { normalizeLocale } from '../../src/i18n/normalizeLocale';
import { SUPPORTED_LOCALES } from '../../src/i18n/supportedLocales';

const MAIN_NAMESPACES = ['menu', 'update', 'errors'] as const;

const mainI18n = i18next.createInstance();

function buildMainResources(): Record<string, Record<string, Record<string, unknown>>> {
    const modules = import.meta.glob('../../src/i18n/locales/*/*.json', { eager: true }) as Record<
        string,
        { default: Record<string, unknown> }
    >;
    const resources: Record<string, Record<string, Record<string, unknown>>> = {};
    const allow = new Set<string>(MAIN_NAMESPACES);

    for (const [path, mod] of Object.entries(modules)) {
        const m = path.match(/locales\/([^/]+)\/([^/]+)\.json$/);
        const lng = m?.[1];
        const ns = m?.[2];
        if (!lng || !ns || !allow.has(ns)) {
            continue;
        }
        if (!resources[lng]) {
            resources[lng] = {};
        }
        resources[lng][ns] = mod.default;
    }

    return resources;
}

let resourcesCache: ReturnType<typeof buildMainResources> | null = null;

function getMainResources(): Record<string, Record<string, Record<string, unknown>>> {
    if (!resourcesCache) {
        resourcesCache = buildMainResources();
    }
    return resourcesCache;
}

export async function initMainI18n(localeTag: string): Promise<void> {
    const lng = normalizeLocale(localeTag);
    const resources = getMainResources();

    if (!mainI18n.isInitialized) {
        await mainI18n.init({
            lng,
            fallbackLng: 'en',
            supportedLngs: [...SUPPORTED_LOCALES],
            ns: [...MAIN_NAMESPACES],
            defaultNS: 'menu',
            resources,
            interpolation: { escapeValue: false }
        });
        return;
    }

    await mainI18n.changeLanguage(lng);
}

export function translateMenu(key: string): string {
    return mainI18n.t(key, { ns: 'menu' });
}

export function translateUpdate(
    key: string,
    options?: Record<string, string | number | undefined>
): string {
    return mainI18n.t(key, { ns: 'update', ...options });
}

export function translateMainError(
    key: string,
    options?: Record<string, string | number | undefined>
): string {
    return mainI18n.t(key, { ns: 'errors', ...options });
}
