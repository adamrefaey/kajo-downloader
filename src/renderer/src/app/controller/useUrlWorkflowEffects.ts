import type { TFunction } from 'i18next';
import type { Dispatch, SetStateAction } from 'react';
import { useEffect, useRef } from 'react';
import {
    isMultilineBatchInput,
    parseBatchUrlLines,
    primaryBatchOrSingleUrl
} from '../../../../shared/batchUrlInput';
import { buildStaticMetadataResolveContext } from '../../../../shared/urlSiteResolveContext';
import type {
    MediaLookupResult,
    MetadataResolveResult,
    PlaylistInfo,
    VideoInfo
} from '../../../../types';
import { getErrorMessage, getPreferredFormat } from '../../lib/youtubeAppHelpers';
import type { MultilinePreviewRowState } from '../multilinePreview.types';

type MediaLookupFn = (
    result: MediaLookupResult<VideoInfo> | MediaLookupResult<PlaylistInfo> | null | undefined,
    authReady: boolean,
    mediaLabel: 'video' | 'playlist'
) => string;

export function useUrlWorkflowEffects(options: {
    isYoutubeChannelBatch: boolean;
    channelSelectionResetKey: string;
    setChannelQueueVideos: Dispatch<SetStateAction<boolean>>;
    setChannelQueueShorts: Dispatch<SetStateAction<boolean>>;
    setChannelQueueLive: Dispatch<SetStateAction<boolean>>;
    showSetupGate: boolean;
    focusUrlInput: () => void;
    trimmedUrl: string;
    urlValidationError: string | null;
    authSessionReady: boolean;
    getMediaLookupErrorMessage: MediaLookupFn;
    t: TFunction;
    metadataResolveRefreshKey: number;
    setIsFetchingInfo: Dispatch<SetStateAction<boolean>>;
    setMetadataResolvePending: Dispatch<SetStateAction<boolean>>;
    setMetadataResolve: Dispatch<SetStateAction<MetadataResolveResult | null>>;
    setVideoInfo: Dispatch<SetStateAction<VideoInfo | null>>;
    setSelectedFormatId: Dispatch<SetStateAction<string>>;
    setError: Dispatch<SetStateAction<string | null>>;
    videoInfo: VideoInfo | null;
    effectivePreferredQuality: number | null;
    setAudioOnly: Dispatch<SetStateAction<boolean>>;
    setMultilinePreviewRows: Dispatch<SetStateAction<MultilinePreviewRowState[]>>;
}): void {
    const {
        isYoutubeChannelBatch,
        channelSelectionResetKey,
        setChannelQueueVideos,
        setChannelQueueShorts,
        setChannelQueueLive,
        showSetupGate,
        focusUrlInput,
        trimmedUrl,
        urlValidationError,
        authSessionReady,
        getMediaLookupErrorMessage,
        t,
        metadataResolveRefreshKey,
        setIsFetchingInfo,
        setMetadataResolvePending,
        setMetadataResolve,
        setVideoInfo,
        setSelectedFormatId,
        setError,
        videoInfo,
        effectivePreferredQuality,
        setAudioOnly,
        setMultilinePreviewRows
    } = options;

    const hasAutoFocusedUrlRef = useRef(false);
    const preferredQualityRef = useRef(effectivePreferredQuality);
    useEffect(() => {
        preferredQualityRef.current = effectivePreferredQuality;
    }, [effectivePreferredQuality]);

    useEffect(() => {
        if (!isYoutubeChannelBatch) {
            return;
        }
        setChannelQueueVideos(true);
        setChannelQueueShorts(false);
        setChannelQueueLive(false);
        // eslint-disable-next-line react-hooks/exhaustive-deps -- state setters from useState are stable; intentionally omitted
    }, [isYoutubeChannelBatch, channelSelectionResetKey]);

    useEffect(() => {
        if (!showSetupGate && !hasAutoFocusedUrlRef.current) {
            hasAutoFocusedUrlRef.current = true;
            focusUrlInput();
        }
    }, [focusUrlInput, showSetupGate]);

    useEffect(() => {
        if (!window.api) {
            return;
        }

        // Intentional dependency: same URL must re-resolve after embedded site sign-in saves cookies.
        void metadataResolveRefreshKey;

        if (!trimmedUrl) {
            setMultilinePreviewRows((prev) => (prev.length === 0 ? prev : []));
            setIsFetchingInfo(false);
            setMetadataResolvePending(false);
            setMetadataResolve(null);
            setVideoInfo(null);
            setSelectedFormatId('');
            return;
        }

        if (urlValidationError) {
            setMultilinePreviewRows((prev) => (prev.length === 0 ? prev : []));
            setIsFetchingInfo(false);
            setMetadataResolvePending(false);
            setMetadataResolve(null);
            setVideoInfo(null);
            setSelectedFormatId('');
            return;
        }

        const lines = parseBatchUrlLines(trimmedUrl);
        if (isMultilineBatchInput(lines)) {
            setVideoInfo(null);
            setSelectedFormatId('');
            setMetadataResolve(null);
            setMetadataResolvePending(false);
            setIsFetchingInfo(false);

            setMultilinePreviewRows(
                lines.map((inputUrl, lineIndex) => ({
                    lineIndex,
                    inputUrl,
                    resolvePending: true,
                    fetchPending: false,
                    metadataResolve: null,
                    videoInfo: null,
                    errorMessage: null,
                    selectedFormatId: '',
                    audioOnly: false,
                    multiBatchQueued: false,
                    youtubeWatchPlaylistChoice: null,
                    channelQueueVideos: true,
                    channelQueueShorts: false,
                    channelQueueLive: false
                }))
            );

            const controller = new AbortController();
            const { signal } = controller;
            const timer = setTimeout(() => {
                setError(null);

                const updateRow = (
                    lineIndex: number,
                    patch: Partial<MultilinePreviewRowState>
                ): void => {
                    if (signal.aborted) {
                        return;
                    }
                    setMultilinePreviewRows((prev) =>
                        prev.map((r) => (r.lineIndex === lineIndex ? { ...r, ...patch } : r))
                    );
                };

                const processLine = async (inputUrl: string, lineIndex: number): Promise<void> => {
                    try {
                        const result = await window.api.resolveMetadataUrl(inputUrl);
                        if (signal.aborted) {
                            return;
                        }
                        updateRow(lineIndex, { metadataResolve: result, resolvePending: false });

                        if (result.kind === 'single') {
                            updateRow(lineIndex, { fetchPending: true });
                            try {
                                const videoResult = await window.api.fetchVideoInfo(result.url);
                                if (signal.aborted) {
                                    return;
                                }
                                if (!videoResult.data) {
                                    updateRow(lineIndex, {
                                        fetchPending: false,
                                        videoInfo: null,
                                        selectedFormatId: '',
                                        errorMessage: getMediaLookupErrorMessage(
                                            videoResult,
                                            authSessionReady,
                                            'video'
                                        )
                                    });
                                    return;
                                }
                                const vi = videoResult.data;
                                const preferredFormat = getPreferredFormat(
                                    vi.formats,
                                    preferredQualityRef.current
                                );
                                updateRow(lineIndex, {
                                    videoInfo: vi,
                                    fetchPending: false,
                                    selectedFormatId: preferredFormat?.id ?? '',
                                    audioOnly: Boolean(preferredFormat?.audioOnly)
                                });
                            } catch (cause) {
                                updateRow(lineIndex, {
                                    fetchPending: false,
                                    videoInfo: null,
                                    selectedFormatId: '',
                                    errorMessage: getErrorMessage(
                                        cause,
                                        t('errors:failedFetchVideo')
                                    )
                                });
                            }
                            return;
                        }

                        if (result.kind === 'multi') {
                            updateRow(lineIndex, {
                                multiBatchQueued: false,
                                youtubeWatchPlaylistChoice: null
                            });
                            return;
                        }

                        const mediaLabel: 'video' | 'playlist' =
                            result.candidateMode === 'multi' ||
                            result.youtubeBatchKind === 'channel'
                                ? 'playlist'
                                : 'video';

                        if (result.kind === 'auth-required') {
                            updateRow(lineIndex, { errorMessage: null });
                            return;
                        }
                        if (result.kind === 'blocked') {
                            updateRow(lineIndex, {
                                errorMessage: result.reason?.trim()
                                    ? result.reason
                                    : mediaLabel === 'playlist'
                                      ? t('errors:metadataPlaylistFailed')
                                      : t('errors:metadataVideoFailed')
                            });
                            return;
                        }
                        updateRow(lineIndex, {
                            errorMessage: result.message?.trim()
                                ? result.message
                                : mediaLabel === 'playlist'
                                  ? t('errors:metadataPlaylistFailed')
                                  : t('errors:metadataVideoFailed')
                        });
                    } catch (cause) {
                        if (signal.aborted) {
                            return;
                        }
                        updateRow(lineIndex, {
                            resolvePending: false,
                            fetchPending: false,
                            metadataResolve: {
                                kind: 'unsupported',
                                url: inputUrl,
                                message: getErrorMessage(cause, t('errors:metadataVideoFailed')),
                                ...buildStaticMetadataResolveContext(inputUrl)
                            },
                            errorMessage: getErrorMessage(cause, t('errors:metadataVideoFailed'))
                        });
                    }
                };

                // Process lines in chunks of 25 to avoid blocking the main thread
                // for large playlists (500+ items). Yield between chunks via setTimeout(0).
                const BATCH_CHUNK_SIZE = 25;
                const processInChunks = async (): Promise<void> => {
                    for (let start = 0; start < lines.length; start += BATCH_CHUNK_SIZE) {
                        if (signal.aborted) break;
                        const chunk = lines.slice(start, start + BATCH_CHUNK_SIZE);
                        await Promise.allSettled(
                            chunk.map((inputUrl, i) => processLine(inputUrl, start + i))
                        );
                        if (!signal.aborted && start + BATCH_CHUNK_SIZE < lines.length) {
                            await new Promise<void>((resolve) => setTimeout(resolve, 0));
                        }
                    }
                };
                void processInChunks();
            }, 450);

            return () => {
                controller.abort();
                clearTimeout(timer);
            };
        }

        setMultilinePreviewRows((prev) => (prev.length === 0 ? prev : []));
        setVideoInfo(null);
        setSelectedFormatId('');
        setMetadataResolve(null);
        setMetadataResolvePending(true);
        setIsFetchingInfo(false);

        const metadataTargetUrl = primaryBatchOrSingleUrl(trimmedUrl);

        const controller = new AbortController();
        const { signal } = controller;
        const timer = setTimeout(() => {
            setError(null);

            void window.api
                .resolveMetadataUrl(metadataTargetUrl)
                .then((result) => {
                    if (signal.aborted) {
                        return;
                    }
                    setMetadataResolve(result);
                    setMetadataResolvePending(false);

                    if (result.kind === 'single') {
                        setIsFetchingInfo(true);
                        void window.api
                            .fetchVideoInfo(result.url)
                            .then((videoResult) => {
                                if (signal.aborted) {
                                    return;
                                }
                                if (!videoResult.data) {
                                    throw new Error(
                                        getMediaLookupErrorMessage(
                                            videoResult,
                                            authSessionReady,
                                            'video'
                                        )
                                    );
                                }
                                setVideoInfo(videoResult.data);
                            })
                            .catch((cause) => {
                                if (signal.aborted) {
                                    return;
                                }
                                setVideoInfo(null);
                                setSelectedFormatId('');
                                setError(getErrorMessage(cause, t('errors:failedFetchVideo')));
                            })
                            .finally(() => {
                                if (!signal.aborted) {
                                    setIsFetchingInfo(false);
                                }
                            });
                        return;
                    }

                    if (result.kind === 'multi') {
                        return;
                    }

                    const mediaLabel: 'video' | 'playlist' =
                        result.candidateMode === 'multi' || result.youtubeBatchKind === 'channel'
                            ? 'playlist'
                            : 'video';

                    if (result.kind === 'auth-required') {
                        setError(null);
                        return;
                    }
                    if (result.kind === 'blocked') {
                        setError(
                            result.reason?.trim()
                                ? result.reason
                                : mediaLabel === 'playlist'
                                  ? t('errors:metadataPlaylistFailed')
                                  : t('errors:metadataVideoFailed')
                        );
                        return;
                    }
                    setError(
                        result.message?.trim()
                            ? result.message
                            : mediaLabel === 'playlist'
                              ? t('errors:metadataPlaylistFailed')
                              : t('errors:metadataVideoFailed')
                    );
                })
                .catch((cause) => {
                    if (signal.aborted) {
                        return;
                    }
                    setMetadataResolve({
                        kind: 'unsupported',
                        url: metadataTargetUrl,
                        message: getErrorMessage(cause, t('errors:metadataVideoFailed')),
                        ...buildStaticMetadataResolveContext(metadataTargetUrl)
                    });
                    setMetadataResolvePending(false);
                    setError(getErrorMessage(cause, t('errors:metadataVideoFailed')));
                });
        }, 450);

        return () => {
            controller.abort();
            clearTimeout(timer);
        };
    }, [
        authSessionReady,
        getMediaLookupErrorMessage,
        metadataResolveRefreshKey,
        setError,
        setIsFetchingInfo,
        setMetadataResolve,
        setMetadataResolvePending,
        setMultilinePreviewRows,
        setSelectedFormatId,
        setVideoInfo,
        t,
        trimmedUrl,
        urlValidationError
    ]);

    useEffect(() => {
        setMultilinePreviewRows((prev) => {
            if (prev.length < 2) {
                return prev;
            }
            let changed = false;
            const next = prev.map((r) => {
                if (!r.videoInfo) {
                    return r;
                }
                const preferred = getPreferredFormat(
                    r.videoInfo.formats,
                    effectivePreferredQuality
                );
                const nextId = preferred?.id ?? '';
                if (nextId === r.selectedFormatId) {
                    return r;
                }
                changed = true;
                return {
                    ...r,
                    selectedFormatId: nextId,
                    audioOnly: preferred ? Boolean(preferred.audioOnly) : r.audioOnly
                };
            });
            return changed ? next : prev;
        });
    }, [effectivePreferredQuality, setMultilinePreviewRows]);

    useEffect(() => {
        if (!videoInfo) {
            return;
        }

        const preferredFormat = getPreferredFormat(videoInfo.formats, effectivePreferredQuality);
        const nextId = preferredFormat?.id ?? '';
        setSelectedFormatId(nextId);
        if (preferredFormat) {
            setAudioOnly(Boolean(preferredFormat.audioOnly));
        }
    }, [effectivePreferredQuality, setAudioOnly, setSelectedFormatId, videoInfo]);
}
