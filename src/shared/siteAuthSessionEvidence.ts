/**
 * Heuristics: only persist a “site session” when cookies plausibly include an account login,
 * not merely consent / analytics / anonymous state (fixes “session” rows after opening the site without signing in).
 */
export function persistedCookiesLookLikeSignedIn(
    siteKey: string,
    cookies: ReadonlyArray<{ name: string }>
): boolean {
    if (cookies.length === 0) {
        return false;
    }
    const names = new Set(cookies.map((c) => c.name));
    const id = siteKey.trim().toLowerCase();

    switch (id) {
        case 'youtube':
            return (
                names.has('LOGIN_INFO') ||
                names.has('__Secure-1PSID') ||
                names.has('__Secure-3PSID') ||
                names.has('__Secure-1PSIDTS') ||
                names.has('__Secure-3PSIDTS')
            );
        case 'tiktok':
            return names.has('sessionid') || names.has('sid_tt');
        case 'instagram':
            return names.has('sessionid') && names.has('ds_user_id');
        case 'facebook':
            return names.has('c_user') && names.has('xs');
        case 'twitter':
            return names.has('auth_token');
        case 'twitch':
            return names.has('auth-token') || names.has('persistent');
        default:
            return true;
    }
}
