import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { FlatEntry } from '../electron/services/youtubeSearch';

const searchViaYtDlp = vi.fn();

vi.mock('../electron/services/youtubeSearch', async (importOriginal) => {
    const mod = await importOriginal<typeof import('../electron/services/youtubeSearch')>();
    return {
        ...mod,
        searchViaYtDlp: (...args: Parameters<typeof mod.searchViaYtDlp>) => searchViaYtDlp(...args)
    };
});

import { searchYoutubeInApp } from '../electron/services/youtubeInAppSearch';
import { parseSearchIpcPayload } from '../src/shared/ipcPayloadSchemas';

describe('youtubeInAppSearch', () => {
    beforeEach(() => {
        searchViaYtDlp.mockReset();
    });

    describe('parseSearchIpcPayload', () => {
        it('accepts string query', () => {
            expect(parseSearchIpcPayload('hello')).toEqual({
                query: 'hello',
                platforms: ['youtube'],
                maxResults: 6
            });
        });

        it('normalizes object payload', () => {
            expect(parseSearchIpcPayload({ query: 'q', maxResults: 99 })).toEqual({
                query: 'q',
                platforms: ['youtube'],
                maxResults: 60
            });
        });

        it('treats non-string query as empty', () => {
            expect(parseSearchIpcPayload({ query: 123, maxResults: 3 })).toEqual({
                query: '',
                platforms: ['youtube'],
                maxResults: 3
            });
        });

        it('ignores non-finite maxResults', () => {
            expect(parseSearchIpcPayload({ query: 'ok', maxResults: Number.NaN })).toEqual({
                query: 'ok',
                platforms: ['youtube'],
                maxResults: 6
            });
        });

        it('returns null for non-object payloads', () => {
            expect(parseSearchIpcPayload(null)).toBeNull();
            expect(parseSearchIpcPayload(42)).toBeNull();
        });
    });

    describe('searchYoutubeInApp', () => {
        it('returns empty for short query', async () => {
            expect(await searchYoutubeInApp('x')).toEqual([]);
            expect(searchViaYtDlp).not.toHaveBeenCalled();
        });

        it('dedupes by URL and maps flat entries', async () => {
            searchViaYtDlp.mockResolvedValue([
                {
                    id: 'vid1',
                    url: 'https://www.youtube.com/watch?v=vid1',
                    title: 'A',
                    channel: 'C',
                    duration: 12.3,
                    thumbnails: [{ url: 'https://t1' }, { url: 'https://t2' }]
                },
                {
                    id: 'vid1',
                    url: 'https://www.youtube.com/watch?v=vid1',
                    title: 'Dup',
                    channel: 'C',
                    duration: 1,
                    thumbnails: []
                }
            ] satisfies FlatEntry[]);

            const rows = await searchYoutubeInApp('music', 10);
            expect(rows).toHaveLength(1);
            expect(rows[0]?.durationSeconds).toBe(12);
            expect(rows[0]?.thumbnailUrl).toBe('https://t2');
            expect(rows[0]?.platform).toBe('youtube');
        });

        it('builds watch URL from protocol-relative and webpage_url', async () => {
            searchViaYtDlp.mockResolvedValue([
                {
                    id: '',
                    url: '//www.youtube.com/watch?v=abc',
                    title: 'T',
                    uploader: 'U',
                    duration: 0
                },
                {
                    id: '',
                    url: '/relative-only',
                    webpage_url: 'https://www.youtube.com/watch?v=wp',
                    title: 'W',
                    channel: 'Ch',
                    duration: NaN
                }
            ] satisfies FlatEntry[]);

            const rows = await searchYoutubeInApp('find', 6);
            expect(rows).toHaveLength(2);
            expect(rows[0]?.url.startsWith('https:')).toBe(true);
            expect(rows[1]?.url).toContain('watch?v=wp');
        });

        it('synthesizes youtube URL from id when needed', async () => {
            searchViaYtDlp.mockResolvedValue([
                { id: 'onlyid', title: 'T', channel: 'C', duration: 0 } satisfies FlatEntry
            ]);
            const rows = await searchYoutubeInApp('qq', 6);
            expect(rows[0]?.url).toBe('https://www.youtube.com/watch?v=onlyid');
        });

        it('drops non-http, non-youtube, and search URLs', async () => {
            searchViaYtDlp.mockResolvedValue([
                { id: '', title: 'a', channel: 'c', duration: 0, url: 'ftp://bad' },
                { id: '', title: 'b', channel: 'c', duration: 0, url: 'https://example.com/v' },
                {
                    id: '',
                    title: 'c',
                    channel: 'c',
                    duration: 0,
                    url: 'https://www.youtube.com/search/results/stuff'
                }
            ] satisfies FlatEntry[]);
            expect(await searchYoutubeInApp('qq', 20)).toEqual([]);
        });

        it('drops entries when URL constructor fails', async () => {
            searchViaYtDlp.mockResolvedValue([
                {
                    id: '',
                    title: 'T',
                    channel: 'C',
                    duration: 0,
                    url: 'http://[::1:invalid/'
                } satisfies FlatEntry
            ]);
            expect(await searchYoutubeInApp('qq', 6)).toEqual([]);
        });

        it('uses Unknown title and clamps duration', async () => {
            searchViaYtDlp.mockResolvedValue([
                {
                    id: 'v',
                    url: 'https://www.youtube.com/watch?v=v',
                    duration: -5
                } satisfies FlatEntry
            ]);
            const rows = await searchYoutubeInApp('qq', 6);
            expect(rows[0]?.title).toBe('Unknown');
            expect(rows[0]?.durationSeconds).toBe(0);
        });

        it('handles non-string id and coerces odd thumbnail URLs', async () => {
            searchViaYtDlp.mockResolvedValue([
                {
                    id: 123 as unknown as string,
                    url: 'https://www.youtube.com/watch?v=fallback',
                    title: 456 as unknown as string,
                    duration: 1,
                    thumbnails: [{ url: 999 as unknown as string }]
                } as FlatEntry
            ]);
            const rows = await searchYoutubeInApp('qq', 6);
            expect(rows[0]?.id).toContain('youtube.com');
            expect(rows[0]?.thumbnailUrl).toBe('');
        });

        it('uses empty thumbnail when last thumbnail omits url', async () => {
            searchViaYtDlp.mockResolvedValue([
                {
                    id: 't1',
                    url: 'https://www.youtube.com/watch?v=t1',
                    title: 'T',
                    channel: 'C',
                    duration: 1,
                    thumbnails: [{}, { notUrl: true } as unknown as { url?: string }]
                } as FlatEntry
            ]);
            const rows = await searchYoutubeInApp('qq', 6);
            expect(rows[0]?.thumbnailUrl).toBe('');
        });

        it('treats null thumbnails like missing artwork', async () => {
            searchViaYtDlp.mockResolvedValue([
                {
                    id: 't2',
                    url: 'https://www.youtube.com/watch?v=t2',
                    title: 'T',
                    channel: 'C',
                    duration: 1,
                    thumbnails: null as unknown as FlatEntry['thumbnails']
                } as FlatEntry
            ]);
            const rows = await searchYoutubeInApp('qq', 6);
            expect(rows[0]?.thumbnailUrl).toBe('');
        });
    });
});
