import { unlinkManagedCookieFilesFromArgv } from '../siteAuthCookieStore';
import {
    IS_WIN,
    MERGE_STALL_WINDOW_MS,
    NETWORK_STALL_WINDOW_MS,
    STALL_WATCHDOG_POLL_MS
} from './downloadEngineConstants';
import { killProcessTree } from './downloadEngineProcessKill';
import { lastProgressEmitAt, progressFlushTimers, queuedProgressPayloads } from './progressParser';
import type { RunningDownload } from './types';

export const runningDownloads: Map<string, RunningDownload> = new Map<string, RunningDownload>();
export const reservedOutputPaths: Set<string> = new Set<string>();

/**
 * One-way latch set during application shutdown (Electron `before-quit`).
 *
 * While true, the terminal download handlers MUST NOT delete partial artifacts
 * (`.part`, `.ytdl`, per-format fragment files). Preserving them lets yt-dlp's default
 * `--continue` resume each interrupted download from where it left off on the next launch —
 * the app re-runs the same command for any queue item restored to `pending`, so the transfer
 * continues instead of restarting at 0%. Without this, killing yt-dlp on quit looks like a user
 * cancellation, which deletes the very files resume depends on.
 */
let engineShuttingDown = false;

/** Mark the engine as shutting down so terminal handlers preserve partial files for resume. */
export function markEngineShuttingDown(): void {
    engineShuttingDown = true;
}

/** True once {@link markEngineShuttingDown} has been called (app is quitting). */
export function isEngineShuttingDown(): boolean {
    return engineShuttingDown;
}

/** Stall watchdog timer handles, keyed by downloadId. */
const stallWatchdogTimers = new Map<string, ReturnType<typeof setTimeout>>();

function stallWindowForDownload(download: RunningDownload): number {
    return download.inMergeOrPostProcess ? MERGE_STALL_WINDOW_MS : NETWORK_STALL_WINDOW_MS;
}

/** Record stdout/stderr activity so the stall watchdog does not kill a healthy download. */
export function touchDownloadActivity(download: RunningDownload): void {
    download.lastActivityAt = Date.now();
}

/** Touch activity and reschedule the stall watchdog (called on every stdout/stderr line). */
export function noteDownloadActivity(downloadId: string, download: RunningDownload): void {
    touchDownloadActivity(download);
    if (runningDownloads.has(downloadId)) {
        scheduleStallWatchdogTick(downloadId);
    }
}

function killStalledDownloadProcess(downloadId: string, download: RunningDownload): void {
    cancelOrphanCleanup(downloadId);
    download.stallKilled = true;
    const pid = download.process.pid;
    if (!pid) {
        try {
            download.process.kill('SIGKILL');
        } catch {
            // already dead
        }
        return;
    }
    /* v8 ignore start -- paused downloads never reach kill (watchdog returns early); kept for symmetry if that changes */
    if (download.isPaused && !IS_WIN) {
        try {
            process.kill(-pid, 'SIGCONT');
        } catch {
            try {
                download.process.kill('SIGCONT');
            } catch {
                // ignore
            }
        }
        download.isPaused = false;
    }
    /* v8 ignore stop */
    try {
        killProcessTree(pid, 'SIGKILL');
    } catch {
        try {
            download.process.kill('SIGKILL');
        } catch {
            // already dead
        }
    }
}

function runStallWatchdogTick(downloadId: string): void {
    const download = runningDownloads.get(downloadId);
    if (!download) {
        cancelOrphanCleanup(downloadId);
        return;
    }

    if (download.isPaused) {
        scheduleStallWatchdogTick(downloadId);
        return;
    }

    // scheduleOrphanCleanup always sets lastActivityAt before the first tick.
    /* v8 ignore next */
    const lastActivity =
        download.lastActivityAt !== undefined ? download.lastActivityAt : Date.now();
    const stallWindow = stallWindowForDownload(download);
    const idleMs = Date.now() - lastActivity;

    if (idleMs >= stallWindow) {
        killStalledDownloadProcess(downloadId, download);
        return;
    }

    const remainingMs = stallWindow - idleMs;
    scheduleStallWatchdogTick(downloadId, Math.min(STALL_WATCHDOG_POLL_MS, remainingMs));
}

function scheduleStallWatchdogTick(downloadId: string, delayMs = STALL_WATCHDOG_POLL_MS): void {
    const existing = stallWatchdogTimers.get(downloadId);
    if (existing !== undefined) {
        clearTimeout(existing);
    }
    const timer = setTimeout(() => {
        stallWatchdogTimers.delete(downloadId);
        runStallWatchdogTick(downloadId);
    }, delayMs);
    stallWatchdogTimers.set(downloadId, timer);
}

/** Arm the activity-aware stall watchdog for an in-flight download (legacy export name). */
export function scheduleOrphanCleanup(downloadId: string): void {
    const download = runningDownloads.get(downloadId);
    if (download && download.lastActivityAt === undefined) {
        download.lastActivityAt = Date.now();
    }
    scheduleStallWatchdogTick(downloadId);
}

export function cancelOrphanCleanup(downloadId: string): void {
    const timer = stallWatchdogTimers.get(downloadId);
    if (timer !== undefined) {
        clearTimeout(timer);
        stallWatchdogTimers.delete(downloadId);
    }
}

export function cleanupDownloadTracking(downloadId: string): void {
    cancelOrphanCleanup(downloadId);
    const download = runningDownloads.get(downloadId);
    if (download?.reservedOutputPath) {
        reservedOutputPaths.delete(download.reservedOutputPath);
    }
    const cookieArgv = download?.launchContext.cookieArgv;
    if (cookieArgv?.length) {
        void unlinkManagedCookieFilesFromArgv(cookieArgv);
    }
    const queuedProgressTimer = progressFlushTimers.get(downloadId);
    if (queuedProgressTimer) {
        clearTimeout(queuedProgressTimer);
        progressFlushTimers.delete(downloadId);
    }
    queuedProgressPayloads.delete(downloadId);
    runningDownloads.delete(downloadId);
    lastProgressEmitAt.delete(downloadId);
}
