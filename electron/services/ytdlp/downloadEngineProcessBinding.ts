import { handleDownloadOutputLine, handleStderrLine } from './downloadEngineOutputHandlers';
import { cleanupDownloadTracking, isEngineShuttingDown } from './downloadEngineState';
import { finishDownload } from './downloadEngineTerminal';
import { createLineProcessor } from './progressParser';
import type { RunningDownload } from './types';

export function attachProcessHandlers(downloadId: string, download: RunningDownload): void {
    const webContents = download.launchContext.options.webContents;
    const stdoutLines = createLineProcessor((line) => {
        handleDownloadOutputLine(downloadId, webContents, download, line);
    });

    const stderrLines = createLineProcessor((line) => {
        handleStderrLine(downloadId, webContents, download, line);
    });

    download.process.stdout.on('data', (chunk: Buffer) => {
        stdoutLines.push(chunk.toString());
    });

    download.process.stderr.on('data', (chunk: Buffer) => {
        stderrLines.push(chunk.toString());
    });

    download.process.on('error', (error) => {
        // Worker teardown during app quit surfaces here as a handle 'error'. Preserve partial
        // artifacts for resume (see finishDownload) instead of deleting them on shutdown.
        if (isEngineShuttingDown()) {
            cleanupDownloadTracking(downloadId);
            return;
        }
        detachProcessHandlers(download);
        download.stderrBuffer.push(error.message);
        download.workerCrashed = true;
        void finishDownload(downloadId, download, 1);
    });

    download.process.on('close', (code) => {
        void finishDownload(downloadId, download, code);
    });
}

/**
 * Remove the stdout/stderr/terminal listeners added by {@link attachProcessHandlers}.
 * Used before a retry swaps in a fresh `download.process`, so stale events from the previous
 * (closed) handle can't corrupt the shared download state or emit duplicate terminal IPC.
 */
export function detachProcessHandlers(download: RunningDownload): void {
    const { process: proc } = download;
    proc.stdout.removeAllListeners('data');
    proc.stderr.removeAllListeners('data');
    proc.removeAllListeners('close');
    proc.removeAllListeners('error');
}
