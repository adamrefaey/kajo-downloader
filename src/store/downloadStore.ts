import { z } from 'zod';
import type { UseBoundStore } from 'zustand';
import { create } from 'zustand';
import type { PersistOptions } from 'zustand/middleware';
import { persist } from 'zustand/middleware';
import type { StoreApi } from 'zustand/vanilla';
import { normalizeAdvancedDownloadDefaults } from '../shared/advancedDownloadSettings';
import { type AppSettings, DEFAULT_NOTIFICATION_SETTINGS, type DownloadItem } from '../types';
import { createSafeLocalJsonStorage } from './safeLocalJsonStorage';

const downloadStateSchema = z.enum([
    'pending',
    'starting',
    'downloading',
    'paused',
    'complete',
    'error',
    'cancelled'
]);

/** Validates the minimum required shape for a persisted DownloadItem; extra keys pass through. */
const persistedDownloadItemSchema = z
    .object({
        id: z.string().min(1),
        url: z.string().min(1),
        formatId: z.string().min(1),
        outputDir: z.string(),
        state: downloadStateSchema,
        createdAt: z.number().finite()
    })
    .passthrough();

const DEFAULT_SETTINGS: AppSettings = {
    outputDir: '',
    maxConcurrentDownloads: 1,
    preferredQuality: 1080,
    uiLocale: '',
    advancedDownloadDefaults: normalizeAdvancedDownloadDefaults(undefined),
    proxyConfigured: false,
    notificationSettings: DEFAULT_NOTIFICATION_SETTINGS
};

export interface AddDownloadPayload {
    id?: string | undefined;
    url: string;
    siteId?: string | undefined;
    siteDomain?: string | undefined;
    extractorKey?: string | undefined;
    authRequired?: boolean | undefined;
    formatId: string;
    audioOnly?: boolean | undefined;
    videoHeight?: number | undefined;
    outputTemplate?: string | undefined;
    outputDir: string;
    progressVideoBytes?: number | undefined;
    progressAudioBytes?: number | undefined;
    totalSize?: string | undefined;
    sizeEstimateFullBytes?: number | undefined;
    mediaDurationSeconds?: number | undefined;
    title?: string | undefined;
    channel?: string | undefined;
    thumbnailUrl?: string | undefined;
    playlistId?: string | undefined;
    playlistTitle?: string | undefined;
    batchGroupId?: string | undefined;
    batchSourceUrl?: string | undefined;
    batchSiteLabel?: string | undefined;
    batchExtractedAt?: number | undefined;
    liveStatus?: string | undefined;
    createdAt?: number | undefined;
    sectionTrim?: { start: string; end: string } | undefined;
}

export interface DownloadProgressPayload {
    percent: number;
    size?: string | undefined;
    speed?: string | undefined;
    eta?: string | undefined;
    /** Live total from main (yt-dlp progress); refines metadata-only queue estimates. */
    totalSize?: string | undefined;
    /** Canonical bytes for `totalSize`; UI should format with the shared `formatBytes` helper. */
    totalSizeBytes?: number | undefined;
}

interface DownloadStoreState {
    queue: DownloadItem[];
    settings: AppSettings;
    addDownload: (payload: AddDownloadPayload) => string;
    /** Prepend many items in one update (playlist/channel batch), preserving payload order. */
    prependDownloads: (payloads: AddDownloadPayload[]) => string[];
    updateDownloadProgress: (downloadId: string, payload: DownloadProgressPayload) => void;
    completeDownload: (
        downloadId: string,
        filePath?: string | null,
        completedTotalSize?: string,
        completedTotalSizeBytes?: number,
        contentSha256?: string | null
    ) => void;
    cancelDownload: (downloadId: string) => void;
    removeDownload: (downloadId: string) => void;
    updateDownload: (downloadId: string, patch: Partial<DownloadItem>) => void;
    /** When async metadata delivers a data-URL thumb, patch matching queued rows (same canonical page). */
    upgradeThumbnailsForMediaPage: (mediaPageUrl: string, thumbnailUrl: string) => void;
    setSettings: (patch: Partial<AppSettings>) => void;
    hydrateSettings: (settings: AppSettings | null) => void;
}

