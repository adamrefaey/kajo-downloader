import type { SiteProfile } from './siteProfiles';

/** OAuth / CDN hosts commonly hit while signing into YouTube via Google. */
const YOUTUBE_SIGNIN_EXTRA_SUFFIXES = [
    'google.com',
    /** Token / OAuth API calls during Google sign-in */
    'googleapis.com',
    'gstatic.com',
    'googleusercontent.com',
    'recaptcha.net',
    'gvt1.com',
    /** Regional Google account domains (EU / APAC redirects) */
    'google.co.uk',
    'google.de',
    'google.fr',
    'google.it',
    'google.es',
    'google.nl',
    'google.pl',
    'google.co.jp',
    'google.com.br',
    'google.com.au',
    'google.co.in',
    'google.ca',
    'google.com.mx',
    'google.com.tr',
    'google.co.kr',
    'google.com.tw',
    'google.com.hk',
    'google.co.za',
    'google.com.ar',
    'google.co.nz',
    'google.com.sg',
    'google.be',
    'google.at',
    'google.ch',
    'google.se',
    'google.no',
    'google.dk',
    'google.fi',
    'google.cz',
    'google.pt',
    'google.gr',
    'google.ie',
    'google.co.il',
    'google.ae',
    'google.sa',
    'google.eg'
];

function normalizeHost(hostname: string): string {
    return hostname.trim().toLowerCase().replace(/\.$/, '');
}

function hostMatchesDomainSuffix(host: string, domainSuffix: string): boolean {
    const h = normalizeHost(host);
    const d = domainSuffix.trim().toLowerCase();
    if (!h || !d) {
        return false;
    }
    return h === d || h.endsWith(`.${d}`);
}

/**
 * Returns true when `hostname` may receive cookies in the embedded auth session for this site.
 * Unknown profiles fall back to the registrable-style host of the initial URL only.
 */
export function isHostnameAllowedForSiteAuthSession(
    hostname: string,
    profile: SiteProfile | undefined,
    fallbackRootHost: string
): boolean {
    const h = normalizeHost(hostname);
    if (!h) {
        return false;
    }

    if (profile?.domains?.length) {
        for (const d of profile.domains) {
            if (hostMatchesDomainSuffix(h, d)) {
                return true;
            }
        }
        if (profile.siteId === 'youtube') {
            for (const d of YOUTUBE_SIGNIN_EXTRA_SUFFIXES) {
                if (hostMatchesDomainSuffix(h, d)) {
                    return true;
                }
            }
        }
        return false;
    }

    const root = normalizeHost(fallbackRootHost);
    if (!root) {
        return false;
    }
    return hostMatchesDomainSuffix(h, root);
}

export function listAllowedDomainSuffixesForSiteAuth(
    profile: SiteProfile | undefined,
    fallbackRootHost: string
): string[] {
    if (profile?.domains?.length) {
        const base = [...profile.domains.map((d) => d.toLowerCase())];
        if (profile.siteId === 'youtube') {
            base.push(...YOUTUBE_SIGNIN_EXTRA_SUFFIXES);
        }
        return [...new Set(base)];
    }
    const root = normalizeHost(fallbackRootHost);
    return root ? [root] : [];
}

/**
 * Whether a cookie's `domain` attribute is on the same allowlist used for embedded navigation.
 * Prevents persisting unrelated third-party cookies (can be thousands) into the encrypted vault.
 */
export function isCookieDomainAllowedForSiteAuth(
    cookieDomain: string | undefined,
    allowedSuffixes: string[]
): boolean {
    if (!allowedSuffixes.length) {
        return false;
    }
    const raw = (cookieDomain ?? '').trim().toLowerCase().replace(/^\./, '');
    if (!raw) {
        return false;
    }
    for (const suffix of allowedSuffixes) {
        if (hostMatchesDomainSuffix(raw, suffix)) {
            return true;
        }
    }
    return false;
}
