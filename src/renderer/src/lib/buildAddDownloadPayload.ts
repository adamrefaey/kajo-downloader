import { estimateDownloadFullBytesFromDuration } from '../../../shared/estimateDownloadFullBytes';
import { estimateBytesForSectionTrim } from '../../../shared/sectionTrim';
import type { AddDownloadPayload } from '../../../store/downloadStore';
import type { Format, MetadataResolveResult, VideoInfo } from '../../../types';
import { queueSiteFieldsFromResolve } from './queueSiteHelpers';
import {
    formatBytes,
    getDownloadFormatId,
    getMergedProgressByteWeights,
    getVideoHeight
} from './youtubeAppHelpers';

export type BuildAddDownloadPayloadInput = {
    videoInfo: VideoInfo;
    /** Selected format id; may be set even when the resolved `Format` object is null. */
    selectedFormatId: string;
    selectedFormat: Format | null;
    audioOnly: boolean;
    metadataResolve: MetadataResolveResult | null;
    outputDir: string;
    /**
     * Section-trim (single-video preview only). When present, `totalSize` reflects the
     * trimmed estimate and `sectionTrim` is carried on the payload.
     */
    sectionTrim?: { start: string; end: string } | undefined;
};

/**
 * Builds the `addDownload` payload for one resolved single video — the format/size/progress
 * derivation shared by the single-video start path, the multiline-batch "start all" loop, and
 * the per-row "start row" handler in `useStartDownloadHandler`. Kept pure (no React, no IPC) so
 * the math is unit-testable; the hook keeps the validation, error handling, and state resets.
 */
export function buildAddDownloadPayloadFromVideo({
    videoInfo,
    selectedFormatId,
    selectedFormat,
    audioOnly,
    metadataResolve,
    outputDir,
    sectionTrim
}: BuildAddDownloadPayloadInput): AddDownloadPayload {
    const isAudioDownload = audioOnly || Boolean(selectedFormat?.audioOnly);
    const videoHeightPx = !isAudioDownload && selectedFormat ? getVideoHeight(selectedFormat) : 0;

    const resolvedFormatId = getDownloadFormatId(selectedFormatId, selectedFormat, {
        allFormats: videoInfo.formats,
        durationSeconds: videoInfo.durationSeconds
    });
    const progressWeights = getMergedProgressByteWeights(
        resolvedFormatId,
        isAudioDownload,
        selectedFormat
    );

    const fullFilesizeBytes =
        selectedFormat?.filesize && selectedFormat.filesize > 0
            ? selectedFormat.filesize
            : undefined;
    const fullDurationSeconds =
        videoInfo.durationSeconds > 0 && Number.isFinite(videoInfo.durationSeconds)
            ? videoInfo.durationSeconds
            : undefined;
    // `fullDurationSeconds`, when set, is already finite and > 0, so the duration estimate is
    // always >= 1 when computed (it clamps to >= 1) — no extra positivity guard needed.
    const heuristicFullBytes =
        fullFilesizeBytes === undefined && fullDurationSeconds !== undefined
            ? estimateDownloadFullBytesFromDuration({
                  durationSeconds: fullDurationSeconds,
                  audioOnly: isAudioDownload,
                  videoHeight: !isAudioDownload && videoHeightPx > 0 ? videoHeightPx : undefined
              })
            : undefined;
    const sizeEstimateFullBytes = fullFilesizeBytes ?? heuristicFullBytes;
    const trimmedSizeBytes =
        sizeEstimateFullBytes !== undefined && fullDurationSeconds !== undefined && sectionTrim
            ? estimateBytesForSectionTrim({
                  fullFilesizeBytes: sizeEstimateFullBytes,
                  fullDurationSeconds,
                  trimStart: sectionTrim.start,
                  trimEnd: sectionTrim.end
              })
            : null;

    return {
        ...queueSiteFieldsFromResolve(metadataResolve, videoInfo.url),
        url: videoInfo.url,
        title: videoInfo.title,
        channel: videoInfo.channel,
        thumbnailUrl: videoInfo.thumbnailUrl,
        formatId: resolvedFormatId,
        audioOnly: isAudioDownload,
        videoHeight: isAudioDownload ? undefined : videoHeightPx > 0 ? videoHeightPx : undefined,
        outputDir,
        progressVideoBytes: progressWeights.progressVideoBytes,
        progressAudioBytes: progressWeights.progressAudioBytes,
        totalSize:
            sizeEstimateFullBytes !== undefined
                ? `~${formatBytes(trimmedSizeBytes ?? sizeEstimateFullBytes)}`
                : undefined,
        sizeEstimateFullBytes,
        mediaDurationSeconds: fullDurationSeconds,
        ...(sectionTrim ? { sectionTrim } : {})
    };
}
