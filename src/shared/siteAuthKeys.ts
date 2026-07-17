import { getSiteProfileByHostOrUrl } from './siteProfiles';

function tryHostnameFromUrl(raw: string): string {
    const trimmed = raw.trim();
    if (!trimmed) {
        return '';
    }
    try {
        const withScheme = trimmed.includes('://') ? trimmed : `https://${trimmed}`;
        return new URL(withScheme).hostname.toLowerCase();
    } catch {
        return '';
    }
}

export function sanitizeSiteStorageKey(raw: string): string {
    const slug = raw
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '');
    return slug || 'site';
}

/**
 * Stable key for per-site auth partition + encrypted cookie snapshot storage.
 * Prefer known `siteId` from resolver / profile; otherwise derive from hostname.
 */
export function resolveSiteCookieStorageKey(input: {
    url: string;
    siteId?: string;
    siteDomain?: string;
}): string {
    const sid = input.siteId?.trim();
    if (sid) {
        return sanitizeSiteStorageKey(sid);
    }
    const profile = getSiteProfileByHostOrUrl(input.url);
    if (profile?.siteId) {
        return sanitizeSiteStorageKey(profile.siteId);
    }
    const host = (input.siteDomain?.trim() || tryHostnameFromUrl(input.url)).toLowerCase();
    return sanitizeSiteStorageKey(host || 'unknown');
}
