export {
    buildFallbackInflightOutputPath,
    cleanupIncompleteDownloadArtifactsFromSeeds,
    isYtDlpCancelledArtifact
} from './artifactCleanup';
export {
    cancelAllDownloads,
    cancelDownload,
    cleanupDownloadArtifactsForQueuedRemoval,
    getActiveDownloadIds,
    getRunningDownloadCount,
    isDownloadRunning,
    pauseDownload,
    resumeDownload,
    startDownload
} from './downloadEngine';
export { markEngineShuttingDown } from './downloadEngineState';

export {
    clampProgressPercentValue,
    computeMergedProgress,
    isYtDlpMergeSidecarDestination,
    onDownloadDestinationPath,
    resolveMergeProgressMode,
    shouldSuppressMergeProgressBeforeFirstFormat
} from './mergeProgress';
export {
    createLineProcessor,
    formatEta,
    formatSpeed,
    parseStructuredProgress
} from './progressParser';

export { shouldRetryVideoWithRecode } from './retryLogic';
export type {
    DownloadLaunchContext,
    DownloadTerminalInfo,
    MergeProgressMode,
    ProgressPayload,
    RunningDownload,
    SiteCookiesPathGetter,
    StartDownloadOptions,
    StartDownloadResult,
    VideoOutputMode
} from './types';
export { teardownYtdlpWorker } from './ytdlpUtilityProcess';
