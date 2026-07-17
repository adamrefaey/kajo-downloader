import { describe, expect, it } from 'vitest';
import { normalizeFormats } from '../electron/services/metadata/formatNormalization';
import type { YtDlpFormat } from '../electron/services/metadata/types';
import { MAX_SUPPORTED_VIDEO_HEIGHT } from '../src/types';

function v(
    id: string,
    overrides: Partial<YtDlpFormat> & Pick<YtDlpFormat, 'vcodec' | 'acodec'>
): YtDlpFormat {
    return {
        format_id: id,
        ext: 'mp4',
        resolution: '720p',
        height: 720,
        width: 1280,
        ...overrides
    };
}

describe('normalizeFormats', () => {
    it('drops non-selectable formats (no streams, storyboard, image/mhtml exts)', () => {
        expect(
            normalizeFormats(
                [
                    { format_id: 'a', vcodec: 'none', acodec: 'none' },
                    {
                        format_id: 'b',
                        vcodec: 'avc1',
                        acodec: 'mp4a',
                        format_note: 'storyboard',
                        resolution: '720p',
                        height: 720
                    },
                    {
                        format_id: 'c',
                        vcodec: 'avc1',
                        acodec: 'mp4a',
                        ext: 'mhtml',
                        resolution: '720p',
                        height: 720
                    },
                    {
                        format_id: 'd',
                        vcodec: 'avc1',
                        acodec: 'mp4a',
                        ext: 'JPEG',
                        resolution: '720p',
                        height: 720
                    }
                ],
                null
            )
        ).toEqual([]);
    });

    it('uses audio-only list when there is no muxed or video-only stream', () => {
        const a1 = v('a1', {
            vcodec: 'none',
            acodec: 'mp4a.40.2',
            resolution: 'audio only',
            ext: 'm4a',
            abr: 128,
            filesize: 1_000_000
        });
        const a2 = v('a2', {
            vcodec: 'none',
            acodec: 'opus',
            resolution: 'audio only',
            ext: 'webm',
            abr: 96,
            filesize: 800_000
        });
        const out = normalizeFormats([a2, a1], 120);
        expect(out.map((x) => x.id).sort()).toEqual(['a1', 'a2']);
        const byId = Object.fromEntries(out.map((x) => [x.id, x]));
        expect(byId.a1?.audioOnly).toBe(true);
        expect(byId.a1?.audioBitrateKbps).toBe(128);
    });

    it('parses audio bitrate from format_note when abr is missing', () => {
        const row = v('notebr', {
            vcodec: 'none',
            acodec: 'mp4a',
            resolution: 'audio only',
            ext: 'm4a',
            format_note: 'medium 160 KiB/s',
            filesize: 2_000_000
        });
        const out = normalizeFormats([row], 100);
        expect(out[0]?.audioBitrateKbps).toBe(160);
    });

    it('returns zero implied audio kbps when note does not contain a kb/s pattern', () => {
        const row = v('nokb', {
            vcodec: 'none',
            acodec: 'mp4a',
            resolution: 'audio only',
            ext: 'm4a',
            abr: 0,
            format_note: 'no numbers here',
            filesize: 500_000
        });
        expect(normalizeFormats([row], 200)[0]?.audioBitrateKbps).toBeUndefined();
    });

    it('estimates paired audio kbps from file bytes when abr metadata is missing', () => {
        const vo = v('vsize', {
            vcodec: 'avc1',
            acodec: 'none',
            height: 720,
            resolution: '720p',
            filesize: 20_000_000
        });
        const ao = v('asize', {
            vcodec: 'none',
            acodec: 'mp4a',
            resolution: 'audio only',
            ext: 'm4a',
            filesize: 4_000_000
        });
        const row = normalizeFormats([vo, ao], 100).find((x) => x.id === 'vsize');
        expect(row?.filesize).toBeGreaterThan(20_000_000);
    });

    it('prefers video-only bucket when no muxed exists', () => {
        const vid = v('v1', {
            vcodec: 'avc1',
            acodec: 'none',
            resolution: '480p',
            height: 480,
            width: 854,
            filesize: 3_000_000
        });
        const out = normalizeFormats([vid], null);
        expect(out).toHaveLength(1);
        expect(out[0]?.audioOnly).toBe(false);
    });

    it('skips entries without format_id and video rows with non-positive height', () => {
        expect(
            normalizeFormats(
                [
                    v('ok', { vcodec: 'avc1', acodec: 'mp4a', height: 720 }),
                    { vcodec: 'avc1', acodec: 'mp4a', height: 720, format_id: '   ' },
                    v('badh', {
                        vcodec: 'avc1',
                        acodec: 'none',
                        resolution: 'unknown',
                        height: Number.NaN
                    })
                ],
                null
            ).map((x) => x.id)
        ).toEqual(['ok']);
    });

    it('skips video taller than MAX_SUPPORTED_VIDEO_HEIGHT', () => {
        const ok = v('ok', {
            vcodec: 'avc1',
            acodec: 'mp4a',
            height: MAX_SUPPORTED_VIDEO_HEIGHT,
            resolution: `${MAX_SUPPORTED_VIDEO_HEIGHT}p`
        });
        const too = v('too', {
            vcodec: 'avc1',
            acodec: 'mp4a',
            height: MAX_SUPPORTED_VIDEO_HEIGHT + 1,
            resolution: '9999p'
        });
        expect(normalizeFormats([too, ok], null).map((x) => x.id)).toEqual(['ok']);
    });

    it('uses filesize_approx when not HLS and applies HLS skip for approx + bitrate estimate', () => {
        const progressive = v('prog', {
            vcodec: 'avc1',
            acodec: 'mp4a',
            height: 720,
            filesize_approx: 12_000_000,
            protocol: 'https'
        });
        expect(normalizeFormats([progressive], null)[0]?.filesize).toBe(12_000_000);

        const hls = v('hls', {
            vcodec: 'avc1',
            acodec: 'mp4a',
            height: 720,
            filesize_approx: 99_000_000,
            protocol: 'm3u8_native',
            tbr: 1000
        });
        const hlsOut = normalizeFormats([hls], 80)[0];
        expect(hlsOut?.filesize).toBe(Math.floor((1000 * 1000 * 80) / 8));
    });

    it('uses muxed abr-only bitrate estimate when vbr is missing', () => {
        const mux = v('muxabr', {
            vcodec: 'avc1',
            acodec: 'mp4a',
            height: 720,
            abr: 200,
            protocol: 'https'
        });
        expect(normalizeFormats([mux], 50)[0]?.filesize).toBe(Math.floor((200 * 1000 * 50) / 8));
    });

    it('uses exact filesize on HLS even when filesize_approx is present', () => {
        const row = v('hlsexact', {
            vcodec: 'avc1',
            acodec: 'mp4a',
            height: 720,
            resolution: '720p',
            protocol: 'm3u8_native',
            filesize: 1234,
            filesize_approx: 9_999_999
        });
        expect(normalizeFormats([row], null)[0]?.filesize).toBe(1234);
    });

    it('applies max audio kbps caps for 1440p and 2160p pairing tiers', () => {
        const vo = v('v1440', {
            vcodec: 'avc1',
            acodec: 'none',
            height: 1440,
            resolution: '1440p',
            filesize: 50_000_000
        });
        const ao256 = v('a256', {
            vcodec: 'none',
            acodec: 'mp4a',
            resolution: 'audio only',
            ext: 'm4a',
            abr: 256,
            filesize: 6_000_000
        });
        const ao320 = v('a320b', {
            vcodec: 'none',
            acodec: 'mp4a',
            resolution: 'audio only',
            ext: 'm4a',
            abr: 320,
            filesize: 7_000_000
        });
        const r1440 = normalizeFormats([vo, ao256, ao320], 100).find((x) => x.id === 'v1440');
        expect(r1440?.filesize).toBe(50_000_000 + 6_000_000);

        const vo2160 = v('v2160', {
            vcodec: 'avc1',
            acodec: 'none',
            height: 2160,
            resolution: '2160p',
            filesize: 80_000_000
        });
        const ao400 = v('a400', {
            vcodec: 'none',
            acodec: 'mp4a',
            resolution: 'audio only',
            ext: 'm4a',
            abr: 400,
            filesize: 10_000_000
        });
        const ao320c = v('a320c', {
            vcodec: 'none',
            acodec: 'mp4a',
            resolution: 'audio only',
            ext: 'm4a',
            abr: 320,
            filesize: 8_000_000
        });
        const r2160 = normalizeFormats([vo2160, ao400, ao320c], 100).find((x) => x.id === 'v2160');
        expect(r2160?.filesize).toBe(80_000_000 + 8_000_000);
    });

    it('uses video-only vbr and audio-only abr for split streams', () => {
        const vo = v('vo', {
            vcodec: 'vp9',
            acodec: 'none',
            height: 1080,
            resolution: '1080p',
            vbr: 3000,
            filesize: 50_000_000
        });
        const ao = v('ao', {
            vcodec: 'none',
            acodec: 'opus',
            resolution: 'audio only',
            ext: 'webm',
            abr: 128,
            filesize: 2_000_000
        });
        const out = normalizeFormats([vo, ao], 100);
        const videoRow = out.find((x) => x.id === 'vo');
        expect(videoRow?.filesizeVideoOnly).toBe(50_000_000);
        expect(videoRow?.filesize).toBeGreaterThan(50_000_000);
    });

    it('pairs audio using capped kbps tier for 1080p video height', () => {
        const vo = v('v1080', {
            vcodec: 'avc1',
            acodec: 'none',
            height: 1080,
            resolution: '1080p',
            filesize: 40_000_000
        });
        const aoHigh = v('a320', {
            vcodec: 'none',
            acodec: 'mp4a',
            resolution: 'audio only',
            ext: 'm4a',
            abr: 320,
            filesize: 8_000_000
        });
        const aoOk = v('a192', {
            vcodec: 'none',
            acodec: 'mp4a',
            resolution: 'audio only',
            ext: 'm4a',
            abr: 192,
            filesize: 5_000_000
        });
        const row = normalizeFormats([vo, aoHigh, aoOk], 100).find((x) => x.id === 'v1080');
        expect(row?.filesize).toBe(40_000_000 + 5_000_000);
    });

    it('falls back to largest audio when none fit under the height cap', () => {
        const vo = v('v480', {
            vcodec: 'avc1',
            acodec: 'none',
            height: 480,
            resolution: '480p',
            filesize: 10_000_000
        });
        const ao = v('a999', {
            vcodec: 'none',
            acodec: 'mp4a',
            resolution: 'audio only',
            ext: 'm4a',
            abr: 999,
            filesize: 3_000_000
        });
        const row = normalizeFormats([vo, ao], 100).find((x) => x.id === 'v480');
        expect(row?.filesize).toBe(10_000_000 + 3_000_000);
    });

    it('covers codec, container, and protocol scoring paths', () => {
        const mkvHevc = v('mkv', {
            vcodec: 'hev1.1.6.L120.90',
            acodec: 'mp4a',
            ext: 'mkv',
            height: 480,
            width: 854,
            resolution: '480p',
            protocol: 'dash',
            filesize: 1_000
        });
        const webmVp9 = v('webm', {
            vcodec: 'vp9',
            acodec: 'opus',
            ext: 'webm',
            height: 720,
            width: 1280,
            resolution: '720p',
            protocol: 'm3u8',
            filesize: 2_000
        });
        const av01 = v('av1', {
            vcodec: 'av01.0.05M.08',
            acodec: 'vorbis',
            ext: 'mp4',
            height: 1080,
            width: 1920,
            resolution: '1080p',
            protocol: 'rtmp',
            filesize: 3_000
        });
        const out = normalizeFormats([mkvHevc, webmVp9, av01], null);
        expect(out.map((x) => x.id).sort()).toEqual(['av1', 'mkv', 'webm']);
    });

    it('derives resolution from width x height and height-only hints', () => {
        const wh = v('wh', {
            vcodec: 'h264',
            acodec: 'none',
            resolution: 'none',
            height: 600,
            width: 800,
            filesize: 1
        });
        const hp = v('hp', {
            vcodec: 'h264',
            acodec: 'none',
            resolution: 'none',
            height: 480,
            filesize: 1
        });
        const out = normalizeFormats([wh, hp], null);
        const byId = Object.fromEntries(out.map((x) => [x.id, x.resolution]));
        expect(byId.wh).toContain('800');
        expect(byId.hp).toMatch(/480/);
    });

    it('derives resolution as height-only p label when width is absent', () => {
        const row: YtDlpFormat = {
            format_id: 'honly',
            ext: 'mp4',
            resolution: 'none',
            vcodec: 'avc1',
            acodec: 'none',
            height: 540,
            filesize: 1
        };
        const out = normalizeFormats([row], null)[0];
        expect(out?.resolution).toBe('540p');
    });

    it('uses muxed vbr for bitrate estimate when both vbr and abr exist', () => {
        const row = v('muxvbr', {
            vcodec: 'avc1',
            acodec: 'mp4a',
            height: 720,
            resolution: '720p',
            vbr: 4500,
            abr: 128,
            protocol: 'https'
        });
        expect(normalizeFormats([row], 20)[0]?.filesize).toBe(Math.floor((4500 * 1000 * 20) / 8));
    });

    it('scores default codec and protocol buckets', () => {
        const row = v('generic', {
            vcodec: 'mpeg4',
            acodec: 'flac',
            height: 360,
            resolution: '360p',
            protocol: 'ftp',
            filesize: 100
        });
        expect(normalizeFormats([row], null)).toHaveLength(1);
    });

    it('falls back to unknown ext when yt-dlp ext is blank', () => {
        const row = v('blankext', {
            ext: '   ',
            vcodec: 'avc1',
            acodec: 'mp4a',
            height: 360,
            resolution: '360p',
            filesize: 1
        });
        expect(normalizeFormats([row], null)[0]?.ext).toBe('unknown');
    });

    it('omits optional vcodec/acodec fields when absent on raw rows', () => {
        const videoBare: YtDlpFormat = {
            format_id: 'vbare',
            ext: 'mp4',
            vcodec: 'avc1',
            resolution: '360p',
            height: 360,
            filesize: 1
        };
        const audioBare: YtDlpFormat = {
            format_id: 'abare',
            ext: 'm4a',
            acodec: 'mp4a',
            resolution: 'audio only',
            abr: 96,
            filesize: 100
        };
        const vOut = normalizeFormats([videoBare], null)[0];
        const aOut = normalizeFormats([audioBare], null)[0];
        expect(vOut?.vcodec).toBe('avc1');
        expect(vOut?.acodec).toBeUndefined();
        expect(aOut?.acodec).toBe('mp4a');
        expect(aOut?.vcodec).toBeUndefined();
    });

    it('covers height-hint fallbacks when raw height is non-finite', () => {
        const bareHint: YtDlpFormat = {
            format_id: 'barehint',
            resolution: '1080p',
            height: Number.NaN,
            vcodec: 'avc1',
            acodec: 'none',
            filesize: 1
        };
        expect(normalizeFormats([bareHint], null)[0]?.resolution).toBe('1080p');
    });

    it('covers isAudioOnly resolution fallback when resolution is omitted on muxed rows', () => {
        const muxNoResolution: YtDlpFormat = {
            format_id: 'muxnores',
            ext: 'mp4',
            vcodec: 'avc1',
            acodec: 'mp4a',
            height: 480,
            width: 854,
            filesize: 1
        };
        expect(normalizeFormats([muxNoResolution], null)).toHaveLength(1);
    });

    it('sorts muxed rows with same height by fps when audio bitrate ties', () => {
        const slow = v('fps24', {
            vcodec: 'avc1',
            acodec: 'mp4a',
            height: 720,
            resolution: '720p',
            fps: 24,
            filesize: 100
        });
        const fast = v('fps60', {
            vcodec: 'avc1',
            acodec: 'mp4a',
            height: 720,
            resolution: '720p',
            fps: 60,
            filesize: 200
        });
        const out = normalizeFormats([slow, fast], null);
        expect(out.map((x) => x.id)).toEqual(['fps60', 'fps24']);
    });

    it('replaces same-bucket video-only when scores differ at equal declared bitrate', () => {
        const small = v('vsmall', {
            vcodec: 'avc1',
            acodec: 'none',
            height: 720,
            resolution: '720p',
            fps: 30,
            tbr: 2000,
            protocol: 'https',
            filesize: 1_000_000
        });
        const big = v('vbig', {
            vcodec: 'avc1',
            acodec: 'none',
            height: 720,
            resolution: '720p',
            fps: 30,
            tbr: 2000,
            protocol: 'https',
            filesize: 9_000_000
        });
        const out = normalizeFormats([small, big], null);
        expect(out.map((x) => x.id)).toEqual(['vbig']);
    });

    it('pairs >2160 video using uncapped audio ranking', () => {
        const vo: YtDlpFormat = {
            format_id: 'v8k',
            ext: 'mp4',
            resolution: '4320p',
            vcodec: 'avc1',
            acodec: 'none',
            height: 4320,
            filesize: 100_000_000
        };
        const hi = v('a384', {
            vcodec: 'none',
            acodec: 'mp4a',
            resolution: 'audio only',
            ext: 'm4a',
            abr: 384,
            filesize: 12_000_000
        });
        const lo = v('a256', {
            vcodec: 'none',
            acodec: 'mp4a',
            resolution: 'audio only',
            ext: 'm4a',
            abr: 256,
            filesize: 8_000_000
        });
        const dead = v('adead', {
            vcodec: 'none',
            acodec: 'mp4a',
            resolution: 'audio only',
            ext: 'm4a',
            abr: 0,
            format_note: 'x',
            filesize: null,
            filesize_approx: null
        });
        const row = normalizeFormats([vo, dead, lo, hi], 100).find((x) => x.id === 'v8k');
        expect(row?.filesize).toBe(100_000_000 + 12_000_000);
    });

    it('uses height hint from 1080p and from width×height strings when raw height is non-finite', () => {
        const p = v('hintp', {
            vcodec: 'avc1',
            acodec: 'none',
            resolution: '1080p',
            height: Number.NaN,
            filesize: 1
        });
        const x = v('hintx', {
            vcodec: 'avc1',
            acodec: 'none',
            resolution: '1280x720',
            height: Number.NaN,
            width: Number.NaN,
            filesize: 1
        });
        const out = normalizeFormats([p, x], null);
        const byId = Object.fromEntries(out.map((r) => [r.id, r.resolution]));
        expect(byId.hintp).toBe('1080p');
        expect(byId.hintx).toBe('1280x720');
    });

    it('treats invalid string bitrates as absent for size estimation', () => {
        const row = v('badtbr', {
            vcodec: 'avc1',
            acodec: 'none',
            height: 360,
            resolution: '360p',
            tbr: 'not-a-number',
            protocol: 'https'
        });
        expect(normalizeFormats([row], 60)[0]?.filesize).toBeNull();
    });

    it('uses string tbr/vbr/abr coercion in bitrate estimate', () => {
        const row = v('str', {
            vcodec: 'avc1',
            acodec: 'none',
            height: 360,
            resolution: '360p',
            vbr: ' 900.5 ',
            filesize: null,
            filesize_approx: null,
            protocol: 'https'
        });
        expect(normalizeFormats([row], 40)[0]?.filesize).toBe(Math.floor((900.5 * 1000 * 40) / 8));
    });

    it('does not add filesize when bitrate-duration estimate is non-positive', () => {
        const row = v('tiny', {
            vcodec: 'avc1',
            acodec: 'none',
            height: 240,
            resolution: '240p',
            tbr: 0.000001,
            protocol: 'https'
        });
        const out = normalizeFormats([row], 1)[0];
        expect(out?.filesize == null || out.filesize === 0).toBe(true);
    });

    it('prefers non-segmented over segmented when tied on bitrate and score', () => {
        const base = {
            vcodec: 'avc1',
            acodec: 'mp4a',
            height: 720,
            resolution: '720p',
            fps: 30,
            ext: 'mp4',
            filesize: 5_000_000
        };
        const dash = v('dash', { ...base, format_id: 'dash', protocol: 'https+dash' });
        const direct = v('direct', { ...base, format_id: 'direct', protocol: 'https' });
        const out = normalizeFormats([dash, direct], 60);
        expect(out.find((x) => x.id === 'direct')).toBeTruthy();
        expect(out.find((x) => x.id === 'dash')).toBeUndefined();
    });

    it('replaces candidate when bitrate is higher in the same quality bucket', () => {
        const low = v('low', {
            vcodec: 'avc1',
            acodec: 'mp4a',
            height: 720,
            resolution: '720p',
            fps: 25,
            tbr: 1000,
            protocol: 'https',
            filesize: 1_000_000
        });
        const high = v('high', {
            vcodec: 'avc1',
            acodec: 'mp4a',
            height: 720,
            resolution: '720p',
            fps: 25,
            tbr: 5000,
            protocol: 'https',
            filesize: 5_000_000
        });
        const out = normalizeFormats([low, high], 120);
        expect(out.map((x) => x.id)).toEqual(['high']);
    });

    it('sorts by audio bitrate, height, fps, then score', () => {
        const a = v('a', {
            vcodec: 'none',
            acodec: 'mp4a',
            resolution: 'audio only',
            ext: 'm4a',
            abr: 64,
            filesize: 100
        });
        const b = v('b', {
            vcodec: 'none',
            acodec: 'mp4a',
            resolution: 'audio only',
            ext: 'm4a',
            abr: 192,
            filesize: 200
        });
        const out = normalizeFormats([a, b], null);
        expect(out[0]?.id).toBe('b');
        expect(out[1]?.id).toBe('a');
    });

    it('keeps first muxed row when a duplicate is not a better candidate', () => {
        const twinA = v('twin-a', {
            vcodec: 'avc1',
            acodec: 'mp4a',
            height: 720,
            resolution: '720p',
            fps: 30,
            ext: 'mp4',
            protocol: 'https',
            filesize: 9_000_000,
            tbr: 2000
        });
        const twinB = v('twin-b', {
            vcodec: 'avc1',
            acodec: 'mp4a',
            height: 720,
            resolution: '720p',
            fps: 30,
            ext: 'mp4',
            protocol: 'https',
            filesize: 9_000_000,
            tbr: 2000
        });
        const out = normalizeFormats([twinA, twinB], 60);
        expect(out.filter((x) => x.id.startsWith('twin')).length).toBe(1);
        expect(['twin-a', 'twin-b']).toContain(out.find((x) => x.id.startsWith('twin'))?.id ?? '');
    });

    it('includes optional format fields when present', () => {
        const row = v('opt', {
            vcodec: 'avc1',
            acodec: 'mp4a',
            height: 720,
            resolution: '720p',
            format_note: 'HD',
            fps: 29.97,
            filesize: 100
        });
        const out = normalizeFormats([row], null)[0];
        expect(out?.formatNote).toBe('HD');
        expect(out?.fps).toBe(29.97);
    });
});
