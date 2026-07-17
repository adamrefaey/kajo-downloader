import { estimateDownloadFullBytesFromDuration } from '../../../shared/estimateDownloadFullBytes';
import { estimateBytesForSectionTrim } from '../../../shared/sectionTrim';
import { getSiteProfileByHostOrUrl } from '../../../shared/siteProfiles';
import type { AddDownloadPayload } from '../../../store/downloadStore';
import type { MediaCandidate, PlaylistInfo } from '../../../types';
import { formatBytes, formatPlaylistIndex, getPlaylistIdFromUrl } from '../lib/youtubeAppHelpers';

export const DEFAULT_PLAYLIST_FORMAT_ID = 'bestvideo+bestaudio/best';

/**
 * Section trim from the single-video preview, applied to every batch queue row
 * (playlist / channel / multi-picker). Returns undefined when either timestamp is empty.
 */
export function batchSectionTrimFromPreview(
    previewTrimStart: string,
    previewTrimEnd: string
): { start: string; end: string } | undefined {
    const ps = previewTrimStart.trim();
    const pe = previewTrimEnd.trim();
    if (!ps || !pe) {
        return undefined;
    }
    return { start: ps.slice(0, 24), end: pe.slice(0, 24) };
}

function isLiveStreamStatus(liveStatus: string | null | undefined): boolean {
    return liveStatus === 'is_live' || liveStatus === 'was_live' || liveStatus === 'post_live';
}

export function batchEntryDownloadFields(
    entry: Pick<MediaCandidate, 'durationSeconds' | 'playlistEntryFilesizeBytes' | 'liveStatus'>,
    batchSectionTrim?: { start: string; end: string }
): Partial<
    Pick<
        AddDownloadPayload,
        | 'sectionTrim'
        | 'totalSize'
        | 'sizeEstimateFullBytes'
        | 'mediaDurationSeconds'
        | 'liveStatus'
    >
> {
    const durationSec =
        entry.durationSeconds > 0 && Number.isFinite(entry.durationSeconds)
            ? entry.durationSeconds
            : undefined;
    const fromFlat =
        entry.playlistEntryFilesizeBytes !== undefined && entry.playlistEntryFilesizeBytes > 0
            ? entry.playlistEntryFilesizeBytes
            : undefined;
    // For live/past-live streams, the yt-dlp filesize_approx is derived from the HLS manifest peak
    // BANDWIDTH (already cleared by normalizeOnePlaylistEntry), and the fallback duration-based
    // estimation is tuned for VOD bitrates which are 5-10× higher than live stream averages.
    // Return no size estimate so the UI shows nothing rather than a wildly wrong number.
    const roughFull = isLiveStreamStatus(entry.liveStatus)
        ? undefined
        : fromFlat !== undefined
          ? fromFlat
          : durationSec !== undefined
            ? estimateDownloadFullBytesFromDuration({ durationSeconds: durationSec })
            : undefined;
    const trimmedBytes =
        roughFull !== undefined && durationSec !== undefined && batchSectionTrim
            ? estimateBytesForSectionTrim({
                  fullFilesizeBytes: roughFull,
                  fullDurationSeconds: durationSec,
                  trimStart: batchSectionTrim.start,
                  trimEnd: batchSectionTrim.end
              })
            : null;

    const base: Partial<
        Pick<
            AddDownloadPayload,
            | 'sectionTrim'
            | 'totalSize'
            | 'sizeEstimateFullBytes'
            | 'mediaDurationSeconds'
            | 'liveStatus'
        >
    > = {
        sizeEstimateFullBytes: roughFull,
        mediaDurationSeconds: durationSec,
        totalSize:
            roughFull !== undefined ? `~${formatBytes(trimmedBytes ?? roughFull)}` : undefined,
        // Carry live status forward so the download engine can suppress inflated HLS size
        // estimates from yt-dlp's peak-bandwidth-based progress reporting.
        ...(entry.liveStatus != null ? { liveStatus: entry.liveStatus } : {})
    };

    if (batchSectionTrim) {
        base.sectionTrim = batchSectionTrim;
    }

    return base;
}

/**
 * yt-dlp `-f` value when queueing a YouTube watch URL without a format manifest
 * (e.g. in-app search). Optional height / fps ceilings map to selector filters.
 */
export function formatIdForYoutubeQualityCaps(
    maxHeightPx: number | null,
    maxFps: number | null
): string {
    const capH = maxHeightPx !== null && maxHeightPx > 0 ? Math.floor(maxHeightPx) : null;
    const capF = maxFps !== null && maxFps > 0 ? Math.floor(maxFps) : null;
    if (capH === null && capF === null) {
        return DEFAULT_PLAYLIST_FORMAT_ID;
    }
    let sel = 'bestvideo';
    if (capH !== null) {
        sel += `[height<=${capH}]`;
    }
    if (capF !== null) {
        sel += `[fps<=${capF}]`;
    }
    const muxedFallback = capH !== null ? `/best[height<=${capH}]/best` : '/best';
    return `${sel}+bestaudio${muxedFallback}`;
}

