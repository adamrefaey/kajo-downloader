const YOUTUBE_HOSTNAMES = new Set([
    'youtube.com',
    'm.youtube.com',
    'music.youtube.com',
    'youtu.be'
]);

/** No `--extractor-args`: yt-dlp's default YouTube clients expose the full adaptive format ladder. */
const YOUTUBE_ANONYMOUS_EXTRACTOR_ARGS: readonly string[] = [];

const YOUTUBE_AUTHENTICATED_EXTRACTOR_ARGS = [
    '--extractor-args',
    'youtube:player_client=web_safari,default'
] as const;

/**
 * Download-phase extractor args mirror metadata-phase args so the same DASH format ids
 * selected in the UI remain available at download time. `player_skip=webpage,configs` was
 * removed because it can drop the adaptive ladder and silently downgrade quality/size.
 */
const YOUTUBE_ANONYMOUS_DOWNLOAD_EXTRACTOR_ARGS = YOUTUBE_ANONYMOUS_EXTRACTOR_ARGS;

const YOUTUBE_AUTHENTICATED_DOWNLOAD_EXTRACTOR_ARGS = YOUTUBE_AUTHENTICATED_EXTRACTOR_ARGS;

/**
 * Second attempt when default web-style extraction hits EU/bot/consent walls.
 * Unlike `android`/`android,web`, `tv_embedded` still exposes the usual adaptive format ladder.
 */
export const YOUTUBE_CONSENT_FALLBACK_EXTRACTOR_ARGS = [
    '--extractor-args',
    'youtube:player_client=tv_embedded'
] as const;

/**
 * Anonymous: omit extractor overrides so qualities up to 4K (split video+audio) are listed without cookies.
 * With site cookies, use web-style clients aligned with a signed-in session.
 */
export function getYoutubeExtractorArgs(hasAuthentication: boolean): readonly string[] {
    return hasAuthentication
        ? YOUTUBE_AUTHENTICATED_EXTRACTOR_ARGS
        : YOUTUBE_ANONYMOUS_EXTRACTOR_ARGS;
}

/** Download-phase variant: same clients as metadata fetch for format-ladder parity. */
export function getYoutubeExtractorDownloadArgs(hasAuthentication: boolean): readonly string[] {
    return hasAuthentication
        ? YOUTUBE_AUTHENTICATED_DOWNLOAD_EXTRACTOR_ARGS
        : YOUTUBE_ANONYMOUS_DOWNLOAD_EXTRACTOR_ARGS;
}

/**
 * Whether a failed anonymous yt-dlp run is worth retrying with {@link YOUTUBE_CONSENT_FALLBACK_EXTRACTOR_ARGS}.
 * Skips cases that need a real account (private, age) -- those won't be fixed by swapping the player client.
 */
export function shouldRetryYoutubeWithAlternatePlayerClient(stderr: string): boolean {
    const n = stderr.toLowerCase();
    if (!n.trim()) {
        return false;
    }
    if (n.includes('private video')) {
        return false;
    }
    if (n.includes('sign in to confirm your age')) {
        return false;
    }
    if (n.includes('members only') || n.includes('join this channel')) {
        return false;
    }
    return (
        n.includes('consent.youtube.com') ||
        n.includes('before you continue to youtube') ||
        n.includes('cookie consent') ||
        n.includes("sign in to confirm you're not a bot") ||
        n.includes('sign in to confirm you\u2019re not a bot')
    );
}

export function isYoutubeUrl(url: string): boolean {
    try {
        const host = new URL(url).hostname.replace(/^www\./, '');
        return YOUTUBE_HOSTNAMES.has(host);
    } catch {
        return false;
    }
}
