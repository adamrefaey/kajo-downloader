import { describe, expect, it } from 'vitest';
import {
    createLineProcessor,
    formatEta,
    formatSpeed,
    parseStructuredProgress,
    YTDLP_PROGRESS_MARKER
} from '../electron/services/ytdlp/progressParser';

describe('parseStructuredProgress', () => {
    it('parses a valid marker line', () => {
        const line = `${YTDLP_PROGRESS_MARKER}|1024|2048|4096|512.5|90`;
        expect(parseStructuredProgress(line)).toEqual({
            downloadedBytes: 1024,
            totalBytes: 2048,
            totalEstimateBytes: 4096,
            speedBytesPerSec: 512.5,
            etaSeconds: 90
        });
    });

    it('returns null for non-marker or short lines', () => {
        expect(parseStructuredProgress('[download] Destination: a.mp4')).toBeNull();
        expect(parseStructuredProgress(`${YTDLP_PROGRESS_MARKER}|1|2`)).toBeNull();
        expect(parseStructuredProgress(`${YTDLP_PROGRESS_MARKER}|-1|2|3|4|5`)).toBeNull();
        expect(parseStructuredProgress(`${YTDLP_PROGRESS_MARKER}|100|0|0|0|0`)).toEqual({
            downloadedBytes: 100,
            totalBytes: 0,
            totalEstimateBytes: 0,
            speedBytesPerSec: 0,
            etaSeconds: 0
        });
        expect(parseStructuredProgress(`${YTDLP_PROGRESS_MARKER}|bad|1|2|3|4`)).toBeNull();
        expect(parseStructuredProgress(`${YTDLP_PROGRESS_MARKER}|100|x|y|bad|5`)).toEqual({
            downloadedBytes: 100,
            totalBytes: 0,
            totalEstimateBytes: 0,
            speedBytesPerSec: 0,
            etaSeconds: 5
        });
    });
});

describe('formatSpeed / formatEta', () => {
    it('formats positive speed and eta', () => {
        expect(formatSpeed(0)).toBe('--');
        expect(formatSpeed(1024)).toMatch(/\/s$/);
        expect(formatEta(0)).toBe('--');
        expect(formatEta(65)).toBe('1:05');
        expect(formatEta(3661)).toBe('1:01:01');
    });
});

describe('createLineProcessor', () => {
    it('splits chunks on newlines and retains a partial trailing line', () => {
        const lines: string[] = [];
        const proc = createLineProcessor((line) => {
            lines.push(line);
        });
        proc.push('a\nb\nc');
        expect(lines).toEqual(['a', 'b']);
        proc.push('d\n');
        expect(lines).toEqual(['a', 'b', 'cd']);
    });

    it('handles empty push without emitting lines', () => {
        const lines: string[] = [];
        const proc = createLineProcessor((line) => lines.push(line));
        proc.push('');
        expect(lines).toEqual([]);
    });
});
