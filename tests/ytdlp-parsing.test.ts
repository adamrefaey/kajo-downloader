import { describe, expect, it, vi } from 'vitest';

vi.mock('../electron/services/metadata', () => ({
    resolveYoutubeCookieArgvForDownload: vi.fn(async () => [])
}));

vi.mock('../electron/services/binaries', () => ({
    buildYtDlpInvocation: vi.fn(async (args: string[]) => ({ command: 'yt-dlp', args }))
}));

vi.mock('electron', () => ({
    app: {
        getPath: () => '/tmp',
        isPackaged: false,
        getAppPath: () => '/app',
        isReady: () => true
    }
}));

import type { RunningDownload } from '../electron/services/ytdlp';
import {
    clampProgressPercentValue,
    computeMergedProgress,
    createLineProcessor,
    formatEta,
    formatSpeed,
    isYtDlpCancelledArtifact,
    isYtDlpMergeSidecarDestination,
    onDownloadDestinationPath,
    parseStructuredProgress,
    resolveMergeProgressMode,
    shouldRetryVideoWithRecode,
    shouldSuppressMergeProgressBeforeFirstFormat
} from '../electron/services/ytdlp';

const MiB = 1024 * 1024;

function baseDownload(over: Partial<RunningDownload> = {}): RunningDownload {
    return {
        process: {} as RunningDownload['process'],
        wasCancelled: false,
        isPaused: false,
        stderrBuffer: [],
        mergeProgressMode: 'none',
        mergeStreamIndex: 0,
        launchContext: {
            options: {
                url: 'https://example.com/v',
                formatId: 'best',
                outputDir: '/tmp',
                webContents: {} as never
            },
            cookieArgv: [],
            uniqueOutputPath: '/tmp/out.mp4',
            resolvedCookiesPresent: false
        },
        recodeRetryAttempted: false,
        youtubeConsentFallbackAttempted: false,
        ...over
    };
}

// ─── parseStructuredProgress ─────────────────────────────────────────────────

describe('parseStructuredProgress', () => {
    it('parses a full valid line', () => {
        const line = '__YTPB__|4718592|94371840|0|3145728|30';
        const r = parseStructuredProgress(line);
        expect(r).not.toBeNull();
        expect(r?.downloadedBytes).toBe(4718592);
        expect(r?.totalBytes).toBe(94371840);
        expect(r?.totalEstimateBytes).toBe(0);
        expect(r?.speedBytesPerSec).toBe(3145728);
        expect(r?.etaSeconds).toBe(30);
    });

    it('returns null for non-matching lines', () => {
        expect(parseStructuredProgress('[download] Destination: foo.mp4')).toBeNull();
        expect(
            parseStructuredProgress('[download]  50.0% of 90.00MiB at 1MiB/s ETA 00:01')
        ).toBeNull();
        expect(parseStructuredProgress('')).toBeNull();
    });

    it('handles unknown speed and eta (0 values)', () => {
        const r = parseStructuredProgress('__YTPB__|0|94371840|0|0|0');
        expect(r?.downloadedBytes).toBe(0);
        expect(r?.speedBytesPerSec).toBe(0);
        expect(r?.etaSeconds).toBe(0);
    });

    it('uses totalEstimateBytes when totalBytes is 0', () => {
        const r = parseStructuredProgress('__YTPB__|2097152|0|94371840|1048576|45');
        expect(r?.totalBytes).toBe(0);
        expect(r?.totalEstimateBytes).toBe(94371840);
    });
});

// ─── formatSpeed / formatEta ──────────────────────────────────────────────────

describe('formatSpeed', () => {
    it('formats known speeds', () => {
        expect(formatSpeed(3 * MiB)).toContain('MB');
        expect(formatSpeed(512 * 1024)).toContain('KB');
        expect(formatSpeed(1.5 * 1024 * 1024 * 1024)).toContain('GB');
    });
    it('returns -- for zero / negative', () => {
        expect(formatSpeed(0)).toBe('--');
        expect(formatSpeed(-1)).toBe('--');
    });
});

describe('formatEta', () => {
    it('formats seconds as MM:SS', () => {
        expect(formatEta(90)).toBe('1:30');
        expect(formatEta(65)).toBe('1:05');
        expect(formatEta(5)).toBe('0:05');
    });
    it('formats hours as H:MM:SS', () => {
        expect(formatEta(3661)).toBe('1:01:01');
    });
    it('returns -- for zero / negative', () => {
        expect(formatEta(0)).toBe('--');
        expect(formatEta(-5)).toBe('--');
    });
});

