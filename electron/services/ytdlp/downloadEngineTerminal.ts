import { stat } from 'node:fs/promises';
import { IPC_MAIN_TO_RENDERER } from '../../../src/shared/ipcChannels';
import { sendDownloadError } from '../../ipc/sendDownloadError';
import { safeSend } from '../../mainHelpers';
import { sha256FileHex } from '../fileContentHash';
import { userFacingDownloadFailureMessage } from '../userFacingEngineErrors';
import { isYoutubeUrl, shouldRetryYoutubeWithAlternatePlayerClient } from '../youtubeYtdlpDefaults';
import {
    cleanupCancelledDownloadFiles,
    cleanupIncompleteDownloadArtifactsFromSeeds,
    runningDownloadArtifactSeeds
} from './artifactCleanup';
import {
    MAX_NETWORK_RESUME_ATTEMPTS,
    MAX_RATE_LIMIT_RESUME_ATTEMPTS
} from './downloadEngineConstants';
import {
    startFreshDownloadRetry,
    startNetworkResumeRetry,
    startRecodeVideoRetry,
    startYoutubeConsentFallbackRetry
} from './downloadEngineRetry';
import { cleanupDownloadTracking, isEngineShuttingDown } from './downloadEngineState';
import {
    isNonResumableRangeFailure,
    isPermanentDownloadFailure,
    isRateLimitedFailure,
    shouldRetryTransientNetwork,
    shouldRetryVideoWithRecode
} from './retryLogic';
import type { DownloadTerminalInfo, RunningDownload } from './types';

export function tryNotifyDownloadTerminal(
    downloadId: string,
    download: RunningDownload,
    outcome: DownloadTerminalInfo['outcome'],
    filePath: string | null,
    errorMessage: string | null,
    contentSha256?: string | null
): void {
    const cb = download.launchContext.options.onDownloadTerminal;
    const trace = download.launchContext.options.downloadTrace;
    if (!cb || !trace) {
        return;
    }
    cb({
        downloadId,
        outcome,
        filePath,
        errorMessage,
        url: trace.url,
        mediaTitle: trace.mediaTitle,
        queuedAtMs: trace.queuedAtMs,
        ...(contentSha256 !== undefined ? { contentSha256 } : {})
    });
}

