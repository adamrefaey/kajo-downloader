import type { TFunction } from 'i18next';
import type { Dispatch, SetStateAction } from 'react';
import { isMultilineBatchInput, parseBatchUrlLines } from '../../../../shared/batchUrlInput';
import {
    normalizeSectionTrimTimestampDisplay,
    parseSectionTrimTimestampSeconds
} from '../../../../shared/sectionTrim';
import type { AddDownloadPayload } from '../../../../store/downloadStore';
import { useSetupStore } from '../../../../store/setupStore';
import type {
    AppSettings,
    DownloadItem,
    Format,
    MetadataResolveResult,
    VideoInfo
} from '../../../../types';
import { buildAddDownloadPayloadFromVideo } from '../../lib/buildAddDownloadPayload';
import {
    backfillQuickStartDownloadRow,
    buildQuickStartDownloadPayload
} from '../../lib/buildQuickStartDownloadPayload';
import {
    getErrorMessage,
    YOUTUBE_LIKED_VIDEOS_PLAYLIST_URL,
    YOUTUBE_WATCH_LATER_PLAYLIST_URL
} from '../../lib/youtubeAppHelpers';
import type { MultilinePreviewRowState } from '../multilinePreview.types';
import { multilineRowIsDownloadReady } from '../multilinePreview.types';

export type UseStartDownloadHandlerOptions = {
    t: TFunction;
    settings: Pick<AppSettings, 'outputDir' | 'maxConcurrentDownloads' | 'preferredQuality'>;
    setError: Dispatch<SetStateAction<string | null>>;
    canQuickStartDownload: boolean;
    preview: {
        url: string;
        metadataResolve: MetadataResolveResult | null;
        videoInfo: VideoInfo | null;
        selectedFormatId: string;
        selectedFormat: Format | null;
        audioOnly: boolean;
        previewTrimStart: string;
        previewTrimEnd: string;
        focusUrlInput: () => void;
        setUrl: Dispatch<SetStateAction<string>>;
        setClipboardHint: Dispatch<SetStateAction<string | null>>;
        setVideoInfo: Dispatch<SetStateAction<VideoInfo | null>>;
        setSelectedFormatId: Dispatch<SetStateAction<string>>;
        setAudioOnly: Dispatch<SetStateAction<boolean>>;
        setPreviewTrimStart: Dispatch<SetStateAction<string>>;
        setPreviewTrimEnd: Dispatch<SetStateAction<string>>;
        multilinePreviewRows: MultilinePreviewRowState[];
        setMultilinePreviewRows: Dispatch<SetStateAction<MultilinePreviewRowState[]>>;
        isBatchUrl: boolean;
        openBatchPickerModal: () => Promise<boolean>;
        setIsStartingDownload: Dispatch<SetStateAction<boolean>>;
        executePlaylistDownload: (
            url: string,
            opts?: { clearWorkflowAfter?: boolean }
        ) => Promise<boolean>;
    };
    addDownload: (payload: AddDownloadPayload) => string;
    updateDownload: (downloadId: string, patch: Partial<DownloadItem>) => void;
    setIsYoutubeLibraryQueueing: Dispatch<SetStateAction<boolean>>;
};

