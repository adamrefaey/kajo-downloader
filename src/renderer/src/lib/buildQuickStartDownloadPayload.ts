import { classifyYouTubeUrl } from '../../../shared/youtubeUrlClassification';
import type { AddDownloadPayload } from '../../../store/downloadStore';
import type { DownloadItem, MetadataResolveResult } from '../../../types';
import {
    DEFAULT_PLAYLIST_FORMAT_ID,
    formatIdForYoutubeQualityCaps
} from '../utils/playlistBatchPayloads';
import { buildAddDownloadPayloadFromVideo } from './buildAddDownloadPayload';
import { queueSiteFieldsFromResolve } from './queueSiteHelpers';
import { getPreferredFormat, getVideoHeight } from './youtubeAppHelpers';

/** Short placeholder title while metadata fetch is still in flight. */
export function placeholderTitleFromUrl(url: string): string {
    try {
        const parsed = new URL(url);
        const host = parsed.hostname.replace(/^www\./, '');
        const videoId =
            parsed.searchParams.get('v') ??
            (host === 'youtu.be' ? parsed.pathname.slice(1).split('/')[0] : undefined);
        if (videoId?.trim()) {
            return videoId.trim();
        }
        return host || url;
    } catch {
        return url;
    }
}

function isYoutubeQuickStartUrl(
    url: string,
    metadataResolve: MetadataResolveResult | null
): boolean {
    if (metadataResolve?.siteId === 'youtube') {
        return true;
    }
    return classifyYouTubeUrl(url) === 'video';
}

export function buildQuickStartDownloadPayload(input: {
    url: string;
    metadataResolve: MetadataResolveResult | null;
    outputDir: string;
    preferredQuality: number | null;
    audioOnly?: boolean;
}): AddDownloadPayload {
    const audioOnly = input.audioOnly ?? false;
    const youtube = isYoutubeQuickStartUrl(input.url, input.metadataResolve);
    const formatId = audioOnly
        ? 'bestaudio/best'
        : youtube
          ? formatIdForYoutubeQualityCaps(input.preferredQuality, null)
          : DEFAULT_PLAYLIST_FORMAT_ID;

    return {
        ...queueSiteFieldsFromResolve(input.metadataResolve, input.url),
        url: input.url,
        title: placeholderTitleFromUrl(input.url),
        formatId,
        audioOnly,
        videoHeight:
            !audioOnly && input.preferredQuality !== null && input.preferredQuality > 0
                ? input.preferredQuality
                : undefined,
        outputDir: input.outputDir
    };
}

/** Patches a quick-started queue row once full metadata arrives (does not change formatId). */
export function buildQuickStartMetadataBackfillPatch(
    videoInfo: Parameters<typeof buildAddDownloadPayloadFromVideo>[0]['videoInfo'],
    preferredQuality: number | null
): Partial<DownloadItem> {
    const selectedFormat = getPreferredFormat(videoInfo.formats, preferredQuality);
    if (!selectedFormat) {
        return {
            title: videoInfo.title,
            channel: videoInfo.channel,
            thumbnailUrl: videoInfo.thumbnailUrl,
            mediaDurationSeconds:
                videoInfo.durationSeconds > 0 ? videoInfo.durationSeconds : undefined
        };
    }

    const isAudioDownload = Boolean(selectedFormat.audioOnly);
    const videoHeightPx = !isAudioDownload ? getVideoHeight(selectedFormat) : 0;

    const estimatePayload = buildAddDownloadPayloadFromVideo({
        videoInfo,
        selectedFormatId: selectedFormat.id,
        selectedFormat,
        audioOnly: isAudioDownload,
        metadataResolve: null,
        outputDir: ''
    });

    return {
        title: videoInfo.title,
        channel: videoInfo.channel,
        thumbnailUrl: videoInfo.thumbnailUrl,
        totalSize: estimatePayload.totalSize,
        sizeEstimateFullBytes: estimatePayload.sizeEstimateFullBytes,
        mediaDurationSeconds: estimatePayload.mediaDurationSeconds,
        progressVideoBytes: estimatePayload.progressVideoBytes,
        progressAudioBytes: estimatePayload.progressAudioBytes,
        videoHeight: isAudioDownload ? undefined : videoHeightPx > 0 ? videoHeightPx : undefined,
        audioOnly: isAudioDownload
    };
}

export async function backfillQuickStartDownloadRow(options: {
    downloadId: string;
    url: string;
    preferredQuality: number | null;
    updateDownload: (downloadId: string, patch: Partial<DownloadItem>) => void;
}): Promise<void> {
    if (!window.api) {
        return;
    }
    const result = await window.api.fetchVideoInfo(options.url);
    if (!result.data) {
        return;
    }
    options.updateDownload(
        options.downloadId,
        buildQuickStartMetadataBackfillPatch(result.data, options.preferredQuality)
    );
}