// ─── clampProgressPercentValue ────────────────────────────────────────────────

describe('clampProgressPercentValue', () => {
    it('clamps to [0, 100]', () => {
        expect(clampProgressPercentValue(NaN)).toBe(0);
        expect(clampProgressPercentValue(-1)).toBe(0);
        expect(clampProgressPercentValue(150)).toBe(100);
        expect(clampProgressPercentValue(50)).toBe(50);
    });
});

// ─── isYtDlpCancelledArtifact ─────────────────────────────────────────────────

describe('isYtDlpCancelledArtifact', () => {
    it('identifies artefact paths', () => {
        expect(isYtDlpCancelledArtifact('out', 'out', 'out.part')).toBe(true);
        expect(isYtDlpCancelledArtifact('v', 'v', 'v.f123.mp4')).toBe(true);
        expect(isYtDlpCancelledArtifact('v', 'v', 'other.txt')).toBe(false);
        expect(
            isYtDlpCancelledArtifact(
                'The Arabic Dream (1).mp4',
                'The Arabic Dream (1)',
                'The Arabic Dream (1).webp'
            )
        ).toBe(true);
        expect(isYtDlpCancelledArtifact('v', 'v', 'v.webm')).toBe(true);
        expect(isYtDlpCancelledArtifact('v', 'v', 'v.info.json')).toBe(true);
    });
});

// ─── createLineProcessor ──────────────────────────────────────────────────────

describe('createLineProcessor', () => {
    it('splits lines correctly', () => {
        const lines: string[] = [];
        const p = createLineProcessor((l) => lines.push(l));
        p.push('a\nb\r\n');
        expect(lines).toEqual(['a', 'b']);
        p.push('partial');
        p.push('\nend\n');
        expect(lines).toEqual(['a', 'b', 'partial', 'end']);
    });
});

// ─── resolveMergeProgressMode ─────────────────────────────────────────────────

describe('resolveMergeProgressMode', () => {
    it('returns weighted when both byte sizes are provided', () => {
        expect(
            resolveMergeProgressMode({
                url: '',
                formatId: 'a+b',
                outputDir: '/',
                webContents: {} as never,
                progressVideoBytes: 90 * MiB,
                progressAudioBytes: 10 * MiB
            })
        ).toBe('weighted');
    });
    it('returns default_split for merged without pre-fetched sizes', () => {
        expect(
            resolveMergeProgressMode({
                url: '',
                formatId: 'a+b',
                outputDir: '/',
                webContents: {} as never
            })
        ).toBe('default_split');
    });
    it('returns none for audio-only or single format', () => {
        expect(
            resolveMergeProgressMode({
                url: '',
                formatId: 'best',
                outputDir: '/',
                webContents: {} as never,
                audioOnly: true
            })
        ).toBe('none');
    });
});

// ─── computeMergedProgress ───────────────────────────────────────────────────

describe('computeMergedProgress — none (single stream)', () => {
    it('computes percent directly from bytes (exact Content-Length)', () => {
        const d = baseDownload({ mergeProgressMode: 'none' });
        const r = computeMergedProgress(d, 45 * MiB, 90 * MiB, 0, 0, 0);
        expect(r.percent).toBeCloseTo(50, 4);
        expect(r.totalSizeBytes).toBe(90 * MiB);
        expect(r.totalSizeLabel).toContain('MB');
    });

    it('HLS: derives total from ETA×speed (not noisy segment estimate)', () => {
        const d = baseDownload({ mergeProgressMode: 'none' });
        // 45 MiB downloaded, speed = 1 MiB/s, ETA = 45 s → derived total = 45+45 = 90 MiB
        const r = computeMergedProgress(d, 45 * MiB, 0, 900 * MiB, MiB, 45);
        expect(r.percent).toBeCloseTo(50, 4);
        expect(r.totalSizeBytes).toBe(90 * MiB);
        // The inflated 900 MiB segment estimate is ignored
    });

    it('HLS: suppresses size until 5 MB downloaded', () => {
        const d = baseDownload({ mergeProgressMode: 'none' });
        // 3 MiB downloaded — speed and eta are known but threshold not met
        const r = computeMergedProgress(d, 3 * MiB, 0, 0, MiB, 87);
        expect(r.totalSizeBytes).toBeUndefined();
        expect(r.totalSizeLabel).toBeUndefined();
        expect(r.percent).toBeGreaterThan(0); // percent still computed
    });

    it('HLS: returns 0% when speed/eta unknown', () => {
        const d = baseDownload({ mergeProgressMode: 'none' });
        const r = computeMergedProgress(d, 1000, 0, 0, 0, 0);
        expect(r.percent).toBe(0);
        expect(r.totalSizeBytes).toBeUndefined();
    });

    it('HLS: size appears once 5 MB threshold is crossed', () => {
        const d = baseDownload({ mergeProgressMode: 'none' });
        // 5 MiB downloaded, speed = 1 MiB/s, ETA = 85 s → derived = 5 + 85 = 90 MiB
        const r = computeMergedProgress(d, 5 * MiB, 0, 0, MiB, 85);
        expect(r.totalSizeBytes).toBe(90 * MiB);
        expect(r.totalSizeLabel).toContain('MB');
    });
});

