/** @vitest-environment jsdom */

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { normalizeAdvancedDownloadDefaults } from '../src/shared/advancedDownloadSettings';
import { mergePersistedDownloadState, useDownloadStore } from '../src/store/downloadStore';
import { type AppSettings, DEFAULT_NOTIFICATION_SETTINGS } from '../src/types';

function testSettings(
    overrides: Partial<{
        outputDir: string;
        maxConcurrentDownloads: number;
        preferredQuality: number | null;
        uiLocale: string;
        proxyConfigured: boolean;
    }> = {}
) {
    return {
        outputDir: '/tmp',
        maxConcurrentDownloads: 1,
        preferredQuality: 1080,
        uiLocale: '',
        advancedDownloadDefaults: normalizeAdvancedDownloadDefaults(undefined),
        proxyConfigured: false,
        notificationSettings: DEFAULT_NOTIFICATION_SETTINGS,
        ...overrides
    };
}

beforeEach(() => {
    vi.unstubAllGlobals();
    localStorage.clear();
    useDownloadStore.persist.clearStorage();
    useDownloadStore.setState({
        queue: [],
        settings: testSettings({ outputDir: '/tmp' })
    });
});

describe('downloadStore', () => {
    it('addDownload prepends and returns id', () => {
        vi.stubGlobal('crypto', { randomUUID: () => 'uuid-1' });
        const id = useDownloadStore.getState().addDownload({
            url: 'https://youtu.be/x',
            formatId: 'best',
            outputDir: '/out'
        });
        expect(id).toBe('uuid-1');
        expect(useDownloadStore.getState().queue[0]?.url).toBe('https://youtu.be/x');
        vi.unstubAllGlobals();
    });

    it('upgradeThumbnailsForMediaPage patches rows with matching canonical URL', () => {
        useDownloadStore.getState().addDownload({
            id: 'dm1',
            url: 'https://www.dailymotion.com/video/xabc',
            formatId: 'best',
            outputDir: '/out',
            thumbnailUrl: 'https://s1.dmcdn.net/broken.jpg'
        });
        useDownloadStore
            .getState()
            .upgradeThumbnailsForMediaPage(
                'https://www.dailymotion.com/video/xabc',
                'data:image/jpeg;base64,QQ=='
            );
        expect(useDownloadStore.getState().queue[0]?.thumbnailUrl).toBe(
            'data:image/jpeg;base64,QQ=='
        );
    });

    it('upgradeThumbnailsForMediaPage matches www vs non-www', () => {
        useDownloadStore.getState().addDownload({
            id: 'dm2',
            url: 'https://dailymotion.com/video/xabc',
            formatId: 'best',
            outputDir: '/out',
            thumbnailUrl: 'http'
        });
        useDownloadStore
            .getState()
            .upgradeThumbnailsForMediaPage('https://www.dailymotion.com/video/xabc', 'data:x');
        expect(useDownloadStore.getState().queue[0]?.thumbnailUrl).toBe('data:x');
    });

    it('addDownload copies optional site context fields', () => {
        vi.stubGlobal('crypto', { randomUUID: () => 'uuid-site' });
        useDownloadStore.getState().addDownload({
            url: 'https://youtu.be/x',
            formatId: 'best',
            outputDir: '/out',
            siteId: 'youtube',
            siteDomain: 'youtu.be',
            extractorKey: 'youtube',
            authRequired: false
        });
        const row = useDownloadStore.getState().queue[0];
        expect(row?.siteId).toBe('youtube');
        expect(row?.siteDomain).toBe('youtu.be');
        expect(row?.extractorKey).toBe('youtube');
        expect(row?.authRequired).toBe(false);
        vi.unstubAllGlobals();
    });

    it('updateDownloadProgress clamps and noop skips', () => {
        const id = useDownloadStore.getState().addDownload({
            id: 'd1',
            url: 'u',
            formatId: 'f',
            outputDir: '/o'
        });
        useDownloadStore.getState().updateDownloadProgress(id, { percent: 50 });
        expect(useDownloadStore.getState().queue.find((q) => q.id === id)?.progressPercent).toBe(
            50
        );
        useDownloadStore.getState().updateDownloadProgress(id, { percent: NaN });
        expect(useDownloadStore.getState().queue.find((q) => q.id === id)?.progressPercent).toBe(0);
        useDownloadStore.getState().updateDownloadProgress(id, { percent: 50, speed: '1' });
        useDownloadStore.getState().updateDownloadProgress(id, { percent: 50, speed: '1' });
        expect(useDownloadStore.getState().queue.find((q) => q.id === id)?.speed).toBe('1');
        useDownloadStore.getState().updateDownloadProgress(id, {
            percent: 50,
            speed: '1',
            eta: '00:01'
        });
        useDownloadStore.getState().updateDownloadProgress(id, {
            percent: 50,
            speed: '1',
            eta: '00:02'
        });
        expect(useDownloadStore.getState().queue.find((q) => q.id === id)?.eta).toBe('00:02');
    });

    it('updateDownloadProgress refines totalSize when main sends live totals', () => {
        const id = useDownloadStore.getState().addDownload({
            id: 'd-size',
            url: 'u',
            formatId: 'f',
            outputDir: '/o',
            totalSize: '9 MB'
        });
        useDownloadStore.getState().updateDownloadProgress(id, {
            percent: 10,
            totalSize: '10 MB'
        });
        expect(useDownloadStore.getState().queue.find((q) => q.id === id)?.totalSize).toBe('10 MB');
        useDownloadStore.getState().updateDownloadProgress(id, {
            percent: 10,
            totalSize: '10 MB'
        });
        const mid = useDownloadStore.getState().queue.find((q) => q.id === id);
        useDownloadStore.getState().updateDownloadProgress(id, { percent: 10 });
        const after = useDownloadStore.getState().queue.find((q) => q.id === id);
        expect(mid?.totalSize).toBe('10 MB');
        expect(after?.totalSize).toBe('10 MB');
    });

    it('updateDownloadProgress uses payload.size as totalSize for live items and keeps updating it', () => {
        // HLS past-live downloads: yt-dlp reports each segment's Content-Length as totalBytes,
        // not the full stream total. So early ticks have tiny values (e.g. '1.0 KB') that grow.
        // The store must always overwrite with the latest payload.size for live items so the
        // displayed size tracks streamVideoTotalBytes as it grows segment-by-segment.
        const id = useDownloadStore.getState().addDownload({
            id: 'd-live-size',
            url: 'u',
            formatId: 'f',
            outputDir: '/o',
            liveStatus: 'was_live'
        });
        // First tick: tiny size from first HLS segment's Content-Length
        useDownloadStore.getState().updateDownloadProgress(id, {
            percent: 1,
            size: '1.0 KB'
        });
        expect(useDownloadStore.getState().queue.find((q) => q.id === id)?.totalSize).toBe(
            '1.0 KB'
        );
        // Subsequent tick: streamVideoTotalBytes grows as more segments are seen
        useDownloadStore.getState().updateDownloadProgress(id, {
            percent: 6,
            size: '450 MB',
            speed: '2.1 MB/s',
            eta: '3:17'
        });
        // Must update (not stay locked at '1.0 KB')
        expect(useDownloadStore.getState().queue.find((q) => q.id === id)?.totalSize).toBe(
            '450 MB'
        );
    });

    it('updateDownloadProgress does not overwrite existing totalSize with payload.size for non-live items', () => {
        // Non-live items have a pre-fetched combined metadata estimate in totalSize.
        // During the video phase of a merged download, payload.size is only the video-stream
        // label and must not replace the combined estimate.
        const id = useDownloadStore.getState().addDownload({
            id: 'd-existing-size',
            url: 'u',
            formatId: 'f',
            outputDir: '/o',
            totalSize: '~500 MB'
            // liveStatus absent → non-live
        });
        useDownloadStore.getState().updateDownloadProgress(id, {
            percent: 10,
            size: '400 MB' // video-only stream label
        });
        expect(useDownloadStore.getState().queue.find((q) => q.id === id)?.totalSize).toBe(
            '~500 MB'
        );
    });

    it('updateDownloadProgress ignores payload.size of "--" for live items', () => {
        const id = useDownloadStore.getState().addDownload({
            id: 'd-dash-size',
            url: 'u',
            formatId: 'f',
            outputDir: '/o',
            liveStatus: 'is_live'
        });
        useDownloadStore.getState().updateDownloadProgress(id, {
            percent: 5,
            size: '--'
        });
        expect(
            useDownloadStore.getState().queue.find((q) => q.id === id)?.totalSize
        ).toBeUndefined();
    });

    it('updateDownloadProgress never decreases percent for finite main ticks', () => {
        const id = useDownloadStore.getState().addDownload({
            id: 'd-mono',
            url: 'u',
            formatId: 'f',
            outputDir: '/o'
        });
        useDownloadStore.getState().updateDownload(id, { state: 'downloading' });
        useDownloadStore.getState().updateDownloadProgress(id, { percent: 60 });
        expect(useDownloadStore.getState().queue.find((q) => q.id === id)?.progressPercent).toBe(
            60
        );
        useDownloadStore.getState().updateDownloadProgress(id, { percent: 45 });
        expect(useDownloadStore.getState().queue.find((q) => q.id === id)?.progressPercent).toBe(
            60
        );
        useDownloadStore.getState().updateDownloadProgress(id, { percent: 72 });
        expect(useDownloadStore.getState().queue.find((q) => q.id === id)?.progressPercent).toBe(
            72
        );
    });

    it('updateDownloadProgress noop preserves queue item ref when nothing changes', () => {
        const id = useDownloadStore.getState().addDownload({
            id: 'noop0',
            url: 'u',
            formatId: 'f',
            outputDir: '/o'
        });
        useDownloadStore.getState().updateDownload(id, { state: 'downloading' });
        useDownloadStore.getState().updateDownloadProgress(id, { percent: 0 });
        const mid = useDownloadStore.getState().queue.find((q) => q.id === id);
        useDownloadStore.getState().updateDownloadProgress(id, { percent: 0 });
        const after = useDownloadStore.getState().queue.find((q) => q.id === id);
        expect(mid).toBe(after);
    });

    it('updateDownloadProgress applies when item had errorMessage while downloading', () => {
        const id = useDownloadStore.getState().addDownload({
            id: 'd2',
            url: 'u',
            formatId: 'f',
            outputDir: '/o'
        });
        useDownloadStore.getState().updateDownload(id, {
            state: 'downloading',
            progressPercent: 40,
            errorMessage: 'stale'
        });
        useDownloadStore.getState().updateDownloadProgress(id, { percent: 40 });
        const item = useDownloadStore.getState().queue.find((q) => q.id === id);
        expect(item?.errorMessage).toBeUndefined();
        expect(item?.progressPercent).toBe(40);
    });

    it('updateDownloadProgress does not resume a manually paused item', () => {
        const id = useDownloadStore.getState().addDownload({
            id: 'd-paused',
            url: 'u',
            formatId: 'f',
            outputDir: '/o'
        });
        useDownloadStore.getState().updateDownload(id, {
            state: 'paused',
            pauseReason: 'manual',
            progressPercent: 33
        });
        useDownloadStore.getState().updateDownloadProgress(id, { percent: 90, speed: '5MiB/s' });
        const item = useDownloadStore.getState().queue.find((q) => q.id === id);
        expect(item?.state).toBe('paused');
        expect(item?.pauseReason).toBe('manual');
        expect(item?.progressPercent).toBe(33);
        expect(item?.speed).toBeUndefined();
    });

    it('completeDownload cancelDownload removeDownload updateDownload', () => {
        const id = useDownloadStore.getState().addDownload({
            id: 'x',
            url: 'u',
            formatId: 'f',
            outputDir: '/o'
        });
        useDownloadStore.getState().completeDownload(id, '/file.mp4', '42 MB');
        let item = useDownloadStore.getState().queue.find((q) => q.id === id);
        expect(item?.state).toBe('complete');
        expect(item?.filePath).toBe('/file.mp4');
        expect(item?.totalSize).toBe('42 MB');
        useDownloadStore.getState().completeDownload(id, null);
        item = useDownloadStore.getState().queue.find((q) => q.id === id);
        expect(item?.filePath).toBe('/file.mp4');
        useDownloadStore.getState().cancelDownload(id);
        expect(useDownloadStore.getState().queue.find((q) => q.id === id)?.state).toBe('cancelled');
        useDownloadStore.getState().updateDownload(id, { title: 'T' });
        expect(useDownloadStore.getState().queue.find((q) => q.id === id)?.title).toBe('T');
        useDownloadStore.getState().removeDownload(id);
        expect(useDownloadStore.getState().queue.find((q) => q.id === id)).toBeUndefined();
    });

    it('hydrateSettings preserves explicit proxyConfigured and applies defaults for omitted optionals', () => {
        useDownloadStore.getState().hydrateSettings(
            testSettings({
                outputDir: '/proxy-true',
                proxyConfigured: true
            })
        );
        expect(useDownloadStore.getState().settings.proxyConfigured).toBe(true);

        const base = testSettings({ outputDir: '/proxy-false' });
        useDownloadStore.getState().hydrateSettings({
            ...base,
            proxyConfigured: undefined,
            notificationSettings: undefined
        } as unknown as AppSettings);
        const s = useDownloadStore.getState().settings;
        expect(s.proxyConfigured).toBe(false);
        expect(s.notificationSettings).toEqual(DEFAULT_NOTIFICATION_SETTINGS);
    });

    it('setSettings and hydrateSettings', () => {
        useDownloadStore.getState().setSettings({ preferredQuality: 720 });
        expect(useDownloadStore.getState().settings.preferredQuality).toBe(720);
        useDownloadStore.getState().hydrateSettings(null);
        expect(useDownloadStore.getState().settings.preferredQuality).toBe(720);
        useDownloadStore.getState().hydrateSettings(
            testSettings({
                outputDir: '/z',
                maxConcurrentDownloads: 1,
                preferredQuality: null,
                uiLocale: ''
            })
        );
        expect(useDownloadStore.getState().settings.outputDir).toBe('/z');
        useDownloadStore.getState().hydrateSettings(
            testSettings({
                outputDir: '/y',
                maxConcurrentDownloads: 2,
                preferredQuality: 480,
                uiLocale: 'de'
            })
        );
        expect(useDownloadStore.getState().settings.uiLocale).toBe('de');
        useDownloadStore.getState().hydrateSettings(
            testSettings({
                outputDir: '/w',
                maxConcurrentDownloads: 1,
                preferredQuality: 1080,
                uiLocale: null as unknown as string
            })
        );
        expect(useDownloadStore.getState().settings.uiLocale).toBe('');
    });

    it('updateDownloadProgress ignores unknown id', () => {
        const len = useDownloadStore.getState().queue.length;
        useDownloadStore.getState().updateDownloadProgress('nope', { percent: 99 });
        expect(useDownloadStore.getState().queue.length).toBe(len);
    });

    it('rehydrate resets in-flight downloads to pending for auto-restart', async () => {
        localStorage.setItem(
            'kajo-download-store',
            JSON.stringify({
                state: {
                    queue: [
                        {
                            id: 'rid',
                            url: 'u',
                            formatId: 'f',
                            outputDir: '/o',
                            state: 'starting',
                            createdAt: 1
                        }
                    ],
                    settings: {
                        outputDir: '/tmp',
                        maxConcurrentDownloads: 1,
                        preferredQuality: 1080
                    }
                },
                version: 0
            })
        );
        await useDownloadStore.persist.rehydrate();
        expect(useDownloadStore.getState().queue[0]?.state).toBe('pending');
        expect(useDownloadStore.getState().queue[0]?.pauseReason).toBeUndefined();
        expect(useDownloadStore.getState().queue[0]?.progressPercent).toBeUndefined();
        expect(useDownloadStore.getState().queue[0]?.speed).toBeUndefined();
        expect(useDownloadStore.getState().queue[0]?.eta).toBeUndefined();
        expect(useDownloadStore.getState().queue[0]?.totalSize).toBeUndefined();
    });

    it('rehydrate resets downloading items to pending for auto-restart', async () => {
        localStorage.setItem(
            'kajo-download-store',
            JSON.stringify({
                state: {
                    queue: [
                        {
                            id: 'rid2',
                            url: 'u',
                            formatId: 'f',
                            outputDir: '/o',
                            state: 'downloading',
                            progressPercent: 45,
                            speed: '1 MB/s',
                            eta: '1:00',
                            totalSize: '~4.1 GB',
                            createdAt: 1
                        }
                    ],
                    settings: {
                        outputDir: '/tmp',
                        maxConcurrentDownloads: 1,
                        preferredQuality: 1080
                    }
                },
                version: 0
            })
        );
        await useDownloadStore.persist.rehydrate();
        expect(useDownloadStore.getState().queue[0]?.state).toBe('pending');
        expect(useDownloadStore.getState().queue[0]?.progressPercent).toBeUndefined();
        expect(useDownloadStore.getState().queue[0]?.speed).toBeUndefined();
        expect(useDownloadStore.getState().queue[0]?.eta).toBeUndefined();
        expect(useDownloadStore.getState().queue[0]?.totalSize).toBeUndefined();
    });

    it('rehydrate does not rewrite paused queue items', async () => {
        localStorage.setItem(
            'kajo-download-store',
            JSON.stringify({
                state: {
                    queue: [
                        {
                            id: 'rid-paused',
                            url: 'u',
                            formatId: 'f',
                            outputDir: '/o',
                            state: 'paused',
                            pauseReason: 'manual',
                            createdAt: 1
                        }
                    ],
                    settings: {
                        outputDir: '/tmp',
                        maxConcurrentDownloads: 1,
                        preferredQuality: 1080
                    }
                },
                version: 0
            })
        );
        await useDownloadStore.persist.rehydrate();
        expect(useDownloadStore.getState().queue[0]?.state).toBe('paused');
        expect(useDownloadStore.getState().queue[0]?.pauseReason).toBe('manual');
    });

    it('rehydrate resets only in-flight items in a mixed-state queue', async () => {
        localStorage.setItem(
            'kajo-download-store',
            JSON.stringify({
                state: {
                    queue: [
                        // In-flight: should be reset to pending.
                        {
                            id: 'downloading-item',
                            url: 'u',
                            formatId: 'f',
                            outputDir: '/o',
                            state: 'downloading',
                            progressPercent: 55,
                            createdAt: 1
                        },
                        // Pending: should remain pending, not touched by resumingIds logic.
                        {
                            id: 'pending-item',
                            url: 'u',
                            formatId: 'f',
                            outputDir: '/o',
                            state: 'pending',
                            createdAt: 2
                        }
                    ],
                    settings: null
                },
                version: 0
            })
        );
        await useDownloadStore.persist.rehydrate();
        const q = useDownloadStore.getState().queue;
        const inFlight = q.find((i) => i.id === 'downloading-item');
        const pending = q.find((i) => i.id === 'pending-item');
        expect(inFlight?.state).toBe('pending');
        expect(inFlight?.progressPercent).toBeUndefined();
        expect(pending?.state).toBe('pending');
    });

    it('onRehydrateStorage no-ops when persist hydration fails', async () => {
        const spy = vi.spyOn(Storage.prototype, 'getItem').mockImplementation((key) => {
            if (key === 'kajo-download-store') {
                throw new Error('storage read failed');
            }
            return null;
        });
        await expect(useDownloadStore.persist.rehydrate()).resolves.toBeUndefined();
        spy.mockRestore();
    });

    it('rehydrate prunes terminal items older than 7 days', async () => {
        const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;
        const now = Date.now();
        const old = now - SEVEN_DAYS_MS - 1000;
        localStorage.setItem(
            'kajo-download-store',
            JSON.stringify({
                state: {
                    queue: [
                        {
                            id: 'recent-complete',
                            url: 'u',
                            formatId: 'f',
                            outputDir: '/o',
                            state: 'complete',
                            createdAt: now - 1000
                        },
                        {
                            id: 'old-complete',
                            url: 'u',
                            formatId: 'f',
                            outputDir: '/o',
                            state: 'complete',
                            createdAt: old
                        },
                        {
                            id: 'old-cancelled',
                            url: 'u',
                            formatId: 'f',
                            outputDir: '/o',
                            state: 'cancelled',
                            createdAt: old
                        },
                        {
                            id: 'old-pending',
                            url: 'u',
                            formatId: 'f',
                            outputDir: '/o',
                            state: 'pending',
                            createdAt: old
                        }
                    ],
                    settings: {
                        outputDir: '/tmp',
                        maxConcurrentDownloads: 1,
                        preferredQuality: 1080
                    }
                },
                version: 0
            })
        );
        await useDownloadStore.persist.rehydrate();
        const ids = useDownloadStore.getState().queue.map((i) => i.id);
        expect(ids).toContain('recent-complete');
        expect(ids).not.toContain('old-complete');
        expect(ids).not.toContain('old-cancelled');
        // Non-terminal old items are preserved (only terminal rows are age-pruned in merge).
        expect(ids).toContain('old-pending');
    });

    it('rehydrate prunes oldest terminal items when count exceeds 500', async () => {
        const now = Date.now();
        const cutoff = now - 1000; // recent enough to pass age guard
        const queue = Array.from({ length: 510 }, (_, i) => ({
            id: `item-${i}`,
            url: 'u',
            formatId: 'f',
            outputDir: '/o',
            state: 'complete' as const,
            createdAt: cutoff + i // older items have lower createdAt
        }));
        localStorage.setItem(
            'kajo-download-store',
            JSON.stringify({
                state: {
                    queue,
                    settings: {
                        outputDir: '/tmp',
                        maxConcurrentDownloads: 1,
                        preferredQuality: 1080
                    }
                },
                version: 0
            })
        );
        await useDownloadStore.persist.rehydrate();
        const result = useDownloadStore.getState().queue;
        expect(result.length).toBe(500);
        // Newest 500 items should be kept (item-10 through item-509)
        expect(result.some((i) => i.id === 'item-509')).toBe(true);
        expect(result.some((i) => i.id === 'item-0')).toBe(false);
    });

    it('completeDownload cancelDownload removeDownload updateDownload noop for unknown id', () => {
        const prev = useDownloadStore.getState().queue;
        useDownloadStore.getState().completeDownload('missing-id', '/x');
        useDownloadStore.getState().cancelDownload('missing-id');
        useDownloadStore.getState().removeDownload('missing-id');
        useDownloadStore.getState().updateDownload('missing-id', { title: 'nope' });
        expect(useDownloadStore.getState().queue).toBe(prev);
    });

    it('updateDownload finds non-first queue item', () => {
        useDownloadStore
            .getState()
            .addDownload({ id: 'second', url: 'b', formatId: 'f', outputDir: '/o' });
        useDownloadStore
            .getState()
            .addDownload({ id: 'first', url: 'a', formatId: 'f', outputDir: '/o' });
        expect(useDownloadStore.getState().queue[1]?.id).toBe('second');
        useDownloadStore.getState().updateDownload('second', { title: 'Updated' });
        expect(useDownloadStore.getState().queue.find((q) => q.id === 'second')?.title).toBe(
            'Updated'
        );
    });

    it('prependDownloads returns [] for empty input', () => {
        expect(useDownloadStore.getState().prependDownloads([])).toEqual([]);
    });

    it('prependDownloads preserves order before existing queue', () => {
        useDownloadStore
            .getState()
            .addDownload({ id: 'old', url: 'o', formatId: 'f', outputDir: '/o' });
        const ids = useDownloadStore.getState().prependDownloads([
            { id: 'n1', url: 'a', formatId: 'f', outputDir: '/o' },
            { id: 'n2', url: 'b', formatId: 'f', outputDir: '/o' }
        ]);
        expect(ids).toEqual(['n1', 'n2']);
        expect(useDownloadStore.getState().queue.map((q) => q.id)).toEqual(['n1', 'n2', 'old']);
    });

    it('updateDownloadProgress clamps NaN percent to 0', () => {
        const id = useDownloadStore.getState().addDownload({
            id: 'nanp',
            url: 'u',
            formatId: 'f',
            outputDir: '/o'
        });
        useDownloadStore.getState().updateDownload(id, { state: 'downloading', speed: '1MiB/s' });
        useDownloadStore
            .getState()
            .updateDownloadProgress(id, { percent: Number.NaN, speed: '2MiB/s' });
        expect(useDownloadStore.getState().queue.find((q) => q.id === id)?.progressPercent).toBe(0);
        expect(useDownloadStore.getState().queue.find((q) => q.id === id)?.speed).toBe('2MiB/s');
    });

    it('updateDownloadProgress is noop when percent and speed unchanged', () => {
        const id = useDownloadStore.getState().addDownload({
            id: 'noop',
            url: 'u',
            formatId: 'f',
            outputDir: '/o'
        });
        useDownloadStore
            .getState()
            .updateDownload(id, { state: 'downloading', progressPercent: 50, speed: '1' });
        const before = useDownloadStore.getState().queue;
        useDownloadStore.getState().updateDownloadProgress(id, { percent: 50, speed: '1' });
        expect(useDownloadStore.getState().queue).toBe(before);
    });

    it('updateDownloadProgress ignores updates for complete rows', () => {
        const id = useDownloadStore.getState().addDownload({
            id: 'done',
            url: 'u',
            formatId: 'f',
            outputDir: '/o'
        });
        useDownloadStore.getState().completeDownload(id, '/f.mp4');
        useDownloadStore.getState().updateDownloadProgress(id, { percent: 10 });
        expect(useDownloadStore.getState().queue.find((q) => q.id === id)?.progressPercent).toBe(
            100
        );
    });

    it('completeDownload sets sizeEstimateFullBytes when positive', () => {
        const id = useDownloadStore.getState().addDownload({
            id: 'sz',
            url: 'u',
            formatId: 'f',
            outputDir: '/o'
        });
        useDownloadStore.getState().completeDownload(id, '/f.mp4', '1 MB', 999);
        expect(
            useDownloadStore.getState().queue.find((q) => q.id === id)?.sizeEstimateFullBytes
        ).toBe(999);
    });

    it('completeDownload normalizes valid contentSha256 and omits invalid', () => {
        const id = useDownloadStore.getState().addDownload({
            id: 'sha-case',
            url: 'u',
            formatId: 'f',
            outputDir: '/o'
        });
        const hex = `${'b'.repeat(64)}`;
        useDownloadStore
            .getState()
            .completeDownload(id, '/out.mp4', '1 MB', 100, `${hex.toUpperCase()}  `);
        expect(useDownloadStore.getState().queue.find((q) => q.id === id)?.contentSha256).toBe(hex);
        useDownloadStore.getState().completeDownload(id, '/out.mp4', '2 MB', 200, 'not-64-hex');
        expect(useDownloadStore.getState().queue.find((q) => q.id === id)?.contentSha256).toBe(hex);
    });

    it('rehydrate merge ignores legacy persisted settings', async () => {
        useDownloadStore.setState({
            settings: testSettings({ outputDir: '/from-memory' })
        });
        localStorage.setItem(
            'kajo-download-store',
            JSON.stringify({
                state: {
                    queue: [],
                    settings: { outputDir: '/from-local-storage' }
                },
                version: 1
            })
        );
        await useDownloadStore.persist.rehydrate();
        expect(useDownloadStore.getState().settings.outputDir).toBe('/from-memory');
    });

    it('rehydrate discards corrupted queue items that fail schema validation', async () => {
        localStorage.setItem(
            'kajo-download-store',
            JSON.stringify({
                state: {
                    queue: [
                        // Valid item — should be kept.
                        {
                            id: 'v1',
                            url: 'https://example.com/v',
                            formatId: 'mp4',
                            outputDir: '/tmp',
                            state: 'pending',
                            createdAt: Date.now()
                        },
                        // Missing required `state` field — should be discarded.
                        {
                            id: 'bad1',
                            url: 'https://example.com/b',
                            formatId: 'mp4',
                            outputDir: '/tmp',
                            createdAt: 1
                        },
                        // `state` has an invalid value — should be discarded.
                        {
                            id: 'bad2',
                            url: 'https://example.com/b',
                            formatId: 'mp4',
                            outputDir: '/tmp',
                            state: 'flying',
                            createdAt: 1
                        },
                        // Completely wrong shape — should be discarded.
                        { garbage: true }
                    ],
                    settings: null
                },
                version: 0
            })
        );
        await useDownloadStore.persist.rehydrate();
        const ids = useDownloadStore.getState().queue.map((q) => q.id);
        expect(ids).toContain('v1');
        expect(ids).not.toContain('bad1');
        expect(ids).not.toContain('bad2');
        expect(ids).toHaveLength(1);
    });

    it('updateDownloadProgress ignores error and cancelled rows', () => {
        const idErr = useDownloadStore.getState().addDownload({
            id: 'e1',
            url: 'u',
            formatId: 'f',
            outputDir: '/o'
        });
        useDownloadStore.getState().updateDownload(idErr, { state: 'error', progressPercent: 10 });
        useDownloadStore.getState().updateDownloadProgress(idErr, { percent: 99 });
        expect(useDownloadStore.getState().queue.find((q) => q.id === idErr)?.progressPercent).toBe(
            10
        );

        const idCan = useDownloadStore.getState().addDownload({
            id: 'c1',
            url: 'u',
            formatId: 'f',
            outputDir: '/o'
        });
        useDownloadStore
            .getState()
            .updateDownload(idCan, { state: 'cancelled', progressPercent: 5 });
        useDownloadStore.getState().updateDownloadProgress(idCan, { percent: 80 });
        expect(useDownloadStore.getState().queue.find((q) => q.id === idCan)?.progressPercent).toBe(
            5
        );
    });

    it('completeDownload ignores non-positive completedTotalSizeBytes', () => {
        const id = useDownloadStore.getState().addDownload({
            id: 'sz0',
            url: 'u',
            formatId: 'f',
            outputDir: '/o',
            sizeEstimateFullBytes: 500
        });
        useDownloadStore.getState().completeDownload(id, '/f.mp4', '1 MB', 0);
        expect(
            useDownloadStore.getState().queue.find((q) => q.id === id)?.sizeEstimateFullBytes
        ).toBe(500);
    });

    it('upgradeThumbnailsForMediaPage matches path trailing slash normalization', () => {
        useDownloadStore.getState().addDownload({
            id: 'slash',
            url: 'https://example.com/channel/abc',
            formatId: 'f',
            outputDir: '/o',
            thumbnailUrl: 'old'
        });
        useDownloadStore
            .getState()
            .upgradeThumbnailsForMediaPage('https://example.com/channel/abc/', 'new-thumb');
        expect(useDownloadStore.getState().queue[0]?.thumbnailUrl).toBe('new-thumb');
    });

    it('rehydrate merge coerces non-array persisted queue to empty array', async () => {
        localStorage.setItem(
            'kajo-download-store',
            JSON.stringify({
                state: {
                    queue: {},
                    settings: {
                        outputDir: '/tmp',
                        maxConcurrentDownloads: 1,
                        preferredQuality: 1080
                    }
                },
                version: 0
            })
        );
        await useDownloadStore.persist.rehydrate();
        expect(useDownloadStore.getState().queue).toEqual([]);
    });

    it('migrate returns empty queue when persisted state is null', async () => {
        localStorage.setItem(
            'kajo-download-store',
            JSON.stringify({
                state: null,
                version: 1
            })
        );
        await useDownloadStore.persist.rehydrate();
        expect(useDownloadStore.getState().queue).toEqual([]);
    });

    it('rehydrate merge does not apply persisted uiLocale or notification settings', async () => {
        useDownloadStore.setState({
            settings: testSettings({ outputDir: '/memory', uiLocale: 'en' })
        });
        localStorage.setItem(
            'kajo-download-store',
            JSON.stringify({
                state: {
                    queue: [],
                    settings: {
                        outputDir: '/tmp',
                        maxConcurrentDownloads: 1,
                        preferredQuality: 1080,
                        uiLocale: 'fr',
                        notificationSettings: {
                            onDownloadComplete: false,
                            onDownloadError: true,
                            batchSummary: true
                        }
                    }
                },
                version: 1
            })
        );
        await useDownloadStore.persist.rehydrate();
        const s = useDownloadStore.getState().settings;
        expect(s.uiLocale).toBe('en');
        expect(s.outputDir).toBe('/memory');
        expect(s.notificationSettings).toEqual(DEFAULT_NOTIFICATION_SETTINGS);
    });

    it('rehydrate merge uses empty uiLocale when persisted value is not a string', async () => {
        localStorage.setItem(
            'kajo-download-store',
            JSON.stringify({
                state: {
                    queue: [],
                    settings: {
                        outputDir: '/tmp',
                        maxConcurrentDownloads: 1,
                        preferredQuality: 1080,
                        uiLocale: 99
                    }
                },
                version: 0
            })
        );
        await useDownloadStore.persist.rehydrate();
        expect(useDownloadStore.getState().settings.uiLocale).toBe('');
    });

    it('rehydrate merge uses default notification settings when persisted value is null', async () => {
        localStorage.setItem(
            'kajo-download-store',
            JSON.stringify({
                state: {
                    queue: [],
                    settings: {
                        outputDir: '/tmp',
                        maxConcurrentDownloads: 1,
                        preferredQuality: 1080,
                        notificationSettings: null
                    }
                },
                version: 0
            })
        );
        await useDownloadStore.persist.rehydrate();
        expect(useDownloadStore.getState().settings.notificationSettings.onDownloadComplete).toBe(
            DEFAULT_NOTIFICATION_SETTINGS.onDownloadComplete
        );
    });

    it('rehydrate hook skips invalid queue rows but still resets valid in-flight items to pending', async () => {
        localStorage.setItem(
            'kajo-download-store',
            JSON.stringify({
                state: {
                    queue: [
                        {},
                        {
                            id: 'not-downloading',
                            url: 'u',
                            formatId: 'f',
                            outputDir: '/o',
                            state: 'pending'
                        },
                        {
                            id: 1 as unknown as string,
                            url: 'u',
                            formatId: 'f',
                            outputDir: '/o',
                            state: 'downloading'
                        },
                        {
                            id: 'good',
                            url: 'u',
                            formatId: 'f',
                            outputDir: '/o',
                            state: 'downloading',
                            createdAt: 1
                        }
                    ],
                    settings: {
                        outputDir: '/tmp',
                        maxConcurrentDownloads: 1,
                        preferredQuality: 1080
                    }
                },
                version: 0
            })
        );
        await useDownloadStore.persist.rehydrate();
        expect(useDownloadStore.getState().queue.find((q) => q.id === 'good')?.state).toBe(
            'pending'
        );
    });

    it('updateDownloadProgress updates sizeEstimateFullBytes when only totalSizeBytes changes', () => {
        const id = useDownloadStore.getState().addDownload({
            id: 'bytes-only',
            url: 'u',
            formatId: 'f',
            outputDir: '/o'
        });
        useDownloadStore.getState().updateDownload(id, {
            state: 'downloading',
            progressPercent: 40,
            sizeEstimateFullBytes: 100
        });
        useDownloadStore.getState().updateDownloadProgress(id, {
            percent: 40,
            totalSizeBytes: 900
        });
        expect(
            useDownloadStore.getState().queue.find((q) => q.id === id)?.sizeEstimateFullBytes
        ).toBe(900);
    });

    it('upgradeThumbnailsForMediaPage is a no-op when no row matches', () => {
        useDownloadStore.getState().addDownload({
            id: 'nomatch',
            url: 'https://a.com/one',
            formatId: 'f',
            outputDir: '/o',
            thumbnailUrl: 'old'
        });
        const before = useDownloadStore.getState().queue;
        useDownloadStore.getState().upgradeThumbnailsForMediaPage('https://b.com/other', 'new');
        expect(useDownloadStore.getState().queue).toBe(before);
    });

    it('upgradeThumbnailsForMediaPage treats malformed row URL as non-matching', () => {
        useDownloadStore.getState().addDownload({
            id: 'malformed',
            url: 'not-a-valid-url-at-all',
            formatId: 'f',
            outputDir: '/o',
            thumbnailUrl: 'old'
        });
        const before = useDownloadStore.getState().queue;
        useDownloadStore
            .getState()
            .upgradeThumbnailsForMediaPage('https://example.com/watch?v=1', 'new');
        expect(useDownloadStore.getState().queue).toBe(before);
    });

    it('completeDownload omits totalSize when completedTotalSize is undefined', () => {
        const id = useDownloadStore.getState().addDownload({
            id: 'no-total',
            url: 'u',
            formatId: 'f',
            outputDir: '/o',
            totalSize: 'keep-me'
        });
        useDownloadStore.getState().completeDownload(id, '/f.mp4');
        expect(useDownloadStore.getState().queue.find((q) => q.id === id)?.totalSize).toBe(
            'keep-me'
        );
    });

    it('merge (create-time hydration path) resets in-flight rows to pending for resume', () => {
        // Regression guard for the resume bug: the reset now lives in `merge`, which runs during
        // the synchronous create()-time hydration BEFORE the `useDownloadStore` export is assigned.
        // Previously this lived in `onRehydrateStorage` and called `useDownloadStore.setState(...)`,
        // which threw "Cannot read properties of undefined" at startup — so restored downloads
        // stayed `downloading`/`starting` and never resumed. `merge` must do it with no such ref.
        const merged = mergePersistedDownloadState(
            {
                queue: [
                    {
                        id: 'boot',
                        url: 'u',
                        formatId: 'f',
                        outputDir: '/o',
                        state: 'downloading',
                        progressPercent: 12,
                        speed: '1 MB/s',
                        createdAt: Date.now()
                    }
                ],
                settings: null
            },
            useDownloadStore.getState()
        );
        expect(merged.queue[0]?.state).toBe('pending');
        expect(merged.queue[0]?.progressPercent).toBeUndefined();
        expect(merged.queue[0]?.speed).toBeUndefined();
    });

    it('merge preserves paused rows and their progress across restart', () => {
        const merged = mergePersistedDownloadState(
            {
                queue: [
                    {
                        id: 'paused-row',
                        url: 'u',
                        formatId: 'f',
                        outputDir: '/o',
                        state: 'paused',
                        pauseReason: 'manual',
                        progressPercent: 42,
                        reservedOutputPath: '/o/video.mp4',
                        createdAt: Date.now()
                    }
                ],
                settings: null
            },
            useDownloadStore.getState()
        );
        expect(merged.queue[0]?.state).toBe('paused');
        expect(merged.queue[0]?.pauseReason).toBe('manual');
        expect(merged.queue[0]?.progressPercent).toBe(42);
        expect(merged.queue[0]?.reservedOutputPath).toBe('/o/video.mp4');
    });

    it('merge coerces non-array queue payloads to empty array', () => {
        const merged = mergePersistedDownloadState(
            { queue: {} as unknown as never },
            useDownloadStore.getState()
        );
        expect(merged.queue).toEqual([]);
    });
});
