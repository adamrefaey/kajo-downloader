import type { TFunction } from 'i18next';
import type { MutableRefObject, SetStateAction } from 'react';
import { useSetupStore } from '../../../../store/setupStore';
import type {
    MediaLookupResult,
    MetadataResolveResult,
    PlaylistInfo,
    VideoInfo
} from '../../../../types';
import { getErrorMessage } from '../../lib/youtubeAppHelpers';
import type { MultilinePreviewRowState } from '../multilinePreview.types';

export interface UseMultilineYoutubeHandlersDeps {
    t: TFunction;
    authSessionReady: boolean;
    getMediaLookupErrorMessage: (
        result: MediaLookupResult<VideoInfo> | MediaLookupResult<PlaylistInfo> | null | undefined,
        authReady: boolean,
        mediaLabel: 'playlist' | 'video'
    ) => string;
    outputDir: string | undefined;
    multilinePickerLineIndexRef: MutableRefObject<number | null>;
    multilinePreviewRows: MultilinePreviewRowState[];
    setMultilinePreviewRows: (v: SetStateAction<MultilinePreviewRowState[]>) => void;
    metadataResolve: MetadataResolveResult | null;
    setMetadataResolve: (v: SetStateAction<MetadataResolveResult | null>) => void;
    metadataResolvePending: boolean;
    setError: (v: SetStateAction<string | null>) => void;
    setIsStartingDownload: (v: SetStateAction<boolean>) => void;
    setYoutubeWatchPlaylistChoice: (
        v: SetStateAction<null | 'video' | 'playlist' | 'dismissed'>
    ) => void;
    setVideoInfo: (v: SetStateAction<VideoInfo | null>) => void;
    setSelectedFormatId: (v: SetStateAction<string>) => void;
    setIsFetchingInfo: (v: SetStateAction<boolean>) => void;
    setAudioOnly: (v: SetStateAction<boolean>) => void;
    setChannelQueueVideos: (v: SetStateAction<boolean>) => void;
    setChannelQueueShorts: (v: SetStateAction<boolean>) => void;
    setChannelQueueLive: (v: SetStateAction<boolean>) => void;
    channelQueueVideos: boolean;
    channelQueueShorts: boolean;
    channelQueueLive: boolean;
    youtubeWatchPlaylistChoice: null | 'video' | 'playlist' | 'dismissed';
    openBatchPickerModal: () => Promise<boolean>;
    openChannelMultiPicker: (opts: {
        metadataResolve: MetadataResolveResult;
        channelQueueVideos: boolean;
        channelQueueShorts: boolean;
        channelQueueLive: boolean;
    }) => Promise<boolean>;
}

export interface MultilineYoutubeHandlers {
    openMultilineRowPlaylistPicker: (lineIndex: number) => Promise<void>;
    openMultilineRowChannelPicker: (lineIndex: number) => Promise<void>;
    handleMultilineMultiPickerDismiss: () => void;
    handleMultilineYoutubeForkVideo: (lineIndex: number) => void;
    handleMultilineYoutubeForkPlaylist: (lineIndex: number) => void;
    handleMultilineYoutubeForkDismiss: (lineIndex: number) => void;
    handleMultilineRowChannelOptionsChange: (
        lineIndex: number,
        options: Partial<{
            channelQueueVideos: boolean;
            channelQueueShorts: boolean;
            channelQueueLive: boolean;
        }>
    ) => void;
    handleYoutubeWatchPlaylistForkVideo: () => void;
    handleYoutubeWatchPlaylistForkPlaylist: () => void;
    youtubeWatchPlaylistForkModalOpen: boolean;
}

/**
 * Extracts the multiline-batch and youtube-watch-playlist fork handler logic
 * from WorkflowProvider into a focused, testable hook.
 */