describe('computeMergedProgress — weighted (video+audio, pre-fetched sizes)', () => {
    it('scales video progress by pre-fetched ratio', () => {
        const d = baseDownload({
            mergeProgressMode: 'weighted',
            progressVideoBytes: 90 * MiB,
            progressAudioBytes: 10 * MiB,
            mergeStreamIndex: 0
        });
        onDownloadDestinationPath(d, '/tmp/title.f399.mp4');

        // At 50% of video stream (45 MiB downloaded of 90 MiB total)
        const r = computeMergedProgress(d, 45 * MiB, 90 * MiB, 0, 0, 0);
        // 45 / (90 + 10) = 45%
        expect(r.percent).toBeCloseTo(45, 1);
        // Exact Content-Length: combined total available during video phase
        expect(r.totalSizeBytes).toBe(100 * MiB);
        expect(r.totalSizeLabel).toBe('100 MB');
    });

    it('shows combined total and correct percent during audio phase', () => {
        const d = baseDownload({
            mergeProgressMode: 'weighted',
            progressVideoBytes: 90 * MiB,
            progressAudioBytes: 10 * MiB
        });
        onDownloadDestinationPath(d, '/tmp/title.f399.mp4');
        // Finish video (sets streamVideoTotalBytes = 90MiB)
        computeMergedProgress(d, 90 * MiB, 90 * MiB, 0, 0, 0);
        onDownloadDestinationPath(d, '/tmp/title.f140.m4a');

        // 5 MiB into audio (out of 10 MiB audio total)
        const r = computeMergedProgress(d, 5 * MiB, 10 * MiB, 0, 0, 0);
        // (90 + 5) / (90 + 10) = 95%
        expect(r.percent).toBeCloseTo(95, 1);
        expect(r.totalSizeBytes).toBe(100 * MiB);
        expect(r.totalSizeLabel).toBe('100 MB');
    });

    it('is monotonically non-decreasing at the video→audio boundary', () => {
        const d = baseDownload({
            mergeProgressMode: 'weighted',
            progressVideoBytes: 90 * MiB,
            progressAudioBytes: 10 * MiB
        });
        onDownloadDestinationPath(d, '/tmp/video.f399.mp4');
        const atVideoEnd = computeMergedProgress(d, 90 * MiB, 90 * MiB, 0, 0, 0);
        // ~90% (90/100)
        expect(atVideoEnd.percent).toBeCloseTo(90, 1);

        onDownloadDestinationPath(d, '/tmp/audio.f140.m4a');
        const atAudioStart = computeMergedProgress(d, 0, 10 * MiB, 0, 0, 0);
        // 90 / 100 = 90% — not less than video end
        expect(atAudioStart.percent).toBeCloseTo(90, 1);
        expect(atAudioStart.percent).toBeGreaterThanOrEqual(atVideoEnd.percent);
    });
});