function createDownloadItem(payload: AddDownloadPayload): DownloadItem {
    return {
        id: payload.id ?? crypto.randomUUID(),
        url: payload.url,
        siteId: payload.siteId,
        siteDomain: payload.siteDomain,
        extractorKey: payload.extractorKey,
        authRequired: payload.authRequired,
        title: payload.title,
        channel: payload.channel,
        thumbnailUrl: payload.thumbnailUrl,
        playlistId: payload.playlistId,
        playlistTitle: payload.playlistTitle,
        batchGroupId: payload.batchGroupId,
        batchSourceUrl: payload.batchSourceUrl,
        batchSiteLabel: payload.batchSiteLabel,
        batchExtractedAt: payload.batchExtractedAt,
        liveStatus: payload.liveStatus,
        formatId: payload.formatId,
        audioOnly: payload.audioOnly,
        videoHeight: payload.videoHeight,
        outputTemplate: payload.outputTemplate,
        outputDir: payload.outputDir,
        progressVideoBytes: payload.progressVideoBytes,
        progressAudioBytes: payload.progressAudioBytes,
        totalSize: payload.totalSize,
        sizeEstimateFullBytes: payload.sizeEstimateFullBytes,
        mediaDurationSeconds: payload.mediaDurationSeconds,
        sectionTrim: payload.sectionTrim,
        state: 'pending',
        createdAt: payload.createdAt ?? Date.now()
    };
}

function updateItemById(
    queue: DownloadItem[],
    downloadId: string,
    updater: (item: DownloadItem) => DownloadItem
): DownloadItem[] {
    let index = -1;
    for (let i = 0; i < queue.length; i += 1) {
        if (queue[i]?.id === downloadId) {
            index = i;
            break;
        }
    }
    if (index < 0) {
        return queue;
    }

    const current = queue[index];
    /* v8 ignore start — index is validated above via findIndex */
    if (!current) {
        return queue;
    }
    /* v8 ignore stop */
    const updated = updater(current);
    if (updated === current) {
        return queue;
    }

    const nextQueue = queue.slice();
    nextQueue[index] = updated;
    return nextQueue;
}

function clampProgressPercent(percent: number): number {
    if (!Number.isFinite(percent)) {
        return 0;
    }
    return Math.max(0, Math.min(100, Math.round(percent)));
}

const RESUME_TERMINAL_STATES = new Set<DownloadItem['state']>(['complete', 'cancelled', 'error']);

/**
 * Transform a freshly hydrated queue so unfinished downloads resume on next launch:
 * - in-flight rows (`downloading`/`starting`) → `pending`, clearing stale live-progress, so the
 *   concurrency controller re-invokes them (yt-dlp continues from the preserved `.part`/fragments).
 * - prune terminal rows older than 7 days or beyond the 500-item cap (keeps the queue bounded).
 *
 * This MUST run inside `merge`, NOT `onRehydrateStorage`: persist hydrates synchronously during
 * `create()`, before the `useDownloadStore` export is assigned, so an `onRehydrateStorage` hook that
 * calls `useDownloadStore.setState(...)` throws "Cannot read properties of undefined" — the reset
 * then silently never runs, leaving restored downloads stuck in `downloading`/`starting` and unable
 * to resume after an app restart. `merge` returns the state directly, so it needs no such reference.
 */
function restoreHydratedQueue(queue: DownloadItem[]): DownloadItem[] {
    const reset = queue.map((item) =>
        item.state === 'downloading' || item.state === 'starting'
            ? {
                  ...item,
                  state: 'pending' as const,
                  pauseReason: undefined,
                  progressPercent: undefined,
                  speed: undefined,
                  eta: undefined,
                  // Stale live total from the previous run; non-live estimates live in
                  // sizeEstimateFullBytes and are regenerated by the UI for display.
                  totalSize: undefined
              }
            : item
    );

    const cutoff = Date.now() - 7 * 24 * 60 * 60 * 1000;
    const MAX_TERMINAL_COUNT = 500;
    let pruned = reset.filter(
        (item) => !RESUME_TERMINAL_STATES.has(item.state) || item.createdAt >= cutoff
    );

    const terminal = pruned.filter((item) => RESUME_TERMINAL_STATES.has(item.state));
    if (terminal.length > MAX_TERMINAL_COUNT) {
        terminal.sort((a, b) => b.createdAt - a.createdAt);
        const keepIds = new Set(terminal.slice(0, MAX_TERMINAL_COUNT).map((i) => i.id));
        pruned = pruned.filter(
            (item) => !RESUME_TERMINAL_STATES.has(item.state) || keepIds.has(item.id)
        );
    }

    return pruned;
}

/**
 * Exported for tests: verifies the resume reset/prune runs inside `merge` (the create-time
 * hydration path) rather than a store-export-dependent `onRehydrateStorage` hook.
 */
