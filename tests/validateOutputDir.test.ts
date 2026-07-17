import { describe, expect, it } from 'vitest';
import { isAcceptableOutputDir, resolveTrustedOutputDir } from '../electron/lib/validateOutputDir';

describe('validateOutputDir', () => {
    it('accepts absolute paths and rejects relative / empty / NUL', () => {
        expect(isAcceptableOutputDir('/tmp/out')).toBe(true);
        expect(isAcceptableOutputDir('  /tmp/out  ')).toBe(true);
        expect(isAcceptableOutputDir('relative')).toBe(false);
        expect(isAcceptableOutputDir('')).toBe(false);
        expect(isAcceptableOutputDir('/tmp/\0evil')).toBe(false);
    });

    it('resolveTrustedOutputDir normalizes valid paths and falls back otherwise', () => {
        expect(resolveTrustedOutputDir('/tmp/out', '/fallback')).toBe('/tmp/out');
        expect(resolveTrustedOutputDir('relative', '/fallback')).toBe('/fallback');
        expect(resolveTrustedOutputDir(null, '/fallback')).toBe('/fallback');
        expect(resolveTrustedOutputDir('  /tmp/nested/../out  ', '/fallback')).toBe('/tmp/out');
    });
});