export async function finishDownload(
    downloadId: string,
    download: RunningDownload,
    code: number | null
): Promise<void> {
    if (download.finishHandled) {
        return;
    }

    const webContents = download.launchContext.options.webContents;

    // App is quitting: preserve partial artifacts (.part / .ytdl / per-format fragments) so the
    // download resumes via yt-dlp's default `--continue` on next launch. Release only the in-memory
    // tracking — no artifact cleanup and no terminal notification — so the persisted queue item
    // stays "downloading" (restored to "pending" → auto-resumed) instead of being logged as
    // cancelled/errored and restarting from 0%.
    if (isEngineShuttingDown()) {
        cleanupDownloadTracking(downloadId);
        return;
    }

    if (download.wasCancelled) {
        download.finishHandled = true;
        tryNotifyDownloadTerminal(downloadId, download, 'cancelled', null, 'Download cancelled');
        cleanupDownloadTracking(downloadId);
        void cleanupCancelledDownloadFiles(download);
        sendDownloadError(webContents, {
            downloadId,
            message: 'Download cancelled',
            cancelled: true
        });
        return;
    }

    if (code === 0) {
        download.finishHandled = true;
        const fp = download.outputFilePath ?? null;
        let outputFileSizeBytes: number | undefined;
        let contentSha256: string | null = null;
        if (fp) {
            try {
                const st = await stat(fp);
                if (st.isFile()) {
                    outputFileSizeBytes = st.size;
                }
            } catch {
                // Missing or unreadable path — keep UI size from pre-download estimate
            }
            contentSha256 = await sha256FileHex(fp);
        }
        tryNotifyDownloadTerminal(downloadId, download, 'success', fp, null, contentSha256);
        cleanupDownloadTracking(downloadId);
        safeSend(webContents, IPC_MAIN_TO_RENDERER.downloadComplete, {
            downloadId,
            filePath: fp,
            outputFileSizeBytes,
            contentSha256: contentSha256 ?? undefined
        });
        return;
    }

    // Paused process died externally (sleep/wake, OS kill): keep partials and push the queue row
    // back to pending so the user can Resume or concurrency can pick it up again.
    if (download.isPaused) {
        download.finishHandled = true;
        cleanupDownloadTracking(downloadId);
        safeSend(webContents, IPC_MAIN_TO_RENDERER.downloadStateChange, {
            downloadId,
            state: 'pending'
        });
        return;
    }

    const joinedStderr = download.stderrBuffer.join('\n');

    const canYoutubeConsentFallbackRetry =
        !download.youtubeConsentFallbackAttempted &&
        isYoutubeUrl(download.launchContext.options.url) &&
        !download.launchContext.resolvedCookiesPresent &&
        shouldRetryYoutubeWithAlternatePlayerClient(joinedStderr);

    if (canYoutubeConsentFallbackRetry) {
        download.finishHandled = true;
        download.youtubeConsentFallbackAttempted = true;
        void startYoutubeConsentFallbackRetry(downloadId, download);
        return;
    }

    const canRecodeRetry =
        !download.launchContext.options.audioOnly &&
        !download.recodeRetryAttempted &&
        shouldRetryVideoWithRecode(joinedStderr, code);

    if (canRecodeRetry) {
        download.finishHandled = true;
        download.recodeRetryAttempted = true;
        void startRecodeVideoRetry(downloadId, download);
        return;
    }

    // HTTP 416: stale partial offset — delete artifacts and restart once from byte 0.
    if (!download.noContinueRetryAttempted && isNonResumableRangeFailure(joinedStderr, code)) {
        download.finishHandled = true;
        download.noContinueRetryAttempted = true;
        void cleanupIncompleteDownloadArtifactsFromSeeds(runningDownloadArtifactSeeds(download));
        void startFreshDownloadRetry(downloadId, download);
        return;
    }

    // Transient network failure (dropped connection, timeout, DNS, 5xx, 429), stall-kill, or
    // worker crash: the partial download is still valid. Re-spawn with a hard attempt cap to resume
    // from the preserved .part/fragments via --continue. The item stays "downloading" until the
    // cap is exceeded — then we surface a terminal error and keep partials for manual retry.
    const isTransientNetwork = shouldRetryTransientNetwork(joinedStderr, code);
    const shouldAutoResume = download.stallKilled || download.workerCrashed || isTransientNetwork;

    if (shouldAutoResume) {
        const nextAttempt = (download.networkRetryCount ?? 0) + 1;
        const maxAttempts = isRateLimitedFailure(joinedStderr, code)
            ? MAX_RATE_LIMIT_RESUME_ATTEMPTS
            : MAX_NETWORK_RESUME_ATTEMPTS;
        if (nextAttempt > maxAttempts) {
            download.finishHandled = true;
            const errorMessage = isRateLimitedFailure(joinedStderr, code)
                ? 'Download paused by the site (rate limited). Try again later.'
                : userFacingDownloadFailureMessage(download.stderrBuffer.at(-1)?.trim());
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
            return;
        }
        download.finishHandled = true;
        download.networkRetryCount = nextAttempt;
        void startNetworkResumeRetry(downloadId, download);
        return;
    }

    const isPermanent = isPermanentDownloadFailure(joinedStderr, code);

    // Permanent failure → delete partial artifacts (not resumable; avoids clutter). Unknown /
    // ambiguous errors KEEP partials so a later manual Retry can resume.
    if (isPermanent) {
        void cleanupIncompleteDownloadArtifactsFromSeeds(runningDownloadArtifactSeeds(download));
    }
    download.finishHandled = true;
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
