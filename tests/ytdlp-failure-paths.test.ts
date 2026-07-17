import { EventEmitter } from 'node:events';
import type { WebContents } from 'electron';
import { beforeEach, describe, expect, it, vi } from 'vitest';

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
            stdout.emit('data', Buffer.from('/tmp/kajo-planned/fail.mp4\n'));
            child.emit('close', 0);
        });
        return child;
    })
}));

// spawnYtdlpProcess is used for the actual yt-dlp download
vi.mock('../electron/services/ytdlp/ytdlpUtilityProcess', () => ({
    spawnYtdlpProcess: vi.fn(() => {
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
        child.kill = vi.fn(() => true);
        queueMicrotask(() => {
            stderr.emit('data', Buffer.from('something went wrong\n'));
            child.emit('close', 2);
        });
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

describe('ytdlp failure handling', () => {
    beforeEach(async () => {
        vi.resetModules();
        const { cancelAllDownloads } = await import('../electron/services/ytdlp');
        cancelAllDownloads();
    });

    it('emits download:error when yt-dlp exits non-zero', async () => {
        const { startDownload } = await import('../electron/services/ytdlp');
        const send = vi.fn();
        const wc = { send, isDestroyed: () => false } as unknown as WebContents;

        const { downloadId: id } = await startDownload({
            url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
            formatId: 'best',
            outputDir: '/tmp/out',
            webContents: wc
        });

        await vi.waitFor(() => {
            expect(send).toHaveBeenCalledWith(
                'download:error',
                expect.objectContaining({ downloadId: id })
            );
        });
        const errCall = send.mock.calls.find((c) => c[0] === 'download:error');
        expect(String(errCall?.[1]?.message)).toContain('wrong');
    });
});
