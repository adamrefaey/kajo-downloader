import { EventEmitter } from 'node:events';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
    MERGE_STALL_WINDOW_MS,
    NETWORK_STALL_WINDOW_MS,
    STALL_WATCHDOG_POLL_MS
} from './downloadEngineConstants';
import {
    cancelOrphanCleanup,
    cleanupDownloadTracking,
    isEngineShuttingDown,
    markEngineShuttingDown,
    runningDownloads,
    scheduleOrphanCleanup,
    touchDownloadActivity
} from './downloadEngineState';
import type { RunningDownload } from './types';

vi.mock('./downloadEngineProcessKill', () => ({
    killProcessTree: vi.fn()
}));

const unlinkManagedCookieFilesFromArgv = vi.hoisted(() =>
    vi.fn<(argv: readonly string[]) => Promise<void>>(() => Promise.resolve())
);

vi.mock('../siteAuthCookieStore', () => ({
    unlinkManagedCookieFilesFromArgv: (...args: unknown[]) =>
        unlinkManagedCookieFilesFromArgv(...(args as [readonly string[]]))
}));

describe('engine shutdown latch', () => {
    it('starts not-shutting-down, then latches to true once marked (one-way)', () => {
        expect(isEngineShuttingDown()).toBe(false);
        markEngineShuttingDown();
        expect(isEngineShuttingDown()).toBe(true);
        markEngineShuttingDown();
        expect(isEngineShuttingDown()).toBe(true);
    });
});

function makeFakeProcess(): EventEmitter & {
    pid: number;
    killed: boolean;
    kill: ReturnType<typeof vi.fn>;
    stdout: EventEmitter;
    stderr: EventEmitter;
} {
    const proc = new EventEmitter() as EventEmitter & {
        pid: number;
        killed: boolean;
        kill: ReturnType<typeof vi.fn>;
        stdout: EventEmitter;
        stderr: EventEmitter;
    };
    proc.pid = 42_001;
    proc.killed = false;
    proc.kill = vi.fn();
    proc.stdout = new EventEmitter();
    proc.stderr = new EventEmitter();
    return proc;
}

function seedRunningDownload(overrides: Partial<RunningDownload> = {}): RunningDownload {
    const process = makeFakeProcess();
    const download: RunningDownload = {
        process: process as unknown as RunningDownload['process'],
        wasCancelled: false,
        isPaused: false,
        stderrBuffer: [],
        mergeProgressMode: 'none',
        mergeStreamIndex: 0,
        recodeRetryAttempted: false,
        youtubeConsentFallbackAttempted: false,
        launchContext: {
            options: {
                url: 'https://example.com/v',
                formatId: 'best',
                outputDir: '/tmp',
                webContents: { send: vi.fn(), isDestroyed: () => false } as never
            },
            cookieArgv: [],
            uniqueOutputPath: '/tmp/out.mp4',
            resolvedCookiesPresent: false
        },
        lastActivityAt: Date.now(),
        ...overrides
    };
    runningDownloads.set('wd-1', download);
    return download;
}

