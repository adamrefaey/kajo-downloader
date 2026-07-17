import { EventEmitter } from 'node:events';
import type { WebContents } from 'electron';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { RunningDownload } from '../electron/services/ytdlp/types';

const cleanupIncomplete = vi.fn().mockResolvedValue(undefined);
const spawnYtdlp = vi.fn();
const buildInvocation = vi.fn().mockResolvedValue({ command: 'yt-dlp', args: [], env: {} });

vi.mock('../electron/services/binaries', () => ({
    buildYtDlpInvocation: (...args: unknown[]) => buildInvocation(...args)
}));
vi.mock('../electron/services/ytdlp/ytdlpUtilityProcess', () => ({
    spawnYtdlpProcess: (...args: unknown[]) => spawnYtdlp(...args)
}));
vi.mock('../electron/services/ytdlp/artifactCleanup', () => ({
    cleanupCancelledDownloadFiles: vi.fn(),
    cleanupIncompleteDownloadArtifactsFromSeeds: (...args: unknown[]) => cleanupIncomplete(...args),
    runningDownloadArtifactSeeds: () => ['/tmp/out.mp4']
}));
vi.mock('../electron/services/fileContentHash', () => ({
    sha256FileHex: vi.fn().mockResolvedValue(null)
}));
vi.mock('../electron/services/ytdlp/downloadEngineArgs', () => ({
    buildYtDlpArgs: vi.fn().mockResolvedValue(['--continue'])
}));

type FakeProcess = EventEmitter & {
    stdout: EventEmitter;
    stderr: EventEmitter;
    pid: number;
    killed: boolean;
    kill: ReturnType<typeof vi.fn>;
};

function makeFakeProcess(): FakeProcess {
    const proc = new EventEmitter() as FakeProcess;
    proc.stdout = new EventEmitter();
    proc.stderr = new EventEmitter();
    proc.pid = 55_001;
    proc.killed = false;
    proc.kill = vi.fn();
    return proc;
}

function makeDownload(proc: FakeProcess, send: ReturnType<typeof vi.fn>): RunningDownload {
    const webContents = { send, isDestroyed: () => false } as unknown as WebContents;
    return {
        process: proc as unknown as RunningDownload['process'],
        wasCancelled: false,
        isPaused: false,
        stderrBuffer: ['ERROR: connection reset'],
        mergeProgressMode: 'none',
        mergeStreamIndex: 0,
        recodeRetryAttempted: false,
        youtubeConsentFallbackAttempted: false,
        launchContext: {
            options: {
                url: 'https://example.com/watch',
                formatId: 'best',
                outputDir: '/tmp/out',
                webContents
            },
            cookieArgv: [],
            uniqueOutputPath: '/tmp/out/file.mp4',
            resolvedCookiesPresent: false
        }
    } as RunningDownload;
}