export function mergePersistedDownloadState(
    persisted: unknown,
    current: DownloadStoreState
): DownloadStoreState {
    if (!persisted || typeof persisted !== 'object') {
        return current;
    }
    const p = persisted as Partial<Pick<DownloadStoreState, 'queue'>>;
    const queue: DownloadItem[] = restoreHydratedQueue(
        Array.isArray(p.queue)
            ? (p.queue as unknown[]).filter(
                  (item): item is DownloadItem =>
                      persistedDownloadItemSchema.safeParse(item).success
              )
            : []
    );

    return {
        ...current,
        queue
    };
}

function stripWwwHost(host: string): string {
    const h = host.toLowerCase();
    return h.startsWith('www.') ? h.slice(4) : h;
}

/**
 * Returns true for live / past-live download items where yt-dlp HLS progress size estimates are
 * known to be unreliable (derived from manifest peak BANDWIDTH, not average encoded bitrate).
 */
function isLiveStreamItem(liveStatus: string | undefined): boolean {
    return liveStatus === 'is_live' || liveStatus === 'was_live' || liveStatus === 'post_live';
}

/** Loose match for canonical yt-dlp `webpage_url` vs queued row URL. */
function mediaPageUrlsMatch(a: string, b: string): boolean {
    const x = a.trim();
    const y = b.trim();
    if (x === y) {
        return true;
    }
    try {
        const ux = new URL(x);
        const uy = new URL(y);
        return (
            ux.protocol === uy.protocol &&
            stripWwwHost(ux.hostname) === stripWwwHost(uy.hostname) &&
            ux.pathname.replace(/\/$/, '') === uy.pathname.replace(/\/$/, '') &&
            ux.search === uy.search
        );
    } catch {
        return false;
    }
}

type UseDownloadStoreType = UseBoundStore<StoreApi<DownloadStoreState>> & {
    persist: {
        clearStorage(): void;
        rehydrate(): Promise<void> | void;
        hasHydrated(): boolean;
        onHydrate(fn: (state: DownloadStoreState) => void): () => void;
        onFinishHydration(fn: (state: DownloadStoreState) => void): () => void;
        setOptions(opts: Partial<PersistOptions<DownloadStoreState>>): void;
    };
};

