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

// Planning probe (node:child_process.spawn) — emits a planned output path then exits 0.
vi.mock('node:child_process', () => ({
    spawn: vi.fn(() => {
        const child = new EventEmitter() as EventEmitter & {
            stdout: EventEmitter;
            stderr: EventEmitter;
            kill: ReturnType<typeof vi.fn>;
            killed: boolean;
        };
        Object.assign(child, {
            stdout: new EventEmitter(),
            stderr: new EventEmitter(),
            killed: false,
            kill: vi.fn(() => true)
        });
        queueMicrotask(() => {
            child.stdout.emit('data', Buffer.from('/tmp/kajo-planned/video.mp4\n'));
            child.emit('close', 0);
        });
        return child;
    })
}));

type FakeYtdlpChild = EventEmitter & {
    stdout: EventEmitter;
    stderr: EventEmitter;
    kill: ReturnType<typeof vi.fn>;
    killed: boolean;
    pid: number | undefined;
};

const ytdlpChildren: FakeYtdlpChild[] = [];

// Each yt-dlp invocation returns a manually-driven child captured in `ytdlpChildren` so the test
// controls the exact ordering of stdout/close events across the original and retry attempts.
vi.mock('../electron/services/ytdlp/ytdlpUtilityProcess', () => ({
    spawnYtdlpProcess: vi.fn(() => {
        const child = new EventEmitter() as FakeYtdlpChild;
        Object.assign(child, {
            stdout: new EventEmitter(),
            stderr: new EventEmitter(),
            killed: false,
            pid: 4321,
            kill: vi.fn(() => true)
        });
        ytdlpChildren.push(child);
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

describe('ytdlp retry does not inherit stale output from the previous attempt', () => {
    beforeEach(async () => {
        ytdlpChildren.length = 0;
        vi.resetModules();
        const { cancelAllDownloads } = await import('../electron/services/ytdlp');
        cancelAllDownloads();
    });

    afterEach(async () => {
        const { cancelAllDownloads } = await import('../electron/services/ytdlp');
        cancelAllDownloads();
    });

    it('ignores a late destination flushed by the old process after a recode retry', async () => {
        const { startDownload } = await import('../electron/services/ytdlp');
        const send = vi.fn();
        const wc = { send, isDestroyed: () => false } as unknown as WebContents;

        // Non-YouTube URL keeps us on the recode-retry path (no consent-fallback branch).
        const { downloadId } = await startDownload({
            url: 'https://vimeo.com/123456789',
            formatId: 'best',
            outputDir: '/tmp/out',
            webContents: wc
        });

        await vi.waitFor(() => expect(ytdlpChildren).toHaveLength(1));
        const first = ytdlpChildren[0];

        // First attempt fails with an ffmpeg/merge error → triggers `--recode-video` retry.
        first?.stderr.emit('data', Buffer.from('ERROR: Conversion failed!\n'));
        first?.emit('close', 1);

        await vi.waitFor(() => expect(ytdlpChildren).toHaveLength(2));
        const second = ytdlpChildren[1];

        // The retry reports its real destination; then the old (closed) handle flushes a stale one.
        second?.stdout.emit('data', Buffer.from('[download] Destination: /tmp/out/GOOD.mp4\n'));
        first?.stdout.emit('data', Buffer.from('[download] Destination: /tmp/out/STALE.mp4\n'));
        second?.emit('close', 0);

        await vi.waitFor(() => {
            expect(send).toHaveBeenCalledWith(
                'download:complete',
                expect.objectContaining({ downloadId })
            );
        });

        const completeCall = send.mock.calls.find((c) => c[0] === 'download:complete');
        expect(completeCall?.[1]?.filePath).toBe('/tmp/out/GOOD.mp4');
    });
});
