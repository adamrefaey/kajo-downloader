/**
 * Rough full-file byte estimate when yt-dlp metadata has duration but no filesize
 * (batch flat rows, or single-video formats without byte totals).
 * Tuned toward typical `bestvideo+bestaudio/best` YouTube merges, not bare audio bitrate.
 */
export function estimateDownloadFullBytesFromDuration(params: {
    durationSeconds: number;
    audioOnly?: boolean | undefined;
    /** Max video height (px) when known; refines bitrate tier. */
    videoHeight?: number | undefined;
}): number {
    const d = params.durationSeconds;
    if (!Number.isFinite(d) || d <= 0) {
        return 0;
    }
    let bytesPerSecond = 1_200_000;
    if (params.audioOnly) {
        bytesPerSecond = 192_000;
    } else if (params.videoHeight !== undefined && params.videoHeight > 0) {
        const h = params.videoHeight;
        if (h <= 480) {
            bytesPerSecond = 450_000;
        } else if (h <= 720) {
            bytesPerSecond = 750_000;
        } else if (h <= 1080) {
            bytesPerSecond = 1_000_000;
        } else if (h <= 1440) {
            bytesPerSecond = 1_400_000;
        } else {
            bytesPerSecond = 2_000_000;
        }
    }
    return Math.max(1, Math.round(d * bytesPerSecond));
}
