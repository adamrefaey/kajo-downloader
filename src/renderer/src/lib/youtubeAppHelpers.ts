import { isIpcInvokeTimeoutError } from '../../../shared/ipcErrors';
import type { Format } from '../../../types';

export { formatBytes } from '../../../shared/formatBytes';
export { classifyYouTubeUrl, type YoutubeUrlType } from '../../../shared/youtubeUrlClassification';

export const YOUTUBE_URL_REGEX: RegExp =
    /https?:\/\/(?:www\.)?(?:youtube\.com\/watch\?[^\s#]+|youtube\.com\/playlist\?[^\s#]+|youtube\.com\/shorts\/[^\s#?]+|youtube\.com\/channel\/[^\s#?]+|youtube\.com\/c\/[^\s#?]+|youtube\.com\/user\/[^\s#?]+|youtube\.com\/@[^?\s#]+|youtu\.be\/[^\s#]+)/i;

/** System playlists; fetching works when the signed-in account has access (cookies / auth). */
export const YOUTUBE_WATCH_LATER_PLAYLIST_URL = 'https://www.youtube.com/playlist?list=WL';
export const YOUTUBE_LIKED_VIDEOS_PLAYLIST_URL = 'https://www.youtube.com/playlist?list=LL';

export function getErrorMessage(cause: unknown, fallbackMessage: string): string {
    if (isIpcInvokeTimeoutError(cause)) {
        return fallbackMessage;
    }
    if (cause instanceof Error && cause.message) {
        return cause.message;
    }
    return fallbackMessage;
}

export function getPreferredFormat(
    formats: Format[],
    preferredQuality: number | null
): Format | undefined {
    const videoFormats = formats.filter((format) => !format.audioOnly);
    if (videoFormats.length === 0) {
        return formats[0];
    }

    if (preferredQuality === null) {
        return videoFormats[0];
    }

    const withHeights = videoFormats
        .map((format) => ({ format, height: getVideoHeight(format) }))
        .filter((item) => item.height > 0);

    if (withHeights.length === 0) {
        return videoFormats[0];
    }

    const lowerOrEqual = withHeights
        .filter((item) => item.height <= preferredQuality)
        .sort((a, b) => b.height - a.height || (b.format.fps ?? 0) - (a.format.fps ?? 0));
    if (lowerOrEqual.length > 0) {
        return lowerOrEqual.at(0)?.format;
    }

    const nearestHigher = withHeights.sort(
        (a, b) => a.height - b.height || (b.format.fps ?? 0) - (a.format.fps ?? 0)
    );
    return nearestHigher.at(0)?.format;
}

export function getVideoHeight(format: Format): number {
    const resolution = format.resolution.toLowerCase();
    const pMatch = resolution.match(/(\d{3,4})p/);
    if (pMatch) {
        // biome-ignore lint/style/noNonNullAssertion: capturing group is present when match is truthy
        return Number.parseInt(pMatch[1]!, 10);
    }

    const dimMatch = resolution.match(/x(\d{3,4})/);
    if (dimMatch) {
        // biome-ignore lint/style/noNonNullAssertion: capturing group is present when match is truthy
        return Number.parseInt(dimMatch[1]!, 10);
    }

    return 0;
}

/** Upper bound for paired audio bitrate (kbps) so low-res video does not pull premium-only audio tiers. */
export function maxAudioKbpsForVideoHeight(height: number): number {
    if (height <= 0) {
        return Number.POSITIVE_INFINITY;
    }
    if (height <= 480) {
        return 128;
    }
    if (height <= 720) {
        return 160;
    }
    if (height <= 1080) {
        return 192;
    }
    if (height <= 1440) {
        return 256;
    }
    if (height <= 2160) {
        return 320;
    }
    return Number.POSITIVE_INFINITY;
}

function estimateAudioKbps(format: Format, durationSeconds: number): number {
    if (typeof format.audioBitrateKbps === 'number' && format.audioBitrateKbps > 0) {
        return format.audioBitrateKbps;
    }
    if (
        typeof format.filesize === 'number' &&
        format.filesize > 0 &&
        typeof durationSeconds === 'number' &&
        durationSeconds > 0
    ) {
        return Math.round((format.filesize * 8) / durationSeconds / 1000);
    }
    return 0;
}

/**
 * Chooses an audio format id from the manifest when possible; otherwise null to use yt-dlp selectors.
 */
export function pickAudioFormatIdForVideoHeight(
    videoHeight: number,
    allFormats: Format[],
    durationSeconds: number
): string | null {
    const maxKbps = maxAudioKbpsForVideoHeight(videoHeight);
    const audios = allFormats.filter((f) => f.audioOnly);
    const scored = audios
        .map((f) => ({ f, kbps: estimateAudioKbps(f, durationSeconds) }))
        .filter((x) => x.kbps > 0)
        .sort((a, b) => b.kbps - a.kbps);

    if (scored.length === 0) {
        return null;
    }

    if (maxKbps === Number.POSITIVE_INFINITY) {
        // biome-ignore lint/style/noNonNullAssertion: scored.length === 0 is handled above
        return scored[0]!.f.id;
    }

    const capped = scored.filter((x) => x.kbps <= maxKbps);
    if (capped.length > 0) {
        // biome-ignore lint/style/noNonNullAssertion: capped.length > 0 is checked above
        return capped[0]!.f.id;
    }

    return null;
}

export type GetDownloadFormatIdOptions = {
    allFormats?: Format[];
    durationSeconds?: number;
};

/**
 * yt-dlp fallback tail when the exact format id is unavailable at download time.
 * Height-capped merge/muxed alternatives precede bare `best` so silent 360p degradation is avoided.
 */
export function formatHeightCappedFallbackTail(height: number): string {
    if (height <= 0) {
        return '/best';
    }
    const cap = Math.floor(height);
    return `/bestvideo[height<=${cap}]+bestaudio/best[height<=${cap}]/best`;
}

/**
 * Builds yt-dlp `-f` value for a selected row. Video-only DASH formats get audio matched to the video
 * resolution tier (not always `bestaudio`, which is often a premium high-bitrate track).
 */
export function getDownloadFormatId(
    selectedFormatId: string,
    selectedFormat: Format | null,
    options?: GetDownloadFormatIdOptions
): string {
    if (!selectedFormat) {
        return selectedFormatId;
    }

    const hasVideo = Boolean(selectedFormat.vcodec && selectedFormat.vcodec !== 'none');
    const hasAudio = Boolean(selectedFormat.acodec && selectedFormat.acodec !== 'none');
    const height = getVideoHeight(selectedFormat);
    const heightFallbackTail = formatHeightCappedFallbackTail(height);

    if (hasVideo && !hasAudio) {
        const maxKbps = maxAudioKbpsForVideoHeight(height);
        const { allFormats, durationSeconds } = options ?? {};
        const canPairFromManifest =
            Array.isArray(allFormats) &&
            allFormats.length > 0 &&
            typeof durationSeconds === 'number' &&
            durationSeconds > 0;

        const audioId = canPairFromManifest
            ? pickAudioFormatIdForVideoHeight(height, allFormats, durationSeconds)
            : null;

        if (audioId) {
            return `${selectedFormatId}+${audioId}/${selectedFormatId}+bestaudio${heightFallbackTail}`;
        }

        if (maxKbps === Number.POSITIVE_INFINITY) {
            return `${selectedFormatId}+bestaudio${heightFallbackTail}`;
        }

        const cap = Math.floor(maxKbps);
        return `${selectedFormatId}+bestaudio[abr<=${cap}]/${selectedFormatId}+bestaudio${heightFallbackTail}`;
    }

    if (!hasVideo && hasAudio) {
        return `${selectedFormatId}/bestaudio`;
    }

    if (hasVideo && hasAudio) {
        return `${selectedFormatId}${heightFallbackTail}`;
    }

    return selectedFormatId;
}

export function getMergedProgressByteWeights(
    resolvedFormatId: string,
    audioOnly: boolean,
    selectedFormat: Format | null
): { progressVideoBytes?: number; progressAudioBytes?: number } {
    if (audioOnly || !resolvedFormatId.includes('+')) {
        return {};
    }
    const videoOnly = selectedFormat?.filesizeVideoOnly;
    const total = selectedFormat?.filesize;
    if (
        typeof videoOnly === 'number' &&
        videoOnly > 0 &&
        typeof total === 'number' &&
        total > videoOnly
    ) {
        return {
            progressVideoBytes: Math.round(videoOnly),
            progressAudioBytes: Math.round(total - videoOnly)
        };
    }
    return {};
}

export function toFileUrl(filePath: string): string {
    const normalized = filePath.startsWith('/') ? filePath : `/${filePath}`;
    const encoded = normalized
        .split('/')
        .map((segment) => encodeURIComponent(segment))
        .join('/');
    return `file://${encoded}`;
}

export function getPlaylistIdFromUrl(url: string): string | undefined {
    try {
        const parsed = new URL(url);
        const listId = parsed.searchParams.get('list')?.trim();
        return listId || undefined;
    } catch {
        return undefined;
    }
}

export function formatPlaylistIndex(index: number, padWidth: number): string {
    return String(index).padStart(Math.max(2, padWidth), '0');
}
