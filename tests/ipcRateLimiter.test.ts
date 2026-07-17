import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
    IPC_RATE_LIMITED_MUTATING_CHANNELS,
    IPC_RATE_LIMITS,
    isIpcCallAllowed,
    resetRateLimiterForTests,
    tryConsumeIpcRateLimitSlot
} from '../electron/ipc/rateLimiter';
import { IPC_INVOKE } from '../src/shared/ipcChannels';

describe('ipcRateLimiter', () => {
    beforeEach(() => {
        vi.useFakeTimers();
        resetRateLimiterForTests();
    });

    afterEach(() => {
        vi.useRealTimers();
    });

    it('tryConsumeIpcRateLimitSlot skips limits for unlisted channels', () => {
        expect(tryConsumeIpcRateLimitSlot('unlisted-test-channel')).toBe(true);
        expect(tryConsumeIpcRateLimitSlot('unlisted-test-channel')).toBe(true);
    });

    it('tryConsumeIpcRateLimitSlot enforces IPC_RATE_LIMITS for download:start', () => {
        const ch = IPC_INVOKE.downloadStart;
        const rateCfg = IPC_RATE_LIMITS[ch];
        if (!rateCfg) throw new Error(`no rate config for ${ch}`);
        const { maxCalls, windowMs } = rateCfg;
        for (let i = 0; i < maxCalls; i++) {
            expect(tryConsumeIpcRateLimitSlot(ch)).toBe(true);
        }
        expect(tryConsumeIpcRateLimitSlot(ch)).toBe(false);
        vi.advanceTimersByTime(windowMs + 1);
        expect(tryConsumeIpcRateLimitSlot(ch)).toBe(true);
    });

    it('allows calls within the limit', () => {
        const config = { maxCalls: 3, windowMs: 1_000 };
        expect(isIpcCallAllowed('test-channel', config)).toBe(true);
        expect(isIpcCallAllowed('test-channel', config)).toBe(true);
        expect(isIpcCallAllowed('test-channel', config)).toBe(true);
    });

    it('rejects calls exceeding the limit', () => {
        const config = { maxCalls: 2, windowMs: 1_000 };
        expect(isIpcCallAllowed('test-channel', config)).toBe(true);
        expect(isIpcCallAllowed('test-channel', config)).toBe(true);
        expect(isIpcCallAllowed('test-channel', config)).toBe(false);
        expect(isIpcCallAllowed('test-channel', config)).toBe(false);
    });

    it('prunes expired timestamps and allows new calls after the window passes', () => {
        const config = { maxCalls: 2, windowMs: 1_000 };
        expect(isIpcCallAllowed('test-channel', config)).toBe(true);
        expect(isIpcCallAllowed('test-channel', config)).toBe(true);
        expect(isIpcCallAllowed('test-channel', config)).toBe(false);

        // Advance past the window
        vi.advanceTimersByTime(1_001);

        // Old timestamps are now expired; calls should be allowed again
        expect(isIpcCallAllowed('test-channel', config)).toBe(true);
        expect(isIpcCallAllowed('test-channel', config)).toBe(true);
    });

    it('maintains independent windows per channel', () => {
        const config = { maxCalls: 1, windowMs: 1_000 };
        expect(isIpcCallAllowed('channel-a', config)).toBe(true);
        expect(isIpcCallAllowed('channel-a', config)).toBe(false);

        // Different channel is unaffected
        expect(isIpcCallAllowed('channel-b', config)).toBe(true);
        expect(isIpcCallAllowed('channel-b', config)).toBe(false);
    });

    it('resetRateLimiterForTests clears all state', () => {
        const config = { maxCalls: 1, windowMs: 1_000 };
        expect(isIpcCallAllowed('test-channel', config)).toBe(true);
        expect(isIpcCallAllowed('test-channel', config)).toBe(false);

        resetRateLimiterForTests();

        expect(isIpcCallAllowed('test-channel', config)).toBe(true);
    });

    it('allows exactly maxCalls and rejects the next one', () => {
        const config = { maxCalls: 5, windowMs: 2_000 };
        for (let i = 0; i < 5; i++) {
            expect(isIpcCallAllowed('exact-channel', config)).toBe(true);
        }
        expect(isIpcCallAllowed('exact-channel', config)).toBe(false);
    });

    it('handles the window boundary — timestamps at exactly cutoff are pruned', () => {
        const config = { maxCalls: 1, windowMs: 1_000 };

        // First call at t=0
        expect(isIpcCallAllowed('boundary', config)).toBe(true);
        expect(isIpcCallAllowed('boundary', config)).toBe(false);

        // Advance exactly to the window boundary (t=1000)
        // The timestamp at t=0 has cutoff = 1000 - 1000 = 0, and 0 <= 0 is true → pruned
        vi.advanceTimersByTime(1_000);

        expect(isIpcCallAllowed('boundary', config)).toBe(true);
    });

    it('partially prunes old entries while keeping recent ones', () => {
        const config = { maxCalls: 3, windowMs: 1_000 };

        // t=0: first call
        expect(isIpcCallAllowed('partial', config)).toBe(true);

        // t=500: second call
        vi.advanceTimersByTime(500);
        expect(isIpcCallAllowed('partial', config)).toBe(true);

        // t=1001: first call expires, second still valid
        vi.advanceTimersByTime(501);
        // Window now holds 1 entry (t=500), so 2 more are allowed
        expect(isIpcCallAllowed('partial', config)).toBe(true);
        expect(isIpcCallAllowed('partial', config)).toBe(true);
        expect(isIpcCallAllowed('partial', config)).toBe(false);
    });

    it('exports default rate-limit configs for known channels', () => {
        expect(IPC_RATE_LIMITS[IPC_INVOKE.downloadFetchVideoInfo]).toEqual({
            maxCalls: 10,
            windowMs: 5_000
        });
        expect(IPC_RATE_LIMITS[IPC_INVOKE.downloadStart]).toEqual({ maxCalls: 5, windowMs: 5_000 });
        expect(IPC_RATE_LIMITS[IPC_INVOKE.youtubeSearch]).toEqual({
            maxCalls: 6,
            windowMs: 10_000
        });
        expect(IPC_RATE_LIMITS[IPC_INVOKE.searchGetUsage]).toEqual({
            maxCalls: 20,
            windowMs: 5_000
        });
    });

    it('lists a rate-limit config for every mutating IPC channel', () => {
        for (const channel of IPC_RATE_LIMITED_MUTATING_CHANNELS) {
            expect(IPC_RATE_LIMITS[channel], channel).toEqual(
                expect.objectContaining({
                    maxCalls: expect.any(Number) as number,
                    windowMs: expect.any(Number) as number
                })
            );
        }
        expect(IPC_RATE_LIMITS[IPC_INVOKE.siteAuthSave]).toBeDefined();
        expect(IPC_RATE_LIMITS[IPC_INVOKE.siteAuthClearSignedSite]).toBeDefined();
        expect(IPC_RATE_LIMITS[IPC_INVOKE.settingsSelectOutputFolder]).toBeDefined();
        expect(IPC_RATE_LIMITS[IPC_INVOKE.downloadPlaylistStreamCancel]).toBeDefined();
    });
});
