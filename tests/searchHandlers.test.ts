import { beforeEach, describe, expect, it, vi } from 'vitest';
import { IPC_INVOKE } from '../src/shared/ipcChannels';

const ipcHandleSpy = vi.hoisted(() => vi.fn());
const tryConsumeIpcRateLimitSlot = vi.hoisted(() => vi.fn(() => true));
const searchYoutubeInApp = vi.hoisted(() => vi.fn());
const incrementSearchCount = vi.hoisted(() => vi.fn());
const getSearchUsage = vi.hoisted(() =>
    vi.fn(() => ({ count: 1, cap: -1, dateKey: '2026-07-17' }))
);
const getSearchUsageResponse = vi.hoisted(() =>
    vi.fn(() => ({ search: { count: 0, cap: -1, dateKey: '2026-07-17' } }))
);

vi.mock('electron', () => ({
    ipcMain: { handle: ipcHandleSpy }
}));

vi.mock('../electron/ipc/rateLimiter', () => ({
    tryConsumeIpcRateLimitSlot
}));

vi.mock('../electron/services/searchUsageStore', () => ({
    getSearchUsageResponse,
    incrementSearchCount,
    getSearchUsage
}));

vi.mock('../electron/services/youtubeInAppSearch', () => ({
    searchYoutubeInApp
}));

vi.mock('../electron/i18n/mainI18n', () => ({
    translateMainError: (key: string) => key
}));

import { registerSearchHandlers } from '../electron/ipc/searchHandlers';
import type { IpcHandlerDeps } from '../electron/ipc/types';

describe('searchHandlers', () => {
    let handlers = new Map<string, (...args: unknown[]) => Promise<unknown>>();

    const mockDeps = {
        isValidIpcSender: vi.fn(() => true)
    } as unknown as IpcHandlerDeps;

    beforeEach(() => {
        handlers = new Map();
        ipcHandleSpy.mockImplementation(
            (channel: string, handler: (...args: unknown[]) => unknown) => {
                handlers.set(channel, handler as (...args: unknown[]) => Promise<unknown>);
            }
        );
        tryConsumeIpcRateLimitSlot.mockReset().mockReturnValue(true);
        searchYoutubeInApp.mockReset().mockResolvedValue([{ title: 'Video', url: 'https://x' }]);
        incrementSearchCount.mockReset();
        getSearchUsage.mockReset().mockReturnValue({ count: 1, cap: -1, dateKey: '2026-07-17' });
        getSearchUsageResponse.mockReset().mockReturnValue({
            search: { count: 0, cap: -1, dateKey: '2026-07-17' }
        });
        registerSearchHandlers(mockDeps);
    });

    it('youtubeSearch rejects queries shorter than two characters', async () => {
        const handler = handlers.get(IPC_INVOKE.youtubeSearch);
        const result = await handler?.({}, { query: 'a', platforms: ['youtube'], maxResults: 5 });
        expect(result).toEqual({ ok: false, error: 'query_too_short' });
        expect(searchYoutubeInApp).not.toHaveBeenCalled();
    });

    it('youtubeSearch returns rate_limited when the slot is exhausted', async () => {
        tryConsumeIpcRateLimitSlot.mockReturnValue(false);
        const handler = handlers.get(IPC_INVOKE.youtubeSearch);
        const result = await handler?.(
            {},
            { query: 'cats', platforms: ['youtube'], maxResults: 5 }
        );
        expect(result).toEqual({ ok: false, error: 'rate_limited' });
    });

    it('searchGetUsage returns null when rate limited', async () => {
        tryConsumeIpcRateLimitSlot.mockReturnValue(false);
        const handler = handlers.get(IPC_INVOKE.searchGetUsage);
        await expect(handler?.({})).resolves.toBeNull();
        expect(getSearchUsageResponse).not.toHaveBeenCalled();
    });
});