const _downloadStore = create<DownloadStoreState>()(
    persist(
        (set) => ({
            queue: [],
            settings: DEFAULT_SETTINGS,

            addDownload: (payload) => {
                const item = createDownloadItem(payload);
                set((state) => ({ queue: [item, ...state.queue] }));
                return item.id;
            },

            prependDownloads: (payloads) => {
                if (payloads.length === 0) {
                    return [];
                }
                const items = payloads.map(createDownloadItem);
                set((state) => ({ queue: [...items, ...state.queue] }));
                return items.map((i) => i.id);
            },

            updateDownloadProgress: (downloadId, payload) => {
                set((state) => {
                    const queue = updateItemById(state.queue, downloadId, (item) => {
                        // Stray progress after pause or terminal outcomes must not flip state or clear
                        // pauseReason; otherwise a manually paused row can resume when another download
                        // triggers late/stale progress events.
                        if (
                            item.state === 'paused' ||
                            item.state === 'complete' ||
                            item.state === 'error' ||
                            item.state === 'cancelled'
                        ) {
                            return item;
                        }

                        const clamped = clampProgressPercent(payload.percent);
                        const prevDisplayed = item.progressPercent ?? 0;
                        const nextPercent =
                            typeof payload.percent === 'number' && Number.isFinite(payload.percent)
                                ? Math.max(prevDisplayed, clamped)
                                : clamped;

                        const isNoopUpdate =
                            item.state === 'downloading' &&
                            item.pauseReason === undefined &&
                            item.errorMessage === undefined &&
                            (item.progressPercent ?? 0) === nextPercent &&
                            (payload.speed === undefined || item.speed === payload.speed) &&
                            (payload.eta === undefined || item.eta === payload.eta) &&
                            (payload.totalSize === undefined ||
                                item.totalSize === payload.totalSize) &&
                            (payload.totalSizeBytes === undefined ||
                                item.sizeEstimateFullBytes === payload.totalSizeBytes);

                        if (isNoopUpdate) {
                            return item;
                        }

                        return {
                            ...item,
                            state: 'downloading',
                            pauseReason: undefined,
                            errorMessage: undefined,
                            progressPercent: nextPercent,
                            // totalSize is shown alongside progressPercent and eta in the UI.
                            // Priority: explicit combined total from payload (set in audio phase of
                            // merged downloads, or for single-stream once Content-Length is known) >
                            // For live/past-live HLS items: always update with payload.size
                            //   (the current stream label from the merge engine) so the displayed
                            //   size tracks streamVideoTotalBytes as it grows segment-by-segment.
                            //   Using ?? would permanently lock in the first (tiny) segment size.
                            // For non-live items: preserve the pre-fetched metadata estimate in
                            //   item.totalSize; payload.size is only the video portion.
                            // sizeEstimateFullBytes is still suppressed for live items because it
                            // drives section-trim byte scaling where an inflated value causes errors.
                            totalSize:
                                payload.totalSize !== undefined
                                    ? payload.totalSize
                                    : isLiveStreamItem(item.liveStatus) &&
                                        payload.size &&
                                        payload.size !== '--'
                                      ? payload.size
                                      : item.totalSize,
                            sizeEstimateFullBytes:
                                payload.totalSizeBytes !== undefined &&
                                payload.totalSizeBytes > 0 &&
                                !isLiveStreamItem(item.liveStatus)
                                    ? payload.totalSizeBytes
                                    : item.sizeEstimateFullBytes,
                            speed: payload.speed ?? item.speed,
                            eta: payload.eta ?? item.eta
                        };
                    });
                    return queue === state.queue ? state : { queue };
                });
            },

            completeDownload: (
                downloadId,
                filePath,
                completedTotalSize,
                completedTotalSizeBytes,
                contentSha256
            ) => {
                set((state) => {
                    const hash =
                        typeof contentSha256 === 'string' &&
                        /^[a-f0-9]{64}$/i.test(contentSha256.trim())
                            ? contentSha256.trim().toLowerCase()
                            : undefined;
                    const queue = updateItemById(state.queue, downloadId, (item) => ({
                        ...item,
                        state: 'complete',
                        pauseReason: undefined,
                        errorMessage: undefined,
                        progressPercent: 100,
                        filePath: filePath ?? item.filePath,
                        reservedOutputPath: undefined,
                        ...(hash ? { contentSha256: hash } : {}),
                        ...(completedTotalSize !== undefined
                            ? { totalSize: completedTotalSize }
                            : {}),
                        ...(completedTotalSizeBytes !== undefined && completedTotalSizeBytes > 0
                            ? { sizeEstimateFullBytes: completedTotalSizeBytes }
                            : {})
                    }));
                    return queue === state.queue ? state : { queue };
                });
            },

            cancelDownload: (downloadId) => {
                set((state) => {
                    const queue = updateItemById(state.queue, downloadId, (item) => ({
                        ...item,
                        state: 'cancelled',
                        pauseReason: undefined
                    }));
                    return queue === state.queue ? state : { queue };
                });
            },

            removeDownload: (downloadId) => {
                set((state) => {
                    const next = state.queue.filter((item) => item.id !== downloadId);
                    return next.length === state.queue.length ? state : { queue: next };
                });
            },

            updateDownload: (downloadId, patch) => {
                set((state) => {
                    const queue = updateItemById(state.queue, downloadId, (item) => ({
                        ...item,
                        ...patch,
                        id: item.id
                    }));
                    return queue === state.queue ? state : { queue };
                });
            },

            upgradeThumbnailsForMediaPage: (mediaPageUrl, thumbnailUrl) => {
                set((state) => {
                    let changed = false;
                    const queue = state.queue.map((item) => {
                        if (mediaPageUrlsMatch(item.url, mediaPageUrl)) {
                            changed = true;
                            return { ...item, thumbnailUrl };
                        }
                        return item;
                    });
                    return changed ? { queue } : state;
                });
            },

            setSettings: (patch) => {
                set((state) => ({
                    settings: {
                        ...state.settings,
                        ...patch
                    }
                }));
            },

            hydrateSettings: (settings) => {
                if (!settings) {
                    return;
                }
                set({
                    settings: {
                        ...DEFAULT_SETTINGS,
                        ...settings,
                        uiLocale: settings.uiLocale ?? '',
                        advancedDownloadDefaults: normalizeAdvancedDownloadDefaults(
                            settings.advancedDownloadDefaults
                        ),
                        proxyConfigured: settings.proxyConfigured ?? false,
                        notificationSettings:
                            settings.notificationSettings ?? DEFAULT_NOTIFICATION_SETTINGS
                    }
                });
            }
        }),
        {
            name: 'kajo-download-store',
            version: 2,
            storage: createSafeLocalJsonStorage(),
            partialize: (state) => ({
                queue: state.queue
            }),
            migrate: (persisted) => {
                // v2: settings are authoritative in main (electron-store); persist queue only.
                if (!persisted || typeof persisted !== 'object') {
                    return { queue: [] };
                }
                const p = persisted as Partial<Pick<DownloadStoreState, 'queue'>>;
                return {
                    queue: Array.isArray(p.queue) ? p.queue : []
                };
            },
            merge: mergePersistedDownloadState
        }
    )
);
export const useDownloadStore: UseDownloadStoreType = _downloadStore as UseDownloadStoreType;
