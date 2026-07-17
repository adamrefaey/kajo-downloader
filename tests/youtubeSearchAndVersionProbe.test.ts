import { EventEmitter } from 'node:events';
import { afterEach, describe, expect, it, vi } from 'vitest';

const spawnMock = vi.hoisted(() => vi.fn());

vi.mock('node:child_process', () => ({
    spawn: (...args: unknown[]) => spawnMock(...args)
}));

vi.mock('../electron/services/binaries', () => ({
    buildYtDlpInvocation: vi.fn(async () => ({
        command: 'mock-bin',
        args: ['--x'],
        env: process.env
    }))
}));

function childWithClose(stdout: string, code: number, stderr = '') {
    const child = new EventEmitter() as NodeJS.EventEmitter & {
        stdout: EventEmitter;
        stderr: EventEmitter;
    };
    child.stdout = Object.assign(new EventEmitter(), {
        setEncoding: () => {}
    });
    child.stderr = Object.assign(new EventEmitter(), {
        setEncoding: () => {}
    });
    queueMicrotask(() => {
        if (stdout) {
            child.stdout.emit('data', Buffer.from(stdout, 'utf8'));
        }
        if (stderr) {
            child.stderr.emit('data', Buffer.from(stderr, 'utf8'));
        }
        child.emit('close', code);
    });
    return child;
}

