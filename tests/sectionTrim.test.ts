import { describe, expect, it } from 'vitest';
import {
    estimateBytesForSectionTrim,
    normalizeSectionTrimTimestampDisplay,
    parseSectionTrimTimestampSeconds
} from '../src/shared/sectionTrim';

describe('sectionTrim', () => {
    it('normalizeSectionTrimTimestampDisplay pads hours when valid', () => {
        expect(normalizeSectionTrimTimestampDisplay('0:00:00')).toBe('00:00:00');
        expect(normalizeSectionTrimTimestampDisplay('0:01:30')).toBe('00:01:30');
        expect(normalizeSectionTrimTimestampDisplay('1:00:00')).toBe('01:00:00');
        expect(normalizeSectionTrimTimestampDisplay('12:05:09.25')).toBe('12:05:09.25');
        expect(normalizeSectionTrimTimestampDisplay(' 0:00:01.5 ')).toBe('00:00:01.5');
        expect(normalizeSectionTrimTimestampDisplay('1:2:03')).toBe('1:2:03');
        expect(normalizeSectionTrimTimestampDisplay('')).toBe('');
    });

    it('parseSectionTrimTimestampSeconds', () => {
        expect(parseSectionTrimTimestampSeconds('0:00:00')).toBe(0);
        expect(parseSectionTrimTimestampSeconds('0:01:30')).toBe(90);
        expect(parseSectionTrimTimestampSeconds('1:00:00')).toBe(3600);
        expect(parseSectionTrimTimestampSeconds('0:00:01.5')).toBeCloseTo(1.5);
        expect(parseSectionTrimTimestampSeconds('')).toBeNull();
        expect(parseSectionTrimTimestampSeconds('99:99:99')).toBeNull();
    });

    it('estimateBytesForSectionTrim scales by duration ratio', () => {
        expect(
            estimateBytesForSectionTrim({
                fullFilesizeBytes: 1000,
                fullDurationSeconds: 100,
                trimStart: '0:00:00',
                trimEnd: '0:00:50'
            })
        ).toBe(500);
        expect(
            estimateBytesForSectionTrim({
                fullFilesizeBytes: 1000,
                fullDurationSeconds: 100,
                trimStart: '0:00:00',
                trimEnd: '0:01:40'
            })
        ).toBe(1000);
    });

    it('estimateBytesForSectionTrim returns null for bad inputs', () => {
        expect(
            estimateBytesForSectionTrim({
                fullFilesizeBytes: 0,
                fullDurationSeconds: 100,
                trimStart: '0:00:00',
                trimEnd: '0:00:10'
            })
        ).toBeNull();
        expect(
            estimateBytesForSectionTrim({
                fullFilesizeBytes: 100,
                fullDurationSeconds: 0,
                trimStart: '0:00:00',
                trimEnd: '0:00:10'
            })
        ).toBeNull();
        expect(
            estimateBytesForSectionTrim({
                fullFilesizeBytes: 100,
                fullDurationSeconds: 100,
                trimStart: '0:00:50',
                trimEnd: '0:00:10'
            })
        ).toBeNull();
    });
});
