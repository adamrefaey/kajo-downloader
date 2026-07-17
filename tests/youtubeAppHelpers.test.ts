import { describe, expect, it } from 'vitest';
import {
    classifyYouTubeUrl,
    formatBytes,
    formatHeightCappedFallbackTail,
    formatPlaylistIndex,
    getDownloadFormatId,
    getErrorMessage,
    getMergedProgressByteWeights,
    getPlaylistIdFromUrl,
    getPreferredFormat,
    getVideoHeight,
    maxAudioKbpsForVideoHeight,
    pickAudioFormatIdForVideoHeight,
    toFileUrl,
    YOUTUBE_URL_REGEX
} from '../src/renderer/src/lib/youtubeAppHelpers';
import type { Format } from '../src/types';

describe('youtubeAppHelpers', () => {
    it('getErrorMessage prefers Error message', () => {
        expect(getErrorMessage(new Error('x'), 'fallback')).toBe('x');
        expect(getErrorMessage('x', 'fallback')).toBe('fallback');
        expect(getErrorMessage(new Error(''), 'fallback')).toBe('fallback');
    });

    it('getErrorMessage maps IPC invoke timeouts to fallback copy', () => {
        expect(
            getErrorMessage(
                new Error('IPC_INVOKE_TIMEOUT:download:metadata-resolve-url'),
                'fallback'
            )
        ).toBe('fallback');
    });

    it('classifyYouTubeUrl handles watch, playlist, shorts, youtu.be', () => {
        expect(classifyYouTubeUrl('https://www.youtube.com/watch?v=dQw4w9WgXcQ')).toBe('video');
        expect(classifyYouTubeUrl('https://www.youtube.com/watch?v=dQw4w9WgXcQ&list=PLx')).toBe(
            'playlist'
        );
        expect(classifyYouTubeUrl('https://www.youtube.com/playlist?list=PLx')).toBe('playlist');
        expect(classifyYouTubeUrl('https://youtu.be/dQw4w9WgXcQ')).toBe('video');
        expect(classifyYouTubeUrl('https://youtu.be/dQw4w9WgXcQ?list=PLx')).toBe('playlist');
        expect(classifyYouTubeUrl('https://www.youtube.com/shorts/dQw4w9WgXcQ')).toBe('video');
        expect(classifyYouTubeUrl('https://www.youtube.com/embed/dQw4w9WgXcQ')).toBe('video');
        expect(classifyYouTubeUrl('not a url')).toBe('unsupported');
    });

    it('classifyYouTubeUrl treats channel URLs as batch downloads', () => {
        expect(classifyYouTubeUrl('https://www.youtube.com/channel/UCuAXFkgsw1L7xaCfnd5JJOw')).toBe(
            'channel'
        );
        expect(classifyYouTubeUrl('https://www.youtube.com/c/YouTube')).toBe('channel');
        expect(classifyYouTubeUrl('https://www.youtube.com/user/YouTube')).toBe('channel');
        expect(classifyYouTubeUrl('https://www.youtube.com/@YouTube')).toBe('channel');
        expect(classifyYouTubeUrl('https://www.youtube.com/@YouTube/videos')).toBe('channel');
        expect(classifyYouTubeUrl('https://www.youtube.com/channel/short')).toBe('unsupported');
        expect(classifyYouTubeUrl('https://www.youtube.com/c/')).toBe('unsupported');
    });

    it('classifyYouTubeUrl marks short ids and bad playlist paths as unsupported', () => {
        expect(classifyYouTubeUrl('https://youtu.be/short')).toBe('unsupported');
        expect(classifyYouTubeUrl('https://www.youtube.com/playlist')).toBe('unsupported');
        expect(classifyYouTubeUrl('https://www.youtube.com/watch?v=short')).toBe('unsupported');
        expect(classifyYouTubeUrl('https://www.youtube.com/shorts/bad')).toBe('unsupported');
        expect(classifyYouTubeUrl('https://www.youtube.com/')).toBe('unsupported');
        expect(classifyYouTubeUrl('https://youtu.be/')).toBe('unsupported');
    });

    it('YOUTUBE_URL_REGEX still matches primary app URL shapes', () => {
        const url = 'https://www.youtube.com/watch?v=dQw4w9WgXcQ';
        expect(YOUTUBE_URL_REGEX.test(url)).toBe(true);
        expect(YOUTUBE_URL_REGEX.test('https://www.youtube.com/@SomeChannel/videos')).toBe(true);
    });

    it('getPreferredFormat', () => {
        const audio: Format = {
            id: 'a',
            ext: 'm4a',
            resolution: 'audio only',
            audioOnly: true,
            acodec: 'aac',
            vcodec: 'none'
        };
        const v720: Format = {
            id: 'v720',
            ext: 'mp4',
            resolution: '720p',
            vcodec: 'avc1',
            acodec: 'mp4a',
            fps: 30
        };
        const v1080: Format = {
            id: 'v1080',
            ext: 'mp4',
            resolution: '1080p',
            vcodec: 'avc1',
            acodec: 'mp4a'
        };
        expect(getPreferredFormat([audio], 1080)).toBe(audio);
        expect(getPreferredFormat([v720, v1080], null)).toBe(v720);
        expect(getPreferredFormat([v720, v1080], 720)).toBe(v720);
        expect(getPreferredFormat([v1080], 480)).toBe(v1080);
        const noHeight: Format = {
            id: 'x',
            ext: 'mp4',
            resolution: 'unknown',
            vcodec: 'avc1',
            acodec: 'mp4a'
        };
        expect(getPreferredFormat([noHeight], 1080)).toBe(noHeight);
        const v720LowFps: Format = {
            id: '72a',
            ext: 'mp4',
            resolution: '720p',
            vcodec: 'avc1',
            acodec: 'mp4a',
            fps: 30
        };
        const v720HighFps: Format = {
            id: '72b',
            ext: 'mp4',
            resolution: '720p',
            vcodec: 'avc1',
            acodec: 'mp4a',
            fps: 60
        };
        expect(getPreferredFormat([v720LowFps, v720HighFps], 720)).toBe(v720HighFps);
        const v720NoFps: Format = {
            id: '72c',
            ext: 'mp4',
            resolution: '720p',
            vcodec: 'avc1',
            acodec: 'mp4a'
        };
        expect(getPreferredFormat([v720NoFps, v720HighFps], 720)).toBe(v720HighFps);

        const v1080a: Format = {
            id: '1080a',
            ext: 'mp4',
            resolution: '1080p',
            vcodec: 'avc1',
            acodec: 'mp4a',
            fps: 30
        };
        const v1080b: Format = {
            id: '1080b',
            ext: 'mp4',
            resolution: '1080p',
            vcodec: 'avc1',
            acodec: 'mp4a',
            fps: 60
        };
        expect(getPreferredFormat([v1080a, v1080b], 720)).toBe(v1080b);

        const v720tieA: Format = {
            id: '720a',
            ext: 'mp4',
            resolution: '720p',
            vcodec: 'avc1',
            acodec: 'mp4a',
            fps: 30
        };
        const v720tieB: Format = {
            id: '720b',
            ext: 'mp4',
            resolution: '720p',
            vcodec: 'avc1',
            acodec: 'mp4a',
            fps: 60
        };
        expect(getPreferredFormat([v720tieA, v720tieB], 1080)).toBe(v720tieB);

        const v1080tieA: Format = {
            id: '1080ta',
            ext: 'mp4',
            resolution: '1080p',
            vcodec: 'avc1',
            acodec: 'mp4a',
            fps: 24
        };
        const v1080tieB: Format = {
            id: '1080tb',
            ext: 'mp4',
            resolution: '1080p',
            vcodec: 'avc1',
            acodec: 'mp4a',
            fps: 60
        };
        expect(getPreferredFormat([v1080tieA, v1080tieB], 720)).toBe(v1080tieB);

        const unknownA: Format = {
            id: 'ua',
            ext: 'mp4',
            resolution: '???',
            vcodec: 'avc1',
            acodec: 'mp4a'
        };
        const unknownB: Format = {
            id: 'ub',
            ext: 'mp4',
            resolution: 'nope',
            vcodec: 'avc1',
            acodec: 'mp4a'
        };
        expect(getPreferredFormat([unknownA, unknownB], 480)).toBe(unknownA);

        const v720aNoFps: Format = {
            id: '720nf-a',
            ext: 'mp4',
            resolution: '720p',
            vcodec: 'avc1',
            acodec: 'mp4a'
        };
        const v720bNoFps: Format = {
            id: '720nf-b',
            ext: 'mp4',
            resolution: '720p',
            vcodec: 'avc1',
            acodec: 'mp4a'
        };
        expect(getPreferredFormat([v720aNoFps, v720bNoFps], 1080)).toBe(v720aNoFps);

        const v1440a: Format = {
            id: '1440a',
            ext: 'mp4',
            resolution: '1440p',
            vcodec: 'avc1',
            acodec: 'mp4a'
        };
        const v1440b: Format = {
            id: '1440b',
            ext: 'mp4',
            resolution: '1440p',
            vcodec: 'avc1',
            acodec: 'mp4a',
            fps: 60
        };
        expect(getPreferredFormat([v1440a, v1440b], 720)).toBe(v1440b);

        const v1440nf1: Format = {
            id: '1440nf1',
            ext: 'mp4',
            resolution: '1440p',
            vcodec: 'avc1',
            acodec: 'mp4a'
        };
        const v1440nf2: Format = {
            id: '1440nf2',
            ext: 'mp4',
            resolution: '1440p',
            vcodec: 'avc1',
            acodec: 'mp4a'
        };
        expect(getPreferredFormat([v1440nf1, v1440nf2], 720)).toBe(v1440nf1);
    });

    it('getDownloadFormatId adds audio merge when video-only', () => {
        const f: Format = {
            id: '137',
            ext: 'mp4',
            resolution: '1080p',
            vcodec: 'avc1',
            acodec: 'none'
        };
        expect(getDownloadFormatId('137', f)).toBe(
            '137+bestaudio[abr<=192]/137+bestaudio/bestvideo[height<=1080]+bestaudio/best[height<=1080]/best'
        );
        expect(
            getDownloadFormatId('137', {
                id: '137',
                ext: 'mp4',
                resolution: '1080p',
                vcodec: 'avc1',
                acodec: 'mp4a'
            })
        ).toBe('137/bestvideo[height<=1080]+bestaudio/best[height<=1080]/best');
        expect(getDownloadFormatId('137', null)).toBe('137');
    });

    it('getDownloadFormatId pairs manifest audio tier to video height', () => {
        const durationSeconds = 100;
        const v480: Format = {
            id: 'v480',
            ext: 'mp4',
            resolution: '480p',
            vcodec: 'avc1',
            acodec: 'none'
        };
        const opusHi: Format = {
            id: '251',
            ext: 'webm',
            resolution: 'audio only',
            vcodec: 'none',
            acodec: 'opus',
            audioOnly: true,
            audioBitrateKbps: 160
        };
        const aacMed: Format = {
            id: '140',
            ext: 'm4a',
            resolution: 'audio only',
            vcodec: 'none',
            acodec: 'mp4a',
            audioOnly: true,
            audioBitrateKbps: 128
        };
        const formats = [v480, opusHi, aacMed];
        expect(maxAudioKbpsForVideoHeight(480)).toBe(128);
        expect(pickAudioFormatIdForVideoHeight(480, formats, durationSeconds)).toBe('140');
        expect(getDownloadFormatId('v480', v480, { allFormats: formats, durationSeconds })).toBe(
            'v480+140/v480+bestaudio/bestvideo[height<=480]+bestaudio/best[height<=480]/best'
        );

        const v8k: Format = {
            id: 'v8k',
            ext: 'mp4',
            resolution: '4320p',
            vcodec: 'avc1',
            acodec: 'none'
        };
        const formats8k = [v8k, aacMed, opusHi];
        expect(pickAudioFormatIdForVideoHeight(4320, formats8k, durationSeconds)).toBe('251');
        expect(getDownloadFormatId('v8k', v8k, { allFormats: formats8k, durationSeconds })).toBe(
            'v8k+251/v8k+bestaudio/bestvideo[height<=4320]+bestaudio/best[height<=4320]/best'
        );

        expect(getDownloadFormatId('v8k', v8k)).toBe(
            'v8k+bestaudio/bestvideo[height<=4320]+bestaudio/best[height<=4320]/best'
        );

        expect(
            getDownloadFormatId('v480', v480, {
                allFormats: [v480, opusHi],
                durationSeconds
            })
        ).toBe(
            'v480+bestaudio[abr<=128]/v480+bestaudio/bestvideo[height<=480]+bestaudio/best[height<=480]/best'
        );
    });

    it('getMergedProgressByteWeights', () => {
        expect(getMergedProgressByteWeights('a+b', true, null)).toEqual({});
        expect(getMergedProgressByteWeights('ab', false, null)).toEqual({});
        const fmt: Format = {
            id: 'x',
            ext: 'mp4',
            resolution: '1080p',
            filesize: 100,
            filesizeVideoOnly: 90,
            vcodec: 'avc1',
            acodec: 'none'
        };
        expect(getMergedProgressByteWeights('v+a', false, fmt)).toEqual({
            progressVideoBytes: 90,
            progressAudioBytes: 10
        });
        expect(
            getMergedProgressByteWeights('v+a', false, {
                ...fmt,
                filesize: 90,
                filesizeVideoOnly: 90
            })
        ).toEqual({});
    });

    it('getVideoHeight parses xNNN dimension', () => {
        const f: Format = {
            id: 'x',
            ext: 'mp4',
            resolution: '1280x720',
            vcodec: 'avc1',
            acodec: 'mp4a'
        };
        expect(getPreferredFormat([f], 720)).toBe(f);
    });

    it('toFileUrl encodes segments', () => {
        expect(toFileUrl('/tmp/a b.txt')).toBe('file:///tmp/a%20b.txt');
        expect(toFileUrl('Users/x/file.txt')).toBe('file:///Users/x/file.txt');
    });

    it('formatBytes (re-export from shared)', () => {
        expect(formatBytes(500)).toMatch(/B$/);
        expect(formatBytes(2048)).toContain('KB');
    });

    it('getPlaylistIdFromUrl', () => {
        expect(getPlaylistIdFromUrl('https://www.youtube.com/playlist?list=PLabc')).toBe('PLabc');
        expect(getPlaylistIdFromUrl('bad')).toBeUndefined();
        expect(
            getPlaylistIdFromUrl('https://www.youtube.com/watch?v=dQw4w9WgXcQ&list=%20%20')
        ).toBeUndefined();
    });

    it('formatPlaylistIndex', () => {
        expect(formatPlaylistIndex(3, 2)).toBe('03');
        expect(formatPlaylistIndex(10, 1)).toBe('10');
        expect(formatPlaylistIndex(7, 5)).toBe('00007');
    });

    it('getVideoHeight parses 720p, WxH, or returns 0', () => {
        const base = { id: 'x', ext: 'mp4', vcodec: 'avc1', acodec: 'mp4a' };
        expect(getVideoHeight({ ...base, resolution: '1080P' })).toBe(1080);
        expect(getVideoHeight({ ...base, resolution: '1920x1080' })).toBe(1080);
        expect(getVideoHeight({ ...base, resolution: 'audio only' })).toBe(0);
    });

    it('maxAudioKbpsForVideoHeight covers height tiers', () => {
        expect(maxAudioKbpsForVideoHeight(0)).toBe(Number.POSITIVE_INFINITY);
        expect(maxAudioKbpsForVideoHeight(-1)).toBe(Number.POSITIVE_INFINITY);
        expect(maxAudioKbpsForVideoHeight(480)).toBe(128);
        expect(maxAudioKbpsForVideoHeight(481)).toBe(160);
        expect(maxAudioKbpsForVideoHeight(720)).toBe(160);
        expect(maxAudioKbpsForVideoHeight(721)).toBe(192);
        expect(maxAudioKbpsForVideoHeight(1080)).toBe(192);
        expect(maxAudioKbpsForVideoHeight(1081)).toBe(256);
        expect(maxAudioKbpsForVideoHeight(1440)).toBe(256);
        expect(maxAudioKbpsForVideoHeight(1441)).toBe(320);
        expect(maxAudioKbpsForVideoHeight(2160)).toBe(320);
        expect(maxAudioKbpsForVideoHeight(5000)).toBe(Number.POSITIVE_INFINITY);
    });

    it('pickAudioFormatIdForVideoHeight uses filesize when bitrate missing', () => {
        const durationSeconds = 10;
        const fromSize: Format = {
            id: 'fs',
            ext: 'webm',
            resolution: 'audio only',
            vcodec: 'none',
            acodec: 'opus',
            audioOnly: true,
            filesize: 160000
        };
        expect(pickAudioFormatIdForVideoHeight(480, [fromSize], durationSeconds)).toBe('fs');
    });

    it('pickAudioFormatIdForVideoHeight returns null when no usable bitrate', () => {
        const bad: Format = {
            id: 'b',
            ext: 'webm',
            resolution: 'audio only',
            vcodec: 'none',
            acodec: 'opus',
            audioOnly: true,
            filesize: 0
        };
        expect(pickAudioFormatIdForVideoHeight(480, [bad], 10)).toBeNull();
        expect(pickAudioFormatIdForVideoHeight(480, [bad], 0)).toBeNull();
    });

    it('pickAudioFormatIdForVideoHeight returns null when all candidates exceed cap', () => {
        const hi: Format = {
            id: 'hi',
            ext: 'webm',
            resolution: 'audio only',
            vcodec: 'none',
            acodec: 'opus',
            audioOnly: true,
            audioBitrateKbps: 999
        };
        expect(pickAudioFormatIdForVideoHeight(480, [hi], 10)).toBeNull();
    });

    it('getDownloadFormatId uses bestaudio/best when height is unknown and manifest unusable', () => {
        const unknownRes: Format = {
            id: 'dashv',
            ext: 'mp4',
            resolution: 'unknown',
            vcodec: 'avc1',
            acodec: 'none'
        };
        expect(getDownloadFormatId('dashv', unknownRes)).toBe('dashv+bestaudio/best');
    });

    it('getDownloadFormatId falls back to bestaudio for audio-only selections', () => {
        const audio: Format = {
            id: '140',
            ext: 'm4a',
            resolution: 'audio only',
            vcodec: 'none',
            acodec: 'mp4a',
            audioOnly: true
        };
        expect(getDownloadFormatId('140', audio)).toBe('140/bestaudio');
    });

    it('formatHeightCappedFallbackTail caps by height or falls back to bare best', () => {
        expect(formatHeightCappedFallbackTail(1080)).toBe(
            '/bestvideo[height<=1080]+bestaudio/best[height<=1080]/best'
        );
        expect(formatHeightCappedFallbackTail(0)).toBe('/best');
    });

    it('getMergedProgressByteWeights skips when totals do not imply split', () => {
        expect(getMergedProgressByteWeights('a+b', false, null)).toEqual({});
        const fmt: Format = {
            id: 'x',
            ext: 'mp4',
            resolution: '1080p',
            filesize: 100,
            filesizeVideoOnly: 100,
            vcodec: 'avc1',
            acodec: 'none'
        };
        expect(getMergedProgressByteWeights('v+a', false, fmt)).toEqual({});
        const noVideoOnly: Format = {
            id: 'y',
            ext: 'mp4',
            resolution: '1080p',
            filesize: 100,
            vcodec: 'avc1',
            acodec: 'none'
        };
        expect(getMergedProgressByteWeights('v+a', false, noVideoOnly)).toEqual({});
    });
});
