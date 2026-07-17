/** @vitest-environment jsdom */

import { afterEach, describe, expect, it, vi } from 'vitest';
import { createSafeLocalJsonStorage } from '../src/store/safeLocalJsonStorage';

describe('createSafeLocalJsonStorage', () => {
    afterEach(() => {
        localStorage.clear();
        vi.restoreAllMocks();
    });

    it('setItem writes JSON and getItem reads it back', () => {
        const store = createSafeLocalJsonStorage<{ x: number }>();
        store.setItem('k', { state: { x: 1 }, version: 0 });
        const val = store.getItem('k');
        expect(val).toEqual({ state: { x: 1 }, version: 0 });
    });

    it('getItem returns null for missing key', () => {
        const store = createSafeLocalJsonStorage<{ x: number }>();
        expect(store.getItem('missing')).toBeNull();
    });

    it('getItem drops corrupt data and returns null', () => {
        localStorage.setItem('bad', '{not valid json');
        const store = createSafeLocalJsonStorage<{ x: number }>();
        expect(store.getItem('bad')).toBeNull();
        expect(localStorage.getItem('bad')).toBeNull();
    });

    it('setItem logs a warning and does not throw when localStorage.setItem throws', () => {
        const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
        const original = Storage.prototype.setItem;
        Storage.prototype.setItem = () => {
            throw new Error('QuotaExceededError');
        };
        try {
            const store = createSafeLocalJsonStorage<{ x: number }>();
            expect(() => store.setItem('k', { state: { x: 1 }, version: 0 })).not.toThrow();
            expect(warnSpy).toHaveBeenCalledWith(
                expect.stringContaining('Failed to write'),
                'k',
                expect.anything()
            );
        } finally {
            Storage.prototype.setItem = original;
        }
    });

    it('removeItem removes a stored key', () => {
        const store = createSafeLocalJsonStorage<{ x: number }>();
        store.setItem('k', { state: { x: 42 }, version: 0 });
        store.removeItem('k');
        expect(store.getItem('k')).toBeNull();
    });
});