export function useStartDownloadHandler({
    t,
    settings,
    setError,
    canQuickStartDownload,
    preview: {
        url,
        metadataResolve,
        videoInfo,
        selectedFormatId,
        selectedFormat,
        audioOnly,
        previewTrimStart,
        previewTrimEnd,
        focusUrlInput,
        setUrl,
        setClipboardHint,
        setVideoInfo,
        setSelectedFormatId,
        setAudioOnly,
        setPreviewTrimStart,
        setPreviewTrimEnd,
        multilinePreviewRows,
        setMultilinePreviewRows,
        isBatchUrl,
        openBatchPickerModal,
        setIsStartingDownload,
        executePlaylistDownload
    },
    addDownload,
    updateDownload,
    setIsYoutubeLibraryQueueing
}: UseStartDownloadHandlerOptions): {
    handleStartDownload: () => Promise<void>;
    handleStartDownloadRow: (lineIndex: number) => Promise<void>;
    handleQueueLikedVideos: () => Promise<void>;
    handleQueueWatchLater: () => Promise<void>;
} {
    const handleStartDownload = async (): Promise<void> => {
        if (!settings.outputDir) {
            setError(t('errors:selectOutputFirst'));
            return;
        }
        if (!useSetupStore.getState().setupStatus?.ytdlpReady) {
            setError(t('errors:setupNotReady'));
            return;
        }

        setIsStartingDownload(true);
        setError(null);

        try {
            const lineUrls = parseBatchUrlLines(url);
            if (isMultilineBatchInput(lineUrls)) {
                if (!window.api) {
                    setError(t('errors:failedStartDownload'));
                    return;
                }
                if (
                    lineUrls.length !== multilinePreviewRows.length ||
                    lineUrls.some((u, i) => multilinePreviewRows[i]?.inputUrl !== u)
                ) {
                    setError(t('errors:failedStartDownload'));
                    return;
                }
                for (let i = 0; i < lineUrls.length; i++) {
                    const lineUrl = lineUrls[i];
                    if (!lineUrl) {
                        continue;
                    }
                    const row = multilinePreviewRows[i];
                    if (!row || !multilineRowIsDownloadReady(row)) {
                        setError(t('errors:chooseVideoQuality'));
                        return;
                    }
                    if (row.multiBatchQueued) {
                        continue;
                    }
                    const meta = row.metadataResolve;
                    if (meta?.kind !== 'single') {
                        setError(t('errors:failedStartDownload'));
                        return;
                    }
                    const vi = row.videoInfo;
                    if (!vi) {
                        setError(t('errors:failedStartDownload'));
                        return;
                    }
                    const selectedFmt =
                        vi.formats.find((f) => f.id === row.selectedFormatId) ?? null;
                    if (!selectedFmt?.id) {
                        setError(t('errors:chooseVideoQuality'));
                        return;
                    }

                    addDownload(
                        buildAddDownloadPayloadFromVideo({
                            videoInfo: vi,
                            selectedFormatId: selectedFmt.id,
                            selectedFormat: selectedFmt,
                            audioOnly: row.audioOnly,
                            metadataResolve: meta,
                            outputDir: settings.outputDir
                        })
                    );
                }

                setUrl('');
                setClipboardHint(null);
                setVideoInfo(null);
                setSelectedFormatId('');
                setAudioOnly(false);
                setMultilinePreviewRows([]);
                setPreviewTrimStart('');
                setPreviewTrimEnd('');
                focusUrlInput();
                return;
            }

            if (isBatchUrl) {
                await openBatchPickerModal();
                return;
            }

            if (canQuickStartDownload && !videoInfo) {
                const downloadUrl =
                    metadataResolve?.kind === 'single' ? metadataResolve.url : url.trim();
                const downloadId = addDownload(
                    buildQuickStartDownloadPayload({
                        url: downloadUrl,
                        metadataResolve,
                        outputDir: settings.outputDir,
                        preferredQuality: settings.preferredQuality,
                        audioOnly
                    })
                );
                void backfillQuickStartDownloadRow({
                    downloadId,
                    url: downloadUrl,
                    preferredQuality: settings.preferredQuality,
                    updateDownload
                }).catch(() => {
                    // Metadata backfill is best-effort; download already queued.
                });

                setUrl('');
                setClipboardHint(null);
                setVideoInfo(null);
                setSelectedFormatId('');
                setAudioOnly(false);
                setMultilinePreviewRows([]);
                setPreviewTrimStart('');
                setPreviewTrimEnd('');
                focusUrlInput();
                return;
            }

            if (!videoInfo || !selectedFormatId) {
                setError(t('errors:chooseVideoQuality'));
                return;
            }

            const ps = previewTrimStart.trim();
            const pe = previewTrimEnd.trim();
            const sectionTrimFromPreview =
                ps &&
                pe &&
                parseSectionTrimTimestampSeconds(ps) !== null &&
                parseSectionTrimTimestampSeconds(pe) !== null
                    ? {
                          start: normalizeSectionTrimTimestampDisplay(ps).slice(0, 24),
                          end: normalizeSectionTrimTimestampDisplay(pe).slice(0, 24)
                      }
                    : undefined;

            const doAddDownload = (): void => {
                const vi = videoInfo;
                if (!vi) return;
                addDownload(
                    buildAddDownloadPayloadFromVideo({
                        videoInfo: vi,
                        selectedFormatId,
                        selectedFormat,
                        audioOnly,
                        metadataResolve,
                        outputDir: settings.outputDir,
                        sectionTrim: sectionTrimFromPreview
                    })
                );
                setUrl('');
                setClipboardHint(null);
                setVideoInfo(null);
                setSelectedFormatId('');
                setAudioOnly(false);
                setMultilinePreviewRows([]);
                setPreviewTrimStart('');
                setPreviewTrimEnd('');
                focusUrlInput();
            };

            doAddDownload();
        } catch (cause) {
            setError(getErrorMessage(cause, t('errors:failedStartDownload')));
        } finally {
            setIsStartingDownload(false);
        }
    };

    const handleQueueLikedVideos = async (): Promise<void> => {
        if (!settings.outputDir) {
            setError(t('errors:selectOutputFirst'));
            return;
        }
        if (!useSetupStore.getState().setupStatus?.ytdlpReady) {
            setError(t('errors:setupNotReady'));
            return;
        }
        setIsYoutubeLibraryQueueing(true);
        setIsStartingDownload(true);
        setError(null);
        try {
            await executePlaylistDownload(YOUTUBE_LIKED_VIDEOS_PLAYLIST_URL, {
                clearWorkflowAfter: false
            });
        } catch (cause) {
            setError(getErrorMessage(cause, t('errors:failedQueuePlaylist')));
        } finally {
            setIsStartingDownload(false);
            setIsYoutubeLibraryQueueing(false);
        }
    };

    const handleStartDownloadRow = async (lineIndex: number): Promise<void> => {
        if (!settings.outputDir) {
            setError(t('errors:selectOutputFirst'));
            return;
        }
        if (!useSetupStore.getState().setupStatus?.ytdlpReady) {
            setError(t('errors:setupNotReady'));
            return;
        }
        if (!window.api) {
            setError(t('errors:failedStartDownload'));
            return;
        }

        const row = multilinePreviewRows.find((r) => r.lineIndex === lineIndex);
        if (!row || row.multiBatchQueued) {
            return;
        }

        setIsStartingDownload(true);
        setError(null);

        try {
            const meta = row.metadataResolve;
            if (meta?.kind !== 'single') {
                setError(t('errors:failedStartDownload'));
                return;
            }

            const vi = row.videoInfo;
            if (!vi) {
                setError(t('errors:failedStartDownload'));
                return;
            }

            const selectedFmt = vi.formats.find((f) => f.id === row.selectedFormatId) ?? null;
            if (!selectedFmt?.id) {
                setError(t('errors:chooseVideoQuality'));
                return;
            }

            addDownload(
                buildAddDownloadPayloadFromVideo({
                    videoInfo: vi,
                    selectedFormatId: selectedFmt.id,
                    selectedFormat: selectedFmt,
                    audioOnly: row.audioOnly,
                    metadataResolve: meta,
                    outputDir: settings.outputDir
                })
            );

            setMultilinePreviewRows((prev) =>
                prev.map((r) => (r.lineIndex === lineIndex ? { ...r, multiBatchQueued: true } : r))
            );
        } catch (cause) {
            setError(getErrorMessage(cause, t('errors:failedStartDownload')));
        } finally {
            setIsStartingDownload(false);
        }
    };

    const handleQueueWatchLater = async (): Promise<void> => {
        if (!settings.outputDir) {
            setError(t('errors:selectOutputFirst'));
            return;
        }
        setError(null);
        try {
            await executePlaylistDownload(YOUTUBE_WATCH_LATER_PLAYLIST_URL, {
                clearWorkflowAfter: false
            });
        } catch (cause) {
            setError(getErrorMessage(cause, t('errors:failedQueuePlaylist')));
        } finally {
            setIsStartingDownload(false);
            setIsYoutubeLibraryQueueing(false);
        }
    };

    return {
        handleStartDownload,
        handleStartDownloadRow,
        handleQueueLikedVideos,
        handleQueueWatchLater
    };
}
