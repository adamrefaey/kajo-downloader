/**
 * Sliding-window rate limiter for IPC handlers.
 * Prevents a compromised renderer from flooding expensive main-process operations.
 */

import { IPC_INVOKE } from '../../src/shared/ipcChannels';

interface RateLimitConfig {
    /** Maximum calls allowed within the window. */
    maxCalls: number;
    /** Window duration in milliseconds. */
    windowMs: number;
}

/** Per-channel sliding window: an array of invocation timestamps. */
const windows = new Map<string, number[]>();

/**
 * Check whether a call to `channel` is allowed under the given rate-limit config.
 * Returns `true` if the call is allowed, `false` if rate-limited.
 * Automatically prunes expired timestamps from the window.
 */
export function isIpcCallAllowed(channel: string, config: RateLimitConfig): boolean {
    const now = Date.now();
    const cutoff = now - config.windowMs;

    let timestamps = windows.get(channel);
    if (!timestamps) {
        timestamps = [];
        windows.set(channel, timestamps);
    }

    // Prune expired entries
    while (timestamps.length > 0) {
        const head = timestamps[0];
        if (head === undefined || head > cutoff) break;
        timestamps.shift();
    }

    if (timestamps.length >= config.maxCalls) {
        return false;
    }

    timestamps.push(now);
    return true;
}

/**
 * If the channel has a limit config, consumes one slot when under the cap.
 * Channels without config always return true.
 */
export function tryConsumeIpcRateLimitSlot(channel: string): boolean {
    const config = IPC_RATE_LIMITS[channel];
    if (!config) {
        return true;
    }
    return isIpcCallAllowed(channel, config);
}

/** Default rate-limit configs for expensive or destructive IPC channels (global per channel). */
export const IPC_RATE_LIMITS: Record<string, RateLimitConfig> = {
    [IPC_INVOKE.downloadFetchVideoInfo]: { maxCalls: 10, windowMs: 5_000 },
    [IPC_INVOKE.downloadFetchPlaylistInfo]: { maxCalls: 10, windowMs: 5_000 },
    [IPC_INVOKE.downloadPlaylistStreamStart]: { maxCalls: 10, windowMs: 5_000 },
    [IPC_INVOKE.downloadMetadataResolveUrl]: { maxCalls: 10, windowMs: 5_000 },
    [IPC_INVOKE.downloadStart]: { maxCalls: 5, windowMs: 5_000 },
    [IPC_INVOKE.downloadPreparePlaylistOutputDir]: { maxCalls: 20, windowMs: 5_000 },
    [IPC_INVOKE.downloadPrepareChannelOutputDir]: { maxCalls: 20, windowMs: 5_000 },
    [IPC_INVOKE.downloadCheckFilePaths]: { maxCalls: 30, windowMs: 5_000 },
    [IPC_INVOKE.downloadCancel]: { maxCalls: 60, windowMs: 5_000 },
    [IPC_INVOKE.downloadPause]: { maxCalls: 60, windowMs: 5_000 },
    [IPC_INVOKE.downloadResume]: { maxCalls: 60, windowMs: 5_000 },
    [IPC_INVOKE.downloadCleanupArtifacts]: { maxCalls: 30, windowMs: 5_000 },
    [IPC_INVOKE.downloadCleanupEmptyBatchDirs]: { maxCalls: 20, windowMs: 5_000 },
    [IPC_INVOKE.settingsSelectOutputFolder]: { maxCalls: 6, windowMs: 10_000 },
    [IPC_INVOKE.settingsSet]: { maxCalls: 30, windowMs: 5_000 },
    [IPC_INVOKE.settingsProxySetProfileUrl]: { maxCalls: 10, windowMs: 5_000 },
    [IPC_INVOKE.youtubeSearch]: { maxCalls: 6, windowMs: 10_000 },
    [IPC_INVOKE.searchGetUsage]: { maxCalls: 20, windowMs: 5_000 },
    [IPC_INVOKE.siteAuthOpen]: { maxCalls: 6, windowMs: 10_000 },
    [IPC_INVOKE.siteAuthSave]: { maxCalls: 6, windowMs: 10_000 },
    [IPC_INVOKE.siteAuthClearSignedSite]: { maxCalls: 10, windowMs: 10_000 },
    [IPC_INVOKE.downloadPlaylistStreamCancel]: { maxCalls: 30, windowMs: 5_000 },
    [IPC_INVOKE.setupInstallYtdlp]: { maxCalls: 2, windowMs: 60_000 },
    [IPC_INVOKE.downloadHistoryList]: { maxCalls: 30, windowMs: 5_000 },
    [IPC_INVOKE.downloadHistoryClear]: { maxCalls: 3, windowMs: 60_000 },
    [IPC_INVOKE.authOpenExternal]: { maxCalls: 10, windowMs: 5_000 },
    [IPC_INVOKE.localFilesOpenPath]: { maxCalls: 20, windowMs: 5_000 },
    [IPC_INVOKE.localFilesRevealPath]: { maxCalls: 20, windowMs: 5_000 },
    [IPC_INVOKE.appReportRendererError]: { maxCalls: 20, windowMs: 10_000 }
};

/**
 * Mutating / expensive invoke channels that must appear in {@link IPC_RATE_LIMITS}.
 * Read-only getters (settings get, history total, nav chrome) are intentionally omitted.
 */
export const IPC_RATE_LIMITED_MUTATING_CHANNELS: readonly string[] = [
    IPC_INVOKE.downloadFetchVideoInfo,
    IPC_INVOKE.downloadFetchPlaylistInfo,
    IPC_INVOKE.downloadPlaylistStreamStart,
    IPC_INVOKE.downloadPlaylistStreamCancel,
    IPC_INVOKE.downloadMetadataResolveUrl,
    IPC_INVOKE.downloadStart,
    IPC_INVOKE.downloadPreparePlaylistOutputDir,
    IPC_INVOKE.downloadPrepareChannelOutputDir,
    IPC_INVOKE.downloadCheckFilePaths,
    IPC_INVOKE.downloadCancel,
    IPC_INVOKE.downloadPause,
    IPC_INVOKE.downloadResume,
    IPC_INVOKE.downloadCleanupArtifacts,
    IPC_INVOKE.downloadCleanupEmptyBatchDirs,
    IPC_INVOKE.downloadHistoryList,
    IPC_INVOKE.downloadHistoryClear,
    IPC_INVOKE.settingsSelectOutputFolder,
    IPC_INVOKE.settingsSet,
    IPC_INVOKE.settingsProxySetProfileUrl,
    IPC_INVOKE.setupInstallYtdlp,
    IPC_INVOKE.authOpenExternal,
    IPC_INVOKE.siteAuthOpen,
    IPC_INVOKE.siteAuthSave,
    IPC_INVOKE.siteAuthClearSignedSite,
    IPC_INVOKE.searchGetUsage,
    IPC_INVOKE.youtubeSearch,
    IPC_INVOKE.localFilesOpenPath,
    IPC_INVOKE.localFilesRevealPath,
    IPC_INVOKE.appReportRendererError
];

/** Reset all windows (for testing). */
export function resetRateLimiterForTests(): void {
    windows.clear();
}
