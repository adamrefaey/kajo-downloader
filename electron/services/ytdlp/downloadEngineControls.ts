import {
    buildFallbackInflightOutputPath,
    cleanupIncompleteDownloadArtifactsFromSeeds,
    runningDownloadArtifactSeeds
} from './artifactCleanup';
import { IS_WIN, PROCESS_FORCE_KILL_DELAY_MS } from './downloadEngineConstants';
import { killProcessTree } from './downloadEngineProcessKill';
import {
    noteDownloadActivity,
    runningDownloads,
    scheduleOrphanCleanup
} from './downloadEngineState';

export function cancelDownload(downloadId: string): boolean {
    const active = runningDownloads.get(downloadId);
    if (!active) {
        return false;
    }

    active.wasCancelled = true;
    if (active.isPaused) {
        // Resume the process group first so the SIGTERM is actually delivered — a stopped
        // process ignores SIGTERM until it receives SIGCONT.
        const pausedPid = active.process.pid;
        if (pausedPid && !IS_WIN) {
            try {
                process.kill(-pausedPid, 'SIGCONT');
            } catch {
                // Ignore; process may already be dead.
            }
        } else {
            try {
                active.process.kill('SIGCONT');
            } catch {
                // Ignore.
            }
        }
        active.isPaused = false;
    }
    const pid = active.process.pid;
    if (pid) {
        killProcessTree(pid, 'SIGTERM');
    } else {
        active.process.kill('SIGTERM');
    }

    setTimeout(() => {
        if (runningDownloads.has(downloadId) && !active.process.killed) {
            if (pid) {
                killProcessTree(pid, 'SIGKILL');
            } else {
                active.process.kill('SIGKILL');
            }
        }
    }, PROCESS_FORCE_KILL_DELAY_MS);

    return true;
}

export function pauseDownload(downloadId: string): boolean {
    const active = runningDownloads.get(downloadId);
    if (!active || active.isPaused) {
        return false;
    }

    const pid = active.process.pid;
    if (!pid) {
        // PID not yet available (process barely spawned); cannot pause reliably.
        return false;
    }

    // Windows does not support SIGSTOP/SIGCONT — pause is a no-op there.
    if (IS_WIN) {
        return false;
    }

    try {
        // Send SIGSTOP to the entire process group (negative PID) so that any ffmpeg
        // child processes spawned by yt-dlp are also paused. Without this, ffmpeg keeps
        // writing to the pipe while yt-dlp is stopped, which can cause corruption or
        // a deadlock that prevents the download from resuming cleanly.
        process.kill(-pid, 'SIGSTOP');
        active.isPaused = true;
        return true;
    } catch {
        return false;
    }
}

export function resumeDownload(downloadId: string): boolean {
    const active = runningDownloads.get(downloadId);
    if (!active?.isPaused) {
        return false;
    }

    const pid = active.process.pid;

    // Windows: SIGCONT unsupported; clear the flag so the engine state stays consistent.
    if (IS_WIN || !pid) {
        active.isPaused = false;
        return false;
    }

    try {
        // Resume the entire process group so ffmpeg and yt-dlp both continue together.
        process.kill(-pid, 'SIGCONT');
        active.isPaused = false;
        noteDownloadActivity(downloadId, active);
        scheduleOrphanCleanup(downloadId);
        return true;
    } catch {
        active.isPaused = false;
        return false;
    }
}

export function isDownloadRunning(downloadId: string): boolean {
    return runningDownloads.has(downloadId);
}

export function getActiveDownloadIds(): string[] {
    return Array.from(runningDownloads.keys());
}

/** Count of downloads occupying a concurrent slot (excludes SIGSTOP-paused processes). */
export function getRunningDownloadCount(): number {
    let n = 0;
    for (const d of runningDownloads.values()) {
        if (!d.isPaused) {
            n += 1;
        }
    }
    return n;
}

export function cancelAllDownloads(): void {
    for (const downloadId of runningDownloads.keys()) {
        cancelDownload(downloadId);
    }
}

export function cleanupDownloadArtifactsForQueuedRemoval(options: {
    downloadId: string;
    outputDir: string;
    audioOnly?: boolean;
    reservedOutputPath?: string | null;
    partialFilePath?: string | null;
}): Promise<void> {
    const seeds: string[] = [];
    const active = runningDownloads.get(options.downloadId);
    if (active) {
        seeds.push(...runningDownloadArtifactSeeds(active));
    }
    if (options.reservedOutputPath) {
        seeds.push(options.reservedOutputPath);
    }
    if (options.partialFilePath) {
        seeds.push(options.partialFilePath);
    }
    seeds.push(
        buildFallbackInflightOutputPath(
            options.outputDir,
            options.downloadId,
            Boolean(options.audioOnly),
            undefined
        )
    );
    return cleanupIncompleteDownloadArtifactsFromSeeds(seeds);
}
