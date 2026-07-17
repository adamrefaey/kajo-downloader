import { formatBytes } from '../../../src/shared/formatBytes';
import type { MergeProgressMode, RunningDownload, StartDownloadOptions } from './types';

/** Bytes downloaded before the HLS video-stream size estimate is frozen for display. */
const HLS_VIDEO_FREEZE_BYTES = 5 * 1024 * 1024;
/** Bytes downloaded before the HLS audio-stream size estimate is frozen for display. */
const HLS_AUDIO_FREEZE_BYTES = 1 * 1024 * 1024;
/** Lower bound for guessed audio size while video is the active stream. */
const AUDIO_ESTIMATE_MIN_BYTES = 256 * 1024;
/** Cap on the audio estimate to avoid a hugely inflated denominator. */
const AUDIO_ESTIMATE_CAP_BYTES = 15 * 1024 * 1024;

/**
 * Estimates audio stream size from video total when the audio stream has not yet
 * started and its size is unknown. Used only for the combined-progress denominator
 * during the video phase; replaced by the actual audio total once it is reported.
 */
function estimateAudioBytes(videoBytes: number): number {
    if (videoBytes <= 0) {
        return AUDIO_ESTIMATE_MIN_BYTES;
    }
    if (videoBytes < 2 * 1024 * 1024) {
        return Math.max(AUDIO_ESTIMATE_MIN_BYTES, videoBytes);
    }
    return Math.min(
        AUDIO_ESTIMATE_CAP_BYTES,
        Math.max(AUDIO_ESTIMATE_MIN_BYTES, Math.round(videoBytes * 0.15))
    );
}

/** Thumbnail / subtitle / metadata files: not separate A/V merge streams. */
export function isYtDlpMergeSidecarDestination(outputPath: string): boolean {
    const seg = outputPath.replace(/\\/g, '/').split('/').pop() ?? outputPath;
    const lower = seg.toLowerCase();
    if (lower.endsWith('.info.json')) {
        return true;
    }
    if (lower.endsWith('.description')) {
        return true;
    }
    return /\.(webp|jpe?g|png|avif|gif|bmp|tif|tiff|vtt|srt|ass)$/i.test(seg);
}

/** True until the first real media `[download] Destination:` (non-sidecar). */
export function shouldSuppressMergeProgressBeforeFirstFormat(download: RunningDownload): boolean {
    return download.mergeProgressMode !== 'none' && (download.mergeFormatDestinationSeq ?? 0) === 0;
}

export function resolveMergeProgressMode(options: StartDownloadOptions): MergeProgressMode {
    if (options.audioOnly || !options.formatId.includes('+')) {
        return 'none';
    }
    const pv = options.progressVideoBytes;
    const pa = options.progressAudioBytes;
    if (typeof pv === 'number' && typeof pa === 'number' && pv > 0 && pa > 0) {
        return 'weighted';
    }
    return 'default_split';
}

/**
 * Call for each yt-dlp `[download] Destination:` line. Sidecars (thumbnails, subs) are
 * skipped; each subsequent non-sidecar destination advances the merge stream index.
 */
export function onDownloadDestinationPath(download: RunningDownload, outputPath: string): void {
    if (download.mergeProgressMode === 'none') {
        return;
    }
    if (isYtDlpMergeSidecarDestination(outputPath)) {
        return;
    }
    const nextSeq = (download.mergeFormatDestinationSeq ?? 0) + 1;
    download.mergeFormatDestinationSeq = nextSeq;
    download.mergeStreamIndex = Math.min(3, nextSeq - 1);
    if (nextSeq === 1) {
        delete download.progressPercentHighWaterMark;
        delete download.streamVideoTotalBytes;
        delete download.streamAudioTotalBytes;
    } else {
        // Transitioning to audio stream; video total is already captured in streamVideoTotalBytes.
        delete download.streamAudioTotalBytes;
    }
}

export function clampProgressPercentValue(n: number): number {
    if (!Number.isFinite(n)) {
        return 0;
    }
    return Math.min(100, Math.max(0, n));
}

export interface MergeProgressResult {
    percent: number;
    /** Combined total in bytes (undefined until both stream totals are known). */
    totalSizeBytes: number | undefined;
    /** Human-readable combined total label. */
    totalSizeLabel: string | undefined;
    /** Human-readable label for the current stream's total (for the `size` field). */
    currentStreamLabel: string | undefined;
}

/**
 * Computes overall download progress from actual byte counts reported by yt-dlp's
 * `--progress-template` output. Replaces the old regex-percent + estimation chain.
 *
 * @param download        The in-progress download state.
 * @param downloadedBytes Bytes downloaded so far in the current stream (from template).
 * @param totalBytes      Exact stream total in bytes (HTTP Content-Length); 0 when unknown.
 * @param estimateBytes   yt-dlp's estimate; only used for non-HLS fallback.
 * @param speedBytesPerSec yt-dlp smoothed download speed; 0 when unavailable.
 * @param etaSeconds      yt-dlp smoothed ETA in seconds; 0 when unavailable.
 */
