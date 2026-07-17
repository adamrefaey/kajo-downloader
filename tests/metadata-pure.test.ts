import { describe, expect, it, vi } from 'vitest';

vi.mock('electron', () => ({
    app: {
        getPath: () => '/tmp',
        isPackaged: false,
        getAppPath: () => '/app',
        isReady: () => true
    }
}));

vi.mock('../electron/services/binaries', () => ({
    buildYtDlpInvocation: vi.fn(async (args: string[]) => ({ command: 'yt-dlp', args }))
}));

import {
    getErrorMessage,
    shouldRetryWithCookies,
    shouldRetryWithoutCookies
} from '../electron/services/metadata/errorClassification';
import { normalizeFormats } from '../electron/services/metadata/formatNormalization';
import {
    coercePositiveByteCount,
    parseMetadataJson,
    parsePlaylistMetadataJson
} from '../electron/services/metadata/jsonParsing';
import {
    getPlaylistEntryUrl,
    isInaccessiblePlaylistEntry,
    normalizeOnePlaylistEntry,
    normalizePlaylistEntries,
    tryFacebookFlatEntryUrlFromContext,
    tryInstagramFlatEntryUrlFromContext,
    tryTiktokFlatEntryUrlFromProfileContext,
    youtubeVideoThumbnailFallback
} from '../electron/services/metadata/playlistEntries';
import {
    getThumbnailUrl,
    normalizeThumbnailDisplayUrl,
    pickPreviewThumbnailUrlFromEntries,
    youtubeMetadataWantsYtdlpThumbnail
} from '../electron/services/metadata/thumbnails';
import type { YtDlpFormat } from '../electron/services/metadata/types';

