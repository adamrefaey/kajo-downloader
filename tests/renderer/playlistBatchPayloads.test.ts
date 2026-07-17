/** @vitest-environment jsdom */

import { describe, expect, it } from 'vitest';
import {
    batchEntryDownloadFields,
    batchSectionTrimFromPreview,
    batchSiteLabelFromUrl,
    buildPlaylistBatchPayloads,
    DEFAULT_PLAYLIST_FORMAT_ID,
    formatIdForYoutubeQualityCaps
} from '../../src/renderer/src/utils/playlistBatchPayloads';
import type { AddDownloadPayload } from '../../src/store/downloadStore';
import type { MediaCandidate, PlaylistInfo } from '../../src/types';

type BuildPlaylistBatchPayloadsParamsSiteFields = (
    url: string,
    options?: { extractorKey?: string | undefined } | undefined
) => Partial<Pick<AddDownloadPayload, 'siteId' | 'siteDomain' | 'extractorKey' | 'authRequired'>>;

const noopSiteFields: BuildPlaylistBatchPayloadsParamsSiteFields = () => ({});

describe('playlistBatchPayloads', () => {
    it('buildPlaylistBatchPayloads preserves batch metadata and order', () => {
        const entries: MediaCandidate[] = [
            {
                id: 'a',
                url: 'https://example.com/a',
                title: 'A',
                author: 'Auth',
                durationSeconds: 1,
                thumbnailUrl: '',
                flatIndex: 0
            },
            {
                id: 'b',
                url: 'https://example.com/b',
                title: 'B',
                author: 'Auth',
                durationSeconds: 2,
                thumbnailUrl: '',
                flatIndex: 1
            }
        ];
        const playlistInfo: PlaylistInfo = {
            title: 'List',
            entries,
            sourceUrl: 'https://example.com/pl'
        };
        const payloads = buildPlaylistBatchPayloads({
            playlistInfo,
            entries,
            playlistInputUrl: 'https://example.com/pl',
            playlistOutputDir: '/out',
            numberPlaylistItems: false,
            batchGroupId: 'g1',
            batchSourceUrl: 'https://example.com/pl',
            batchSiteLabel: 'Example',
            batchExtractedAt: 1_700_000_000_000,
            siteFieldsForUrl: noopSiteFields
        });

        expect(payloads).toHaveLength(2);
        expect(payloads[0]?.url).toBe('https://example.com/a');
        expect(payloads[0]?.batchGroupId).toBe('g1');
        expect(payloads[0]?.batchSourceUrl).toBe('https://example.com/pl');
        expect(payloads[0]?.batchSiteLabel).toBe('Example');
        expect(payloads[0]?.batchExtractedAt).toBe(1_700_000_000_000);
        expect(payloads[0]?.formatId).toBe(DEFAULT_PLAYLIST_FORMAT_ID);
        expect(payloads[1]?.title).toBe('B');
        expect(payloads[0]?.mediaDurationSeconds).toBe(1);
        expect(payloads[0]?.sizeEstimateFullBytes).toBe(1_200_000);
        expect(payloads[0]?.totalSize).toBeTruthy();
        expect(payloads[0]?.sectionTrim).toBeUndefined();
    });

    it('getSectionTrimForEntry overrides batchSectionTrim per row', () => {
        const entries: MediaCandidate[] = [
            {
                id: 'a',
                url: 'https://example.com/a',
                title: 'A',
                author: 'Auth',
                durationSeconds: 100,
                thumbnailUrl: '',
                flatIndex: 0
            },
            {
                id: 'b',
                url: 'https://example.com/b',
                title: 'B',
                author: 'Auth',
                durationSeconds: 100,
                thumbnailUrl: '',
                flatIndex: 1
            }
        ];
        const playlistInfo: PlaylistInfo = { title: 'List', entries };
        const payloads = buildPlaylistBatchPayloads({
            playlistInfo,
            entries,
            playlistInputUrl: 'https://example.com/pl',
            playlistOutputDir: '/out',
            numberPlaylistItems: false,
            batchGroupId: 'g1',
            batchSourceUrl: 'https://example.com/pl',
            batchSiteLabel: 'Example',
            batchExtractedAt: 1,
            siteFieldsForUrl: noopSiteFields,
            batchSectionTrim: { start: '0:00:00', end: '0:01:00' },
            getSectionTrimForEntry: (entry) =>
                entry.id === 'a' ? { start: '0:00:10', end: '0:00:20' } : undefined
        });
        expect(payloads[0]?.sectionTrim).toEqual({ start: '0:00:10', end: '0:00:20' });
        expect(payloads[1]?.sectionTrim).toEqual({ start: '0:00:00', end: '0:01:00' });
    });

    it('buildPlaylistBatchPayloads falls back to playlistInfo.id when no sourcePlaylistId', () => {
        const entries: MediaCandidate[] = [
            {
                id: 'a',
                url: 'https://example.com/a',
                title: 'A',
                author: 'Auth',
                durationSeconds: 5,
                thumbnailUrl: '',
                flatIndex: 0
            }
        ];
        const playlistInfo: PlaylistInfo = { title: 'Shell', id: 'PL_SHELL', entries };
        const payloads = buildPlaylistBatchPayloads({
            playlistInfo,
            entries,
            playlistInputUrl: 'https://example.com/playlist?list=PL_FROM_URL',
            playlistOutputDir: '/out',
            numberPlaylistItems: false,
            batchGroupId: 'g1',
            batchSourceUrl: 'https://example.com/pl',
            batchSiteLabel: 'Example',
            batchExtractedAt: 1,
            siteFieldsForUrl: noopSiteFields
        });
        expect(payloads[0]?.playlistId).toBe('PL_SHELL');
    });

    it('buildPlaylistBatchPayloads uses entry.sourcePlaylistId when set', () => {
        const entries: MediaCandidate[] = [
            {
                id: 'a',
                url: 'https://example.com/a',
                title: 'A',
                author: 'Auth',
                durationSeconds: 10,
                thumbnailUrl: '',
                flatIndex: 0,
                sourcePlaylistId: 'PL_CUSTOM'
            }
        ];
        const playlistInfo: PlaylistInfo = { title: 'Shell', id: 'PL_SHELL', entries };
        const payloads = buildPlaylistBatchPayloads({
            playlistInfo,
            entries,
            playlistInputUrl: 'https://example.com/playlist?list=PL_FROM_URL',
            playlistOutputDir: '/out',
            numberPlaylistItems: false,
            batchGroupId: 'g1',
            batchSourceUrl: 'https://example.com/pl',
            batchSiteLabel: 'Example',
            batchExtractedAt: 1,
            siteFieldsForUrl: noopSiteFields
        });
        expect(payloads[0]?.playlistId).toBe('PL_CUSTOM');
    });

    it('buildPlaylistBatchPayloads applies batchSectionTrim and scales size', () => {
        const entries: MediaCandidate[] = [
            {
                id: 'a',
                url: 'https://example.com/a',
                title: 'A',
                author: 'Auth',
                durationSeconds: 100,
                thumbnailUrl: '',
                flatIndex: 0
            }
        ];
        const playlistInfo: PlaylistInfo = { title: 'List', entries };
        const payloads = buildPlaylistBatchPayloads({
            playlistInfo,
            entries,
            playlistInputUrl: 'https://example.com/pl',
            playlistOutputDir: '/out',
            numberPlaylistItems: false,
            batchGroupId: 'g1',
            batchSourceUrl: 'https://example.com/pl',
            batchSiteLabel: 'Example',
            batchExtractedAt: 1,
            siteFieldsForUrl: noopSiteFields,
            batchSectionTrim: { start: '0:00:00', end: '0:00:50' }
        });
        expect(payloads[0]?.sectionTrim).toEqual({ start: '0:00:00', end: '0:00:50' });
        expect(payloads[0]?.mediaDurationSeconds).toBe(100);
        expect(payloads[0]?.sizeEstimateFullBytes).toBe(120_000_000);
        expect(payloads[0]?.totalSize).toBeTruthy();
    });

    it('batchSectionTrimFromPreview is undefined for empty fields, set otherwise', () => {
        expect(batchSectionTrimFromPreview('', '0:01:00')).toBeUndefined();
        expect(batchSectionTrimFromPreview('0:00:00', '')).toBeUndefined();
        expect(batchSectionTrimFromPreview('0:00:00', '0:01:00')).toEqual({
            start: '0:00:00',
            end: '0:01:00'
        });
        expect(batchSectionTrimFromPreview('0:00:01', '0:02:00')).toEqual({
            start: '0:00:01',
            end: '0:02:00'
        });
    });

    it('batchEntryDownloadFields leaves sectionTrim off when no batch trim', () => {
        const f = batchEntryDownloadFields({ durationSeconds: 10 }, undefined);
        expect(f.sectionTrim).toBeUndefined();
        expect(f.mediaDurationSeconds).toBe(10);
    });

    it('batchEntryDownloadFields uses flat filesize and ignores non-finite duration', () => {
        const fromFlat = batchEntryDownloadFields(
            { durationSeconds: Number.NaN, playlistEntryFilesizeBytes: 5_000_000 },
            undefined
        );
        expect(fromFlat.mediaDurationSeconds).toBeUndefined();
        expect(fromFlat.sizeEstimateFullBytes).toBe(5_000_000);

        const fromDuration = batchEntryDownloadFields(
            { durationSeconds: 60, playlistEntryFilesizeBytes: 0 },
            undefined
        );
        expect(fromDuration.mediaDurationSeconds).toBe(60);
        expect(fromDuration.sizeEstimateFullBytes).toBeGreaterThan(0);
    });

    it('batchEntryDownloadFields applies trim scaling when trim and duration present', () => {
        const trimmed = batchEntryDownloadFields(
            { durationSeconds: 120, playlistEntryFilesizeBytes: 1_200_000 },
            { start: '0:00:00', end: '0:01:00' }
        );
        expect(trimmed.sectionTrim).toEqual({ start: '0:00:00', end: '0:01:00' });
        expect(trimmed.totalSize).toBeTruthy();
        expect(trimmed.sizeEstimateFullBytes).toBe(1_200_000);
    });

    it('batchEntryDownloadFields omits rough size when duration and flat size are unusable', () => {
        const noRough = batchEntryDownloadFields({ durationSeconds: 0 }, undefined);
        expect(noRough.sizeEstimateFullBytes).toBeUndefined();
        expect(noRough.totalSize).toBeUndefined();
        expect(noRough.mediaDurationSeconds).toBeUndefined();
    });

    it('batchEntryDownloadFields uses full size for totalSize when trim estimate is null', () => {
        const withTrimButNoEstimate = batchEntryDownloadFields(
            { durationSeconds: 60, playlistEntryFilesizeBytes: 2_000_000 },
            { start: 'bad', end: 'bad' }
        );
        expect(withTrimButNoEstimate.sectionTrim).toEqual({ start: 'bad', end: 'bad' });
        expect(withTrimButNoEstimate.sizeEstimateFullBytes).toBe(2_000_000);
        expect(withTrimButNoEstimate.totalSize).toBeTruthy();
    });

    it('batchEntryDownloadFields returns no size for was_live entries (HLS peak bandwidth inflation)', () => {
        // was_live filesize_approx is based on HLS peak BANDWIDTH × duration (~10x actual).
        // Even after clearing playlistEntryFilesizeBytes, the duration-based fallback should
        // also be suppressed — live stream bitrates are much lower than VOD defaults.
        const wasLive = batchEntryDownloadFields(
            { durationSeconds: 7200, liveStatus: 'was_live' },
            undefined
        );
        expect(wasLive.sizeEstimateFullBytes).toBeUndefined();
        expect(wasLive.totalSize).toBeUndefined();
        // duration is still preserved for display purposes
        expect(wasLive.mediaDurationSeconds).toBe(7200);
    });

    it('batchEntryDownloadFields returns no size for is_live and post_live entries', () => {
        const isLive = batchEntryDownloadFields(
            { durationSeconds: 3600, liveStatus: 'is_live' },
            undefined
        );
        expect(isLive.sizeEstimateFullBytes).toBeUndefined();
        expect(isLive.totalSize).toBeUndefined();

        const postLive = batchEntryDownloadFields(
            { durationSeconds: 3600, liveStatus: 'post_live' },
            undefined
        );
        expect(postLive.sizeEstimateFullBytes).toBeUndefined();
        expect(postLive.totalSize).toBeUndefined();
    });

    it('batchEntryDownloadFields still estimates size for not_live status', () => {
        const notLive = batchEntryDownloadFields(
            { durationSeconds: 60, liveStatus: 'not_live' },
            undefined
        );
        expect(notLive.sizeEstimateFullBytes).toBeGreaterThan(0);
    });

    it('batchSiteLabelFromUrl uses profile display name for YouTube', () => {
        expect(batchSiteLabelFromUrl('https://www.youtube.com/watch?v=dQw4w9WgXcQ')).toBe(
            'YouTube'
        );
    });

    it('batchSiteLabelFromUrl falls back to hostname and empty on invalid URL', () => {
        expect(batchSiteLabelFromUrl('https://example.org/path')).toBe('example.org');
        expect(batchSiteLabelFromUrl('not-a-url')).toBe('');
    });

    it('formatIdForYoutubeQualityCaps matches default when uncapped', () => {
        expect(formatIdForYoutubeQualityCaps(null, null)).toBe(DEFAULT_PLAYLIST_FORMAT_ID);
    });

    it('formatIdForYoutubeQualityCaps adds height and fps filters', () => {
        expect(formatIdForYoutubeQualityCaps(1080, null)).toBe(
            'bestvideo[height<=1080]+bestaudio/best[height<=1080]/best'
        );
        expect(formatIdForYoutubeQualityCaps(null, 30)).toBe('bestvideo[fps<=30]+bestaudio/best');
        expect(formatIdForYoutubeQualityCaps(720, 60)).toBe(
            'bestvideo[height<=720][fps<=60]+bestaudio/best[height<=720]/best'
        );
        expect(formatIdForYoutubeQualityCaps(0, null)).toBe(DEFAULT_PLAYLIST_FORMAT_ID);
        expect(formatIdForYoutubeQualityCaps(null, 0)).toBe(DEFAULT_PLAYLIST_FORMAT_ID);
    });

    it('buildPlaylistBatchPayloads applies preferredQuality to formatId', () => {
        const entries: MediaCandidate[] = [
            {
                id: 'a',
                url: 'https://example.com/a',
                title: 'Alpha',
                author: 'Auth',
                durationSeconds: 5,
                thumbnailUrl: '',
                flatIndex: 0
            }
        ];
        const playlistInfo: PlaylistInfo = { title: 'List', entries };
        const payloads = buildPlaylistBatchPayloads({
            playlistInfo,
            entries,
            playlistInputUrl: 'https://example.com/pl',
            playlistOutputDir: '/out',
            numberPlaylistItems: false,
            batchGroupId: 'g1',
            batchSourceUrl: 'https://example.com/pl',
            batchSiteLabel: 'Example',
            batchExtractedAt: 1,
            siteFieldsForUrl: noopSiteFields,
            preferredQuality: 1080
        });
        expect(payloads[0]?.formatId).toBe(
            'bestvideo[height<=1080]+bestaudio/best[height<=1080]/best'
        );
    });

    it('buildPlaylistBatchPayloads numbers items and sets output template when enabled', () => {
        const entries: MediaCandidate[] = [
            {
                id: 'a',
                url: 'https://example.com/a',
                title: 'Alpha',
                author: 'Auth',
                durationSeconds: 5,
                thumbnailUrl: '',
                flatIndex: 0
            }
        ];
        const playlistInfo: PlaylistInfo = { title: 'List', entries };
        const payloads = buildPlaylistBatchPayloads({
            playlistInfo,
            entries,
            playlistInputUrl: 'https://example.com/pl',
            playlistOutputDir: '/out',
            numberPlaylistItems: true,
            batchGroupId: 'g1',
            batchSourceUrl: 'https://example.com/pl',
            batchSiteLabel: 'Example',
            batchExtractedAt: 1,
            siteFieldsForUrl: noopSiteFields
        });
        expect(payloads[0]?.title).toMatch(/^01\. /);
        expect(payloads[0]?.outputTemplate).toBe('01 - %(title)s.%(ext)s');
    });

    it('buildPlaylistBatchPayloads preserves original ordinals via getSequenceNumber', () => {
        // Simulates: playlist has 50 videos; user picks videos at positions 22 and 35.
        const entries: MediaCandidate[] = [
            {
                id: 'v22',
                url: 'https://example.com/v22',
                title: 'Video 22',
                author: 'Auth',
                durationSeconds: 10,
                thumbnailUrl: '',
                flatIndex: 21
            },
            {
                id: 'v35',
                url: 'https://example.com/v35',
                title: 'Video 35',
                author: 'Auth',
                durationSeconds: 10,
                thumbnailUrl: '',
                flatIndex: 34
            }
        ];
        const playlistInfo: PlaylistInfo = { title: 'List', entries };
        const [entry0, entry1] = entries as [MediaCandidate, MediaCandidate];
        const originalOrdinals = new Map<MediaCandidate, number>([
            [entry0, 22],
            [entry1, 35]
        ]);
        const payloads = buildPlaylistBatchPayloads({
            playlistInfo,
            entries,
            playlistInputUrl: 'https://example.com/pl',
            playlistOutputDir: '/out',
            numberPlaylistItems: true,
            batchGroupId: 'g1',
            batchSourceUrl: 'https://example.com/pl',
            batchSiteLabel: 'Example',
            batchExtractedAt: 1,
            siteFieldsForUrl: noopSiteFields,
            getSequenceNumber: (entry) => originalOrdinals.get(entry)
        });
        // Pad width is based on max ordinal (35 → 2 digits)
        expect(payloads[0]?.title).toBe('22. Video 22');
        expect(payloads[0]?.outputTemplate).toBe('22 - %(title)s.%(ext)s');
        expect(payloads[1]?.title).toBe('35. Video 35');
        expect(payloads[1]?.outputTemplate).toBe('35 - %(title)s.%(ext)s');
    });

    it('buildPlaylistBatchPayloads pads width to max ordinal when using getSequenceNumber', () => {
        // Playlist has 1000 videos; user picks #850 — pad width should be 3.
        const entry: MediaCandidate = {
            id: 'v850',
            url: 'https://example.com/v850',
            title: 'Video 850',
            author: 'Auth',
            durationSeconds: 5,
            thumbnailUrl: '',
            flatIndex: 849
        };
        const playlistInfo: PlaylistInfo = { title: 'List', entries: [entry] };
        const payloads = buildPlaylistBatchPayloads({
            playlistInfo,
            entries: [entry],
            playlistInputUrl: 'https://example.com/pl',
            playlistOutputDir: '/out',
            numberPlaylistItems: true,
            batchGroupId: 'g1',
            batchSourceUrl: 'https://example.com/pl',
            batchSiteLabel: 'Example',
            batchExtractedAt: 1,
            siteFieldsForUrl: noopSiteFields,
            getSequenceNumber: () => 850
        });
        expect(payloads[0]?.title).toBe('850. Video 850');
        expect(payloads[0]?.outputTemplate).toBe('850 - %(title)s.%(ext)s');
    });
});