describe('youtubeSearch searchViaYtDlp', () => {
    afterEach(() => {
        spawnMock.mockReset();
        vi.resetModules();
    });

    it('returns [] for short query without spawning via searchYoutubeInApp', async () => {
        spawnMock.mockImplementation(() => childWithClose('', 0));
        const { searchYoutubeInApp } = await import('../electron/services/youtubeInAppSearch');
        expect(await searchYoutubeInApp('a')).toEqual([]);
        expect(spawnMock).not.toHaveBeenCalled();
    });

    it('sanitizeSearchQuery strips control characters and colons', async () => {
        spawnMock.mockImplementation(() =>
            childWithClose(
                JSON.stringify({
                    entries: [
                        {
                            id: 'v',
                            url: 'https://www.youtube.com/watch?v=v',
                            title: 'Ok',
                            duration: 1,
                            thumbnails: [{ url: 'https://thumb.example/z.jpg' }]
                        }
                    ]
                }),
                0
            )
        );
        const { searchYoutubeInApp } = await import('../electron/services/youtubeInAppSearch');
        const rows = await searchYoutubeInApp('ab\x01cd:ef', 3);
        expect(rows).toHaveLength(1);
        expect(spawnMock).toHaveBeenCalled();
    });

    it('returns flat entries for playlist JSON', async () => {
        spawnMock.mockImplementation(() =>
            childWithClose(
                JSON.stringify({
                    entries: [
                        {
                            id: 'abc',
                            url: 'https://www.youtube.com/watch?v=abc',
                            title: 'Hello',
                            uploader: 'U',
                            duration: 12,
                            thumbnails: [{ url: 'https://t.example/x.jpg' }]
                        }
                    ]
                }),
                0
            )
        );
        const { searchViaYtDlp } = await import('../electron/services/youtubeSearch');
        const entries = await searchViaYtDlp('ytsearch5:cats', 5);
        expect(entries).toHaveLength(1);
        expect(entries[0]?.title).toBe('Hello');
    });

    it('rejects with cleaned stderr on non-zero exit', async () => {
        spawnMock.mockImplementation(() => childWithClose('', 1, 'some yt_dlp __internal__ noise'));
        const { searchViaYtDlp } = await import('../electron/services/youtubeSearch');
        await expect(searchViaYtDlp('ytsearch5:ok query', 5)).rejects.toThrow();
    });

    it('maps solo object when entries missing', async () => {
        spawnMock.mockImplementation(() =>
            childWithClose(JSON.stringify({ id: 'z', title: 'Solo', url: 'https://youtu.be/z' }), 0)
        );
        const { searchViaYtDlp } = await import('../electron/services/youtubeSearch');
        const entries = await searchViaYtDlp('ytsearch3:long enough', 3);
        expect(entries[0]?.title).toBe('Solo');
    });

    it('returns [] for invalid JSON stdout', async () => {
        spawnMock.mockImplementation(() => childWithClose('not-json', 0));
        const { searchViaYtDlp } = await import('../electron/services/youtubeSearch');
        expect(await searchViaYtDlp('ytsearch3:long enough', 3)).toEqual([]);
    });

    it('includes solo entry when entry has id without http url', async () => {
        spawnMock.mockImplementation(() =>
            childWithClose(
                JSON.stringify({
                    entries: [{ id: 'xyz', title: 'T', channel: 'C' }]
                }),
                0
            )
        );
        const { searchViaYtDlp } = await import('../electron/services/youtubeSearch');
        const entries = await searchViaYtDlp('ytsearch3:long enough', 3);
        expect(entries[0]?.id).toBe('xyz');
        expect(entries[0]?.channel).toBe('C');
    });

    it('returns raw entry when id and url are empty', async () => {
        spawnMock.mockImplementation(() =>
            childWithClose(
                JSON.stringify({
                    entries: [{ id: '', title: 'NoUrl' }]
                }),
                0
            )
        );
        const { searchViaYtDlp } = await import('../electron/services/youtubeSearch');
        const entries = await searchViaYtDlp('ytsearch3:long enough', 3);
        expect(entries).toHaveLength(1);
        expect(entries[0]?.title).toBe('NoUrl');
    });

    it('uses generic error when stderr is too short after non-zero exit', async () => {
        spawnMock.mockImplementation(() => childWithClose('', 1, 'x'));
        const { searchViaYtDlp } = await import('../electron/services/youtubeSearch');
        await expect(searchViaYtDlp('ytsearch3:long enough', 3)).rejects.toThrow(
            /Search failed. Please try again./
        );
    });

    it('rejects when spawn errors before close', async () => {
        spawnMock.mockImplementationOnce(() => {
            const e = new EventEmitter() as NodeJS.EventEmitter & {
                stdout: EventEmitter;
                stderr: EventEmitter;
            };
            e.stdout = Object.assign(new EventEmitter(), { setEncoding: () => {} });
            e.stderr = Object.assign(new EventEmitter(), { setEncoding: () => {} });
            queueMicrotask(() => e.emit('error', new Error('spawn exploded')));
            return e;
        });
        const { searchViaYtDlp } = await import('../electron/services/youtubeSearch');
        await expect(searchViaYtDlp('ytsearch3:long enough', 3)).rejects.toThrow('spawn exploded');
    });

    it('maps empty entries array to solo object row when not a playlist', async () => {
        spawnMock.mockImplementation(() =>
            childWithClose(JSON.stringify({ entries: [], id: 'solo', title: 'Only' }), 0)
        );
        const { searchViaYtDlp } = await import('../electron/services/youtubeSearch');
        const entries = await searchViaYtDlp('ytsearch3:long enough', 3);
        expect(entries).toHaveLength(1);
        expect(entries[0]?.id).toBe('solo');
    });

    it('searchViaYtDlp returns [] for empty playlist (no fake search-page row)', async () => {
        spawnMock.mockImplementation(() =>
            childWithClose(
                JSON.stringify({
                    _type: 'playlist',
                    entries: [],
                    id: 'myquery',
                    title: 'myquery',
                    webpage_url: 'https://www.dailymotion.com/search/myquery/videos'
                }),
                0
            )
        );
        const { searchViaYtDlp } = await import('../electron/services/youtubeSearch');
        expect(
            await searchViaYtDlp('https://www.dailymotion.com/search/myquery/videos', 5)
        ).toEqual([]);
    });

    it('filters null and non-object entries', async () => {
        spawnMock.mockImplementation(() =>
            childWithClose(
                JSON.stringify({
                    entries: [
                        null,
                        [],
                        {
                            id: 'd',
                            url: 'https://www.youtube.com/watch?v=d',
                            title: 'T',
                            channel: 'Chan',
                            duration: 12.7
                        }
                    ]
                }),
                0
            )
        );
        const { searchViaYtDlp } = await import('../electron/services/youtubeSearch');
        const entries = await searchViaYtDlp('ytsearch3:long enough', 3);
        expect(entries).toHaveLength(1);
        expect(entries[0]?.channel).toBe('Chan');
    });

    it('slices results to maxResults', async () => {
        spawnMock.mockImplementation(() =>
            childWithClose(
                JSON.stringify({
                    entries: [
                        { id: '1', url: 'https://www.youtube.com/watch?v=1', title: 'A' },
                        { id: '2', url: 'https://www.youtube.com/watch?v=2', title: 'B' },
                        { id: '3', url: 'https://www.youtube.com/watch?v=3', title: 'C' }
                    ]
                }),
                0
            )
        );
        const { searchViaYtDlp } = await import('../electron/services/youtubeSearch');
        const entries = await searchViaYtDlp('ytsearch5:long enough', 2);
        expect(entries).toHaveLength(2);
    });
});
