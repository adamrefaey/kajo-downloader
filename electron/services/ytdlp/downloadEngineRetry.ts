import { sendDownloadError } from '../../ipc/sendDownloadError';
import { buildYtDlpInvocation } from '../binaries';
import { userFacingDownloadFailureMessage } from '../userFacingEngineErrors';
import { YOUTUBE_CONSENT_FALLBACK_EXTRACTOR_ARGS } from '../youtubeYtdlpDefaults';
import {
    cleanupCancelledDownloadFiles,
    cleanupIncompleteDownloadArtifactsFromSeeds,
    runningDownloadArtifactSeeds
} from './artifactCleanup';
import { buildYtDlpArgs } from './downloadEngineArgs';
import {
    MAX_NETWORK_RESUME_ATTEMPTS,
    RESUME_BACKOFF_BASE_MS,
    RESUME_BACKOFF_CAP_MS
} from './downloadEngineConstants';
import { attachProcessHandlers, detachProcessHandlers } from './downloadEngineProcessBinding';
import {
    cleanupDownloadTracking,
    isEngineShuttingDown,
    scheduleOrphanCleanup
} from './downloadEngineState';
import { tryNotifyDownloadTerminal } from './downloadEngineTerminal';
import {
    emitProgressNow,
    lastProgressEmitAt,
    progressFlushTimers,
    queuedProgressPayloads
} from './progressParser';
import type { RunningDownload } from './types';
import { spawnYtdlpProcess } from './ytdlpUtilityProcess';

function sleep(ms: number): Promise<void> {
    return new Promise((resolve) => {
        setTimeout(resolve, ms);
    });
}

/** After backoff sleep, do not spawn if the user cancelled or the app is quitting. */
function abortRetrySpawnIfNeeded(downloadId: string, download: RunningDownload): boolean {
    if (isEngineShuttingDown()) {
        cleanupDownloadTracking(downloadId);
        return true;
    }
    if (download.wasCancelled) {
        tryNotifyDownloadTerminal(downloadId, download, 'cancelled', null, 'Download cancelled');
        void cleanupCancelledDownloadFiles(download);
        cleanupDownloadTracking(downloadId);
        sendDownloadError(download.launchContext.options.webContents, {
            downloadId,
            message: 'Download cancelled',
            cancelled: true
        });
        return true;
    }
    return false;
}

/** Reset progress tracking and download state in preparation for a retry attempt. */
function resetDownloadStateForRetry(downloadId: string, download: RunningDownload): void {
    const currentHigh = download.progressPercentHighWaterMark ?? 0;
    const priorAttemptHigh = download.attemptProgressHighWaterMark ?? 0;
    if (currentHigh > priorAttemptHigh) {
        download.attemptProgressHighWaterMark = currentHigh;
        download.networkRetryCount = 0;
    }

    // Detach the previous attempt's listeners before the caller reassigns `download.process`.
    // The old (already-closed) handle's PassThrough streams can still flush buffered `data`, and
    // a late `error` can still fire — either would mutate the *shared* `download` state or
    // double-send terminal IPC for the freshly-spawned retry attempt.
    detachProcessHandlers(download);
    const queuedTimer = progressFlushTimers.get(downloadId);
    if (queuedTimer) {
        clearTimeout(queuedTimer);
        progressFlushTimers.delete(downloadId);
    }
    queuedProgressPayloads.delete(downloadId);
    lastProgressEmitAt.delete(downloadId);
    download.stderrBuffer = [];
    delete download.outputFilePath;
    delete download.mergeFormatDestinationSeq;
    download.mergeStreamIndex = 0;
    delete download.streamVideoTotalBytes;
    delete download.streamAudioTotalBytes;
    delete download.progressPercentHighWaterMark;
    delete download.inMergeOrPostProcess;
    download.stallKilled = false;
    download.workerCrashed = false;
    download.finishHandled = false;
    download.lastActivityAt = Date.now();
}

export async function startYoutubeConsentFallbackRetry(
    downloadId: string,
    download: RunningDownload
): Promise<void> {
    const webContents = download.launchContext.options.webContents;
    const { options, cookieArgv, uniqueOutputPath } = download.launchContext;

    resetDownloadStateForRetry(downloadId, download);
    if (abortRetrySpawnIfNeeded(downloadId, download)) {
        return;
    }

    download.launchContext.youtubeExtractorOverride = [...YOUTUBE_CONSENT_FALLBACK_EXTRACTOR_ARGS];

    try {
        const args = await buildYtDlpArgs(
            options,
            uniqueOutputPath,
            cookieArgv,
            'remux',
            download.launchContext.youtubeExtractorOverride
        );
        const invocation = await buildYtDlpInvocation(args);
        download.process = spawnYtdlpProcess(
            downloadId,
            invocation.command,
            invocation.args,
            invocation.env
        );
        scheduleOrphanCleanup(downloadId);
        attachProcessHandlers(downloadId, download);
    } catch (error) {
        void cleanupIncompleteDownloadArtifactsFromSeeds(runningDownloadArtifactSeeds(download));
        const msg =
            error instanceof Error
                ? error.message
                : 'YouTube alternate client retry failed to start';
        tryNotifyDownloadTerminal(downloadId, download, 'error', null, msg);
        cleanupDownloadTracking(downloadId);
        sendDownloadError(webContents, {
            downloadId,
            message: msg
        });
    }
}

