import { getSignInHomeUrlForProfile, getSiteProfileBySiteId } from './siteProfiles';

/**
 * URL to load in the site's persisted partition to keep cookies warm.
 * Known profiles use rollout sign-in home; unknown keys need a `domainLabel` that looks like a hostname.
 */
export function resolveSiteSessionRefreshSeedUrl(
    siteKey: string,
    domainLabelWhenUnknownProfile?: string | null
): string | null {
    const profile = getSiteProfileBySiteId(siteKey);
    if (profile) {
        return getSignInHomeUrlForProfile(profile);
    }
    const label = domainLabelWhenUnknownProfile?.trim() ?? '';
    if (!label.includes('.')) {
        return null;
    }
    try {
        const href = label.includes('://') ? label : `https://${label}`;
        const u = new URL(href);
        if (u.protocol !== 'https:' && u.protocol !== 'http:') {
            return null;
        }
        return u.href;
    } catch {
        return null;
    }
}
