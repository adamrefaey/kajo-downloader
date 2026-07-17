import { describe, expect, it } from 'vitest';
import { buildAddDownloadPayloadFromVideo } from '../src/renderer/src/lib/buildAddDownloadPayload';
import { queueSiteFieldsFromResolve } from '../src/renderer/src/lib/queueSiteHelpers';
import {
    formatBytes,
    getDownloadFormatId,
    getMergedProgressByteWeights,
    getVideoHeight
} from '../src/renderer/src/lib/youtubeAppHelpers';
import { estimateDownloadFullBytesFromDuration } from '../src/shared/estimateDownloadFullBytes';
import { estimateBytesForSectionTrim } from '../src/shared/sectionTrim';
import type { Format, VideoInfo } from '../src/types';

const VIDEO_FMT: Format = {
    id: '137',
    ext: 'mp4',
    resolution: '1080p',
    filesize: 50_000_000,
    audioOnly: false
};
const AUDIO_FMT: Format = {
    id: '140',
    ext: 'm4a',
    resolution: 'audio only',
    filesize: 3_000_000,
    audioOnly: true
};
const VIDEO_NO_SIZE: Format = {
    id: '248',
    ext: 'webm',
    resolution: '1080p',
    filesize: null,
    audioOnly: false
};
const VIDEO_NO_HEIGHT_NO_SIZE: Format = {
    id: '299',
    ext: 'mp4',
    resolution: 'source',
    filesize: null,
    audioOnly: false
};
const AUDIO_NO_SIZE: Format = {
    id: '251',
    ext: 'webm',
    resolution: 'audio only',
    filesize: null,
    audioOnly: true
};

function makeVideoInfo(overrides: Partial<VideoInfo> = {}): VideoInfo {
    return {
        id: 'v1',
        url: 'https://videos.example/watch?v=1',
        title: 'Sample title',
        channel: 'Sample channel',
        durationSeconds: 120,
        thumbnailUrl: 'https://videos.example/thumb.jpg',
        formats: [VIDEO_FMT, AUDIO_FMT, VIDEO_NO_SIZE, VIDEO_NO_HEIGHT_NO_SIZE, AUDIO_NO_SIZE],
        ...overrides
    };
}

