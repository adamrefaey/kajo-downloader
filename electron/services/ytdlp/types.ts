import type { WebContents } from 'electron';
import type { DownloadEngineCapabilities } from '../../../src/types';
import type { SiteCookiesPathGetter } from '../metadata/types';
import type { ManagedProcess } from './ytdlpUtilityProcess';

export type { SiteCookiesPathGetter };

/** Fired once per download when it reaches a terminal state (success, user-visible error, or cancel). */
export interface DownloadTerminalInfo {
    downloadId: string;
    outcome: 'success' | 'error' | 'cancelled';
    filePath: string | null;
    errorMessage: string | null;
    url: string;
    mediaTitle: string | null;
    queuedAtMs: number;
    /** SHA-256 of the output file (hex); set on successful completes when hashing succeeds. */
    contentSha256?: string | null;
}

export interface StartDownloadOptions {
    url: string;
    formatId: string;
    outputDir: string;
    outputTemplate?: string;
    /** Source playlist/channel id when this job is a batch item; absent for single downloads. */
    playlistId?: string | null;
    webContents: WebContents;
    downloadId?: string;
    audioOnly?: boolean;
    /** When set with progressAudioBytes, scales multi-stream [download] % into one bar. */
    progressVideoBytes?: number;
    progressAudioBytes?: number;
    getSiteCookiesFilePath?: SiteCookiesPathGetter;
    extraArgs?: string[];
    /** Validated in main; argv mapping is phased — see `applyStructuredDownloadCapabilities`. */
    capabilities?: DownloadEngineCapabilities;
    /** Main-resolved path for `--download-archive` when archive capability is enabled. */
    resolvedDownloadArchivePath?: string | null;
    /** Best-effort context for history + notifications (main supplies). */
    downloadTrace?: {
        url: string;
        mediaTitle: string | null;
        queuedAtMs: number;
    };
    onDownloadTerminal?: (info: DownloadTerminalInfo) => void;
    /**
     * Persisted output path from a prior attempt (queue `reservedOutputPath`). Ensures restart /
     * retry resumes the same `.part` instead of allocating a new suffixed filename.
     */
    reservedOutputPathHint?: string | null;
}

export interface ProgressPayload {
    downloadId: string;
    percent: number;
    size: string;
    speed: string;
    eta: string;
    /** UI total size: set from the first yt-dlp `of …` total and then held fixed for the download. */
    totalSize?: string;
    /** Same total as {@link totalSize}, in bytes — frozen after the first live progress total. */
    totalSizeBytes?: number;
}

export type MergeProgressMode = 'none' | 'weighted' | 'default_split';

export interface DownloadLaunchContext {
    options: StartDownloadOptions;
    cookieArgv: string[];
    uniqueOutputPath: string;
    /** True when yt-dlp was given `--cookies` (preamble path or site cookie file). */
    resolvedCookiesPresent: boolean;
    /**
     * Anonymous YouTube consent/bot retry: same argv fragment passed to yt-dlp as in metadata
     * ({@link YOUTUBE_CONSENT_FALLBACK_EXTRACTOR_ARGS}).
     */
    youtubeExtractorOverride?: readonly string[];
}

export interface RunningDownload {
    process: ManagedProcess;
    wasCancelled: boolean;
    isPaused: boolean;
    stderrBuffer: string[];
    outputFilePath?: string;
    reservedOutputPath?: string;
    mergeProgressMode: MergeProgressMode;
    progressVideoBytes?: number;
    progressAudioBytes?: number;
    /** Count of `[download] Destination:` paths matching yt-dlp format fragments (`*.f123.*`). Drives merge bar phase. */
    mergeFormatDestinationSeq?: number;
    mergeStreamIndex: number;
    launchContext: DownloadLaunchContext;
    /** After one remux-only failure, we retry once with `--recode-video mp4`. */
    recodeRetryAttempted: boolean;
    /**
     * Re-spawn count after transient network failures (drives backoff). Survives re-spawns because
     * the same RunningDownload object is reused, so the download resumes from its preserved
     * `.part`/fragments via yt-dlp `--continue`.
     */
    networkRetryCount?: number;
    /** After one anonymous YouTube failure matching consent/bot stderr, retry once with `tv_embedded` client. */
    youtubeConsentFallbackAttempted: boolean;
    /** Stable total bytes for the video stream once the HLS estimate has converged (or Content-Length is known). */
    streamVideoTotalBytes?: number;
    /** True once streamVideoTotalBytes has been frozen (HLS: after 5 MB downloaded). */
    streamVideoTotalBytesFrozen?: boolean;
    /** Stable total bytes for the audio stream once the HLS estimate has converged (or Content-Length is known). */
    streamAudioTotalBytes?: number;
    /** True once streamAudioTotalBytes has been frozen (HLS: after 1 MB downloaded in audio phase). */
    streamAudioTotalBytesFrozen?: boolean;
    /** Highest emitted percent this run; yt-dlp / merge mapping can move backward — UI stays non-decreasing. */
    progressPercentHighWaterMark?: number;
    /** Wall-clock ms of the last stdout/stderr line — drives the stall watchdog. */
    lastActivityAt?: number;
    /** True once merge/postprocess begins (ffmpeg is silent but healthy). */
    inMergeOrPostProcess?: boolean;
    /** Set by the stall watchdog immediately before SIGKILL so finishDownload can auto-resume. */
    stallKilled?: boolean;
    /** Highest percent seen across resume attempts; used to reset the network retry counter on progress. */
    attemptProgressHighWaterMark?: number;
    /** Worker or spawn handle error — partials are kept and the download is re-spawned. */
    workerCrashed?: boolean;
    /** Prevents duplicate terminal handling when both `error` and `close` fire for one attempt. */
    finishHandled?: boolean;
    /** After HTTP 416, one fresh restart with `--no-continue` (partials deleted). */
    noContinueRetryAttempted?: boolean;
}

export interface StartDownloadResult {
    downloadId: string;
    reservedOutputPath: string;
}

export type VideoOutputMode = 'remux' | 'recode';
