import { describe, expect, it } from 'vitest';
import { formatBytes, parseYtDlpOfTotalToBytes } from '../src/shared/formatBytes';

describe('formatBytes', () => {
    it('formats small and multi-unit values', () => {
        expect(formatBytes(500)).toMatch(/B$/);
        expect(formatBytes(2048)).toContain('KB');
    });
});

describe('parseYtDlpOfTotalToBytes', () => {
    it('parses common yt-dlp fragments', () => {
        expect(parseYtDlpOfTotalToBytes('12.34MiB')).toBe(Math.round(12.34 * 1024 ** 2));
        expect(parseYtDlpOfTotalToBytes('1.00GiB')).toBe(Math.round(1 * 1024 ** 3));
        expect(parseYtDlpOfTotalToBytes('--')).toBeUndefined();
        expect(parseYtDlpOfTotalToBytes('')).toBeUndefined();
    });
});
