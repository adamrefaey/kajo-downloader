import type { MutableRefObject } from 'react';
import { estimateBytesForSectionTrim } from '../../../../shared/sectionTrim';
import { useDownloadStore } from '../../../../store/downloadStore';
import { formatBytes } from '../../lib/youtubeAppHelpers';

export type UseQueueItemHandlersOptions = {
    updateDownload: (id: string, patch: Partial<import('../../../../types').DownloadItem>) => void;
    startInFlightRef: MutableRefObject<Set<string>>;
    pauseInFlightRef: MutableRefObject<Set<string>>;
    resumeInFlightRef: MutableRefObject<Set<string>>;
    removeDuringStartRef: MutableRefObject<Set<string>>;
    removeDownloadState: (id: string) => void;
    pauseDownloadWithReason: (id: string, reason: 'manual' | 'concurrency') => Promise<void>;
    resumeDownloadFromPause: (id: string, manual: boolean) => Promise<void>;
};

export function useQueueItemHandlers({
    updateDownload,
    startInFlightRef,
    pauseInFlightRef,
    resumeInFlightRef,
    removeDuringStartRef,
    removeDownloadState,
    pauseDownloadWithReason,
    resumeDownloadFromPause
}: UseQueueItemHandlersOptions): {
    handleSectionTrimPatch: (
        downloadId: string,
        patch: Partial<{ start: string; end: string }>
    ) => void;
    handlePauseDownload: (downloadId: string) => Promise<void>;
    handleResumeDownload: (downloadId: string) => Promise<void>;
    handleRetryDownload: (downloadId: string) => Promise<void>;
    handleOpenDownloadedFile: (filePath: string) => Promise<void>;
    handleRevealDownloadedFile: (filePath: string) => Promise<void>;
    handleRemoveDownload: (downloadId: string) => Promise<void>;
    handlePauseBatch: (batchGroupId: string) => Promise<void>;
    handleResumeBatch: (batchGroupId: string) => Promise<void>;
    handleRemoveBatch: (batchGroupId: string) => Promise<void>;
} {
    const queue = useDownloadStore((s) => s.queue);

    const handleSectionTrimPatch = (
        downloadId: string,
        patch: Partial<{ start: string; end: string }>
    ) => {
        const cur = queue.find((i) => i.id === downloadId);
        const prev = cur?.sectionTrim;
        const start = (patch.start !== undefined ? patch.start : (prev?.start ?? '')).slice(0, 24);
        const end = (patch.end !== undefined ? patch.end : (prev?.end ?? '')).slice(0, 24);
        const fullBytes = cur?.sizeEstimateFullBytes;
        const fullDuration = cur?.mediaDurationSeconds;

        if (!start.trim() && !end.trim()) {
            updateDownload(downloadId, {
                sectionTrim: undefined,
                totalSize:
                    fullBytes !== undefined && fullBytes > 0
                        ? formatBytes(fullBytes)
                        : cur?.totalSize
            });
            return;
        }

        const trimmedBytes =
            fullBytes !== undefined && fullDuration !== undefined && fullDuration > 0
                ? estimateBytesForSectionTrim({
                      fullFilesizeBytes: fullBytes,
                      fullDurationSeconds: fullDuration,
                      trimStart: start,
                      trimEnd: end
                  })
                : null;

        updateDownload(downloadId, {
            sectionTrim: { start, end },
            totalSize:
                trimmedBytes !== null
                    ? formatBytes(trimmedBytes)
                    : fullBytes !== undefined && fullBytes > 0
                      ? formatBytes(fullBytes)
                      : cur?.totalSize
        });
    };

    const handlePauseDownload = async (downloadId: string): Promise<void> => {
        await pauseDownloadWithReason(downloadId, 'manual');
    };

    const handleResumeDownload = async (downloadId: string): Promise<void> => {
        const item = queue.find((entry) => entry.id === downloadId);
        if (item?.state !== 'paused') {
            return;
        }
        if (item.pauseReason === 'manual') {
            updateDownload(downloadId, { pauseReason: undefined });
        }
        await resumeDownloadFromPause(downloadId, true);
    };

    const handleRetryDownload = async (downloadId: string): Promise<void> => {
        const item = queue.find((entry) => entry.id === downloadId);
        if (item?.state !== 'error') {
            return;
        }
        updateDownload(downloadId, {
            state: 'pending',
            errorMessage: undefined,
            pauseReason: undefined,
            speed: undefined,
            eta: undefined
        });
    };

    const handleOpenDownloadedFile = async (filePath: string): Promise<void> => {
        await window.api.localFiles.openPath(filePath);
    };

    const handleRevealDownloadedFile = async (filePath: string): Promise<void> => {
        await window.api.localFiles.revealPath(filePath);
    };

    const handleRemoveDownload = async (downloadId: string): Promise<void> => {
        const item = queue.find((entry) => entry.id === downloadId);
        if (!item) {
            return;
        }

        const wasStarting = startInFlightRef.current.has(downloadId);
        if (wasStarting) {
            removeDuringStartRef.current.add(downloadId);
        }

        try {
            if (
                window.api &&
                (item.state === 'downloading' ||
                    item.state === 'starting' ||
                    item.state === 'paused')
            ) {
                await window.api.cancelDownload(downloadId);
            }
        } catch (err) {
            // Keep UI responsive and still remove from local queue.
            console.warn('[queue] cancelDownload failed (non-fatal, removing anyway)', err);
        }

        try {
            if (window.api && item.state !== 'complete') {
                await window.api.cleanupDownloadArtifacts({
                    downloadId,
                    outputDir: item.outputDir,
                    audioOnly: item.audioOnly,
                    reservedOutputPath: item.reservedOutputPath,
                    partialFilePath: item.filePath
                });
            }
        } catch (err) {
            // Best-effort removal of partial yt-dlp files.
            console.warn('[queue] cleanupDownloadArtifacts failed (non-fatal)', err);
        } finally {
            startInFlightRef.current.delete(downloadId);
            pauseInFlightRef.current.delete(downloadId);
            resumeInFlightRef.current.delete(downloadId);
            if (!wasStarting) {
                removeDuringStartRef.current.delete(downloadId);
            }
            removeDownloadState(downloadId);
        }
    };

    const handlePauseBatch = async (batchGroupId: string): Promise<void> => {
        useDownloadStore.setState((state) => ({
            queue: state.queue.map((item) => {
                if (item.batchGroupId !== batchGroupId) {
                    return item;
                }
                if (item.state === 'pending') {
                    return { ...item, state: 'paused' as const, pauseReason: 'manual' as const };
                }
                if (item.state === 'paused' && item.pauseReason === 'concurrency') {
                    return { ...item, pauseReason: 'manual' as const };
                }
                return item;
            })
        }));
        const active = useDownloadStore
            .getState()
            .queue.filter(
                (item) =>
                    item.batchGroupId === batchGroupId &&
                    (item.state === 'downloading' || item.state === 'starting')
            )
            .sort((a, b) => a.createdAt - b.createdAt);
        for (const item of active) {
            await pauseDownloadWithReason(item.id, 'manual');
        }
    };

    const handleResumeBatch = async (batchGroupId: string): Promise<void> => {
        const paused = queue
            .filter((item) => item.batchGroupId === batchGroupId && item.state === 'paused')
            .sort((a, b) => a.createdAt - b.createdAt);
        for (const item of paused) {
            await handleResumeDownload(item.id);
        }
    };

    const handleRemoveBatch = async (batchGroupId: string): Promise<void> => {
        const batchItems = queue.filter((item) => item.batchGroupId === batchGroupId);

        // Collect unique outputDirs that have no completed downloads — candidates for removal
        // after all items are cleaned up.
        const completedDirs = new Set(
            batchItems.filter((item) => item.state === 'complete').map((item) => item.outputDir)
        );
        const dirsToClean = [
            ...new Set(
                batchItems
                    .filter((item) => !completedDirs.has(item.outputDir))
                    .map((item) => item.outputDir)
            )
        ];

        for (const item of batchItems) {
            await handleRemoveDownload(item.id);
        }

        // After all items are removed, delete any empty batch output folders (playlist / channel
        // section dirs). The handler does a safe rmdir (only removes truly empty dirs) and also
        // tries one level up for channel-root cleanup when all section subdirs are gone.
        if (dirsToClean.length > 0) {
            try {
                await window.api?.cleanupEmptyBatchDirs(dirsToClean);
            } catch {
                // Best-effort; if the dirs aren't empty or don't exist, nothing happens.
            }
        }
    };

    return {
        handleSectionTrimPatch,
        handlePauseDownload,
        handleResumeDownload,
        handleRetryDownload,
        handleOpenDownloadedFile,
        handleRevealDownloadedFile,
        handleRemoveDownload,
        handlePauseBatch,
        handleResumeBatch,
        handleRemoveBatch
    };
}