describe('buildAddDownloadPayloadFromVideo', () => {
    it('maps a video format with a known filesize (no trim)', () => {
        const videoInfo = makeVideoInfo();
        const payload = buildAddDownloadPayloadFromVideo({
            videoInfo,
            selectedFormatId: VIDEO_FMT.id,
            selectedFormat: VIDEO_FMT,
            audioOnly: false,
            metadataResolve: null,
            outputDir: '/downloads'
        });
        const resolvedFormatId = getDownloadFormatId(VIDEO_FMT.id, VIDEO_FMT, {
            allFormats: videoInfo.formats,
            durationSeconds: videoInfo.durationSeconds
        });
        const weights = getMergedProgressByteWeights(resolvedFormatId, false, VIDEO_FMT);

        expect(payload).toMatchObject(queueSiteFieldsFromResolve(null, videoInfo.url));
        expect(payload.url).toBe(videoInfo.url);
        expect(payload.title).toBe(videoInfo.title);
        expect(payload.channel).toBe(videoInfo.channel);
        expect(payload.thumbnailUrl).toBe(videoInfo.thumbnailUrl);
        expect(payload.outputDir).toBe('/downloads');
        expect(payload.formatId).toBe(resolvedFormatId);
        expect(payload.audioOnly).toBe(false);
        expect(payload.videoHeight).toBe(getVideoHeight(VIDEO_FMT));
        expect(payload.progressVideoBytes).toBe(weights.progressVideoBytes);
        expect(payload.progressAudioBytes).toBe(weights.progressAudioBytes);
        expect(payload.sizeEstimateFullBytes).toBe(50_000_000);
        expect(payload.totalSize).toBe(`~${formatBytes(50_000_000)}`);
        expect(payload.mediaDurationSeconds).toBe(120);
        // section-trim is omitted (not just undefined) when none is supplied
        expect('sectionTrim' in payload).toBe(false);
    });

    it('treats an explicit audio-only request as audio (no videoHeight)', () => {
        const payload = buildAddDownloadPayloadFromVideo({
            videoInfo: makeVideoInfo(),
            selectedFormatId: AUDIO_FMT.id,
            selectedFormat: AUDIO_FMT,
            audioOnly: true,
            metadataResolve: null,
            outputDir: '/d'
        });
        expect(payload.audioOnly).toBe(true);
        expect(payload.videoHeight).toBeUndefined();
        expect(payload.sizeEstimateFullBytes).toBe(3_000_000);
    });

    it('treats a format flagged audioOnly as audio even when the toggle is off', () => {
        const payload = buildAddDownloadPayloadFromVideo({
            videoInfo: makeVideoInfo(),
            selectedFormatId: AUDIO_FMT.id,
            selectedFormat: AUDIO_FMT,
            audioOnly: false,
            metadataResolve: null,
            outputDir: '/d'
        });
        expect(payload.audioOnly).toBe(true);
        expect(payload.videoHeight).toBeUndefined();
    });

    it('estimates size from duration when a video format has no filesize', () => {
        const videoInfo = makeVideoInfo();
        const payload = buildAddDownloadPayloadFromVideo({
            videoInfo,
            selectedFormatId: VIDEO_NO_SIZE.id,
            selectedFormat: VIDEO_NO_SIZE,
            audioOnly: false,
            metadataResolve: null,
            outputDir: '/d'
        });
        const expected = estimateDownloadFullBytesFromDuration({
            durationSeconds: 120,
            audioOnly: false,
            videoHeight: getVideoHeight(VIDEO_NO_SIZE)
        });
        expect(payload.videoHeight).toBe(1080);
        expect(payload.sizeEstimateFullBytes).toBe(expected);
        expect(payload.totalSize).toBe(`~${formatBytes(expected)}`);
    });

    it('estimates audio size from duration when an audio format has no filesize', () => {
        const payload = buildAddDownloadPayloadFromVideo({
            videoInfo: makeVideoInfo(),
            selectedFormatId: AUDIO_NO_SIZE.id,
            selectedFormat: AUDIO_NO_SIZE,
            audioOnly: true,
            metadataResolve: null,
            outputDir: '/d'
        });
        const expected = estimateDownloadFullBytesFromDuration({
            durationSeconds: 120,
            audioOnly: true,
            videoHeight: undefined
        });
        expect(payload.audioOnly).toBe(true);
        expect(payload.videoHeight).toBeUndefined();
        expect(payload.sizeEstimateFullBytes).toBe(expected);
    });

    it('omits videoHeight for a video format with no parseable resolution', () => {
        const payload = buildAddDownloadPayloadFromVideo({
            videoInfo: makeVideoInfo(),
            selectedFormatId: VIDEO_NO_HEIGHT_NO_SIZE.id,
            selectedFormat: VIDEO_NO_HEIGHT_NO_SIZE,
            audioOnly: false,
            metadataResolve: null,
            outputDir: '/d'
        });
        const expected = estimateDownloadFullBytesFromDuration({
            durationSeconds: 120,
            audioOnly: false,
            videoHeight: undefined
        });
        expect(payload.audioOnly).toBe(false);
        expect(payload.videoHeight).toBeUndefined();
        expect(payload.sizeEstimateFullBytes).toBe(expected);
    });

    it('leaves size undefined when there is neither filesize nor a positive duration', () => {
        const payload = buildAddDownloadPayloadFromVideo({
            videoInfo: makeVideoInfo({ durationSeconds: 0 }),
            selectedFormatId: VIDEO_NO_SIZE.id,
            selectedFormat: VIDEO_NO_SIZE,
            audioOnly: false,
            metadataResolve: null,
            outputDir: '/d'
        });
        expect(payload.sizeEstimateFullBytes).toBeUndefined();
        expect(payload.totalSize).toBeUndefined();
        expect(payload.mediaDurationSeconds).toBeUndefined();
    });

    it('ignores a non-finite duration', () => {
        const payload = buildAddDownloadPayloadFromVideo({
            videoInfo: makeVideoInfo({ durationSeconds: Number.POSITIVE_INFINITY }),
            selectedFormatId: VIDEO_NO_SIZE.id,
            selectedFormat: VIDEO_NO_SIZE,
            audioOnly: false,
            metadataResolve: null,
            outputDir: '/d'
        });
        expect(payload.sizeEstimateFullBytes).toBeUndefined();
        expect(payload.mediaDurationSeconds).toBeUndefined();
    });

    it('keeps the full estimate (no trim math) when filesize is known but duration is not', () => {
        const payload = buildAddDownloadPayloadFromVideo({
            videoInfo: makeVideoInfo({ durationSeconds: 0 }),
            selectedFormatId: VIDEO_FMT.id,
            selectedFormat: VIDEO_FMT,
            audioOnly: false,
            metadataResolve: null,
            outputDir: '/d'
        });
        expect(payload.sizeEstimateFullBytes).toBe(50_000_000);
        expect(payload.totalSize).toBe(`~${formatBytes(50_000_000)}`);
        expect(payload.mediaDurationSeconds).toBeUndefined();
    });

    it('applies a section trim to the size estimate and carries it on the payload', () => {
        const sectionTrim = { start: '00:00:10', end: '00:00:40' };
        const payload = buildAddDownloadPayloadFromVideo({
            videoInfo: makeVideoInfo(),
            selectedFormatId: VIDEO_FMT.id,
            selectedFormat: VIDEO_FMT,
            audioOnly: false,
            metadataResolve: null,
            outputDir: '/d',
            sectionTrim
        });
        const trimmed = estimateBytesForSectionTrim({
            fullFilesizeBytes: 50_000_000,
            fullDurationSeconds: 120,
            trimStart: '00:00:10',
            trimEnd: '00:00:40'
        });
        expect(trimmed).not.toBeNull();
        expect(payload.sectionTrim).toEqual(sectionTrim);
        expect(payload.totalSize).toBe(`~${formatBytes(trimmed ?? 50_000_000)}`);
    });

    it('handles a null resolved format (id present, format object missing)', () => {
        const videoInfo = makeVideoInfo();
        const payload = buildAddDownloadPayloadFromVideo({
            videoInfo,
            selectedFormatId: 'best',
            selectedFormat: null,
            audioOnly: false,
            metadataResolve: null,
            outputDir: '/d'
        });
        const resolvedFormatId = getDownloadFormatId('best', null, {
            allFormats: videoInfo.formats,
            durationSeconds: 120
        });
        const expected = estimateDownloadFullBytesFromDuration({
            durationSeconds: 120,
            audioOnly: false,
            videoHeight: undefined
        });
        expect(payload.audioOnly).toBe(false);
        expect(payload.videoHeight).toBeUndefined();
        expect(payload.formatId).toBe(resolvedFormatId);
        expect(payload.sizeEstimateFullBytes).toBe(expected);
    });
});
