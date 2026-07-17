/**
 * Build yt-dlp lookup URLs for YouTube channel tabs (uploads, shorts, streams).
 * Uploads use the UU… playlist when a numeric channel id (UC…) is known — faster flat extraction.
 */

const CHANNEL_TAB_SEGMENTS = new Set([
    'videos',
    'shorts',
    'streams',
    'live',
    'featured',
    'playlists',
    'community',
    'channels',
    'about'
]);

export interface ChannelContentSelection {
    videos: boolean;
    shorts: boolean;
    live: boolean;
}

/**
 * Normalizes a channel-style URL to a stable origin path (no /videos, /shorts, etc.).
 */
export function getYoutubeChannelBaseUrl(url: string): string | null {
    const trimmed = url.trim();
    try {
        const u = new URL(trimmed);
        const host = u.hostname.replace(/^www\./i, '');
        if (host !== 'youtube.com' && host !== 'm.youtube.com' && host !== 'music.youtube.com') {
            return null;
        }

        let parts = u.pathname.split('/').filter(Boolean);
        while (parts.length > 0) {
            const last = parts[parts.length - 1] ?? '';
            if (CHANNEL_TAB_SEGMENTS.has(last.toLowerCase())) {
                parts = parts.slice(0, -1);
            } else {
                break;
            }
        }

        if (parts[0] === 'channel') {
            const cid = parts[1] ?? '';
            if (cid.startsWith('UC') && cid.length >= 10) {
                return `${u.origin}/channel/${cid}`;
            }
            return null;
        }

        if ((parts[0] === 'c' || parts[0] === 'user') && parts[1]) {
            return `${u.origin}/${parts[0]}/${parts[1]}`;
        }

        const first = parts[0] ?? '';
        if (first.startsWith('@') && first.length > 1) {
            return `${u.origin}/${first}`;
        }

        return null;
    } catch {
        return null;
    }
}

/**
 * Ordered list of playlist/tab URLs to pass to `fetchPlaylistInfo` (one per selected section).
 */
export function buildYoutubeChannelContentLookupUrls(
    channelBaseUrl: string,
    selection: ChannelContentSelection
): string[] {
    const base = channelBaseUrl.replace(/\/+$/, '');
    const urls: string[] = [];

    const ucMatch = base.match(/\/channel\/(UC[a-zA-Z0-9_-]{10,})$/i);
    if (ucMatch) {
        const channelId = ucMatch[1] ?? '';
        if (selection.videos) {
            urls.push(`https://www.youtube.com/playlist?list=UU${channelId.slice(2)}`);
        }
        if (selection.shorts) {
            urls.push(`${base}/shorts`);
        }
        if (selection.live) {
            urls.push(`${base}/streams`);
        }
        return urls;
    }

    if (selection.videos) {
        urls.push(`${base}/videos`);
    }
    if (selection.shorts) {
        urls.push(`${base}/shorts`);
    }
    if (selection.live) {
        urls.push(`${base}/streams`);
    }
    return urls;
}
