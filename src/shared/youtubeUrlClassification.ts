export type YoutubeUrlType = 'video' | 'playlist' | 'channel' | 'unsupported';

function isYoutubePrimaryHost(host: string): boolean {
    const h = host.replace(/^www\./i, '').toLowerCase();
    return (
        h === 'youtube.com' ||
        h === 'm.youtube.com' ||
        h === 'music.youtube.com' ||
        h === 'youtube-nocookie.com'
    );
}

/**
 * YouTube-only URL shape for batch vs single-video UI. Used by the generic media URL resolver.
 */
export function classifyYouTubeUrl(url: string): YoutubeUrlType {
    try {
        const parsed = new URL(url);
        const host = parsed.hostname.replace(/^www\./i, '').toLowerCase();
        const listId = parsed.searchParams.get('list');

        if (host === 'youtu.be') {
            const id = parsed.pathname.split('/').filter(Boolean)[0] ?? '';
            if (listId) {
                return 'playlist';
            }
            return id.length >= 11 ? 'video' : 'unsupported';
        }

        if (isYoutubePrimaryHost(host)) {
            const parts = parsed.pathname.split('/').filter(Boolean);
            const watchId = parsed.searchParams.get('v');

            if (parts[0] === 'playlist') {
                return listId ? 'playlist' : 'unsupported';
            }

            if (watchId && listId) {
                return 'playlist';
            }

            if (watchId) {
                return watchId.length >= 11 ? 'video' : 'unsupported';
            }

            if (parts.length >= 2 && (parts[0] === 'shorts' || parts[0] === 'embed')) {
                return (parts[1] ?? '').length >= 11 ? 'video' : 'unsupported';
            }

            if (parts[0] === 'channel') {
                const cid = parts[1] ?? '';
                return cid.startsWith('UC') && cid.length >= 10 ? 'channel' : 'unsupported';
            }

            if ((parts[0] === 'c' || parts[0] === 'user') && parts[1]) {
                return 'channel';
            }

            const firstSeg = parts[0] ?? '';
            if (firstSeg.startsWith('@') && firstSeg.length > 1) {
                return 'channel';
            }
        }
    } catch {
        return 'unsupported';
    }

    return 'unsupported';
}
