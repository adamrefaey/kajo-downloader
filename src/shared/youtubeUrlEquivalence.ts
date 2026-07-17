const YT_VIDEO_ID = /^[\w-]{11}$/;

/**
 * Returns the 11-character YouTube video id when `raw` is a single-video watch / shorts / youtu.be URL.
 * Used to avoid duplicate workflow runs when the URL field and clipboard differ only by normalization.
 */
export function tryExtractYouTubeVideoId(raw: string): string | null {
    const s = raw.trim();
    if (!s) {
        return null;
    }
    try {
        const href = s.includes('://') ? s : `https://${s}`;
        const u = new URL(href);
        const h = u.hostname.replace(/^www\./i, '').toLowerCase();
        if (h === 'youtu.be') {
            const id = u.pathname.split('/').filter(Boolean)[0] ?? '';
            return YT_VIDEO_ID.test(id) ? id : null;
        }
        if (
            h === 'youtube.com' ||
            h === 'm.youtube.com' ||
            h === 'music.youtube.com' ||
            h === 'youtube-nocookie.com'
        ) {
            const v = u.searchParams.get('v');
            if (v && YT_VIDEO_ID.test(v)) {
                return v;
            }
            const shorts = u.pathname.match(/^\/shorts\/([\w-]{11})/i);
            if (shorts) {
                const s1 = shorts[1] ?? '';
                if (YT_VIDEO_ID.test(s1)) {
                    return s1;
                }
            }
            const live = u.pathname.match(/^\/live\/([\w-]{11})/i);
            if (live) {
                const l1 = live[1] ?? '';
                if (YT_VIDEO_ID.test(l1)) {
                    return l1;
                }
            }
        }
    } catch {
        return null;
    }
    return null;
}

/** True when both strings refer to the same single YouTube video (by id), or are identical after trim. */
export function youtubeSingleVideoUrlsPointToSameMedia(a: string, b: string): boolean {
    const ia = tryExtractYouTubeVideoId(a);
    const ib = tryExtractYouTubeVideoId(b);
    if (ia && ib) {
        return ia === ib;
    }
    return a.trim() === b.trim();
}
