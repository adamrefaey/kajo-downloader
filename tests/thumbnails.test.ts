import { Buffer } from 'node:buffer';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type {
    FetchMetadataOptions,
    MetadataArgsBuilder
} from '../electron/services/metadata/types';

const mkdtemp = vi.hoisted(() => vi.fn());
const readdir = vi.hoisted(() => vi.fn());
const readFile = vi.hoisted(() => vi.fn());
const rm = vi.hoisted(() => vi.fn());
const runYtDlpWithAuthCookieStrategies = vi.hoisted(() => vi.fn());

vi.mock('node:fs/promises', () => ({
    mkdtemp,
    readdir,
    readFile,
    rm: (...args: unknown[]) => rm(...args)
}));

vi.mock('../electron/services/metadata/ytdlpProcess', () => ({
    runYtDlpWithAuthCookieStrategies
}));

import {
    collectYoutubeEmbeddedThumbnailDirectUrls,
    getThumbnailUrl,
    PREVIEW_THUMB_MAX_DIM,
    pickPreviewThumbnailUrlFromEntries,
    thumbnailMimeForFileExtension,
    tryFetchThumbnailDataUrlViaYtdlpWrite,
    tryFetchYoutubeThumbnailDataUrl,
    youtubeMetadataWantsYtdlpThumbnail
} from '../electron/services/metadata/thumbnails';

function mockYtDlpByFirstArg(
    directExit: number,
    writeThumbExit: number
): (
    pageUrl: string,
    options: FetchMetadataOptions,
    buildArgs: MetadataArgsBuilder
) => Promise<{ exitCode: number }> {
    return async (pageUrl, options, buildArgs) => {
        const built = await buildArgs(pageUrl, options);
        if (built.args[0] === '--skip-download') {
            return { exitCode: writeThumbExit };
        }
        return { exitCode: directExit };
    };
}