export function useMultilineYoutubeHandlers(
    deps: UseMultilineYoutubeHandlersDeps
): MultilineYoutubeHandlers {
    const {
        t,
        authSessionReady,
        getMediaLookupErrorMessage,
        outputDir,
        multilinePickerLineIndexRef,
        multilinePreviewRows,
        setMultilinePreviewRows,
        metadataResolve,
        setMetadataResolve,
        metadataResolvePending,
        setError,
        setIsStartingDownload,
        setYoutubeWatchPlaylistChoice,
        setVideoInfo,
        setSelectedFormatId,
        setIsFetchingInfo,
        setAudioOnly,
        setChannelQueueVideos,
        setChannelQueueShorts,
        setChannelQueueLive,
        channelQueueVideos,
        channelQueueShorts,
        channelQueueLive,
        youtubeWatchPlaylistChoice,
        openBatchPickerModal,
        openChannelMultiPicker
    } = deps;

    const openMultilineRowPlaylistPicker = async (lineIndex: number): Promise<void> => {
        const row = multilinePreviewRows.find((r) => r.lineIndex === lineIndex);
        const meta = row?.metadataResolve;
        if (meta?.kind !== 'multi' || meta.youtubeBatchKind === 'channel') {
            return;
        }
        if (!outputDir?.trim()) {
            setError(t('errors:selectOutputFirst'));
            return;
        }
        if (!useSetupStore.getState().setupStatus?.ytdlpReady) {
            setError(t('errors:setupNotReady'));
            return;
        }
        multilinePickerLineIndexRef.current = lineIndex;
        // flushSync is intentionally not used here to avoid forced sync renders;
        // callers that need synchronous UI updates import flushSync themselves.
        setMetadataResolve(meta);
        try {
            const ok = await openBatchPickerModal();
            if (!ok && multilinePickerLineIndexRef.current === lineIndex) {
                multilinePickerLineIndexRef.current = null;
                setMetadataResolve(null);
            }
        } catch (cause) {
            multilinePickerLineIndexRef.current = null;
            setMetadataResolve(null);
            setError(getErrorMessage(cause, t('errors:failedStartDownload')));
        }
    };

    const openMultilineRowChannelPicker = async (lineIndex: number): Promise<void> => {
        const row = multilinePreviewRows.find((r) => r.lineIndex === lineIndex);
        const meta = row?.metadataResolve;
        if (meta?.kind !== 'multi' || meta.youtubeBatchKind !== 'channel') {
            return;
        }
        if (!outputDir?.trim()) {
            setError(t('errors:selectOutputFirst'));
            return;
        }
        if (!useSetupStore.getState().setupStatus?.ytdlpReady) {
            setError(t('errors:setupNotReady'));
            return;
        }
        if (row) {
            setChannelQueueVideos(row.channelQueueVideos);
            setChannelQueueShorts(row.channelQueueShorts);
            setChannelQueueLive(row.channelQueueLive);
        }
        multilinePickerLineIndexRef.current = lineIndex;
        setMetadataResolve(meta);
        setIsStartingDownload(true);
        setError(null);
        try {
            const ok = await openChannelMultiPicker({
                metadataResolve: meta,
                channelQueueVideos: row?.channelQueueVideos ?? channelQueueVideos,
                channelQueueShorts: row?.channelQueueShorts ?? channelQueueShorts,
                channelQueueLive: row?.channelQueueLive ?? channelQueueLive
            });
            if (!ok && multilinePickerLineIndexRef.current === lineIndex) {
                multilinePickerLineIndexRef.current = null;
                setMetadataResolve(null);
            }
        } catch (cause) {
            multilinePickerLineIndexRef.current = null;
            setMetadataResolve(null);
            setError(getErrorMessage(cause, t('errors:failedStartDownload')));
        } finally {
            setIsStartingDownload(false);
        }
    };

    const handleMultilineMultiPickerDismiss = (): void => {
        if (multilinePickerLineIndexRef.current !== null) {
            multilinePickerLineIndexRef.current = null;
            setMetadataResolve(null);
        }
    };

    const handleMultilineYoutubeForkVideo = (lineIndex: number): void => {
        if (!window.api) return;
        const row = multilinePreviewRows.find((r) => r.lineIndex === lineIndex);
        const m = row?.metadataResolve;
        if (m?.kind !== 'multi' || !m.youtubeWatchPlaylistFork) return;
        const singleUrl = m.youtubeWatchPlaylistFork.singleVideoUrl;
        setMultilinePreviewRows((prev) =>
            prev.map((r) =>
                r.lineIndex === lineIndex
                    ? {
                          ...r,
                          youtubeWatchPlaylistChoice: 'video',
                          fetchPending: true,
                          errorMessage: null,
                          metadataResolve: {
                              kind: 'single',
                              url: singleUrl,
                              siteId: m.siteId,
                              siteDomain: m.siteDomain,
                              extractorKey: m.extractorKey,
                              candidateMode: 'single',
                              authCookiesRecommended: m.authCookiesRecommended
                          }
                      }
                    : r
            )
        );
        void window.api
            .fetchVideoInfo(singleUrl)
            .then((videoResult) => {
                if (!videoResult.data) {
                    throw new Error(
                        getMediaLookupErrorMessage(videoResult, authSessionReady, 'video')
                    );
                }
                setMultilinePreviewRows((prev) =>
                    prev.map((r) =>
                        r.lineIndex === lineIndex
                            ? {
                                  ...r,
                                  videoInfo: videoResult.data,
                                  fetchPending: false,
                                  selectedFormatId: ''
                              }
                            : r
                    )
                );
            })
            .catch((cause) => {
                setMultilinePreviewRows((prev) =>
                    prev.map((r) =>
                        r.lineIndex === lineIndex
                            ? {
                                  ...r,
                                  fetchPending: false,
                                  videoInfo: null,
                                  selectedFormatId: '',
                                  errorMessage: getErrorMessage(cause, t('errors:failedFetchVideo'))
                              }
                            : r
                    )
                );
            });
    };

    const handleMultilineYoutubeForkPlaylist = (lineIndex: number): void => {
        setMultilinePreviewRows((prev) =>
            prev.map((r) =>
                r.lineIndex === lineIndex ? { ...r, youtubeWatchPlaylistChoice: 'playlist' } : r
            )
        );
    };

    const handleMultilineYoutubeForkDismiss = (lineIndex: number): void => {
        setMultilinePreviewRows((prev) =>
            prev.map((r) =>
                r.lineIndex === lineIndex ? { ...r, youtubeWatchPlaylistChoice: 'dismissed' } : r
            )
        );
    };

    const handleMultilineRowChannelOptionsChange = (
        lineIndex: number,
        options: Partial<{
            channelQueueVideos: boolean;
            channelQueueShorts: boolean;
            channelQueueLive: boolean;
        }>
    ): void => {
        setMultilinePreviewRows((prev) =>
            prev.map((r) => (r.lineIndex === lineIndex ? { ...r, ...options } : r))
        );
    };

    const handleYoutubeWatchPlaylistForkVideo = (): void => {
        const m = metadataResolve;
        if (m?.kind !== 'multi' || !m.youtubeWatchPlaylistFork) return;
        const singleUrl = m.youtubeWatchPlaylistFork.singleVideoUrl;
        setYoutubeWatchPlaylistChoice('video');
        setMetadataResolve({
            kind: 'single',
            url: singleUrl,
            siteId: m.siteId,
            siteDomain: m.siteDomain,
            extractorKey: m.extractorKey,
            candidateMode: 'single',
            authCookiesRecommended: m.authCookiesRecommended
        });
        setIsFetchingInfo(true);
        setVideoInfo(null);
        setSelectedFormatId('');
        setAudioOnly(false);
        setError(null);
        void window.api
            .fetchVideoInfo(singleUrl)
            .then((videoResult) => {
                if (!videoResult.data) {
                    throw new Error(
                        getMediaLookupErrorMessage(videoResult, authSessionReady, 'video')
                    );
                }
                setVideoInfo(videoResult.data);
            })
            .catch((cause) => {
                setVideoInfo(null);
                setSelectedFormatId('');
                setError(getErrorMessage(cause, t('errors:failedFetchVideo')));
            })
            .finally(() => {
                setIsFetchingInfo(false);
            });
    };

    const handleYoutubeWatchPlaylistForkPlaylist = (): void => {
        setYoutubeWatchPlaylistChoice('playlist');
    };

    const youtubeWatchPlaylistForkModalOpen = Boolean(
        multilinePreviewRows.length < 2 &&
            metadataResolve?.kind === 'multi' &&
            metadataResolve.youtubeWatchPlaylistFork &&
            youtubeWatchPlaylistChoice === null &&
            !metadataResolvePending
    );

    return {
        openMultilineRowPlaylistPicker,
        openMultilineRowChannelPicker,
        handleMultilineMultiPickerDismiss,
        handleMultilineYoutubeForkVideo,
        handleMultilineYoutubeForkPlaylist,
        handleMultilineYoutubeForkDismiss,
        handleMultilineRowChannelOptionsChange,
        handleYoutubeWatchPlaylistForkVideo,
        handleYoutubeWatchPlaylistForkPlaylist,
        youtubeWatchPlaylistForkModalOpen
    };
}
