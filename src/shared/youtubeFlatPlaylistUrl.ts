/**
 * YouTube channel home URLs make yt-dlp return nested "Videos / Live / Shorts" tabs and fully
 * enumerate each tab in one JSON payload — very slow for large channels. The channel "uploads"
 * playlist (list id = "UU" + channel id without the leading "UC") is a single flat shelf and
 * enumerates faster with standard video rows and i.ytimg.com thumbnails.
 *
 * Bare `/@handle` URLs (no tab) yield tab rows as "entries" (no per-video URLs), so our flat
 * playlist normalizer sees zero videos — rewrite to the `/videos` tab for a flat video list.
 */
export function resolveYoutubeFlatPlaylistLookupUrl(url: string): string {
    const trimmed = url.trim();
    try {
        const u = new URL(trimmed);
        const host = u.hostname.replace(/^www\./i, '');
        if (host !== 'youtube.com' && host !== 'm.youtube.com' && host !== 'music.youtube.com') {
            return trimmed;
        }
        const path = u.pathname.replace(/\/+$/, '') || '/';
        // /@name only — not /@name/shorts, /live, etc.
        if (/^\/@[^/]+$/.test(path)) {
            return `https://www.youtube.com${path}/videos`;
        }
        const channelMatch = path.match(/^\/channel\/(UC[a-zA-Z0-9_-]{10,})(?:\/videos)?$/);
        if (channelMatch) {
            const channelId = channelMatch[1] ?? '';
            const uploadsListId = `UU${channelId.slice(2)}`;
            return `https://www.youtube.com/playlist?list=${uploadsListId}`;
        }
        return trimmed;
    } catch {
        return trimmed;
    }
}