describe('thumbnails', () => {
    beforeEach(() => {
        mkdtemp.mockReset();
        readdir.mockReset();
        readFile.mockReset();
        rm.mockReset();
        runYtDlpWithAuthCookieStrategies.mockReset();
        mkdtemp.mockResolvedValue('/tmp/kajo-thumb-test');
        rm.mockResolvedValue(undefined);
    });

    it('thumbnailMimeForFileExtension maps common extensions', () => {
        expect(thumbnailMimeForFileExtension('PNG')).toBe('image/png');
        expect(thumbnailMimeForFileExtension('jpg')).toBe('image/jpeg');
        expect(thumbnailMimeForFileExtension('jpeg')).toBe('image/jpeg');
        expect(thumbnailMimeForFileExtension('webp')).toBe('image/webp');
        expect(thumbnailMimeForFileExtension('unknown')).toBe('image/webp');
    });

    it('youtubeMetadataWantsYtdlpThumbnail covers restricted availability labels', () => {
        const url = 'https://i.ytimg.com/vi/x/hqdefault.jpg';
        expect(youtubeMetadataWantsYtdlpThumbnail({ availability: 'needs_auth' }, url)).toBe(true);
        expect(youtubeMetadataWantsYtdlpThumbnail({ availability: 'subscriber_only' }, url)).toBe(
            true
        );
        expect(youtubeMetadataWantsYtdlpThumbnail({ availability: 'premium_only' }, url)).toBe(
            true
        );
        expect(youtubeMetadataWantsYtdlpThumbnail({ availability: '  UNLISTED  ' }, url)).toBe(
            false
        );
    });

    it('pickPreviewThumbnailUrlFromEntries returns hqdefault when present', () => {
        const u = 'https://i.ytimg.com/vi/v/hqdefault.jpg';
        expect(
            pickPreviewThumbnailUrlFromEntries([
                { url: 'https://i.ytimg.com/vi/v/mqdefault.jpg' },
                { url: u, width: 480, height: 360 }
            ])
        ).toBe(u);
    });

    it('pickPreviewThumbnailUrlFromEntries returns mqdefault when hq is absent', () => {
        const u = 'https://i.ytimg.com/vi/v/mqdefault.webp';
        expect(
            pickPreviewThumbnailUrlFromEntries([
                { url: 'https://i.ytimg.com/vi/v/default.jpg' },
                { url: u }
            ])
        ).toBe(u);
    });

    it('pickPreviewThumbnailUrlFromEntries breaks ties under preview cap by max dimension', () => {
        const wide = 'https://cdn.example/wide';
        const tall = 'https://cdn.example/tall';
        const picked = pickPreviewThumbnailUrlFromEntries([
            { url: tall, width: 200, height: 100 },
            { url: wide, width: 250, height: 80 }
        ]);
        expect(picked).toBe(wide);
    });

    it('pickPreviewThumbnailUrlFromEntries uses area scoring when all entries exceed preview cap', () => {
        const big = 'https://cdn.example/big';
        const bigger = 'https://cdn.example/bigger';
        expect(
            pickPreviewThumbnailUrlFromEntries([
                { url: big, width: PREVIEW_THUMB_MAX_DIM + 10, height: 10 },
                { url: bigger, width: PREVIEW_THUMB_MAX_DIM + 20, height: 20 }
            ])
        ).toBe(bigger);
    });

    it('pickPreviewThumbnailUrlFromEntries prefers largest maxDim when area is zero', () => {
        const w = 'https://cdn.example/wide';
        const n = 'https://cdn.example/narrow';
        expect(
            pickPreviewThumbnailUrlFromEntries([
                { url: n, width: 0, height: 400 },
                { url: w, width: 600, height: 0 }
            ])
        ).toBe(w);
    });

    it('pickPreviewThumbnailUrlFromEntries falls back to last url when dimensions are unusable', () => {
        const first = 'https://x/1';
        const last = 'https://x/2';
        expect(
            pickPreviewThumbnailUrlFromEntries([
                { url: first, width: Number.NaN, height: Number.NaN },
                { url: last }
            ])
        ).toBe(last);
    });

    it('collectYoutubeEmbeddedThumbnailDirectUrls dedupes and orders by embed try score', () => {
        const urls = collectYoutubeEmbeddedThumbnailDirectUrls(
            {
                thumbnail: 'https://i.ytimg.com/vi/abc123/maxresdefault.jpg',
                thumbnails: [
                    { url: 'https://i.ytimg.com/vi/abc123/default.jpg' },
                    { url: 'https://i.ytimg.com/vi/abc123/sddefault.jpg', width: 640, height: 480 },
                    { url: 'https://i.ytimg.com/vi/abc123/hqdefault.jpg' }
                ]
            },
            'abc123'
        );
        expect(urls[0]).toContain('hqdefault');
        expect(urls[1]).toContain('mqdefault');
        expect(new Set(urls).size).toBe(urls.length);
    });

    it('collectYoutubeEmbeddedThumbnailDirectUrls breaks sort ties by url length', () => {
        const urls = collectYoutubeEmbeddedThumbnailDirectUrls(
            {
                thumbnails: [
                    { url: 'https://i.ytimg.com/vi/x/hqdefault.jpg', width: 1, height: 1 },
                    { url: 'https://i.ytimg.com/vi/x/hqdefault.jpg?extra=1', width: 1, height: 1 }
                ]
            },
            'x'
        );
        expect(urls.some((u) => u.includes('hqdefault'))).toBe(true);
    });

    it('collectYoutubeEmbeddedThumbnailDirectUrls covers maxres and mqdefault ordering', () => {
        const urls = collectYoutubeEmbeddedThumbnailDirectUrls(
            {
                thumbnails: [
                    { url: 'https://i.ytimg.com/vi/q/maxresdefault.webp' },
                    { url: 'https://i.ytimg.com/vi/q/mqdefault.jpg' },
                    { url: 'https://i.ytimg.com/vi/q/sddefault.jpg' }
                ]
            },
            'q'
        );
        expect(urls.join('\n')).toContain('maxres');
        expect(urls.join('\n')).toContain('mqdefault');
    });

    it('collectYoutubeEmbeddedThumbnailDirectUrls treats missing thumbnails as empty list', () => {
        const raw = { thumbnail: 'https://example.com/t.jpg' } as Parameters<
            typeof collectYoutubeEmbeddedThumbnailDirectUrls
        >[0];
        const urls = collectYoutubeEmbeddedThumbnailDirectUrls(raw, 'z');
        expect(urls.length).toBeGreaterThan(2);
    });

    it('collectYoutubeEmbeddedThumbnailDirectUrls sorts generic CDN thumbs by area then url length', () => {
        const short = 'https://cdn.other/a.jpg';
        const long = 'https://cdn.other/aa.jpg';
        const urls = collectYoutubeEmbeddedThumbnailDirectUrls(
            {
                thumbnails: [
                    { url: long, width: 10, height: 10 },
                    { url: short, width: 10, height: 10 }
                ]
            },
            'xyz'
        );
        const idxShort = urls.indexOf(short);
        const idxLong = urls.indexOf(long);
        expect(idxShort).toBeGreaterThan(-1);
        expect(idxLong).toBeGreaterThan(-1);
        expect(idxShort).toBeLessThan(idxLong);
    });

    it('collectYoutubeEmbeddedThumbnailDirectUrls sorts same-order entries by area before url length', () => {
        const smallArea = 'https://cdn.other/small.jpg';
        const bigArea = 'https://cdn.other/big.jpg';
        const urls = collectYoutubeEmbeddedThumbnailDirectUrls(
            {
                thumbnails: [
                    { url: bigArea, width: 20, height: 20 },
                    { url: smallArea, width: 10, height: 10 }
                ]
            },
            'tie2'
        );
        expect(urls.indexOf(smallArea)).toBeLessThan(urls.indexOf(bigArea));
    });

    it('pickPreviewThumbnailUrlFromEntries breaks area ties under cap using max dimension', () => {
        const largerMax = 'https://cdn.example/larger-max';
        const smallerMax = 'https://cdn.example/smaller-max';
        expect(
            pickPreviewThumbnailUrlFromEntries([
                { url: largerMax, width: 100, height: 400 },
                { url: smallerMax, width: 200, height: 200 }
            ])
        ).toBe(largerMax);
    });

    it('pickPreviewThumbnailUrlFromEntries uses byMaxDim when area is zero and dimensions exceed cap', () => {
        const tall = 'https://cdn.example/tall';
        const short = 'https://cdn.example/short';
        expect(
            pickPreviewThumbnailUrlFromEntries([
                { url: short, width: 0, height: 800 },
                { url: tall, width: 0, height: 900 }
            ])
        ).toBe(tall);
    });

    it('pickPreviewThumbnailUrlFromEntries withArea tie prefers larger max dimension over cap', () => {
        const a = 'https://cdn.example/a';
        const b = 'https://cdn.example/b';
        expect(
            pickPreviewThumbnailUrlFromEntries([
                { url: a, width: 1000, height: 1000 },
                { url: b, width: 500, height: 2000 }
            ])
        ).toBe(b);
    });

    it('tryFetchThumbnailDataUrlViaYtdlpWrite returns data url on success', async () => {
        runYtDlpWithAuthCookieStrategies.mockImplementation(mockYtDlpByFirstArg(1, 0));
        readdir.mockResolvedValue(['vid123.webp']);
        readFile.mockResolvedValue(Buffer.from([1, 2, 3]));

        const dataUrl = await tryFetchThumbnailDataUrlViaYtdlpWrite(
            'https://www.youtube.com/watch?v=vid123',
            {},
            'vid123'
        );
        expect(dataUrl).toMatch(/^data:image\/webp;base64,/);
        expect(runYtDlpWithAuthCookieStrategies).toHaveBeenCalled();
    });

    it('tryFetchThumbnailDataUrlViaYtdlpWrite returns null when yt-dlp fails', async () => {
        runYtDlpWithAuthCookieStrategies.mockImplementation(mockYtDlpByFirstArg(1, 1));
        expect(
            await tryFetchThumbnailDataUrlViaYtdlpWrite(
                'https://www.youtube.com/watch?v=x',
                {},
                'x'
            )
        ).toBeNull();
    });

    it('tryFetchThumbnailDataUrlViaYtdlpWrite returns null when readFile throws', async () => {
        runYtDlpWithAuthCookieStrategies.mockImplementation(mockYtDlpByFirstArg(1, 0));
        readdir.mockResolvedValue(['z9.webp']);
        readFile.mockRejectedValueOnce(new Error('eacces'));
        await expect(
            tryFetchThumbnailDataUrlViaYtdlpWrite('https://www.youtube.com/watch?v=z9', {}, 'z9')
        ).resolves.toBeNull();
    });

    it('tryFetchThumbnailDataUrlViaYtdlpWrite returns null when no output file appears', async () => {
        runYtDlpWithAuthCookieStrategies.mockImplementation(mockYtDlpByFirstArg(1, 0));
        readdir.mockResolvedValue([]);
        expect(
            await tryFetchThumbnailDataUrlViaYtdlpWrite(
                'https://www.youtube.com/watch?v=x',
                {},
                'x'
            )
        ).toBeNull();
    });

    it('tryFetchYoutubeThumbnailDataUrl returns on first successful direct image fetch', async () => {
        runYtDlpWithAuthCookieStrategies.mockImplementation(mockYtDlpByFirstArg(0, 1));
        readdir.mockResolvedValueOnce(['thumb0.']);
        readFile.mockResolvedValueOnce(Buffer.from('ok'));

        const out = await tryFetchYoutubeThumbnailDataUrl(
            'https://www.youtube.com/watch?v=abc',
            {},
            'abc',
            { thumbnails: [] }
        );
        expect(out).toMatch(/^data:image\/jpeg;base64,/);
    });

    it('tryFetchYoutubeThumbnailDataUrl falls back to write-thumbnail when direct fetches fail', async () => {
        runYtDlpWithAuthCookieStrategies.mockImplementation(mockYtDlpByFirstArg(1, 0));
        readdir.mockImplementation(async () => ['abc.jpg']);
        readFile.mockResolvedValue(Buffer.from('x'));

        const out = await tryFetchYoutubeThumbnailDataUrl(
            'https://www.youtube.com/watch?v=abc',
            {},
            'abc',
            { thumbnails: [{ url: 'https://i.ytimg.com/vi/abc/hqdefault.jpg' }] }
        );
        expect(typeof out).toBe('string');
        expect(out).toMatch(/^data:image\/jpeg;base64,/);
    });

    it('tryFetchYoutubeThumbnailDataUrl write-thumbnail picks preferred webp filename', async () => {
        runYtDlpWithAuthCookieStrategies.mockImplementation(mockYtDlpByFirstArg(1, 0));
        readdir.mockImplementation(async () => ['vid.webp']);
        readFile.mockResolvedValue(Buffer.from([0x89, 0x50, 0x4e, 0x47]));

        const out = await tryFetchYoutubeThumbnailDataUrl(
            'https://www.youtube.com/watch?v=vid',
            {},
            'vid',
            { thumbnails: [{ url: 'https://i.ytimg.com/vi/vid/hqdefault.jpg' }] }
        );
        expect(typeof out).toBe('string');
        expect(out).toMatch(/^data:image\/webp;base64,/);
    });

    it('tryFetchYoutubeThumbnailDataUrl returns null on empty read buffer', async () => {
        runYtDlpWithAuthCookieStrategies.mockImplementation(mockYtDlpByFirstArg(0, 1));
        readdir.mockResolvedValue(['thumb0.webp']);
        readFile.mockResolvedValue(Buffer.alloc(0));

        await expect(
            tryFetchYoutubeThumbnailDataUrl('https://www.youtube.com/watch?v=a', {}, 'a', {
                thumbnails: []
            })
        ).resolves.toBeNull();
    });

    it('tryFetchYoutubeThumbnailDataUrl returns null when write-thumbnail read throws', async () => {
        runYtDlpWithAuthCookieStrategies.mockImplementation(mockYtDlpByFirstArg(1, 0));
        readdir.mockResolvedValue(['w9.webp']);
        readFile.mockRejectedValueOnce(new Error('io'));
        await expect(
            tryFetchYoutubeThumbnailDataUrl('https://www.youtube.com/watch?v=w9', {}, 'w9', {
                thumbnails: []
            })
        ).resolves.toBeNull();
    });

    it('tryYtdlpWriteThumbnailToDataUrl picks prefix match when standard names are absent', async () => {
        runYtDlpWithAuthCookieStrategies.mockImplementation(mockYtDlpByFirstArg(1, 0));
        readdir.mockResolvedValue(['vid.extra.png']);
        readFile.mockResolvedValue(Buffer.from('x'));

        const out = await tryFetchYoutubeThumbnailDataUrl(
            'https://www.youtube.com/watch?v=vid',
            {},
            'vid',
            { thumbnails: [] }
        );
        expect(typeof out).toBe('string');
        expect(out).toMatch(/^data:image\/png;base64,/);
    });

    it('getThumbnailUrl still normalizes protocol-relative picks', () => {
        expect(getThumbnailUrl({ thumbnails: [{ url: '//i.ytimg.com/vi/x/hqdefault.jpg' }] })).toBe(
            'https://i.ytimg.com/vi/x/hqdefault.jpg'
        );
    });
});