describe('computeMergedProgress — default_split (no pre-fetched sizes)', () => {
    it('produces a smooth video phase with audio estimation', () => {
        const d = baseDownload({ mergeProgressMode: 'default_split' });
        onDownloadDestinationPath(d, '/tmp/video.f399.mp4');

        const r50 = computeMergedProgress(d, 45 * MiB, 90 * MiB, 0, 0, 0);
        expect(r50.percent).toBeGreaterThan(0);
        expect(r50.percent).toBeLessThan(50); // estimation inflates denominator
        // Exact Content-Length: combined total (video + estimated audio) shown early
        expect(r50.totalSizeBytes).toBeGreaterThan(90 * MiB);

        // Video 100%
        const r100 = computeMergedProgress(d, 90 * MiB, 90 * MiB, 0, 0, 0);
        expect(r100.percent).toBeLessThan(100); // bar does NOT hit 100 before audio is done
        expect(r100.totalSizeBytes).toBeGreaterThan(90 * MiB);
    });

    it('HLS video phase: updates estimate freely until 5 MB downloaded, then freezes', () => {
        const d = baseDownload({ mergeProgressMode: 'default_split' });
        onDownloadDestinationPath(d, '/tmp/video.f399.mp4');

        // Before 5 MB: estimate updates freely
        computeMergedProgress(d, 1 * MiB, 0, 864 * MiB, 0, 0);
        expect(d.streamVideoTotalBytes).toBe(864 * MiB);
        expect(d.streamVideoTotalBytesFrozen).toBeFalsy();

        computeMergedProgress(d, 3 * MiB, 0, 700 * MiB, 0, 0);
        expect(d.streamVideoTotalBytes).toBe(700 * MiB);
        expect(d.streamVideoTotalBytesFrozen).toBeFalsy();

        // At 5 MB: estimate is frozen
        computeMergedProgress(d, 5 * MiB, 0, 500 * MiB, 0, 0);
        expect(d.streamVideoTotalBytes).toBe(500 * MiB);
        expect(d.streamVideoTotalBytesFrozen).toBe(true);

        // After freeze: subsequent estimates are ignored
        computeMergedProgress(d, 10 * MiB, 0, 200 * MiB, 0, 0);
        expect(d.streamVideoTotalBytes).toBe(500 * MiB);
    });

    it('HLS video phase: suppresses currentStreamLabel until frozen at 5 MB', () => {
        const d = baseDownload({ mergeProgressMode: 'default_split' });
        onDownloadDestinationPath(d, '/tmp/video.f399.mp4');

        // Before 5 MB: no size label
        const before = computeMergedProgress(d, 3 * MiB, 0, 500 * MiB, 0, 0);
        expect(before.currentStreamLabel).toBeUndefined();

        // At 5 MB: size label appears and is stable
        const atFreeze = computeMergedProgress(d, 5 * MiB, 0, 480 * MiB, 0, 0);
        expect(atFreeze.currentStreamLabel).toBe('480 MB');

        // After freeze: label stays at frozen value
        const after = computeMergedProgress(d, 10 * MiB, 0, 200 * MiB, 0, 0);
        expect(after.currentStreamLabel).toBe('480 MB');
    });

    it('non-HLS video phase: emits combined total once exact Content-Length is known', () => {
        const d = baseDownload({
            mergeProgressMode: 'weighted',
            progressVideoBytes: 90 * MiB,
            progressAudioBytes: 10 * MiB
        });
        onDownloadDestinationPath(d, '/tmp/video.f399.mp4');

        const r = computeMergedProgress(d, 1 * MiB, 90 * MiB, 0, 0, 0);
        expect(r.totalSizeBytes).toBe(100 * MiB);
        expect(r.totalSizeLabel).toBe('100 MB');
        expect(r.currentStreamLabel).toBe('100 MB');
    });

    it('non-HLS video phase: uses Math.max for exact Content-Length (totalBytes>0)', () => {
        // For regular downloads with Content-Length, totalBytes is exact and
        // should never decrease — keep the max for safety.
        const d = baseDownload({ mergeProgressMode: 'default_split' });
        onDownloadDestinationPath(d, '/tmp/video.f399.mp4');

        computeMergedProgress(d, 45 * MiB, 90 * MiB, 0, 0, 0);
        expect(d.streamVideoTotalBytes).toBe(90 * MiB);

        // A stray smaller report should not replace the exact known total
        computeMergedProgress(d, 46 * MiB, 80 * MiB, 0, 0, 0);
        expect(d.streamVideoTotalBytes).toBe(90 * MiB);
    });

    it('uses actual sizes in audio phase and shows combined total', () => {
        const d = baseDownload({ mergeProgressMode: 'default_split' });
        onDownloadDestinationPath(d, '/tmp/video.f400.mp4');
        computeMergedProgress(d, 90 * MiB, 90 * MiB, 0, 0, 0); // finish video
        onDownloadDestinationPath(d, '/tmp/audio.f140.m4a');

        const r = computeMergedProgress(d, 5 * MiB, 10 * MiB, 0, 0, 0);
        // (90 + 5) / (90 + 10) = 95%
        expect(r.percent).toBeCloseTo(95, 1);
        expect(r.totalSizeBytes).toBe(100 * MiB);
        expect(r.totalSizeLabel).toBe('100 MB');
    });
});

