import { describe, expect, it } from 'vitest';
import { displayProgressPercent } from './displayProgressPercent';

describe('displayProgressPercent', () => {
    it('returns 0 for non-finite values', () => {
        expect(displayProgressPercent(Number.NaN)).toBe(0);
        expect(displayProgressPercent(Number.POSITIVE_INFINITY)).toBe(0);
        expect(displayProgressPercent(Number.NEGATIVE_INFINITY)).toBe(0);
    });

    it('rounds and clamps to 0–100', () => {
        expect(displayProgressPercent(50.4)).toBe(50);
        expect(displayProgressPercent(50.6)).toBe(51);
        expect(displayProgressPercent(-10)).toBe(0);
        expect(displayProgressPercent(100.7)).toBe(100);
        expect(displayProgressPercent(0)).toBe(0);
        expect(displayProgressPercent(100)).toBe(100);
    });
});
