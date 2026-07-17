import type { MediaCandidate, PlaylistInfo, YoutubeChannelSectionTab } from '../types';

/**
 * yt-dlp nested channel tabs use playlist titles like "Channel - Shorts". The picker already has
 * section tabs, so strip these English suffixes for display (API titles are typically English).
 */
const YT_CHANNEL_TAB_PLAYLIST_TITLE_SUFFIXES_EN = [
    ' - Live streams',
    ' - Shorts',
    ' - Videos',
    ' - Live',
    ' - Uploads'
] as const;

export function stripYoutubeChannelTabSuffixFromPlaylistTitle(title: string): string {
    const trimmed = title.trim();
    for (const suf of YT_CHANNEL_TAB_PLAYLIST_TITLE_SUFFIXES_EN) {
        if (trimmed.endsWith(suf)) {
            const next = trimmed.slice(0, -suf.length).trimEnd();
            return next || trimmed;
        }
    }
    return trimmed;
}

function youtubePlaylistListIdFromUrl(url: string): string | undefined {
    try {
        const listId = new URL(url).searchParams.get('list')?.trim();
        return listId || undefined;
    } catch {
        return undefined;
    }
}

/**
 * Classifies a channel lookup URL from {@link buildYoutubeChannelContentLookupUrls}.
 * Uploads playlist (`list=UU…`) and `/videos` count as **videos**; `/shorts` and `/streams` as their tabs.
 */
export function youtubeChannelTabFromLookupUrl(lookupUrl: string): YoutubeChannelSectionTab {
    let path = '';
    try {
        path = new URL(lookupUrl).pathname.toLowerCase();
    } catch {
        path = lookupUrl.toLowerCase();
    }
    if (path.includes('/shorts')) {
        return 'shorts';
    }
    if (path.includes('/streams') || /\/live\/?$/.test(path) || path.includes('/live/')) {
        return 'live';
    }
    return 'videos';
}

export interface YoutubeChannelFetchedSection {
    lookupUrl: string;
    info: PlaylistInfo;
}

/**
 * Merges multiple channel tab fetches into one {@link PlaylistInfo} for the batch picker.
 * De-duplicates by watch URL (first occurrence wins). Reindexes `flatIndex` for stable picker keys.
 */
export function mergeYoutubeChannelSectionsForPlaylistInfo(
    sections: YoutubeChannelFetchedSection[],
    options: { channelPageUrl: string; title: string }
): PlaylistInfo {
    const seenUrls = new Set<string>();
    const merged: MediaCandidate[] = [];

    for (const { lookupUrl, info } of sections) {
        const tab = youtubeChannelTabFromLookupUrl(lookupUrl);
        const sourcePlaylistId = info.id ?? youtubePlaylistListIdFromUrl(lookupUrl);
        for (const entry of info.entries) {
            if (seenUrls.has(entry.url)) {
                continue;
            }
            seenUrls.add(entry.url);
            merged.push({
                ...entry,
                flatIndex: merged.length,
                channelSection: tab,
                sourcePlaylistId
            });
        }
    }

    const first = sections[0]?.info;
    return {
        title: options.title,
        channel: first?.channel,
        entries: merged,
        sourceUrl: options.channelPageUrl,
        collectionKind: 'channel'
    };
}
