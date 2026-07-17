import { parseHttpMediaUrl } from '../../../src/shared/mediaUrlResolver';
import { getSiteProfileByHostOrUrl } from '../../../src/shared/siteProfiles';
import type { MediaCandidate } from '../../../src/types';
import { isYoutubeUrl } from '../youtubeYtdlpDefaults';
import { coercePositiveByteCount } from './jsonParsing';
import { getThumbnailUrl, normalizeThumbnailDisplayUrl } from './thumbnails';
import type { YtDlpPlaylistEntry } from './types';

/** Default YouTube preview when flat playlist JSON omits thumbnail URLs. */
export function youtubeVideoThumbnailFallback(videoOrId: string): string {
    if (!/^[a-zA-Z0-9_-]{11}$/.test(videoOrId)) {
        return '';
    }
    return `https://i.ytimg.com/vi/${videoOrId}/hqdefault.jpg`;
}

export function normalizeOnePlaylistEntry(
    entry: YtDlpPlaylistEntry,
    contextUrl: string,
    flatIndex: number
): MediaCandidate | null {
    const id = entry.id?.trim();
    const title = entry.title?.trim();
    if (!id || !title) {
        return null;
    }
    if (isInaccessiblePlaylistEntry(entry, title)) {
        return null;
    }

    const author = entry.channel?.trim() || entry.uploader?.trim() || 'Unknown creator';
    const durationSeconds = Math.max(0, Math.floor(entry.duration ?? 0));
    const url = getPlaylistEntryUrl(entry, id, contextUrl);
    if (!url) {
        return null;
    }

    let thumbnailUrl = getThumbnailUrl(entry);
    if (!thumbnailUrl && isYoutubeUrl(contextUrl)) {
        thumbnailUrl = normalizeThumbnailDisplayUrl(youtubeVideoThumbnailFallback(id));
    }

    const extractorKey = entry.ie_key?.trim() || undefined;
    // For live/past-live streams, filesize_approx is computed from the HLS manifest peak BANDWIDTH
    // declaration, which can be 5-10x higher than the actual average encoded bitrate. Skip it for
    // such entries; the caller falls back to duration-based estimation instead.
    const isLiveEntry =
        entry.live_status === 'is_live' ||
        entry.live_status === 'was_live' ||
        entry.live_status === 'post_live';
    const playlistEntryFilesizeBytes = isLiveEntry
        ? coercePositiveByteCount(entry.filesize)
        : (coercePositiveByteCount(entry.filesize) ??
          coercePositiveByteCount(entry.filesize_approx));

    return {
        id,
        url,
        title,
        author,
        durationSeconds,
        thumbnailUrl,
        flatIndex,
        extractorKey,
        availability: entry.availability,
        ...(playlistEntryFilesizeBytes !== undefined ? { playlistEntryFilesizeBytes } : {}),
        ...(entry.live_status != null ? { liveStatus: entry.live_status } : {})
    };
}

export function normalizePlaylistEntries(
    rawEntries: YtDlpPlaylistEntry[],
    contextUrl: string
): MediaCandidate[] {
    const entries: MediaCandidate[] = [];

    for (let flatIndex = 0; flatIndex < rawEntries.length; flatIndex += 1) {
        const entry = rawEntries[flatIndex];
        if (!entry) {
            continue;
        }
        const normalized = normalizeOnePlaylistEntry(entry, contextUrl, flatIndex);
        if (normalized) {
            entries.push(normalized);
        }
    }

    return entries;
}

export function isInaccessiblePlaylistEntry(entry: YtDlpPlaylistEntry, title: string): boolean {
    const normalizedTitle = title.trim().toLowerCase();
    if (
        normalizedTitle === '[private video]' ||
        normalizedTitle === '[deleted video]' ||
        normalizedTitle === '[unavailable video]' ||
        normalizedTitle === 'private video' ||
        normalizedTitle === 'deleted video' ||
        normalizedTitle === 'unavailable video'
    ) {
        return true;
    }

    const availability = (entry.availability ?? '').trim().toLowerCase();
    if (
        availability === 'private' ||
        availability === 'needs_auth' ||
        availability === 'subscriber_only' ||
        availability === 'premium_only'
    ) {
        return true;
    }

    return false;
}

export function tryTiktokFlatEntryUrlFromProfileContext(id: string, contextUrl: string): string {
    if (!/^\d{10,}$/.test(id)) {
        return '';
    }
    const profile = getSiteProfileByHostOrUrl(contextUrl);
    if (profile?.siteId !== 'tiktok') {
        return '';
    }
    const parsed = parseHttpMediaUrl(contextUrl.trim());
    if (!parsed) {
        return '';
    }
    const m = parsed.pathname.match(/^\/@([^/]+)\/?$/i);
    if (!m) {
        return '';
    }
    const handle = m[1];
    return `https://www.tiktok.com/@${handle}/video/${id}`;
}

/** When flat `--dump-single-json` entries omit permalinks, rebuild a canonical /p/ URL from the shortcode. */
export function tryInstagramFlatEntryUrlFromContext(id: string, contextUrl: string): string {
    const profile = getSiteProfileByHostOrUrl(contextUrl);
    if (profile?.siteId !== 'instagram') {
        return '';
    }
    if (!/^[A-Za-z0-9_-]{5,32}$/.test(id)) {
        return '';
    }
    return `https://www.instagram.com/p/${id}/`;
}

/** When flat entries only expose numeric video ids, map to a canonical watch URL. */
export function tryFacebookFlatEntryUrlFromContext(id: string, contextUrl: string): string {
    const profile = getSiteProfileByHostOrUrl(contextUrl);
    if (profile?.siteId !== 'facebook') {
        return '';
    }
    if (!/^\d{8,20}$/.test(id)) {
        return '';
    }
    return `https://www.facebook.com/watch?v=${id}`;
}

export function getPlaylistEntryUrl(
    entry: YtDlpPlaylistEntry,
    id: string,
    contextUrl: string
): string {
    const candidate = entry.webpage_url ?? entry.original_url ?? entry.url;
    if (candidate && /^https?:\/\//i.test(candidate)) {
        return candidate;
    }

    if (isYoutubeUrl(contextUrl) && /^[a-zA-Z0-9_-]{11}$/.test(id)) {
        return `https://www.youtube.com/watch?v=${id}`;
    }

    const tiktok = tryTiktokFlatEntryUrlFromProfileContext(id, contextUrl);
    if (tiktok) {
        return tiktok;
    }

    const instagram = tryInstagramFlatEntryUrlFromContext(id, contextUrl);
    if (instagram) {
        return instagram;
    }

    const facebook = tryFacebookFlatEntryUrlFromContext(id, contextUrl);
    if (facebook) {
        return facebook;
    }

    return '';
}
