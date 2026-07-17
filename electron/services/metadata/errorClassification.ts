import { resolveMediaInputUrl } from '../../../src/shared/mediaUrlResolver';
import { getSiteProfileByHostOrUrl } from '../../../src/shared/siteProfiles';
import type { MetadataAuthReason } from '../../../src/types';
import { userFacingMetadataProbeMessage } from '../userFacingEngineErrors';

export function shouldRetryWithoutCookies(stderr: string): boolean {
    const normalized = stderr.toLowerCase();
    // Only retry when cookies themselves appear unusable (parse/decrypt/load errors).
    // Do not retry for generic auth-required responses; that doubles latency with no benefit.
    if (
        normalized.includes('sign in to confirm your age') ||
        normalized.includes('use --cookies-from-browser or --cookies')
    ) {
        return false;
    }

    return (
        normalized.includes('failed to decrypt') ||
        normalized.includes('could not find cookies') ||
        normalized.includes('cookies file') ||
        normalized.includes('cookie file') ||
        normalized.includes('error loading cookies') ||
        normalized.includes('failed to load cookies') ||
        normalized.includes('keyring') ||
        normalized.includes('browser cookies')
    );
}

export function shouldRetryWithCookies(stderr: string): boolean {
    const normalized = stderr.toLowerCase();
    return (
        normalized.includes('sign in to confirm your age') ||
        normalized.includes("sign in to confirm you're not a bot") ||
        normalized.includes('use --cookies-from-browser or --cookies') ||
        normalized.includes('private video') ||
        normalized.includes('this video is unavailable') ||
        normalized.includes('consent.youtube.com') ||
        normalized.includes('before you continue to youtube') ||
        normalized.includes('cookie consent')
    );
}

export function getErrorMessage(stderr: string, _exitCode: number | null): string {
    const lines = stderr
        .split(/\r?\n/)
        .map((line) => line.trim())
        .filter(Boolean);
    return userFacingMetadataProbeMessage(lines.at(-1) ?? '');
}

export function inferMetadataAuthReason(stderr: string): MetadataAuthReason {
    const s = stderr.toLowerCase();
    if (
        s.includes('sign in to confirm your age') ||
        s.includes('confirm your age') ||
        s.includes("sign in to confirm you're not a bot") ||
        s.includes('not a bot')
    ) {
        return 'age_or_bot_check';
    }
    if (
        s.includes('private video') ||
        s.includes('members only') ||
        s.includes('members-only') ||
        s.includes('subscriber-only') ||
        s.includes('subscriber only') ||
        s.includes('premium_only')
    ) {
        return 'private_or_members';
    }
    if (s.includes('login required') || s.includes('authentication required')) {
        return 'login_required';
    }
    if (
        s.includes('use --cookies') ||
        s.includes('--cookies-from-browser') ||
        (s.includes('cookie') && s.includes('authentication'))
    ) {
        return 'cookies_missing';
    }
    return 'unknown';
}

/**
 * Maps yt-dlp stderr (after flat + optional single probe) to a coarse resolve outcome.
 * Exported for unit tests.
 */
export function classifyMetadataResolveStderr(
    stderr: string
): 'auth-required' | 'blocked' | 'unsupported' {
    const s = stderr.toLowerCase().trim();
    if (!s) {
        return 'unsupported';
    }

    if (
        s.includes('unsupported url') ||
        s.includes('no suitable extractor') ||
        s.includes('no matching extractor')
    ) {
        return 'unsupported';
    }

    if (shouldRetryWithCookies(stderr)) {
        return 'auth-required';
    }

    if (
        s.includes('login required') ||
        s.includes('authentication required') ||
        (s.includes('cookies') &&
            (s.includes('--cookies-from-browser') || s.includes('use --cookies')))
    ) {
        return 'auth-required';
    }

    if (
        s.includes('drm') ||
        s.includes('widevine') ||
        s.includes('fairplay') ||
        s.includes('not available in your country') ||
        s.includes('only available in') ||
        s.includes('uploader has not made this video available in your country') ||
        s.includes('copyright') ||
        s.includes('blocked by the uploader') ||
        s.includes('blocked by uploader') ||
        (s.includes('contains content from') && s.includes('who has blocked')) ||
        s.includes('account associated with this video has been terminated')
    ) {
        return 'blocked';
    }

    return 'unsupported';
}

export function tryHttpsOriginForSignIn(raw: string): string | undefined {
    const trimmed = raw.trim();
    if (!trimmed) {
        return undefined;
    }
    try {
        const href = trimmed.includes('://') ? trimmed : `https://${trimmed}`;
        const u = new URL(href);
        if (u.protocol !== 'http:' && u.protocol !== 'https:') {
            return undefined;
        }
        return u.origin;
    } catch {
        return undefined;
    }
}

export function shouldBlockSingleVideoFallbackAfterFlatFailure(
    originalUrl: string,
    lookupUrl: string
): boolean {
    const trimmed = originalUrl.trim();
    if (lookupUrl !== trimmed) {
        return true;
    }
    const media = resolveMediaInputUrl(trimmed);
    if (media.candidateMode !== 'multi') {
        return false;
    }
    // Unknown hosts can still match arbitrary yt-dlp extractors; URL-only "multi" heuristics are unreliable.
    return Boolean(getSiteProfileByHostOrUrl(trimmed));
}

export function pickCanonicalMediaUrl(
    preferred: string | undefined | null,
    fallback: string
): string {
    const t = preferred?.trim();
    if (t && /^https?:\/\//i.test(t)) {
        return t;
    }
    return fallback;
}