export async function startRecodeVideoRetry(
    downloadId: string,
    download: RunningDownload
): Promise<void> {
    const webContents = download.launchContext.options.webContents;
    const { options, cookieArgv, uniqueOutputPath, youtubeExtractorOverride } =
        download.launchContext;

    resetDownloadStateForRetry(downloadId, download);
    if (abortRetrySpawnIfNeeded(downloadId, download)) {
        return;
    }

    try {
        const args = await buildYtDlpArgs(
            options,
            uniqueOutputPath,
            cookieArgv,
            'recode',
            youtubeExtractorOverride
        );
        const invocation = await buildYtDlpInvocation(args);
        download.process = spawnYtdlpProcess(
            downloadId,
            invocation.command,
            invocation.args,
            invocation.env
        );
        scheduleOrphanCleanup(downloadId);
        attachProcessHandlers(downloadId, download);
    } catch (error) {
        void cleanupIncompleteDownloadArtifactsFromSeeds(runningDownloadArtifactSeeds(download));
        const msg = error instanceof Error ? error.message : 'Recoding retry failed to start';
        tryNotifyDownloadTerminal(downloadId, download, 'error', null, msg);
        cleanupDownloadTracking(downloadId);
        sendDownloadError(webContents, {
            downloadId,
            message: msg
        });
    }
}

/**
 * Re-spawn a download after a transient network failure to resume from its preserved
 * `.part`/fragments (yt-dlp `--continue`). Re-extracts fresh source URLs (the prior ones may have
 * expired during the outage). Unlike the recode/cancel paths, this NEVER deletes partial artifacts.
 */
export async function startFreshDownloadRetry(
    downloadId: string,
    download: RunningDownload
): Promise<void> {
    const webContents = download.launchContext.options.webContents;
    const { options, cookieArgv, uniqueOutputPath, youtubeExtractorOverride } =
        download.launchContext;

    resetDownloadStateForRetry(downloadId, download);
    if (abortRetrySpawnIfNeeded(downloadId, download)) {
        return;
    }

    try {
        const args = await buildYtDlpArgs(
            options,
            uniqueOutputPath,
            cookieArgv,
            'remux',
            youtubeExtractorOverride,
            false
        );
        const invocation = await buildYtDlpInvocation(args);
        download.process = spawnYtdlpProcess(
            downloadId,
            invocation.command,
            invocation.args,
            invocation.env
        );
        scheduleOrphanCleanup(downloadId);
        attachProcessHandlers(downloadId, download);
    } catch (error) {
        const msg =
            error instanceof Error ? error.message : 'Fresh restart after HTTP 416 failed to start';
        tryNotifyDownloadTerminal(downloadId, download, 'error', null, msg);
        cleanupDownloadTracking(downloadId);
        sendDownloadError(webContents, {
            downloadId,
            message: msg
        });
    }
}

function failNetworkResumeExhausted(downloadId: string, download: RunningDownload): void {
    const webContents = download.launchContext.options.webContents;
    const errorMessage = userFacingDownloadFailureMessage(download.stderrBuffer.at(-1)?.trim());
    tryNotifyDownloadTerminal(
        downloadId,
        download,
        'error',
        download.outputFilePath ?? null,
        errorMessage
    );
    cleanupDownloadTracking(downloadId);
    sendDownloadError(webContents, {
        downloadId,
        message: errorMessage
    });
}

export async function startNetworkResumeRetry(
    downloadId: string,
    download: RunningDownload
): Promise<void> {
    const webContents = download.launchContext.options.webContents;
    const { options, cookieArgv, uniqueOutputPath, youtubeExtractorOverride } =
        download.launchContext;

    const attempt = download.networkRetryCount ?? 0;
    const retryPercent = Math.max(
        download.progressPercentHighWaterMark ?? 0,
        download.attemptProgressHighWaterMark ?? 0
    );
    emitProgressNow(webContents, downloadId, {
        percent: retryPercent,
        size: '--',
        speed: `Retrying (${String(attempt)})…`,
        eta: '--'
    });

    const delayMs = Math.min(RESUME_BACKOFF_CAP_MS, RESUME_BACKOFF_BASE_MS * Math.max(1, attempt));
    await sleep(delayMs);
    if (abortRetrySpawnIfNeeded(downloadId, download)) {
        return;
    }

    resetDownloadStateForRetry(downloadId, download);
    if (abortRetrySpawnIfNeeded(downloadId, download)) {
        return;
    }

    try {
        const args = await buildYtDlpArgs(
            options,
            uniqueOutputPath,
            cookieArgv,
            'remux',
            youtubeExtractorOverride
        );
        const invocation = await buildYtDlpInvocation(args);
        download.process = spawnYtdlpProcess(
            downloadId,
            invocation.command,
            invocation.args,
            invocation.env
        );
        scheduleOrphanCleanup(downloadId);
        attachProcessHandlers(downloadId, download);
    } catch {
        if (abortRetrySpawnIfNeeded(downloadId, download)) {
            return;
        }
        const nextAttempt = (download.networkRetryCount ?? 0) + 1;
        if (nextAttempt > MAX_NETWORK_RESUME_ATTEMPTS) {
            failNetworkResumeExhausted(downloadId, download);
            return;
        }
        download.networkRetryCount = nextAttempt;
        void startNetworkResumeRetry(downloadId, download);
    }
}
