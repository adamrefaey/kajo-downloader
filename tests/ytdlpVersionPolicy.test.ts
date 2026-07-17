import { describe, expect, it } from 'vitest';
import {
    compareYtDlpCalver,
    isYtDlpVersionAtLeast,
    MIN_YTDLP_VERSION,
    parseYtDlpVersionLine
} from '../src/shared/ytdlpVersionPolicy';

describe('ytdlpVersionPolicy', () => {
    it('parses CalVer from yt-dlp --version style output', () => {
        expect(parseYtDlpVersionLine('2026.03.17')).toBe('2026.03.17');
        expect(parseYtDlpVersionLine('yt-dlp 2025.01.15\nother')).toBe('2025.01.15');
        expect(parseYtDlpVersionLine('2025.12.31.999')).toBe('2025.12.31.999');
        expect(parseYtDlpVersionLine('no version here')).toBeNull();
    });

    it('compares CalVer chronologically', () => {
        expect(compareYtDlpCalver('2025.01.15', '2025.01.14')).toBeGreaterThan(0);
        expect(compareYtDlpCalver('2024.12.31', '2025.01.01')).toBeLessThan(0);
        expect(compareYtDlpCalver('2025.03.21', '2025.03.21')).toBe(0);
        expect(compareYtDlpCalver('2025.03.21.1', '2025.03.21')).toBeGreaterThan(0);
    });

    it('MIN_YTDLP_VERSION is a valid baseline for gating', () => {
        expect(MIN_YTDLP_VERSION).toMatch(/^\d{4}\.\d{2}\.\d{2}$/);
        expect(isYtDlpVersionAtLeast(MIN_YTDLP_VERSION, MIN_YTDLP_VERSION)).toBe(true);
        expect(isYtDlpVersionAtLeast('2099.01.01', MIN_YTDLP_VERSION)).toBe(true);
        expect(isYtDlpVersionAtLeast('2020.01.01', MIN_YTDLP_VERSION)).toBe(false);
    });
});