export function batchSiteLabelFromUrl(url: string): string {
    const profile = getSiteProfileByHostOrUrl(url);
    if (profile?.displayName) {
        return profile.displayName;
    }
    try {
        return new URL(url).hostname;
    } catch {
        return '';
    }
}

export interface BuildPlaylistBatchPayloadsParams {
    playlistInfo: PlaylistInfo;
    entries: MediaCandidate[];
    playlistInputUrl: string;
    playlistOutputDir: string;
    numberPlaylistItems: boolean;
    batchGroupId: string;
    batchSourceUrl: string;
    batchSiteLabel: string;
    batchExtractedAt: number;
    siteFieldsForUrl: (
        url: string,
        options?: { extractorKey?: string | undefined } | undefined
    ) => Partial<
        Pick<AddDownloadPayload, 'siteId' | 'siteDomain' | 'extractorKey' | 'authRequired'>
    >;
    /** When set, applied to every row — same semantics as single-video preview trim. */
    batchSectionTrim?: { start: string; end: string } | undefined;
    /** Per-row trim (e.g. multi-picker). When defined for a row, overrides `batchSectionTrim`. */
    getSectionTrimForEntry?:
        | ((entry: MediaCandidate, index: number) => { start: string; end: string } | undefined)
        | undefined;
    /**
     * When provided, used instead of `index + 1` for the sequence number of each entry.
     * Returning `undefined` for an entry falls back to `index + 1`.
     * Used by the multi-picker to preserve original playlist position numbers.
     */
    getSequenceNumber?: ((entry: MediaCandidate, index: number) => number | undefined) | undefined;
    /**
     * When provided, overrides `playlistOutputDir` for individual entries.
     * Used for channel downloads where each section (videos/shorts/live) has its own subfolder.
     */
    getOutputDirForEntry?:
        | ((entry: MediaCandidate, index: number) => string | undefined)
        | undefined;
    /** User preferred max height (px); null means best available. */
    preferredQuality?: number | null | undefined;
}

export function buildPlaylistBatchPayloads(
    params: BuildPlaylistBatchPayloadsParams
): AddDownloadPayload[] {
    const {
        playlistInfo,
        entries,
        playlistInputUrl,
        playlistOutputDir,
        numberPlaylistItems,
        batchGroupId,
        batchSourceUrl,
        batchSiteLabel,
        batchExtractedAt,
        siteFieldsForUrl,
        batchSectionTrim,
        getSectionTrimForEntry,
        getSequenceNumber,
        getOutputDirForEntry,
        preferredQuality = null
    } = params;

    const createdAtBase = Date.now();
    // When original ordinals are provided, pad width is determined by the largest ordinal
    // (which reflects the full playlist size), not just the number of selected entries.
    const resolvedSequenceNumbers = entries.map((e, i) => getSequenceNumber?.(e, i) ?? i + 1);
    const maxSeq = resolvedSequenceNumbers.reduce((m, n) => Math.max(m, n), entries.length);
    const indexPadWidth = Math.max(2, String(maxSeq).length);

    return entries.map((entry, index) => {
        const playlistId =
            entry.sourcePlaylistId ?? playlistInfo.id ?? getPlaylistIdFromUrl(playlistInputUrl);
        const sequenceNumber = getSequenceNumber?.(entry, index) ?? index + 1;
        const numericPrefix = formatPlaylistIndex(sequenceNumber, indexPadWidth);
        const queueTitle = numberPlaylistItems ? `${numericPrefix}. ${entry.title}` : entry.title;
        const outputTemplate = numberPlaylistItems
            ? `${numericPrefix} - %(title)s.%(ext)s`
            : undefined;
        const rowTrim = getSectionTrimForEntry?.(entry, index) ?? batchSectionTrim;
        const entryOutputDir = getOutputDirForEntry?.(entry, index) ?? playlistOutputDir;

        return {
            ...siteFieldsForUrl(entry.url, { extractorKey: entry.extractorKey }),
            ...batchEntryDownloadFields(entry, rowTrim),
            url: entry.url,
            title: queueTitle,
            channel: entry.author,
            thumbnailUrl: entry.thumbnailUrl,
            formatId: formatIdForYoutubeQualityCaps(preferredQuality, null),
            audioOnly: false,
            outputTemplate,
            outputDir: entryOutputDir,
            playlistId,
            playlistTitle: playlistInfo.title,
            batchGroupId,
            batchSourceUrl,
            batchSiteLabel,
            batchExtractedAt,
            createdAt: createdAtBase + index
        };
    });
}
