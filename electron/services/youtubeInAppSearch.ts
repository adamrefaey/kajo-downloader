/**
 * In-app video search — YouTube only.
 *
 * Wraps yt-dlp `ytsearchN:` queries. Other platforms are intentionally not
 * surfaced in the Search tab; only YouTube search is exposed to users.
 */

import type { SearchPlatform, SearchResultRow } from '../../src/types';
import {
    type FlatEntry,
    sanitizeSearchQuery,
    searchViaYtDlp,
    YTSEARCH_MAX_N
} from './youtubeSearch';

const DEFAULT_MAX_RESULTS = 6;

const YOUTUBE_PLATFORM: SearchPlatform = 'youtube';

function resolveEntryWatchUrl(entry: FlatEntry): string {
    const id = typeof entry.id === 'string' ? entry.id : '';
    let url = typeof entry.url === 'string' ? entry.url.trim() : '';
    if (url.startsWith('//')) {
        url = `https:${url}`;
    }
    if (!/^https?:\/\//i.test(url)) {
        const wp = typeof entry.webpage_url === 'string' ? entry.webpage_url.trim() : '';
        if (/^https?:\/\//i.test(wp)) {
            url = wp;
        }
    }
    if (!/^https?:\/\//i.test(url) && id) {
        url = `https://www.youtube.com/watch?v=${id}`;
    }
    if (!/^https?:\/\//i.test(url)) {
        return '';
    }
    try {
        const u = new URL(url);
        const host = u.hostname.toLowerCase();
        if (!host.includes('youtube') && !host.includes('youtu.be')) {
            return '';
        }
        if (/\/search\//i.test(u.pathname)) {
            return '';
        }
    } catch {
        return '';
    }
    return url;
}

function flatEntryToSearchResult(entry: FlatEntry): SearchResultRow | null {
    const id = typeof entry.id === 'string' ? entry.id : '';
    const url = resolveEntryWatchUrl(entry);
    if (!url) {
        return null;
    }

    const title = typeof entry.title === 'string' ? entry.title : 'Unknown';
    const channel =
        typeof entry.channel === 'string'
            ? entry.channel
            : typeof entry.uploader === 'string'
              ? entry.uploader
              : '';
    const durationSeconds =
        typeof entry.duration === 'number' && Number.isFinite(entry.duration)
            ? Math.max(0, Math.floor(entry.duration))
            : 0;
    const thumb = entry.thumbnails?.length
        ? (entry.thumbnails[entry.thumbnails.length - 1]?.url ?? '')
        : '';

    return {
        id: id || url,
        url,
        title,
        channel,
        durationSeconds,
        thumbnailUrl: typeof thumb === 'string' ? thumb : '',
        platform: YOUTUBE_PLATFORM
    };
}

function deduplicateByUrl(rows: SearchResultRow[]): SearchResultRow[] {
    const seen = new Set<string>();
    return rows.filter((r) => {
        if (seen.has(r.url)) {
            return false;
        }
        seen.add(r.url);
        return true;
    });
}

export async function searchYoutubeInApp(
    query: string,
    maxResults: number = DEFAULT_MAX_RESULTS
): Promise<SearchResultRow[]> {
    const q = sanitizeSearchQuery(query);
    if (q.length < 2) {
        return [];
    }

    const n = Math.max(1, Math.min(YTSEARCH_MAX_N, Math.floor(maxResults)));
    const entries = await searchViaYtDlp(`ytsearch${n}:${q}`, n);

    const rows: SearchResultRow[] = [];
    for (const entry of entries) {
        const row = flatEntryToSearchResult(entry);
        if (row) {
            rows.push(row);
        }
    }

    return deduplicateByUrl(rows);
}