describe('finishDownload resume routing', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        vi.useFakeTimers();
    });

    afterEach(() => {
        vi.useRealTimers();
    });

    it('auto-resumes on stall-kill without deleting partial artifacts', async () => {
        const { attachProcessHandlers } = await import(
            '../electron/services/ytdlp/downloadEngineProcessBinding'
        );
        const { runningDownloads } = await import('../electron/services/ytdlp/downloadEngineState');

        const send = vi.fn();
        const proc = makeFakeProcess();
        const nextProc = makeFakeProcess();
        spawnYtdlp.mockReturnValue(nextProc);

        const download = makeDownload(proc, send);
        download.stallKilled = true;
        runningDownloads.set('dl-stall', download);

        attachProcessHandlers('dl-stall', download);
        proc.emit('close', 1);

        await vi.runAllTimersAsync();

        expect(cleanupIncomplete).not.toHaveBeenCalled();
        expect(spawnYtdlp).toHaveBeenCalled();
        const errorSends = send.mock.calls.filter((call) => call[0] === 'download:error');
        expect(errorSends).toHaveLength(0);
    });

    it('surfaces terminal error when network resume attempts exceed the cap', async () => {
        const { attachProcessHandlers } = await import(
            '../electron/services/ytdlp/downloadEngineProcessBinding'
        );
        const { runningDownloads } = await import('../electron/services/ytdlp/downloadEngineState');
        const { MAX_NETWORK_RESUME_ATTEMPTS } = await import(
            '../electron/services/ytdlp/downloadEngineConstants'
        );

        const send = vi.fn();
        const proc = makeFakeProcess();
        const nextProc = makeFakeProcess();
        spawnYtdlp.mockReturnValue(nextProc);

        const download = makeDownload(proc, send);
        download.stderrBuffer = ['ERROR: connection reset'];
        download.networkRetryCount = MAX_NETWORK_RESUME_ATTEMPTS;
        runningDownloads.set('dl-capped', download);

        attachProcessHandlers('dl-capped', download);
        proc.emit('close', 1);

        await vi.runAllTimersAsync();

        expect(cleanupIncomplete).not.toHaveBeenCalled();
        expect(spawnYtdlp).not.toHaveBeenCalled();
        const errorSends = send.mock.calls.filter((call) => call[0] === 'download:error');
        expect(errorSends).toHaveLength(1);
    });

    it('surfaces rate-limit error after MAX_RATE_LIMIT_RESUME_ATTEMPTS', async () => {
        const { attachProcessHandlers } = await import(
            '../electron/services/ytdlp/downloadEngineProcessBinding'
        );
        const { runningDownloads } = await import('../electron/services/ytdlp/downloadEngineState');
        const { MAX_RATE_LIMIT_RESUME_ATTEMPTS } = await import(
            '../electron/services/ytdlp/downloadEngineConstants'
        );

        const send = vi.fn();
        const proc = makeFakeProcess();
        spawnYtdlp.mockReturnValue(makeFakeProcess());

        const download = makeDownload(proc, send);
        download.stderrBuffer = ['HTTP Error 429: Too Many Requests'];
        download.networkRetryCount = MAX_RATE_LIMIT_RESUME_ATTEMPTS;
        runningDownloads.set('dl-429', download);

        attachProcessHandlers('dl-429', download);
        proc.emit('close', 1);

        await vi.runAllTimersAsync();

        expect(spawnYtdlp).not.toHaveBeenCalled();
        const errorSends = send.mock.calls.filter((call) => call[0] === 'download:error');
        expect(errorSends).toHaveLength(1);
        expect(String(errorSends[0]?.[1]?.message ?? '')).toMatch(/rate limited/i);
    });

    it('keeps partials when a paused process dies and notifies renderer with pending state', async () => {
        const { attachProcessHandlers } = await import(
            '../electron/services/ytdlp/downloadEngineProcessBinding'
        );
        const { runningDownloads } = await import('../electron/services/ytdlp/downloadEngineState');

        const send = vi.fn();
        const proc = makeFakeProcess();
        const download = makeDownload(proc, send);
        download.isPaused = true;
        download.stderrBuffer = ['ERROR: killed'];
        runningDownloads.set('dl-paused-dead', download);

        attachProcessHandlers('dl-paused-dead', download);
        proc.emit('close', 1);

        await vi.runAllTimersAsync();

        expect(cleanupIncomplete).not.toHaveBeenCalled();
        expect(spawnYtdlp).not.toHaveBeenCalled();
        const errorSends = send.mock.calls.filter((call) => call[0] === 'download:error');
        expect(errorSends).toHaveLength(0);
        const stateChangeSends = send.mock.calls.filter(
            (call) => call[0] === 'download:state-change'
        );
        expect(stateChangeSends).toHaveLength(1);
        expect(stateChangeSends[0]?.[1]).toEqual({
            downloadId: 'dl-paused-dead',
            state: 'pending'
        });
        expect(runningDownloads.has('dl-paused-dead')).toBe(false);
    });

    it('keeps partials for unknown errors and surfaces terminal error IPC', async () => {
        const { attachProcessHandlers } = await import(
            '../electron/services/ytdlp/downloadEngineProcessBinding'
        );
        const { runningDownloads } = await import('../electron/services/ytdlp/downloadEngineState');

        const send = vi.fn();
        const proc = makeFakeProcess();
        const download = makeDownload(proc, send);
        download.stderrBuffer = ['ERROR: something weird happened'];
        download.networkRetryCount = 5;
        runningDownloads.set('dl-unknown', download);

        attachProcessHandlers('dl-unknown', download);
        proc.emit('close', 1);

        await vi.runAllTimersAsync();

        expect(cleanupIncomplete).not.toHaveBeenCalled();
        expect(spawnYtdlp).not.toHaveBeenCalled();
        expect(send).toHaveBeenCalled();
    });

    it('deletes partials only for permanent failures', async () => {
        const { attachProcessHandlers } = await import(
            '../electron/services/ytdlp/downloadEngineProcessBinding'
        );
        const { runningDownloads } = await import('../electron/services/ytdlp/downloadEngineState');

        const send = vi.fn();
        const proc = makeFakeProcess();
        const download = makeDownload(proc, send);
        download.stderrBuffer = ['ERROR: Video unavailable'];
        runningDownloads.set('dl-perm', download);

        attachProcessHandlers('dl-perm', download);
        proc.emit('close', 1);

        await vi.runAllTimersAsync();

        expect(cleanupIncomplete).toHaveBeenCalled();
        expect(spawnYtdlp).not.toHaveBeenCalled();
        expect(send).toHaveBeenCalled();
    });

    it('restarts fresh with --no-continue after HTTP 416 and deletes stale partials', async () => {
        const { attachProcessHandlers } = await import(
            '../electron/services/ytdlp/downloadEngineProcessBinding'
        );
        const { runningDownloads } = await import('../electron/services/ytdlp/downloadEngineState');

        const send = vi.fn();
        const proc = makeFakeProcess();
        const nextProc = makeFakeProcess();
        spawnYtdlp.mockReturnValue(nextProc);

        const download = makeDownload(proc, send);
        download.stderrBuffer = ['HTTP Error 416: Requested Range Not Satisfiable'];
        runningDownloads.set('dl-416', download);

        attachProcessHandlers('dl-416', download);
        proc.emit('close', 1);

        await vi.runAllTimersAsync();

        expect(cleanupIncomplete).toHaveBeenCalled();
        expect(spawnYtdlp).toHaveBeenCalled();
        expect(buildInvocation).toHaveBeenCalled();
        const buildYtDlpArgs = (await import('../electron/services/ytdlp/downloadEngineArgs'))
            .buildYtDlpArgs;
        expect(buildYtDlpArgs).toHaveBeenCalledWith(
            expect.anything(),
            expect.anything(),
            expect.anything(),
            'remux',
            undefined,
            false
        );
        expect(send).not.toHaveBeenCalled();
    });

    it('resets network retry counter when progress advanced before auto-resume', async () => {
        const { attachProcessHandlers } = await import(
            '../electron/services/ytdlp/downloadEngineProcessBinding'
        );
        const { runningDownloads } = await import('../electron/services/ytdlp/downloadEngineState');

        const send = vi.fn();
        const proc = makeFakeProcess();
        const nextProc = makeFakeProcess();
        spawnYtdlp.mockReturnValue(nextProc);

        const download = makeDownload(proc, send);
        download.stderrBuffer = ['ERROR: connection reset'];
        download.networkRetryCount = 4;
        download.progressPercentHighWaterMark = 55;
        download.attemptProgressHighWaterMark = 10;
        runningDownloads.set('dl-progress', download);

        attachProcessHandlers('dl-progress', download);
        proc.emit('close', 1);

        await vi.runAllTimersAsync();

        expect(download.networkRetryCount).toBe(0);
        expect(spawnYtdlp).toHaveBeenCalled();
    });

    it('sends cancelled flag when user cancels during finishDownload', async () => {
        const { attachProcessHandlers } = await import(
            '../electron/services/ytdlp/downloadEngineProcessBinding'
        );
        const { runningDownloads } = await import('../electron/services/ytdlp/downloadEngineState');

        const send = vi.fn();
        const proc = makeFakeProcess();
        const download = makeDownload(proc, send);
        download.wasCancelled = true;
        runningDownloads.set('dl-cancel', download);

        attachProcessHandlers('dl-cancel', download);
        proc.emit('close', 1);

        await vi.runAllTimersAsync();

        expect(send).toHaveBeenCalledWith('download:error', {
            downloadId: 'dl-cancel',
            message: 'Download cancelled',
            cancelled: true
        });
    });

    it('auto-retries when network resume spawn fails instead of surfacing error', async () => {
        const { attachProcessHandlers } = await import(
            '../electron/services/ytdlp/downloadEngineProcessBinding'
        );
        const { runningDownloads } = await import('../electron/services/ytdlp/downloadEngineState');
        const buildYtDlpArgs = (await import('../electron/services/ytdlp/downloadEngineArgs'))
            .buildYtDlpArgs;

        const send = vi.fn();
        const proc = makeFakeProcess();
        const nextProc = makeFakeProcess();
        spawnYtdlp
            .mockImplementationOnce(() => {
                throw new Error('spawn busy');
            })
            .mockReturnValueOnce(nextProc);

        const download = makeDownload(proc, send);
        download.stderrBuffer = ['ERROR: connection reset'];
        runningDownloads.set('dl-spawn-retry', download);

        attachProcessHandlers('dl-spawn-retry', download);
        proc.emit('close', 1);

        await vi.runAllTimersAsync();

        expect(buildYtDlpArgs).toHaveBeenCalled();
        expect(spawnYtdlp).toHaveBeenCalledTimes(2);
        const errorSends = send.mock.calls.filter((call) => call[0] === 'download:error');
        expect(errorSends).toHaveLength(0);
    });
});
