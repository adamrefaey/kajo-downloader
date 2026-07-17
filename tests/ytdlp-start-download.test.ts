import { EventEmitter } from 'node:events';
import type { WebContents } from 'electron';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../electron/services/metadata', () => ({
    resolveYoutubeCookieArgvForDownload: vi.fn(async () => [])
}));

vi.mock('../electron/services/binaries', () => ({
    buildYtDlpInvocation: vi.fn(async (args: string[]) => ({
        command: '/fake/yt-dlp',
        args,
        env: { ...process.env }
    }))
}));

// node:child_process.spawn is used by runCommand (planning probe)
vi.mock('node:child_process', () => ({
    spawn: vi.fn(() => {
        const child = new EventEmitter() as EventEmitter & {
            stdout: EventEmitter;
            stderr: EventEmitter;
            kill: ReturnType<typeof vi.fn>;
            killed: boolean;
        };
        const stdout = new EventEmitter();
        const stderr = new EventEmitter();
        Object.assign(child, { stdout, stderr, killed: false });
        child.kill = vi.fn(() => true);
        queueMicrotask(() => {
            stdout.emit('data', Buffer.from('/tmp/kajo-planned/video.mp4\n'));
            child.emit('close', 0);
        });
        return child;
    })
}));

let ytdlpSpawnCall = 0;

// spawnYtdlpProcess is used for the actual yt-dlp download
vi.mock('../electron/services/ytdlp/ytdlpUtilityProcess', () => ({
    spawnYtdlpProcess: vi.fn(() => {
        const idx = ytdlpSpawnCall;
        ytdlpSpawnCall += 1;
        const child = new EventEmitter() as EventEmitter & {
            stdout: EventEmitter;
            stderr: EventEmitter;
            kill: ReturnType<typeof vi.fn>;
            killed: boolean;
            pid: number | undefined;
        };
        const stdout = new EventEmitter();
        const stderr = new EventEmitter();
        Object.assign(child, { stdout, stderr, killed: false, pid: 1234 });
        let killed = false;
        child.kill = vi.fn((signal?: NodeJS.Signals) => {
            if (killed) return true;
            killed = true;
            Object.assign(child, { killed: true });
            queueMicrotask(() => {
                child.emit('close', signal === 'SIGKILL' ? 1 : 0);
            });
            return true;
        });
        if (idx === 0) {
            setTimeout(() => {
                if (!killed) {
                    stdout.emit(
                        'data',
                        Buffer.from('[download] 100% of   1.00MiB at   1.00MiB/s ETA 00:00\n')
                    );
                    child.emit('close', 0);
                }
            }, 50);
        }
        return child;
    })
}));

vi.mock('node:fs/promises', async (importOriginal) => {
    const actual = await importOriginal<typeof import('node:fs/promises')>();
    return {
        ...actual,
        access: vi.fn(async () => {
            throw new Error('ENOENT');
        }),
        unlink: vi.fn(async () => {}),
        readdir: actual.readdir
    };
});

describe('ytdlp startDownload lifecycle', () => {
    beforeEach(async () => {
        ytdlpSpawnCall = 0;
        vi.useRealTimers();
        vi.resetModules();
        const { cancelAllDownloads } = await import('../electron/services/ytdlp');
        cancelAllDownloads();
    });

    afterEach(async () => {
        const { cancelAllDownloads } = await import('../electron/services/ytdlp');
        cancelAllDownloads();
    });

    it('starts download and completes with success event', async () => {
        const { startDownload } = await import('../electron/services/ytdlp');
        const send = vi.fn();
        const wc = { send, isDestroyed: () => false } as unknown as WebContents;

        const { downloadId: id, reservedOutputPath } = await startDownload({
            url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
            formatId: 'best',
            outputDir: '/tmp/out',
            webContents: wc
        });

        expect(reservedOutputPath).toMatch(/video\.mp4$/);

        await vi.waitFor(() => {
            expect(send).toHaveBeenCalledWith(
                'download:complete',
                expect.objectContaining({ downloadId: id })
            );
        });
    });

    it('cancelDownload returns false when id unknown', async () => {
        const { cancelDownload } = await import('../electron/services/ytdlp');
        expect(cancelDownload('missing')).toBe(false);
    });

    it('cancels active download before yt-dlp exits', async () => {
        const { startDownload, cancelDownload } = await import('../electron/services/ytdlp');
        const send = vi.fn();
        const wc = { send, isDestroyed: () => false } as unknown as WebContents;

        const { downloadId: id } = await startDownload({
            url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
            formatId: 'best',
            outputDir: '/tmp/out',
            webContents: wc
        });

        expect(cancelDownload(id)).toBe(true);
        await vi.waitFor(() => {
            expect(send).toHaveBeenCalledWith(
                'download:error',
                expect.objectContaining({ downloadId: id, message: 'Download cancelled' })
            );
        });
    });
});
