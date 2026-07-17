import { afterEach, describe, expect, it, vi } from 'vitest';
import { bestEffort } from '../electron/lib/bestEffort';

describe('bestEffort', () => {
    afterEach(() => {
        vi.restoreAllMocks();
    });

    it('does not throw when the promise resolves', async () => {
        const p = Promise.resolve('ok');
        expect(() => bestEffort('test-op', p)).not.toThrow();
        await p; // allow promise to settle
    });

    it('does not propagate rejection (swallows the error)', async () => {
        // Returning a rejected promise to bestEffort should not cause an unhandled rejection
        const failed = Promise.reject(new Error('deliberate failure'));
        expect(() => bestEffort('failing-op', failed)).not.toThrow();
        // allow microtask queue to process without re-throwing
        await new Promise<void>((resolve) => setTimeout(resolve, 0));
    });

    it('logs a debug message when the promise rejects', async () => {
        const { mainLog } = await import('../electron/mainLogger');
        const debugSpy = vi.spyOn(mainLog, 'debug').mockImplementation(() => {});

        const failed = Promise.reject(new Error('network error'));
        bestEffort('fetch-metadata', failed);
        // Wait for catch handler
        await new Promise<void>((resolve) => setTimeout(resolve, 0));

        expect(debugSpy).toHaveBeenCalledWith('[bestEffort] fetch-metadata failed', {
            err: 'Error: network error'
        });
    });

    it('returns void (callers should not await the result)', () => {
        const result = bestEffort('void-test', Promise.resolve());
        expect(result).toBeUndefined();
    });
});
