import type { WebContents } from 'electron';
import { formatBytes } from '../../../src/shared/formatBytes';
import { IPC_MAIN_TO_RENDERER } from '../../../src/shared/ipcChannels';
import { safeSend } from '../../mainHelpers';
import type { ProgressPayload } from './types';

/**
 * Marker prefix used in `--progress-template download:__YTPB__|...` output.
 * Lets us identify structured progress lines from yt-dlp among other log output.
 */
export const YTDLP_PROGRESS_MARKER = '__YTPB__';

export const DOWNLOAD_DESTINATION_REGEX: RegExp = /\[download\]\s+Destination:\s+(.+)/;
export const MERGED_FILE_REGEX: RegExp = /\[Merger\]\s+Merging formats into "(.+)"/;
export const POSTPROCESSOR_DESTINATION_REGEX: RegExp = /^\[[^\]]+\]\s+Destination:\s+(.+)/;
export const PROGRESS_EMIT_INTERVAL_MS = 250;

export const lastProgressEmitAt: Map<string, number> = new Map();
export const progressFlushTimers: Map<string, NodeJS.Timeout> = new Map();
export const queuedProgressPayloads: Map<string, Omit<ProgressPayload, 'downloadId'>> = new Map();

/**
 * Structured progress data parsed from a `--progress-template` line.
 * All byte/speed/eta values are 0 when yt-dlp does not yet know them.
 */
export interface StructuredProgress {
    downloadedBytes: number;
    /** Exact total from HTTP Content-Length (0 when unknown). */
    totalBytes: number;
    /** yt-dlp estimate when exact total is unavailable (0 when unknown). */
    totalEstimateBytes: number;
    speedBytesPerSec: number;
    etaSeconds: number;
}

/**
 * Parses a yt-dlp `--progress-template` structured line.
 *
 * Expected format (set by the `--progress-template` arg in `buildYtDlpArgs`):
 *   `__YTPB__|<downloadedBytes>|<totalBytes>|<totalEstimateBytes>|<speedBytesPerSec>|<etaSeconds>`
 *
 * Returns null for any non-matching line (info messages, destination lines, etc.).
 */
export function parseStructuredProgress(line: string): StructuredProgress | null {
    const prefix = `${YTDLP_PROGRESS_MARKER}|`;
    if (!line.startsWith(prefix)) {
        return null;
    }
    const parts = line.slice(prefix.length).split('|');
    if (parts.length < 5) {
        return null;
    }
    /* v8 ignore next */
    const downloadedBytes = parseInt(parts[0] ?? '', 10);
    if (!Number.isFinite(downloadedBytes) || downloadedBytes < 0) {
        return null;
    }
    /* v8 ignore start */
    const safeInt = (s: string): number => {
        const n = parseInt(s, 10);
        return Number.isFinite(n) && n > 0 ? n : 0;
    };
    const safeFloat = (s: string): number => {
        const n = parseFloat(s);
        return Number.isFinite(n) && n > 0 ? n : 0;
    };
    /* v8 ignore stop */
    return {
        downloadedBytes,
        totalBytes: safeInt(parts[1] ?? ''),
        totalEstimateBytes: safeInt(parts[2] ?? ''),
        speedBytesPerSec: safeFloat(parts[3] ?? ''),
        etaSeconds: safeInt(parts[4] ?? '')
    };
}

/** Formats a bytes-per-second speed value for display (e.g. "3.2 MB/s"). */
export function formatSpeed(bytesPerSec: number): string {
    if (bytesPerSec <= 0) {
        return '--';
    }
    return `${formatBytes(bytesPerSec)}/s`;
}

/** Formats an ETA in seconds as MM:SS or H:MM:SS. */
export function formatEta(etaSeconds: number): string {
    if (etaSeconds <= 0) {
        return '--';
    }
    const h = Math.floor(etaSeconds / 3600);
    const m = Math.floor((etaSeconds % 3600) / 60);
    const s = Math.floor(etaSeconds % 60);
    if (h > 0) {
        return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
    }
    return `${m}:${String(s).padStart(2, '0')}`;
}

export function emitProgressThrottled(
    webContents: WebContents,
    downloadId: string,
    data: Omit<ProgressPayload, 'downloadId'>
): void {
    const now = Date.now();
    const lastEmit = lastProgressEmitAt.get(downloadId) ?? 0;

    if (shouldSkipProgressEmit(downloadId, data)) {
        return;
    }

    const elapsedSinceLastEmit = now - lastEmit;
    if (elapsedSinceLastEmit >= PROGRESS_EMIT_INTERVAL_MS) {
        emitProgressNow(webContents, downloadId, data);
        return;
    }

    queuedProgressPayloads.set(downloadId, data);
    if (progressFlushTimers.has(downloadId)) {
        return;
    }

    const delay = Math.max(0, PROGRESS_EMIT_INTERVAL_MS - elapsedSinceLastEmit);
    const timer = setTimeout(() => {
        progressFlushTimers.delete(downloadId);
        const queued = queuedProgressPayloads.get(downloadId);
        if (!queued) {
            return;
        }
        emitProgressNow(webContents, downloadId, queued);
    }, delay);
    progressFlushTimers.set(downloadId, timer);
}

export function emitProgressNow(
    webContents: WebContents,
    downloadId: string,
    data: Omit<ProgressPayload, 'downloadId'>
): void {
    lastProgressEmitAt.set(downloadId, Date.now());
    queuedProgressPayloads.set(downloadId, data);
    safeSend(webContents, IPC_MAIN_TO_RENDERER.downloadProgress, { downloadId, ...data });
}

export function shouldSkipProgressEmit(
    downloadId: string,
    incoming: Omit<ProgressPayload, 'downloadId'>
): boolean {
    const previous = queuedProgressPayloads.get(downloadId);
    if (!previous) {
        return false;
    }

    const previousTenths = Math.round(previous.percent * 10);
    const incomingTenths = Math.round(incoming.percent * 10);
    return (
        previousTenths === incomingTenths &&
        previous.size === incoming.size &&
        previous.speed === incoming.speed &&
        previous.eta === incoming.eta &&
        previous.totalSize === incoming.totalSize &&
        previous.totalSizeBytes === incoming.totalSizeBytes
    );
}

export function createLineProcessor(onLine: (line: string) => void): {
    push: (chunk: string) => void;
} {
    let buffer = '';

    return {
        push(chunk: string): void {
            buffer += chunk;
            const lines = buffer.split(/\r?\n/);
            /* v8 ignore next */
            buffer = lines.pop() ?? '';
            for (const line of lines) {
                onLine(line);
            }
        }
    };
}
