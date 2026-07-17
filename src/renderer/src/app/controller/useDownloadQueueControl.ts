import type { TFunction } from 'i18next';
import type { MutableRefObject } from 'react';
import { useRef } from 'react';
import {
    advancedDownloadDefaultsToCapabilities,
    mergeDownloadCapabilityLayers
} from '../../../../shared/advancedDownloadSettings';
import { useDownloadStore } from '../../../../store/downloadStore';
import type { DownloadEngineCapabilities, DownloadItem } from '../../../../types';
import { getErrorMessage } from '../../lib/youtubeAppHelpers';

export function useDownloadQueueControl(options: {
    t: TFunction;
    updateDownload: (downloadId: string, patch: Partial<DownloadItem>) => void;
}): {
    startInFlightRef: MutableRefObject<Set<string>>;
    pauseInFlightRef: MutableRefObject<Set<string>>;
    resumeInFlightRef: MutableRefObject<Set<string>>;
    removeDuringStartRef: MutableRefObject<Set<string>>;
    startQueuedDownload: (downloadId: string) => Promise<void>;
    pauseDownloadWithReason: (
        downloadId: string,
        pauseReason: 'manual' | 'concurrency'
    ) => Promise<void>;
    resumeDownloadFromPause: (downloadId: string, manualOverride: boolean) => Promise<void>;
} {
    const { t, updateDownload } = options;

    const startInFlightRef = useRef(new Set<string>());
    const pauseInFlightRef = useRef(new Set<string>());
    const resumeInFlightRef = useRef(new Set<string>());
    const removeDuringStartRef = useRef(new Set<string>());

    const queue = useDownloadStore((s) => s.queue);
    const storeSettings = useDownloadStore((s) => s.settings);

    const startQueuedDownload = async (downloadId: string): Promise<void> => {
        const snapshot = queue.find((item) => item.id === downloadId);
        if (snapshot?.state !== 'pending' || !window.api) {
            return;
        }
        if (startInFlightRef.current.has(downloadId)) {
            return;
        }

        startInFlightRef.current.add(downloadId);
        updateDownload(downloadId, { state: 'starting', errorMessage: undefined });
        try {
            // App ships fully unlocked — always apply the configured download capabilities.
            let capabilities: DownloadEngineCapabilities | undefined =
                advancedDownloadDefaultsToCapabilities(storeSettings.advancedDownloadDefaults);
            const tr = snapshot.sectionTrim;
            const ts = tr?.start?.trim() ?? '';
            const te = tr?.end?.trim() ?? '';
            if (ts && te) {
                capabilities = mergeDownloadCapabilityLayers(capabilities ?? {}, {
                    trim: { start: ts.slice(0, 24), end: te.slice(0, 24) }
                });
            }
            const started = await window.api.startDownload({
                downloadId: snapshot.id,
                url: snapshot.url,
                formatId: snapshot.formatId,
                outputTemplate: snapshot.outputTemplate,
                outputDir: snapshot.outputDir,
                audioOnly: Boolean(snapshot.audioOnly),
                videoHeight: snapshot.videoHeight,
                progressVideoBytes: snapshot.progressVideoBytes,
                progressAudioBytes: snapshot.progressAudioBytes,
                playlistId: snapshot.playlistId,
                capabilities,
                mediaTitle: snapshot.title ?? null,
                queuedAtMs: snapshot.createdAt,
                reservedOutputPath: snapshot.reservedOutputPath
            });
            if (!started) {
                throw new Error(t('errors:mainNoDownloadId'));
            }
            if ('blocked' in started) {
                updateDownload(downloadId, {
                    state: 'error',
                    errorMessage: t('errors:prohibitedAdultContentHost')
                });
                return;
            }

            updateDownload(downloadId, { reservedOutputPath: started.reservedOutputPath });

            const latest = useDownloadStore.getState().queue.find((item) => item.id === downloadId);
            if (latest?.state === 'paused') {
                await window.api.pauseDownload(downloadId);
            }
        } catch (cause) {
            updateDownload(downloadId, {
                state: 'error',
                errorMessage: getErrorMessage(cause, t('errors:failedStartQueued'))
            });
        } finally {
            if (removeDuringStartRef.current.has(downloadId) && window.api) {
                try {
                    await window.api.cancelDownload(downloadId);
                } catch {
                    // Best effort cancellation when removal happened during start.
                } finally {
                    removeDuringStartRef.current.delete(downloadId);
                }
            }
            startInFlightRef.current.delete(downloadId);
        }
    };

    const pauseDownloadWithReason = async (
        downloadId: string,
        pauseReason: 'manual' | 'concurrency'
    ): Promise<void> => {
        const snapshot = queue.find((item) => item.id === downloadId);
        if (
            !snapshot ||
            !window.api ||
            snapshot.state === 'paused' ||
            snapshot.state === 'complete'
        ) {
            return;
        }
        if (pauseInFlightRef.current.has(downloadId)) {
            return;
        }

        pauseInFlightRef.current.add(downloadId);
        try {
            if (snapshot.state === 'pending') {
                // Not started on the main process yet — pause is renderer-only so the
                // concurrency controller does not auto-start this row.
                updateDownload(downloadId, { state: 'paused', pauseReason });
            } else if (snapshot.state === 'downloading' || snapshot.state === 'starting') {
                await window.api.pauseDownload(downloadId);
                // State transition arrives via main→renderer `downloadStateChange` push.
                // Update the display reason immediately (it's display-only metadata).
                updateDownload(downloadId, { pauseReason });
            }
        } finally {
            pauseInFlightRef.current.delete(downloadId);
        }
    };

    const resumeDownloadFromPause = async (
        downloadId: string,
        _manualOverride: boolean
    ): Promise<void> => {
        const snapshot = queue.find((item) => item.id === downloadId);
        if (snapshot?.state !== 'paused' || !window.api) {
            return;
        }
        if (resumeInFlightRef.current.has(downloadId)) {
            return;
        }

        resumeInFlightRef.current.add(downloadId);
        try {
            await window.api.resumeDownload(downloadId);
            // Authoritative state (downloading or pending) arrives via main→renderer
            // `downloadStateChange` push — do not optimistically mutate store here.
        } finally {
            resumeInFlightRef.current.delete(downloadId);
        }
    };

    return {
        startInFlightRef,
        pauseInFlightRef,
        resumeInFlightRef,
        removeDuringStartRef,
        startQueuedDownload,
        pauseDownloadWithReason,
        resumeDownloadFromPause
    };
}
