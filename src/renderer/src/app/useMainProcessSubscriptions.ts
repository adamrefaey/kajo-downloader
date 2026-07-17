import type { Dispatch, SetStateAction } from 'react';
import { useEffect } from 'react';
import { clipboardAutopasteClipboardTextsEquivalent } from '../../../shared/clipboardAutopasteUrl';
import { useDownloadStore } from '../../../store/downloadStore';
import { useSetupStore } from '../../../store/setupStore';
import type { VideoInfo } from '../../../types';
import { formatBytes } from '../lib/youtubeAppHelpers';

type StoreApi = ReturnType<typeof useDownloadStore.getState>;

export function useMainProcessSubscriptions(options: {
    updateDownloadProgress: StoreApi['updateDownloadProgress'];
    completeDownload: StoreApi['completeDownload'];
    cancelDownloadState: StoreApi['cancelDownload'];
    updateDownload: StoreApi['updateDownload'];
    removeDownload: StoreApi['removeDownload'];
    setVideoInfo: Dispatch<SetStateAction<VideoInfo | null>>;
    setUrl: Dispatch<SetStateAction<string>>;
    setClipboardHint: Dispatch<SetStateAction<string | null>>;
    setError: Dispatch<SetStateAction<string | null>>;
}): void {
    const {
        updateDownloadProgress,
        completeDownload,
        cancelDownloadState,
        updateDownload,
        removeDownload,
        setVideoInfo,
        setUrl,
        setClipboardHint,
        setError
    } = options;

    useEffect(() => {
        if (!window.api) {
            return;
        }

        const unsubscribeProgress = window.api.onDownloadProgress((payload) => {
            updateDownloadProgress(payload.downloadId, payload);
        });

        const unsubscribeComplete = window.api.onDownloadComplete((payload) => {
            completeDownload(
                payload.downloadId,
                payload.filePath,
                payload.outputFileSizeBytes !== undefined
                    ? formatBytes(payload.outputFileSizeBytes)
                    : undefined,
                payload.outputFileSizeBytes,
                payload.contentSha256 ?? undefined
            );
        });

        const unsubscribeError = window.api.onDownloadError((payload) => {
            if (payload.cancelled === true) {
                cancelDownloadState(payload.downloadId);
                return;
            }

            const item = useDownloadStore
                .getState()
                .queue.find((row) => row.id === payload.downloadId);
            if (item?.state === 'paused') {
                return;
            }

            updateDownload(payload.downloadId, {
                state: 'error',
                errorMessage: payload.message
            });
        });

        // Main pushes authoritative state changes for pause/resume — renderer must not
        // optimistically mutate download state; this is the single source of truth.
        const unsubscribeStateChange = window.api.onDownloadStateChange((payload) => {
            const { downloadId, state, pauseReason } = payload;
            if (state === 'paused') {
                updateDownload(downloadId, {
                    state: 'paused',
                    pauseReason: pauseReason ?? 'manual'
                });
            } else if (state === 'downloading') {
                updateDownload(downloadId, { state: 'downloading', pauseReason: undefined });
            } else if (state === 'pending') {
                updateDownload(downloadId, { state: 'pending', pauseReason: undefined });
            }
        });

        const unsubscribeVideoThumbnail = window.api.onVideoInfoThumbnail((payload) => {
            setVideoInfo((prev) => {
                if (!prev || prev.id !== payload.videoId) {
                    return prev;
                }
                return { ...prev, thumbnailUrl: payload.thumbnailUrl };
            });
            useDownloadStore
                .getState()
                .upgradeThumbnailsForMediaPage(payload.mediaPageUrl, payload.thumbnailUrl);
        });

        const unsubscribeClipboard = window.api.onClipboardUrlDetected((payload) => {
            setUrl((prev) => {
                if (clipboardAutopasteClipboardTextsEquivalent(prev, payload.url)) {
                    return prev;
                }
                return payload.url;
            });
            setClipboardHint((prevHint) => {
                if (prevHint && clipboardAutopasteClipboardTextsEquivalent(prevHint, payload.url)) {
                    return prevHint;
                }
                return payload.url;
            });
            setError(null);
        });

        const unsubscribeSetupLog = window.api.onSetupLog((payload) => {
            const lines = payload.line
                .split(/\r?\n/)
                .map((line) => line.trim())
                .filter(Boolean);
            if (lines.length === 0) {
                return;
            }
            useSetupStore.getState().appendSetupLogLines(lines);
        });

        const unsubscribeSetupComplete = window.api.onSetupComplete(() => {
            useSetupStore.getState().setSetupStatus((previous) =>
                previous
                    ? {
                          ...previous,
                          ytdlpInstalled: true,
                          ffmpegInstalled: true,
                          ytdlpMeetsMinimumVersion: true,
                          ytdlpReady: true
                      }
                    : {
                          ytdlpInstalled: true,
                          ffmpegInstalled: true,
                          ytdlpReady: true,
                          ytdlpVersion: null,
                          ytdlpMeetsMinimumVersion: true,
                          homebrewInstalled: true
                      }
            );
            useSetupStore.getState().setIsInstallingYtdlp(false);
            setError(null);
        });

        const STALE_CHECK_INTERVAL_MS = 5 * 60 * 1000;
        const staleCheckInterval = setInterval(() => {
            const completeEntries = useDownloadStore
                .getState()
                .queue.filter(
                    (item) => item.state === 'complete' && typeof item.filePath === 'string'
                )
                .map((item) => ({ id: item.id, filePath: item.filePath as string }));
            if (completeEntries.length === 0) {
                return;
            }
            void window.api.checkDownloadFilePaths(completeEntries).then((staleIds) => {
                for (const id of staleIds) {
                    removeDownload(id);
                }
            });
        }, STALE_CHECK_INTERVAL_MS);

        return () => {
            unsubscribeProgress();
            unsubscribeComplete();
            unsubscribeError();
            unsubscribeStateChange();
            unsubscribeVideoThumbnail();
            unsubscribeClipboard();
            unsubscribeSetupLog();
            unsubscribeSetupComplete();
            clearInterval(staleCheckInterval);
        };
    }, [
        cancelDownloadState,
        completeDownload,
        updateDownload,
        updateDownloadProgress,
        removeDownload,
        setVideoInfo,
        setUrl,
        setClipboardHint,
        setError
    ]);
}