describe('stall watchdog', () => {
    beforeEach(async () => {
        vi.useFakeTimers();
        runningDownloads.clear();
        const mod = await import('./downloadEngineProcessKill');
        vi.mocked(mod.killProcessTree).mockClear();
    });

    afterEach(() => {
        for (const id of [...runningDownloads.keys()]) {
            cleanupDownloadTracking(id);
        }
        vi.useRealTimers();
        runningDownloads.clear();
    });

    it('arms lastActivityAt when scheduling', () => {
        const download = seedRunningDownload();
        delete download.lastActivityAt;
        scheduleOrphanCleanup('wd-1');
        expect(download.lastActivityAt).toBeTypeOf('number');
    });

    it('does not kill a download that recently had activity', async () => {
        const { killProcessTree } = await import('./downloadEngineProcessKill');
        const download = seedRunningDownload();
        scheduleOrphanCleanup('wd-1');

        vi.advanceTimersByTime(NETWORK_STALL_WINDOW_MS - STALL_WATCHDOG_POLL_MS);
        touchDownloadActivity(download);
        scheduleOrphanCleanup('wd-1');

        vi.advanceTimersByTime(NETWORK_STALL_WINDOW_MS - STALL_WATCHDOG_POLL_MS);
        expect(killProcessTree).not.toHaveBeenCalled();
        expect(download.stallKilled).toBeUndefined();
    });

    it('does not kill paused downloads even when idle', async () => {
        const { killProcessTree } = await import('./downloadEngineProcessKill');
        const download = seedRunningDownload({ isPaused: true });
        download.lastActivityAt = Date.now() - NETWORK_STALL_WINDOW_MS * 3;
        scheduleOrphanCleanup('wd-1');

        vi.advanceTimersByTime(NETWORK_STALL_WINDOW_MS * 3);
        expect(killProcessTree).not.toHaveBeenCalled();
        expect(download.stallKilled).toBeUndefined();
    });

    it('uses the longer merge window when in merge/postprocess phase', async () => {
        const { killProcessTree } = await import('./downloadEngineProcessKill');
        const download = seedRunningDownload({ inMergeOrPostProcess: true });
        download.lastActivityAt = Date.now() - NETWORK_STALL_WINDOW_MS - 1;
        scheduleOrphanCleanup('wd-1');

        vi.advanceTimersByTime(NETWORK_STALL_WINDOW_MS + STALL_WATCHDOG_POLL_MS);
        expect(killProcessTree).not.toHaveBeenCalled();

        vi.advanceTimersByTime(MERGE_STALL_WINDOW_MS);
        expect(killProcessTree).toHaveBeenCalled();
        expect(download.stallKilled).toBe(true);
    });

    it('SIGKILLs and flags stallKilled after network-phase idle exceeds the window', async () => {
        const { killProcessTree } = await import('./downloadEngineProcessKill');
        const download = seedRunningDownload();
        download.lastActivityAt = Date.now() - NETWORK_STALL_WINDOW_MS - 1;
        scheduleOrphanCleanup('wd-1');

        vi.advanceTimersByTime(NETWORK_STALL_WINDOW_MS + STALL_WATCHDOG_POLL_MS);
        expect(killProcessTree).toHaveBeenCalledWith(42_001, 'SIGKILL');
        expect(download.stallKilled).toBe(true);
    });

    it('cancelOrphanCleanup stops pending watchdog ticks', async () => {
        const { killProcessTree } = await import('./downloadEngineProcessKill');
        seedRunningDownload();
        scheduleOrphanCleanup('wd-1');
        cancelOrphanCleanup('wd-1');
        cleanupDownloadTracking('wd-1');

        vi.advanceTimersByTime(NETWORK_STALL_WINDOW_MS * 2);
        expect(killProcessTree).not.toHaveBeenCalled();
    });

    it('watchdog tick cancels when download tracking was removed', async () => {
        seedRunningDownload();
        scheduleOrphanCleanup('wd-1');
        runningDownloads.delete('wd-1');
        vi.advanceTimersByTime(STALL_WATCHDOG_POLL_MS);
        expect(runningDownloads.has('wd-1')).toBe(false);
    });

    it('cleanupDownloadTracking clears queued progress flush timers', async () => {
        const { progressFlushTimers } = await import('./progressParser');
        seedRunningDownload({ reservedOutputPath: '/tmp/reserved.mp4' });
        const timer = setTimeout(() => {}, 60_000);
        progressFlushTimers.set('wd-1', timer);
        cleanupDownloadTracking('wd-1');
        expect(progressFlushTimers.has('wd-1')).toBe(false);
        expect(runningDownloads.has('wd-1')).toBe(false);
    });

    it('cleanupDownloadTracking unlinks managed cookie jars from launch argv', () => {
        unlinkManagedCookieFilesFromArgv.mockClear();
        const download = seedRunningDownload();
        download.launchContext.cookieArgv = ['--cookies', '/tmp/kajo-site-cookies-x.txt'];
        cleanupDownloadTracking('wd-1');
        expect(unlinkManagedCookieFilesFromArgv).toHaveBeenCalledWith([
            '--cookies',
            '/tmp/kajo-site-cookies-x.txt'
        ]);
    });

    it('SIGKILLs via process.kill when pid is missing', async () => {
        const download = seedRunningDownload();
        Object.defineProperty(download.process, 'pid', { value: undefined, configurable: true });
        download.lastActivityAt = Date.now() - NETWORK_STALL_WINDOW_MS - 1;
        scheduleOrphanCleanup('wd-1');
        vi.advanceTimersByTime(NETWORK_STALL_WINDOW_MS + STALL_WATCHDOG_POLL_MS);
        expect(download.process.kill).toHaveBeenCalledWith('SIGKILL');
    });

    it('treats missing lastActivityAt as now (does not immediate-stall)', async () => {
        const download = seedRunningDownload();
        scheduleOrphanCleanup('wd-1');
        delete download.lastActivityAt;
        vi.advanceTimersByTime(STALL_WATCHDOG_POLL_MS);
        expect(download.process.kill).not.toHaveBeenCalled();
    });

    it('falls back to process.kill when killProcessTree throws', async () => {
        const { killProcessTree } = await import('./downloadEngineProcessKill');
        vi.mocked(killProcessTree).mockImplementationOnce(() => {
            throw new Error('kill tree failed');
        });
        const download = seedRunningDownload();
        download.lastActivityAt = Date.now() - NETWORK_STALL_WINDOW_MS - 1;
        scheduleOrphanCleanup('wd-1');
        vi.advanceTimersByTime(NETWORK_STALL_WINDOW_MS + STALL_WATCHDOG_POLL_MS);
        expect(download.process.kill).toHaveBeenCalledWith('SIGKILL');
    });
});
