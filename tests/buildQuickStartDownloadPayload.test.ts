import { describe, expect, it, vi } from 'vitest';
import {
    backfillQuickStartDownloadRow,
    buildQuickStartDownloadPayload,
    buildQuickStartMetadataBackfillPatch,
    placeholderTitleFromUrl
} from '../src/renderer/src/lib/buildQuickStartDownloadPayload';
import type { VideoInfo } from '../src/types';

describe('buildQuickStartDownloadPayload', () => {
    it('placeholderTitleFromUrl prefers YouTube video id', () => {
        expect(placeholderTitleFromUrl('https://www.youtube.com/watch?v=2nLciKQE4pY')).toBe(
            '2nLciKQE4pY'
        );
        expect(placeholderTitleFromUrl('https://youtu.be/abc123_xyz')).toBe('abc123_xyz');
    });

    it('placeholderTitleFromUrl returns raw input when URL parsing fails', () => {
        expect(placeholderTitleFromUrl('not-a-url')).toBe('not-a-url');
    });

    it('buildQuickStartDownloadPayload uses audio-only selector when requested', () => {
        const payload = buildQuickStartDownloadPayload({
            url: 'https://www.youtube.com/watch?v=abc',
            metadataResolve: null,
            outputDir: '/tmp/out',
            preferredQuality: 1080,
            audioOnly: true
        });
        expect(payload.formatId).toBe('bestaudio/best');
        expect(payload.audioOnly).toBe(true);
        expect(payload.videoHeight).toBeUndefined();
    });

    it('buildQuickStartDownloadPayload uses quality-capped YouTube selector', () => {
        const payload = buildQuickStartDownloadPayload({
            url: 'https://www.youtube.com/watch?v=2nLciKQE4pY',
            metadataResolve: {
                kind: 'single',
                url: 'https://www.youtube.com/watch?v=2nLciKQE4pY',
                siteId: 'youtube',
                candidateMode: 'single'
            },
            outputDir: '/tmp/out',
            preferredQuality: 1440
        });
        expect(payload.formatId).toBe('bestvideo[height<=1440]+bestaudio/best[height<=1440]/best');
        expect(payload.videoHeight).toBe(1440);
        expect(payload.title).toBe('2nLciKQE4pY');
        expect(payload.outputDir).toBe('/tmp/out');
    });

    it('buildQuickStartDownloadPayload uses generic best merge for non-YouTube URLs', () => {
        const payload = buildQuickStartDownloadPayload({
            url: 'https://example.com/video.mp4',
            metadataResolve: null,
            outputDir: '/tmp/out',
            preferredQuality: 1080
        });
        expect(payload.formatId).toBe('bestvideo+bestaudio/best');
        expect(payload.videoHeight).toBe(1080);
    });

    it('buildQuickStartMetadataBackfillPatch fills title and size estimate', () => {
        const videoInfo: VideoInfo = {
            id: 'vid',
            url: 'https://www.youtube.com/watch?v=x',
            title: 'Travel Documentary 4K',
            channel: 'Channel',
            durationSeconds: 100,
            thumbnailUrl: 'https://example.com/thumb.jpg',
            formats: [
                {
                    id: '137',
                    ext: 'mp4',
                    resolution: '1080p',
                    vcodec: 'avc1',
                    acodec: 'none',
                    filesize: 1_000_000,
                    filesizeVideoOnly: 900_000
                },
                {
                    id: '140',
                    ext: 'm4a',
                    resolution: 'audio only',
                    vcodec: 'none',
                    acodec: 'mp4a',
                    audioOnly: true,
                    audioBitrateKbps: 128,
                    filesize: 100_000
                }
            ]
        };

        const patch = buildQuickStartMetadataBackfillPatch(videoInfo, 1080);
        expect(patch.title).toBe('Travel Documentary 4K');
        expect(patch.channel).toBe('Channel');
        expect(patch.thumbnailUrl).toBe('https://example.com/thumb.jpg');
        expect(patch.totalSize).toMatch(/^~/);
        expect(patch.sizeEstimateFullBytes).toBeGreaterThan(0);
    });

    it('buildQuickStartMetadataBackfillPatch without matching format keeps core metadata', () => {
        const patch = buildQuickStartMetadataBackfillPatch(
            {
                id: 'vid',
                url: 'https://example.com/v',
                title: 'Example',
                channel: 'Author',
                durationSeconds: 0,
                thumbnailUrl: 'https://example.com/t.jpg',
                formats: []
            },
            1080
        );
        expect(patch.title).toBe('Example');
        expect(patch.mediaDurationSeconds).toBeUndefined();
        expect(patch.totalSize).toBeUndefined();
    });

    it('buildQuickStartMetadataBackfillPatch omits videoHeight when resolution is unknown', () => {
        const patch = buildQuickStartMetadataBackfillPatch(
            {
                id: 'vid',
                url: 'https://www.youtube.com/watch?v=x',
                title: 'Unknown res',
                channel: 'Channel',
                durationSeconds: 100,
                thumbnailUrl: '',
                formats: [
                    {
                        id: 'dash',
                        ext: 'mp4',
                        resolution: 'unknown',
                        vcodec: 'avc1',
                        acodec: 'none',
                        filesize: 1_000_000
                    }
                ]
            },
            null
        );
        expect(patch.videoHeight).toBeUndefined();
    });

    it('buildQuickStartMetadataBackfillPatch handles audio-only preferred format', () => {
        const patch = buildQuickStartMetadataBackfillPatch(
            {
                id: 'vid',
                url: 'https://www.youtube.com/watch?v=x',
                title: 'Song',
                channel: 'Artist',
                durationSeconds: 200,
                thumbnailUrl: '',
                formats: [
                    {
                        id: '140',
                        ext: 'm4a',
                        resolution: 'audio only',
                        vcodec: 'none',
                        acodec: 'mp4a',
                        audioOnly: true,
                        filesize: 3_000_000
                    }
                ]
            },
            1080
        );
        expect(patch.audioOnly).toBe(true);
        expect(patch.videoHeight).toBeUndefined();
        expect(patch.totalSize).toMatch(/^~/);
    });

    it('placeholderTitleFromUrl falls back to raw url when hostname is empty', () => {
        expect(placeholderTitleFromUrl('file:///local/video.mp4')).toBe('file:///local/video.mp4');
    });

    it('buildQuickStartMetadataBackfillPatch without matching format keeps duration when positive', () => {
        const patch = buildQuickStartMetadataBackfillPatch(
            {
                id: 'vid',
                url: 'https://example.com/v',
                title: 'Example',
                channel: 'Author',
                durationSeconds: 42,
                thumbnailUrl: 'https://example.com/t.jpg',
                formats: []
            },
            1080
        );
        expect(patch.mediaDurationSeconds).toBe(42);
    });

    it('backfillQuickStartDownloadRow ignores empty IPC payloads', async () => {
        const updates: Array<{ id: string; patch: Record<string, unknown> }> = [];
        vi.stubGlobal('window', {
            api: {
                fetchVideoInfo: async () => ({ data: null })
            }
        });
        await backfillQuickStartDownloadRow({
            downloadId: 'dl-1',
            url: 'https://www.youtube.com/watch?v=x',
            preferredQuality: 360,
            updateDownload: (id, patch) => {
                updates.push({ id, patch });
            }
        });
        vi.unstubAllGlobals();
        expect(updates).toHaveLength(0);
    });

    it('backfillQuickStartDownloadRow is a no-op without renderer API', async () => {
        vi.stubGlobal('window', {});
        const updates: Array<{ id: string; patch: Record<string, unknown> }> = [];
        await backfillQuickStartDownloadRow({
            downloadId: 'dl-1',
            url: 'https://www.youtube.com/watch?v=x',
            preferredQuality: 360,
            updateDownload: (id, patch) => {
                updates.push({ id, patch });
            }
        });
        vi.unstubAllGlobals();
        expect(updates).toHaveLength(0);
    });

    it('backfillQuickStartDownloadRow patches queue row when IPC returns video info', async () => {
        const updates: Array<{ id: string; patch: Record<string, unknown> }> = [];
        vi.stubGlobal('window', {
            api: {
                fetchVideoInfo: async () => ({
                    data: {
                        id: 'vid',
                        url: 'https://www.youtube.com/watch?v=x',
                        title: 'Backfilled title',
                        channel: 'Channel',
                        durationSeconds: 120,
                        thumbnailUrl: '',
                        formats: [
                            {
                                id: '18',
                                ext: 'mp4',
                                resolution: '360p',
                                vcodec: 'avc1',
                                acodec: 'mp4a',
                                filesize: 500_000
                            }
                        ]
                    }
                })
            }
        });

        await backfillQuickStartDownloadRow({
            downloadId: 'dl-1',
            url: 'https://www.youtube.com/watch?v=x',
            preferredQuality: 360,
            updateDownload: (id, patch) => {
                updates.push({ id, patch });
            }
        });

        vi.unstubAllGlobals();
        expect(updates).toHaveLength(1);
        expect(updates[0]?.id).toBe('dl-1');
        expect(updates[0]?.patch.title).toBe('Backfilled title');
    });
});
