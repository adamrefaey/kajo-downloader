import { ipcMain } from 'electron';
import { IPC_INVOKE } from '../../src/shared/ipcChannels';
import { IPC_ERROR_CODES, ipcFail } from '../../src/shared/ipcErrors';
import { translateMainError } from '../i18n/mainI18n';
import { tryConsumeIpcRateLimitSlot } from './rateLimiter';
import type { IpcHandlerDeps } from './types';
import { withValidSender } from './validateIpcPayload';

/**
 * In-app YouTube Search IPC handlers:
 *   - youtube:search   — runs the yt-dlp `ytsearchN:` query
 *   - search:get-usage — daily search-count readout (search is unlimited)
 */
export function registerSearchHandlers(deps: IpcHandlerDeps): void {
    ipcMain.handle(
        IPC_INVOKE.searchGetUsage,
        withValidSender(deps, async (_event) => {
            if (!tryConsumeIpcRateLimitSlot(IPC_INVOKE.searchGetUsage)) {
                return null;
            }
            try {
                const { getSearchUsageResponse } = await import('../services/searchUsageStore');
                return getSearchUsageResponse();
            } catch {
                return null;
            }
        })
    );

    ipcMain.handle(
        IPC_INVOKE.youtubeSearch,
        withValidSender(deps, async (_event, rawPayload: unknown) => {
            if (!tryConsumeIpcRateLimitSlot(IPC_INVOKE.youtubeSearch)) {
                return { ok: false as const, error: 'rate_limited' as const };
            }
            const { incrementSearchCount, getSearchUsage } = await import(
                '../services/searchUsageStore'
            );
            const { parseSearchIpcPayload } = await import('../../src/shared/ipcPayloadSchemas');
            const { searchYoutubeInApp } = await import('../services/youtubeInAppSearch');
            const parsed = parseSearchIpcPayload(rawPayload);
            if (!parsed) {
                return ipcFail(
                    IPC_ERROR_CODES.invalidPayload,
                    translateMainError('invalidRendererRequest')
                );
            }
            const { query, maxResults } = parsed;
            if (query.length < 2) {
                return { ok: false as const, error: 'query_too_short' as const };
            }
            try {
                incrementSearchCount();
                const results = await searchYoutubeInApp(query, maxResults);
                return {
                    ok: true as const,
                    results,
                    usage: getSearchUsage()
                };
            } catch (err) {
                return {
                    ok: false as const,
                    error: err instanceof Error ? err.message : 'Search failed'
                };
            }
        })
    );
}
