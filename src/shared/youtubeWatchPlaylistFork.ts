/**
 * YouTube watch URLs that include `list=` can mean "this video" or "the whole playlist".
 * When both `v` and `list` are present, the app asks the user which they want.
 */
export function tryYoutubeWatchPlaylistFork(url: string): { singleVideoUrl: string } | undefined {
    const trimmed = url.trim();
    try {
        const u = new URL(trimmed);
        const host = u.hostname.replace(/^www\./i, '').toLowerCase();
        const list = u.searchParams.get('list')?.trim() ?? '';
        if (!list) {
            return undefined;
        }

        if (host === 'youtu.be') {
            const id = u.pathname.split('/').filter(Boolean)[0] ?? '';
            if (id.length < 11) {
                return undefined;
            }
            const single = new URL('https://www.youtube.com/watch');
            single.searchParams.set('v', id);
            return { singleVideoUrl: single.toString() };
        }

        if (
            host !== 'youtube.com' &&
            host !== 'm.youtube.com' &&
            host !== 'music.youtube.com' &&
            host !== 'youtube-nocookie.com'
        ) {
            return undefined;
        }

        const v = u.searchParams.get('v')?.trim() ?? '';
        if (v.length < 11) {
            return undefined;
        }

        const path = u.pathname.replace(/\/+$/, '') || '/';
        if (path !== '/watch' && !path.endsWith('/watch')) {
            return undefined;
        }

        const single = new URL('https://www.youtube.com/watch');
        single.searchParams.set('v', v);
        return { singleVideoUrl: single.toString() };
    } catch {
        return undefined;
    }
}