export function computeMergedProgress(
    download: RunningDownload,
    downloadedBytes: number,
    totalBytes: number,
    estimateBytes: number,
    speedBytesPerSec: number,
    etaSeconds: number
): MergeProgressResult {
    const streamTotal = totalBytes || estimateBytes;
    const idx = download.mergeStreamIndex;

    if (download.mergeProgressMode === 'none') {
        if (totalBytes > 0) {
            // Exact Content-Length (MP4, MKV…): freeze immediately, display is stable.
            download.streamVideoTotalBytes = Math.max(
                download.streamVideoTotalBytes ?? 0,
                totalBytes
            );
            download.streamVideoTotalBytesFrozen = true;
        }

        if (download.streamVideoTotalBytesFrozen) {
            const frozenTotal = download.streamVideoTotalBytes ?? 0;
            const label = frozenTotal > 0 ? formatBytes(frozenTotal) : undefined;
            return {
                percent:
                    frozenTotal > 0
                        ? clampProgressPercentValue((downloadedBytes / frozenTotal) * 100)
                        : 0,
                totalSizeBytes: frozenTotal || undefined,
                totalSizeLabel: label,
                currentStreamLabel: label
            };
        }

        // HLS stream: yt-dlp sets total_bytes_estimate = current_segment_bytes × total_segments.
        // That single-segment extrapolation spikes wildly (10×+) whenever a non-representative
        // segment (init, keyframe, high-bitrate scene) is the current one.
        //
        // Better source: yt-dlp's own smoothed speed × smoothed ETA.
        // This is always ETA-consistent and converges naturally — no freeze needed.
        const etaDerivedTotal =
            speedBytesPerSec > 0 && etaSeconds > 0
                ? downloadedBytes + speedBytesPerSec * etaSeconds
                : 0;

        const percent =
            etaDerivedTotal > 0
                ? clampProgressPercentValue((downloadedBytes / etaDerivedTotal) * 100)
                : 0;

        // Suppress size display until speed has a few seconds of data (512 KB threshold).
        const showSize = etaDerivedTotal > 0 && downloadedBytes >= HLS_VIDEO_FREEZE_BYTES;
        const label = showSize ? formatBytes(etaDerivedTotal) : undefined;

        return {
            percent,
            totalSizeBytes: showSize ? etaDerivedTotal : undefined,
            totalSizeLabel: label,
            currentStreamLabel: label
        };
    }

    if (idx === 0) {
        // Video phase ──────────────────────────────────────────────────────────────────────────────
        if (streamTotal > 0) {
            if (totalBytes > 0) {
                // Exact Content-Length: keep max to avoid backward steps.
                download.streamVideoTotalBytes = Math.max(
                    download.streamVideoTotalBytes ?? 0,
                    streamTotal
                );
                download.streamVideoTotalBytesFrozen = true;
            } else if (!download.streamVideoTotalBytesFrozen) {
                // HLS estimate: update freely until 5 MB downloaded, then freeze.
                // Early estimates jump around; after 5 MB yt-dlp has enough segment
                // data for a stable average. From that point the displayed size is fixed.
                download.streamVideoTotalBytes = streamTotal;
                if (downloadedBytes >= HLS_VIDEO_FREEZE_BYTES && streamTotal > 0) {
                    download.streamVideoTotalBytesFrozen = true;
                }
            }
        }
        const vTotal = download.streamVideoTotalBytes ?? 0;
        const videoFrozen = Boolean(download.streamVideoTotalBytesFrozen);

        // Audio estimate: use pre-fetched bytes for 'weighted', otherwise heuristic.
        const aEstimate =
            download.mergeProgressMode === 'weighted'
                ? (download.progressAudioBytes ?? estimateAudioBytes(vTotal))
                : estimateAudioBytes(vTotal);

        const combined = vTotal + aEstimate;
        const percent =
            combined > 0 ? clampProgressPercentValue((downloadedBytes / combined) * 100) : 0;

        const exactVideoTotalKnown = totalBytes > 0 && videoFrozen && vTotal > 0;
        const combinedLabel =
            exactVideoTotalKnown && combined > 0 ? formatBytes(combined) : undefined;

        return {
            percent,
            totalSizeBytes: exactVideoTotalKnown ? combined : undefined,
            totalSizeLabel: combinedLabel,
            // HLS: show stream size once frozen at 5 MB. Exact Content-Length: show combined total.
            currentStreamLabel:
                exactVideoTotalKnown && combinedLabel
                    ? combinedLabel
                    : videoFrozen && vTotal > 0
                      ? formatBytes(vTotal)
                      : undefined
        };
    }

    if (idx === 1) {
        // Audio phase ──────────────────────────────────────────────────────────────────────────────
        if (streamTotal > 0) {
            if (totalBytes > 0) {
                // Exact Content-Length: keep max.
                download.streamAudioTotalBytes = Math.max(
                    download.streamAudioTotalBytes ?? 0,
                    streamTotal
                );
                download.streamAudioTotalBytesFrozen = true;
            } else if (!download.streamAudioTotalBytesFrozen) {
                // HLS estimate: update freely until 1 MB downloaded in audio phase, then freeze.
                download.streamAudioTotalBytes = streamTotal;
                if (downloadedBytes >= HLS_AUDIO_FREEZE_BYTES && streamTotal > 0) {
                    download.streamAudioTotalBytesFrozen = true;
                }
            }
        }
        const vTotal = download.streamVideoTotalBytes ?? 0;
        const aTotal =
            download.streamAudioTotalBytes ??
            (download.mergeProgressMode === 'weighted'
                ? (download.progressAudioBytes ?? estimateAudioBytes(vTotal))
                : estimateAudioBytes(vTotal));

        const combined = vTotal + aTotal;
        const done = vTotal + downloadedBytes;
        const percent = combined > 0 ? clampProgressPercentValue((done / combined) * 100) : 0;

        return {
            percent,
            totalSizeBytes: combined > 0 ? combined : undefined,
            totalSizeLabel: combined > 0 ? formatBytes(combined) : undefined,
            currentStreamLabel: aTotal > 0 ? formatBytes(aTotal) : undefined
        };
    }

    // idx >= 2: more than two streams — rare (e.g. 3rd subtitle stream got mixed in).
    return {
        percent: clampProgressPercentValue(99 + downloadedBytes / Math.max(1, streamTotal)),
        totalSizeBytes: undefined,
        totalSizeLabel: undefined,
        currentStreamLabel: undefined
    };
}
