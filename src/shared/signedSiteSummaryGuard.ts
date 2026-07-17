import type { SignedSiteSummary, SiteCookieHealth } from '../types';

const ALLOWED_HEALTH = new Set<SiteCookieHealth>([
    'unknown',
    'healthy',
    'expiring_soon',
    'expired',
    'missing'
]);

/** Defensive check for IPC / persisted rows so a bad payload cannot crash the renderer. */
export function isSignedSiteSummary(value: unknown): value is SignedSiteSummary {
    if (!value || typeof value !== 'object') {
        return false;
    }
    const r = value as Record<string, unknown>;
    return (
        typeof r.siteKey === 'string' &&
        r.siteKey.length > 0 &&
        typeof r.siteId === 'string' &&
        typeof r.displayName === 'string' &&
        typeof r.domainLabel === 'string' &&
        (r.signedInAs === null || typeof r.signedInAs === 'string') &&
        typeof r.lastSavedAt === 'number' &&
        Number.isFinite(r.lastSavedAt) &&
        typeof r.cookieCount === 'number' &&
        Number.isFinite(r.cookieCount) &&
        (r.expiresAt === null ||
            (typeof r.expiresAt === 'number' && Number.isFinite(r.expiresAt))) &&
        typeof r.cookieHealth === 'string' &&
        ALLOWED_HEALTH.has(r.cookieHealth as SiteCookieHealth)
    );
}
