import { resolve, sep } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { isPathInsideRoot } from '../electron/lib/isPathInsideRoot';

describe('isPathInsideRoot', () => {
    const root = resolve('/Users/me/Downloads');

    afterEach(() => {
        vi.unstubAllGlobals();
    });

    it('allows the root itself', () => {
        expect(isPathInsideRoot(root, root)).toBe(true);
        expect(isPathInsideRoot(`${root}${sep}`, root)).toBe(true);
    });

    it('allows paths under the root', () => {
        expect(isPathInsideRoot(root, joinUnder(root, 'playlist', 'video.mp4'))).toBe(true);
        expect(isPathInsideRoot(`${root}${sep}`, joinUnder(root, 'nested'))).toBe(true);
    });

    it('denies paths outside the root', () => {
        expect(isPathInsideRoot(root, '/Users/me/Other')).toBe(false);
        expect(isPathInsideRoot(root, '/Users/me/Downloads-evil')).toBe(false);
        expect(isPathInsideRoot(root, joinUnder(root, '..', 'secret'))).toBe(false);
    });

    it('denies when root is empty / whitespace', () => {
        expect(isPathInsideRoot('', '/tmp/x')).toBe(false);
        expect(isPathInsideRoot('   ', '/tmp/x')).toBe(false);
    });

    it('resolves relative candidates against cwd before comparing', () => {
        expect(isPathInsideRoot(process.cwd(), 'package.json')).toBe(true);
        expect(isPathInsideRoot(root, 'package.json')).toBe(false);
    });

    it('uses case-insensitive prefix matching when platform is win32', () => {
        const platformSpy = vi.spyOn(process, 'platform', 'get').mockReturnValue('win32');
        try {
            expect(isPathInsideRoot(root, joinUnder(root, 'clip.mp4'))).toBe(true);
            expect(isPathInsideRoot(root, '/Users/me/Other/clip.mp4')).toBe(false);
        } finally {
            platformSpy.mockRestore();
        }
    });
});

function joinUnder(root: string, ...parts: string[]): string {
    return resolve(root, ...parts);
}
