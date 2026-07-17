import { EventEmitter } from 'node:events';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../electron/services/binaries', () => ({
    buildYtDlpInvocation: vi.fn(async (args: string[]) => ({
        command: '/fake/yt-dlp',
        args,
        env: { ...process.env }
    }))
}));

vi.mock('electron', () => ({
    app: {
        getPath: () => '/tmp',
        isPackaged: false,
        getAppPath: () => '/app',
        isReady: () => true
    }
}));

describe('metadata fetch via yt-dlp', () => {
    beforeEach(() => {
        vi.resetModules();
    });

    it('fetchMetadata maps yt-dlp JSON to VideoInfo', async () => {
        vi.doMock('../electron/services/ytdlp/ytdlpUtilityProcess', () => ({
            spawnYtdlpProcess: vi.fn(() => {
                const child = new EventEmitter() as EventEmitter & {
                    stdout: EventEmitter;
                    stderr: EventEmitter;
                };
                child.stdout = new EventEmitter();
                child.stderr = new EventEmitter();
                queueMicrotask(() => {
                    const json = JSON.stringify({
                        id: 'vid1',
                        title: 'Hello',
                        channel: 'Chan',
                        duration: 42,
                        availability: 'public',
                        thumbnail: 'https://i.ytimg.com/vi/vid1/hqdefault.jpg',
                        formats: [
                            {
                                format_id: 'm',
                                ext: 'mp4',
                                vcodec: 'avc1',
                                acodec: 'mp4a',
                                height: 720,
                                width: 1280,
                                resolution: '720p'
                            }
                        ],
                        webpage_url: 'https://www.youtube.com/watch?v=vid1'
                    });
                    child.stdout.emit('data', Buffer.from(`log line\n${json}`));
                    child.emit('close', 0);
                });
                return child;
            })
        }));

        const { fetchMetadata } = await import('../electron/services/metadata');
        const info = await fetchMetadata('https://www.youtube.com/watch?v=vid1', {});
        expect(info.title).toBe('Hello');
        expect(info.id).toBe('vid1');
        expect(info.formats.length).toBeGreaterThan(0);
    });

    it('fetchPlaylistInfo maps flat playlist JSON', async () => {
        vi.doMock('../electron/services/ytdlp/ytdlpUtilityProcess', () => ({
            spawnYtdlpProcess: vi.fn(() => {
                const child = new EventEmitter() as EventEmitter & {
                    stdout: EventEmitter;
                    stderr: EventEmitter;
                };
                child.stdout = new EventEmitter();
                child.stderr = new EventEmitter();
                queueMicrotask(() => {
                    const json = JSON.stringify({
                        title: 'My list',
                        entries: [
                            {
                                id: 'e1',
                                url: 'https://www.youtube.com/watch?v=e1',
                                title: 'E1',
                                channel: 'C',
                                duration: 1,
                                thumbnail: ''
                            }
                        ]
                    });
                    child.stdout.emit('data', Buffer.from(json));
                    child.emit('close', 0);
                });
                return child;
            })
        }));

        const { fetchPlaylistInfo } = await import('../electron/services/metadata');
        const pl = await fetchPlaylistInfo('https://www.youtube.com/playlist?list=PLx', {});
        expect(pl.title).toBe('My list');
        expect(pl.entries).toHaveLength(1);
        expect(pl.entries[0]?.title).toBe('E1');
        expect(pl.entries[0]?.author).toBe('C');
        expect(pl.entries[0]?.flatIndex).toBe(0);
        expect(pl.sourceUrl).toBe('https://www.youtube.com/playlist?list=PLx');
        expect(pl.collectionKind).toBe('playlist');
    });

    it('fetchPlaylistInfo passes uploads playlist URL to yt-dlp for /channel/UC… links', async () => {
        const spawnYtdlpProcess = vi.fn((_id: string, _command: string, _args: string[]) => {
            const child = new EventEmitter() as EventEmitter & {
                stdout: EventEmitter;
                stderr: EventEmitter;
            };
            child.stdout = new EventEmitter();
            child.stderr = new EventEmitter();
            queueMicrotask(() => {
                const json = JSON.stringify({
                    title: 'Uploads from Chan',
                    channel: 'Chan',
                    id: 'UUxxxxxxxxxxx',
                    entries: [
                        {
                            id: 'abcdefghijk',
                            url: 'https://www.youtube.com/watch?v=abcdefghijk',
                            title: 'Vid',
                            channel: 'Chan',
                            duration: 10
                        }
                    ]
                });
                child.stdout.emit('data', Buffer.from(json));
                child.emit('close', 0);
            });
            return child;
        });

        vi.doMock('../electron/services/ytdlp/ytdlpUtilityProcess', () => ({ spawnYtdlpProcess }));

        const { fetchPlaylistInfo } = await import('../electron/services/metadata');
        await fetchPlaylistInfo('https://www.youtube.com/channel/UCxxxxxxxxxxx', {});

        expect(spawnYtdlpProcess).toHaveBeenCalled();
        const firstCall = spawnYtdlpProcess.mock.calls[0];
        expect(firstCall).toBeDefined();
        const argv = firstCall?.[2] ?? [];
        expect(Array.isArray(argv)).toBe(true);
        const playlistArg = argv.find((a) =>
            a.startsWith('https://www.youtube.com/playlist?list=')
        );
        expect(playlistArg).toBe('https://www.youtube.com/playlist?list=UUxxxxxxxxxxx');
    });

    it('fetchPlaylistInfo uses channel name when title is Uploads from …', async () => {
        vi.doMock('../electron/services/ytdlp/ytdlpUtilityProcess', () => ({
            spawnYtdlpProcess: vi.fn(() => {
                const child = new EventEmitter() as EventEmitter & {
                    stdout: EventEmitter;
                    stderr: EventEmitter;
                };
                child.stdout = new EventEmitter();
                child.stderr = new EventEmitter();
                queueMicrotask(() => {
                    const json = JSON.stringify({
                        title: 'Uploads from Big Think',
                        channel: 'Big Think',
                        entries: [
                            {
                                id: 'abcdefghijk',
                                url: 'https://www.youtube.com/watch?v=abcdefghijk',
                                title: 'V',
                                channel: 'Big Think',
                                duration: 1
                            }
                        ]
                    });
                    child.stdout.emit('data', Buffer.from(json));
                    child.emit('close', 0);
                });
                return child;
            })
        }));

        const { fetchPlaylistInfo } = await import('../electron/services/metadata');
        const pl = await fetchPlaylistInfo('https://www.youtube.com/playlist?list=UUx', {});
        expect(pl.title).toBe('Big Think');
    });

    it('fetchPlaylistInfo fills thumbnail from video id when yt-dlp omits images', async () => {
        vi.doMock('../electron/services/ytdlp/ytdlpUtilityProcess', () => ({
            spawnYtdlpProcess: vi.fn(() => {
                const child = new EventEmitter() as EventEmitter & {
                    stdout: EventEmitter;
                    stderr: EventEmitter;
                };
                child.stdout = new EventEmitter();
                child.stderr = new EventEmitter();
                queueMicrotask(() => {
                    const json = JSON.stringify({
                        title: 'List',
                        entries: [
                            {
                                id: 'dQw4w9WgXcQ',
                                url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
                                title: 'R',
                                channel: 'C',
                                duration: 1
                            }
                        ]
                    });
                    child.stdout.emit('data', Buffer.from(json));
                    child.emit('close', 0);
                });
                return child;
            })
        }));

        const { fetchPlaylistInfo } = await import('../electron/services/metadata');
        const pl = await fetchPlaylistInfo('https://www.youtube.com/playlist?list=PLz', {});
        expect(pl.entries[0]?.thumbnailUrl).toBe(
            'https://i.ytimg.com/vi/dQw4w9WgXcQ/hqdefault.jpg'
        );
    });
});
