import { EventEmitter } from 'node:events';
import type { WebContents } from 'electron';
import { describe, expect, it, vi } from 'vitest';
import type { RunningDownload } from '../electron/services/ytdlp/types';

// downloadEngineProcessBinding pulls in the yt-dlp utility-process bridge (which imports
// electron) and the binaries helper. Stub both so the module graph loads in the node test env;
// this test exercises only attach/detach, which never call into them.
vi.mock('../electron/services/binaries', () => ({
    buildYtDlpInvocation: vi.fn()
}));
vi.mock('../electron/services/ytdlp/ytdlpUtilityProcess', () => ({
    spawnYtdlpProcess: vi.fn()
}));

type FakeProcess = EventEmitter & { stdout: EventEmitter; stderr: EventEmitter };

function makeFakeProcess(): FakeProcess {
    const proc = new EventEmitter() as FakeProcess;
    proc.stdout = new EventEmitter();
    proc.stderr = new EventEmitter();
    return proc;
}

function makeFakeDownload(proc: FakeProcess, send: ReturnType<typeof vi.fn>): RunningDownload {
    const webContents = { send, isDestroyed: () => false } as unknown as WebContents;
    return {
        process: proc,
        wasCancelled: false,
        isPaused: false,
        stderrBuffer: [],
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
            uniqueOutputPath: '/tmp/out/file',
            resolvedCookiesPresent: false
        }
    } as unknown as RunningDownload;
}

describe('download engine retry listener cleanup', () => {
    it('detachProcessHandlers stops stale events from the old process mutating shared state', async () => {
        const { attachProcessHandlers, detachProcessHandlers } = await import(
            '../electron/services/ytdlp/downloadEngineProcessBinding'
        );
        const send = vi.fn();
        const proc = makeFakeProcess();
        const download = makeFakeDownload(proc, send);

        attachProcessHandlers('dl-1', download);

        // While attached, a stderr line is captured into the shared buffer (proves wiring).
        proc.stderr.emit('data', Buffer.from('first attempt failed\n'));
        expect(download.stderrBuffer).toEqual(['first attempt failed']);

        // Retry path: detach the old handle's listeners before `download.process` is reassigned.
        detachProcessHandlers(download);

        // Stale output flushed by the old (closed) handle must now be inert: a late destination
        // line must not move outputFilePath, late stderr must not append, and a late close must
        // not emit terminal IPC for the (already retried) download.
        proc.stdout.emit('data', Buffer.from('[download] Destination: /tmp/out/STALE.mp4\n'));
        proc.stderr.emit('data', Buffer.from('STALE stderr after retry\n'));
        proc.emit('close', 0);

        expect(download.stderrBuffer).toEqual(['first attempt failed']);
        expect(download.outputFilePath).toBeUndefined();
        expect(send).not.toHaveBeenCalled();
    });
});