describe('metadata pure helpers', () => {
    it('parseMetadataJson scans lines', () => {
        const json = JSON.stringify({ id: '1', title: 'Hi', formats: [] });
        expect(parseMetadataJson(`noise\n${json}`)).toMatchObject({ id: '1', title: 'Hi' });
        expect(() => parseMetadataJson('not json')).toThrow();
    });

    it('parseMetadataJson skips invalid JSON lines and rows without id/title', () => {
        const good = JSON.stringify({ id: 'x', title: 'T' });
        expect(parseMetadataJson(`{}\n${good}`)).toMatchObject({ id: 'x', title: 'T' });
        expect(() => parseMetadataJson(`{}\n{"formats":[]}`)).toThrow();
        const goodFirst = JSON.stringify({ id: 'scan', title: 'back' });
        expect(parseMetadataJson(`${goodFirst}\nnot json`)).toMatchObject({
            id: 'scan',
            title: 'back'
        });
        const goodLast = JSON.stringify({ id: 'z', title: 'Last' });
        expect(parseMetadataJson(`not json\n{}\n${goodLast}`)).toMatchObject({
            id: 'z',
            title: 'Last'
        });
    });

    it('parsePlaylistMetadataJson', () => {
        const json = JSON.stringify({ entries: [], title: 'P' });
        expect(parsePlaylistMetadataJson(json)).toMatchObject({ title: 'P' });
        expect(() => parsePlaylistMetadataJson('x')).toThrow();
        const soloVideo = JSON.stringify({
            id: 'abc',
            title: 'Solo',
            webpage_url: 'https://example.com/v/abc'
        });
        expect(parsePlaylistMetadataJson(soloVideo)).toMatchObject({
            id: 'abc',
            title: 'Solo',
            entries: []
        });
    });

    it('parsePlaylistMetadataJson scans backward over junk and rejects non-array entries', () => {
        const good = JSON.stringify({ entries: [{ id: '1' }], title: 'ok' });
        expect(parsePlaylistMetadataJson(`{}\n${good}`)).toMatchObject({ title: 'ok' });
        expect(() => parsePlaylistMetadataJson(`{"entries":{}}\n{}`)).toThrow();
        const pl = JSON.stringify({ entries: [], title: 'scan' });
        expect(parsePlaylistMetadataJson(`${pl}\ntrailing junk`)).toMatchObject({ title: 'scan' });
        const plOk = JSON.stringify({ entries: [], title: 'deep' });
        expect(
            parsePlaylistMetadataJson(`not json\n${JSON.stringify({ entries: {} })}\n${plOk}`)
        ).toMatchObject({ title: 'deep' });
    });

    it('coercePositiveByteCount', () => {
        expect(coercePositiveByteCount(undefined)).toBeUndefined();
        expect(coercePositiveByteCount(Number.NaN)).toBeUndefined();
        expect(coercePositiveByteCount(-1)).toBeUndefined();
        expect(coercePositiveByteCount(0)).toBeUndefined();
        expect(coercePositiveByteCount(1.9)).toBe(1);
        expect(coercePositiveByteCount(42)).toBe(42);
    });

    it('shouldRetryWithCookies and shouldRetryWithoutCookies', () => {
        expect(shouldRetryWithCookies('Sign in to confirm your age')).toBe(true);
        expect(shouldRetryWithCookies('random')).toBe(false);
        expect(shouldRetryWithoutCookies('failed to decrypt cookie')).toBe(true);
        expect(shouldRetryWithoutCookies('sign in to confirm your age')).toBe(false);
    });

    it('getErrorMessage', () => {
        expect(getErrorMessage('noise\nVideo unavailable', 1)).toBe('Video unavailable');
        expect(getErrorMessage('', null)).toBe('Could not load details for this link.');
        expect(getErrorMessage('ERROR: yt-dlp broke', 1)).not.toMatch(/yt-dlp/i);
        expect(getErrorMessage('\n  \n', null)).toBe('Could not load details for this link.');
    });

    it('normalizeThumbnailDisplayUrl', () => {
        expect(normalizeThumbnailDisplayUrl('')).toBe('');
        expect(normalizeThumbnailDisplayUrl('  //dmcdn.net/x.jpg  ')).toBe(
            'https://dmcdn.net/x.jpg'
        );
        expect(normalizeThumbnailDisplayUrl('data:image/png;base64,QQ==')).toBe(
            'data:image/png;base64,QQ=='
        );
    });

    it('pickPreviewThumbnailUrlFromEntries prefers largest under cap when only height is set (e.g. Dailymotion)', () => {
        const url = pickPreviewThumbnailUrlFromEntries([
            { url: 'https://cdn.example/x60', height: 60 },
            { url: 'https://cdn.example/x720', height: 720 },
            { url: 'https://cdn.example/x1080', height: 1080 }
        ]);
        expect(url).toBe('https://cdn.example/x720');
    });

    it('getThumbnailUrl', () => {
        expect(getThumbnailUrl({ thumbnail: 't' })).toBe('t');
        expect(getThumbnailUrl({ thumbnails: [{ url: 'u' }] })).toBe('u');
        expect(getThumbnailUrl({ thumbnails: [{ url: '//s1.dmcdn.net/preview.jpg' }] })).toBe(
            'https://s1.dmcdn.net/preview.jpg'
        );
        expect(getThumbnailUrl({})).toBe('');
        expect(
            getThumbnailUrl({
                thumbnail: 'https://i.ytimg.com/vi/vid/maxresdefault.jpg',
                thumbnails: [
                    {
                        url: 'https://i.ytimg.com/vi/vid/maxresdefault.jpg',
                        width: 1920,
                        height: 1080
                    },
                    { url: 'https://i.ytimg.com/vi/vid/mqdefault.jpg', width: 320, height: 180 }
                ]
            })
        ).toBe('https://i.ytimg.com/vi/vid/mqdefault.jpg');
        expect(
            getThumbnailUrl({
                thumbnails: [
                    { url: 'https://i.ytimg.com/vi/vid/mqdefault.jpg', width: 320, height: 180 },
                    { url: 'https://i.ytimg.com/vi/vid/hqdefault.jpg', width: 480, height: 360 }
                ]
            })
        ).toBe('https://i.ytimg.com/vi/vid/hqdefault.jpg');
        expect(
            getThumbnailUrl({
                thumbnails: [
                    { url: 'https://i.ytimg.com/vi/vid/mqdefault.jpg', width: 320, height: 180 },
                    { url: 'https://i.ytimg.com/vi/vid/default.jpg', width: 120, height: 90 }
                ]
            })
        ).toBe('https://i.ytimg.com/vi/vid/mqdefault.jpg');
        expect(
            getThumbnailUrl({
                thumbnails: [
                    { url: 'https://x/large.jpg', width: 640, height: 480 },
                    { url: 'https://x/small.jpg', width: 120, height: 90 }
                ]
            })
        ).toBe('https://x/large.jpg');
    });

    it('youtubeMetadataWantsYtdlpThumbnail', () => {
        expect(youtubeMetadataWantsYtdlpThumbnail({}, '')).toBe(true);
        expect(
            youtubeMetadataWantsYtdlpThumbnail(
                { availability: 'public', thumbnail: 'https://x/y.jpg' },
                'https://x/y.jpg'
            )
        ).toBe(false);
        expect(
            youtubeMetadataWantsYtdlpThumbnail(
                { availability: 'private', thumbnail: 'https://x/y.jpg' },
                'https://x/y.jpg'
            )
        ).toBe(true);
        expect(
            youtubeMetadataWantsYtdlpThumbnail({ thumbnail: 'https://x/y.jpg' }, 'https://x/y.jpg')
        ).toBe(true);
    });

    it('normalizeFormats picks muxed/video/audio', () => {
        const muxed: YtDlpFormat = {
            format_id: 'm',
            ext: 'mp4',
            vcodec: 'avc1',
            acodec: 'mp4a',
            height: 720,
            width: 1280,
            resolution: '720p'
        };
        const out = normalizeFormats([muxed], 120);
        expect(out.length).toBeGreaterThan(0);
        expect(out[0]?.id).toBe('m');
    });

    it('normalizeFormats estimates size from vbr when abr is present for muxed format (YouTube muxed)', () => {
        const muxed: YtDlpFormat = {
            format_id: 'mux',
            ext: 'mp4',
            vcodec: 'avc1',
            acodec: 'mp4a',
            height: 720,
            width: 1280,
            resolution: '720p',
            vbr: 2000,
            abr: 128
        };
        const out = normalizeFormats([muxed], 60);
        // Only use vbr (video bitrate) for muxed formats to avoid overestimating combined file size
        expect(out[0]?.filesize).toBe(Math.floor((2000 * 1000 * 60) / 8));
    });

    it('normalizeFormats coerces string tbr for size estimate', () => {
        const muxed = {
            format_id: 'm',
            ext: 'mp4',
            vcodec: 'avc1',
            acodec: 'mp4a',
            height: 720,
            resolution: '720p',
            tbr: '500.25'
        } as unknown as YtDlpFormat;
        const out = normalizeFormats([muxed], 120);
        expect(out[0]?.filesize).toBe(Math.floor((500.25 * 1000 * 120) / 8));
    });

    it('normalizeFormats pairs video-only with bitrate-capped audio (not largest manifest audio)', () => {
        const video720: YtDlpFormat = {
            format_id: 'v137',
            ext: 'mp4',
            vcodec: 'avc1',
            acodec: 'none',
            height: 720,
            resolution: '720p',
            filesize: 10_000_000
        };
        const audioHigh: YtDlpFormat = {
            format_id: 'a320',
            ext: 'm4a',
            vcodec: 'none',
            acodec: 'mp4a',
            resolution: 'audio only',
            abr: 320,
            filesize: 5_000_000
        };
        const audio160: YtDlpFormat = {
            format_id: 'a160',
            ext: 'm4a',
            vcodec: 'none',
            acodec: 'mp4a',
            resolution: 'audio only',
            abr: 160,
            filesize: 2_000_000
        };
        const out = normalizeFormats([video720, audioHigh, audio160], 100);
        const v = out.find((f) => f.id === 'v137');
        expect(v?.filesize).toBe(10_000_000 + 2_000_000);
        expect(v?.filesizeVideoOnly).toBe(10_000_000);
    });

    it('normalizeFormats omits video above 8K height', () => {
        const eightK: YtDlpFormat = {
            format_id: '8k',
            ext: 'mp4',
            vcodec: 'avc1',
            acodec: 'mp4a',
            height: 4320,
            width: 7680,
            resolution: '4320p'
        };
        const beyond: YtDlpFormat = {
            format_id: 'big',
            ext: 'mp4',
            vcodec: 'avc1',
            acodec: 'mp4a',
            height: 8000,
            width: 12000,
            resolution: '8000p'
        };
        const out = normalizeFormats([beyond, eightK], 120);
        expect(out.map((f) => f.id)).toContain('8k');
        expect(out.map((f) => f.id)).not.toContain('big');
    });

    it('normalizeOnePlaylistEntry ignores inflated filesize_approx for was_live entries', () => {
        // For past live streams, yt-dlp filesize_approx is based on HLS peak BANDWIDTH, not
        // average encoded bitrate — resulting in ~10x overestimation. It should be discarded.
        const liveEntry = normalizeOnePlaylistEntry(
            {
                id: 'mvxQGGbZuso',
                title: 'Live stream',
                url: 'https://www.youtube.com/watch?v=mvxQGGbZuso',
                duration: 7200,
                filesize_approx: 4_000_000_000, // inflated HLS peak bandwidth × duration
                live_status: 'was_live'
            },
            'https://www.youtube.com/channel/UCvQECJukTDE2i6aCoMnS-Vg',
            0
        );
        expect(liveEntry).not.toBeNull();
        // filesize_approx is excluded; no exact filesize → playlistEntryFilesizeBytes is undefined
        expect(liveEntry?.playlistEntryFilesizeBytes).toBeUndefined();
        // liveStatus is preserved so batchEntryDownloadFields can suppress the fallback estimate
        expect(liveEntry?.liveStatus).toBe('was_live');
    });

    it('normalizeOnePlaylistEntry keeps filesize_approx for regular (non-live) entries', () => {
        const regularEntry = normalizeOnePlaylistEntry(
            {
                id: 'regularvidid',
                title: 'Regular video',
                url: 'https://www.youtube.com/watch?v=regularvidid',
                duration: 300,
                filesize_approx: 40_000_000
            },
            'https://www.youtube.com/playlist?list=PL123',
            0
        );
        expect(regularEntry).not.toBeNull();
        expect(regularEntry?.playlistEntryFilesizeBytes).toBe(40_000_000);
    });

    it('normalizeOnePlaylistEntry keeps exact filesize for was_live entries', () => {
        // Exact filesize (not approx) is reliable even for live streams
        const liveWithExact = normalizeOnePlaylistEntry(
            {
                id: 'livewithrealsize',
                title: 'Archived live',
                url: 'https://www.youtube.com/watch?v=livewithrealsize',
                duration: 7200,
                filesize: 420_000_000,
                filesize_approx: 4_000_000_000,
                live_status: 'was_live'
            },
            'https://www.youtube.com/channel/UCtest',
            0
        );
        expect(liveWithExact?.playlistEntryFilesizeBytes).toBe(420_000_000);
    });

    it('youtubeVideoThumbnailFallback accepts only 11-char video ids', () => {
        expect(youtubeVideoThumbnailFallback('short')).toBe('');
        expect(youtubeVideoThumbnailFallback('dQw4w9WgXcQ')).toBe(
            'https://i.ytimg.com/vi/dQw4w9WgXcQ/hqdefault.jpg'
        );
    });

    it('normalizePlaylistEntries skips empty slots', () => {
        const sparse: Parameters<typeof normalizePlaylistEntries>[0] = [];
        sparse[1] = {
            id: 'dQw4w9WgXcQ',
            title: 'T',
            url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ'
        };
        const out = normalizePlaylistEntries(sparse, 'https://www.youtube.com/playlist?list=PL1');
        expect(out).toHaveLength(1);
        expect(out[0]?.flatIndex).toBe(1);
    });

    it('normalizePlaylistEntries drops entries that fail normalization', () => {
        const out = normalizePlaylistEntries(
            [
                { id: 'bad', title: 'private video' },
                {
                    id: 'dQw4w9WgXcQ',
                    title: 'Ok',
                    url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ'
                }
            ],
            'https://www.youtube.com/playlist?list=PL1'
        );
        expect(out).toHaveLength(1);
        expect(out[0]?.id).toBe('dQw4w9WgXcQ');
    });

    it('normalizeOnePlaylistEntry returns null for missing fields, inaccessible rows, or missing URLs', () => {
        expect(
            normalizeOnePlaylistEntry({ title: 'Only title' }, 'https://www.youtube.com/', 0)
        ).toBeNull();
        expect(
            normalizeOnePlaylistEntry({ id: 'onlyid' }, 'https://www.youtube.com/', 0)
        ).toBeNull();
        expect(
            normalizeOnePlaylistEntry(
                { id: 'pv', title: 'private video' },
                'https://www.youtube.com/',
                0
            )
        ).toBeNull();
        expect(
            normalizeOnePlaylistEntry(
                { id: 'nourl', title: 'No permalink' },
                'https://vimeo.com/123',
                0
            )
        ).toBeNull();
    });

    it('isInaccessiblePlaylistEntry detects title and availability markers', () => {
        const base = { id: '1', title: 'X' };
        expect(
            isInaccessiblePlaylistEntry({ ...base, title: '[Deleted Video]' }, '[Deleted Video]')
        ).toBe(true);
        expect(
            isInaccessiblePlaylistEntry(
                { ...base, title: 'unavailable video' },
                'unavailable video'
            )
        ).toBe(true);
        expect(
            isInaccessiblePlaylistEntry(
                { ...base, title: 'ok', availability: 'subscriber_only' },
                'ok'
            )
        ).toBe(true);
        expect(isInaccessiblePlaylistEntry({ ...base, title: 'ok' }, 'ok')).toBe(false);
    });

    it('rebuilds flat playlist permalinks for TikTok, Instagram, and Facebook', () => {
        expect(
            tryTiktokFlatEntryUrlFromProfileContext(
                '1234567890123456789',
                'https://www.tiktok.com/@creator'
            )
        ).toBe('https://www.tiktok.com/@creator/video/1234567890123456789');
        expect(
            tryTiktokFlatEntryUrlFromProfileContext('123', 'https://www.tiktok.com/@creator')
        ).toBe('');
        expect(
            tryTiktokFlatEntryUrlFromProfileContext(
                '1234567890123456789',
                'https://www.tiktok.com/@creator/videos'
            )
        ).toBe('');
        expect(
            tryTiktokFlatEntryUrlFromProfileContext(
                '1234567890123456789',
                'www.tiktok.com/@creator'
            )
        ).toBe('');

        expect(tryInstagramFlatEntryUrlFromContext('abcd', 'https://www.instagram.com/foo')).toBe(
            ''
        );
        expect(tryInstagramFlatEntryUrlFromContext('abc12DE', 'https://www.youtube.com/')).toBe('');
        expect(
            tryInstagramFlatEntryUrlFromContext('abc12DE', 'https://www.instagram.com/foo')
        ).toBe('https://www.instagram.com/p/abc12DE/');

        expect(tryFacebookFlatEntryUrlFromContext('123', 'https://www.facebook.com/watch')).toBe(
            ''
        );
        expect(
            tryFacebookFlatEntryUrlFromContext('12345678901', 'https://www.facebook.com/foo')
        ).toBe('https://www.facebook.com/watch?v=12345678901');
        expect(
            tryFacebookFlatEntryUrlFromContext('12345678901', 'https://www.instagram.com/foo')
        ).toBe('');
    });

    it('getPlaylistEntryUrl prefers explicit http(s) links and platform rebuilds', () => {
        expect(
            getPlaylistEntryUrl(
                { webpage_url: 'https://x.example/watch?v=1', id: '1', title: 't' },
                '1',
                'https://www.youtube.com/playlist?list=PL1'
            )
        ).toBe('https://x.example/watch?v=1');
        expect(
            getPlaylistEntryUrl(
                { id: 'dQw4w9WgXcQ', title: 't' },
                'dQw4w9WgXcQ',
                'https://youtu.be/x'
            )
        ).toBe('https://www.youtube.com/watch?v=dQw4w9WgXcQ');
        expect(
            getPlaylistEntryUrl({ id: 'nope', title: 't' }, 'nope', 'https://vimeo.com/123')
        ).toBe('');
    });

    it('normalizeOnePlaylistEntry covers is_live and post_live filesize rules', () => {
        const post = normalizeOnePlaylistEntry(
            {
                id: 'postliveid01',
                title: 'Post-live',
                url: 'https://www.youtube.com/watch?v=postliveid01',
                duration: 100,
                filesize_approx: 9_000_000_000,
                live_status: 'post_live'
            },
            'https://www.youtube.com/channel/UCx',
            0
        );
        expect(post?.playlistEntryFilesizeBytes).toBeUndefined();

        const live = normalizeOnePlaylistEntry(
            {
                id: 'isliveid00001',
                title: 'Live now',
                url: 'https://www.youtube.com/watch?v=isliveid00001',
                duration: 10,
                filesize: 5_000_000,
                live_status: 'is_live'
            },
            'https://www.youtube.com/channel/UCy',
            0
        );
        expect(live?.playlistEntryFilesizeBytes).toBe(5_000_000);
        expect(live?.liveStatus).toBe('is_live');
    });
});
