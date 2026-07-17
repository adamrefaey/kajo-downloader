/** Main → renderer: embedded site-auth browser loading spinner. */
export interface SiteAuthLoadingPayload {
    loading: boolean;
}

/** Main → renderer: current URL / history flags for the auth WebContentsView. */
export interface SiteAuthUrlStatePayload {
    url: string;
    canGoBack: boolean;
    canGoForward: boolean;
    title: string;
}

/** Main → renderer: user tried to open a disallowed host. */
export interface SiteAuthNavBlockedPayload {
    url: string;
}

/** Cookie jar re-read / persistence result (save, status refresh, clear). */
export type SiteAuthCookieRefreshOutcome = 'success' | 'failure' | 'skipped';

export interface SiteAuthCookieRefreshPayload {
    siteKey: string;
    outcome: SiteAuthCookieRefreshOutcome;
    cookieCount?: number;
    error?: string;
}

/** Coarse health for persisted site cookie snapshots (renderer + main). */
export type SiteCookieHealth = 'unknown' | 'healthy' | 'expiring_soon' | 'expired' | 'missing';

/** One row for the signed-sites list (main is source of truth for cookie data). */
export interface SignedSiteSummary {
    siteKey: string;
    /** Known profile id when the key maps to rollout config; otherwise same as storage slug. */
    siteId: string;
    displayName: string;
    /** Primary hostname label for chips / avatar fallback. */
    domainLabel: string;
    signedInAs: string | null;
    lastSavedAt: number;
    cookieCount: number;
    /** Earliest persistent cookie expiry, ms since epoch, or null when only session cookies. */
    expiresAt: number | null;
    cookieHealth: SiteCookieHealth;
}