describe('shouldSuppressMergeProgressBeforeFirstFormat + onDownloadDestinationPath', () => {
    it('suppresses progress until first non-sidecar destination', () => {
        const d = baseDownload({ mergeProgressMode: 'default_split' });
        expect(shouldSuppressMergeProgressBeforeFirstFormat(d)).toBe(true);

        onDownloadDestinationPath(d, '/tmp/Video.webp'); // sidecar — ignored
        expect(shouldSuppressMergeProgressBeforeFirstFormat(d)).toBe(true);

        onDownloadDestinationPath(d, '/tmp/Video.f399.mp4'); // first media stream
        expect(shouldSuppressMergeProgressBeforeFirstFormat(d)).toBe(false);
        expect(d.mergeStreamIndex).toBe(0);
    });

    it('advances stream index on second destination', () => {
        const d = baseDownload({ mergeProgressMode: 'default_split' });
        onDownloadDestinationPath(d, '/tmp/v.f399.mp4');
        onDownloadDestinationPath(d, '/tmp/v.f140.m4a');
        expect(d.mergeStreamIndex).toBe(1);
    });

    it('works with custom output templates (no .f in path)', () => {
        const d = baseDownload({ mergeProgressMode: 'default_split' });
        onDownloadDestinationPath(d, '/tmp/cover.jpg'); // sidecar
        expect(shouldSuppressMergeProgressBeforeFirstFormat(d)).toBe(true);
        onDownloadDestinationPath(d, '/tmp/Episode 12.webm');
        expect(shouldSuppressMergeProgressBeforeFirstFormat(d)).toBe(false);
        expect(d.mergeStreamIndex).toBe(0);
    });

    it('none mode: onDownloadDestinationPath is a no-op', () => {
        const d = baseDownload({ mergeProgressMode: 'none' });
        onDownloadDestinationPath(d, '/tmp/out.mp4');
        expect(d.mergeFormatDestinationSeq).toBeUndefined();
    });
});

describe('isYtDlpMergeSidecarDestination', () => {
    it('identifies sidecar files', () => {
        expect(isYtDlpMergeSidecarDestination('/tmp/thumb.webp')).toBe(true);
        expect(isYtDlpMergeSidecarDestination('/tmp/cover.jpg')).toBe(true);
        expect(isYtDlpMergeSidecarDestination('/tmp/info.info.json')).toBe(true);
        expect(isYtDlpMergeSidecarDestination('/tmp/subs.vtt')).toBe(true);
        expect(isYtDlpMergeSidecarDestination('/tmp/video.mp4')).toBe(false);
        expect(isYtDlpMergeSidecarDestination('/tmp/audio.webm')).toBe(false);
    });
});

// ─── shouldRetryVideoWithRecode ───────────────────────────────────────────────

describe('shouldRetryVideoWithRecode', () => {
    it('returns false on success exit', () => {
        expect(shouldRetryVideoWithRecode('ffmpeg exited', 0)).toBe(false);
    });

    it('returns true for typical ffmpeg merge failures', () => {
        expect(shouldRetryVideoWithRecode('ERROR: ffmpeg exited with code 1', 1)).toBe(true);
        expect(shouldRetryVideoWithRecode('Could not find tag for codec vp9', 1)).toBe(true);
        expect(shouldRetryVideoWithRecode('Postprocessing: Conversion failed', 1)).toBe(true);
    });

    it('returns false for auth or availability errors', () => {
        expect(shouldRetryVideoWithRecode('Sign in to confirm your age', 1)).toBe(false);
        expect(shouldRetryVideoWithRecode('Private video', 1)).toBe(false);
        expect(shouldRetryVideoWithRecode('HTTP Error 403: Forbidden', 1)).toBe(false);
    });
});
