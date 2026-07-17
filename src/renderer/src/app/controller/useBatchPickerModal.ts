import type { TFunction } from 'i18next';
import type { Dispatch, MutableRefObject, SetStateAction } from 'react';
import { useEffect, useRef } from 'react';
import { inferMediaCandidateCollectionKind } from '../../../../shared/mediaUrlResolver';
import {
    mergeYoutubeChannelSectionsForPlaylistInfo,
    type YoutubeChannelFetchedSection
} from '../../../../shared/youtubeChannelMerge';
import type { AddDownloadPayload } from '../../../../store/downloadStore';
import type {
    MediaCandidate,
    MetadataResolveResult,
    PlaylistInfo,
    VideoInfo
} from '../../../../types';
import type { MultiVideoPickerSelection } from '../../components/MultiVideoPickerModal';
import { multiVideoPickerEntryKey } from '../../components/multiVideoPickerEntryKey';
import { queueSiteFieldsFromResolve } from '../../lib/queueSiteHelpers';
import { getErrorMessage } from '../../lib/youtubeAppHelpers';
import {
    batchSiteLabelFromUrl,
    buildPlaylistBatchPayloads
} from '../../utils/playlistBatchPayloads';
import { PLAYLIST_SOFT_CAP } from '../appConstants';
import type { MultilinePreviewRowState } from '../multilinePreview.types';
import type { MultiPickerState } from '../useMultiPickerState';
import type { YoutubeWatchPlaylistChoice } from './useAppControllerLocalState';
import type { ChannelPickerOverrides } from './useChannelPickerFetch';
import { stickyPlaylistPickerHeader } from './useChannelPickerFetch';

export function useBatchPickerModal(options: {
    t: TFunction;
    trimmedUrl: string;
    urlValidationError: string | null;
    metadataResolve: MetadataResolveResult | null;
    metadataResolvePending: boolean;
    isYoutubeChannelBatch: boolean;
    multilineBatchPasteActive: boolean;
    youtubeWatchPlaylistChoice: YoutubeWatchPlaylistChoice;
    outputDir: string;
    numberPlaylistItems: boolean;
    isStartingDownload: boolean;
    openChannelMultiPicker: (overrides?: ChannelPickerOverrides) => Promise<boolean>;
    primaryWorkflowUrl: string;
    prependDownloads: (payloads: AddDownloadPayload[]) => void;
    focusUrlInput: () => void;
    setUrl: Dispatch<SetStateAction<string>>;
    setClipboardHint: Dispatch<SetStateAction<string | null>>;
    setVideoInfo: Dispatch<SetStateAction<VideoInfo | null>>;
    setSelectedFormatId: Dispatch<SetStateAction<string>>;
    setAudioOnly: Dispatch<SetStateAction<boolean>>;
    setError: Dispatch<SetStateAction<string | null>>;
    setIsStartingDownload: Dispatch<SetStateAction<boolean>>;
    ytdlpReady: boolean | undefined;
    multilinePickerLineIndexRef: MutableRefObject<number | null>;
    setMultilinePreviewRows: Dispatch<SetStateAction<MultilinePreviewRowState[]>>;
    setMetadataResolve: Dispatch<SetStateAction<MetadataResolveResult | null>>;
    multiPicker: MultiPickerState;
    effectivePreferredQuality: number | null;
}): {
    openBatchPickerModal: () => Promise<boolean>;
    handleMultiPickerConfirm: (selections: MultiVideoPickerSelection[]) => Promise<void>;
} {
    const {
        t,
        trimmedUrl,
        urlValidationError,
        metadataResolve,
        metadataResolvePending,
        isYoutubeChannelBatch,
        multilineBatchPasteActive,
        youtubeWatchPlaylistChoice,
        outputDir,
        numberPlaylistItems,
        isStartingDownload,
        openChannelMultiPicker,
        primaryWorkflowUrl,
        prependDownloads,
        focusUrlInput,
        setUrl,
        setClipboardHint,
        setVideoInfo,
        setSelectedFormatId,
        setAudioOnly,
        setError,
        setIsStartingDownload,
        ytdlpReady,
        multilinePickerLineIndexRef,
        setMultilinePreviewRows,
        setMetadataResolve,
        multiPicker,
        effectivePreferredQuality
    } = options;

    const {
        multiPickerOpen,
        multiPickerPlaylist,
        multiPickerSourceUrl,
        multiPickerExtractedAt,
        multiPickerChannelTabs,
        multiPickerChannelBundles,
        setMultiPickerOpen,
        setMultiPickerPlaylist,
        setMultiPickerSourceUrl,
        setMultiPickerExtractedAt,
        setMultiPickerChannelTabs,
        setMultiPickerChannelBundles,
        setMultiPickerChannelTabLoading,
        setMultiPickerChannelTabError,
        plainPlaylistStreamCancelRef,
        plainPlaylistStreamGenRef,
        setMultiPickerPlainPlaylistError,
        setMultiPickerPlainPlaylistStreaming,
        autoBatchPickerOpenedUrlRef,
        resetMultiPicker
    } = multiPicker;

    const openBatchPickerModal = async (): Promise<boolean> => {
        if (isYoutubeChannelBatch) {
            return openChannelMultiPicker();
        }
        const fetchUrl =
            metadataResolve?.kind === 'multi' || metadataResolve?.kind === 'single'
                ? metadataResolve.url.trim()
                : primaryWorkflowUrl;

        plainPlaylistStreamGenRef.current += 1;
        const gen = plainPlaylistStreamGenRef.current;

        setMultiPickerChannelTabs(null);
        setMultiPickerChannelBundles({});
        setMultiPickerChannelTabLoading({});
        setMultiPickerChannelTabError({});
        setMultiPickerPlainPlaylistError(null);
        setMultiPickerPlainPlaylistStreaming(true);
        setMultiPickerPlaylist({
            title: '',
            entries: [],
            sourceUrl: fetchUrl,
            collectionKind: inferMediaCandidateCollectionKind(fetchUrl)
        });
        setMultiPickerSourceUrl(fetchUrl);
        setMultiPickerExtractedAt(Date.now());
        autoBatchPickerOpenedUrlRef.current = trimmedUrl;
        setMultiPickerOpen(true);

        let accumulated: MediaCandidate[] = [];

        const cancel = await window.api.fetchPlaylistInfoStream(fetchUrl, (evt) => {
            if (gen !== plainPlaylistStreamGenRef.current) {
                return;
            }
            if (evt.kind === 'meta') {
                setMultiPickerPlaylist((prev) =>
                    prev
                        ? stickyPlaylistPickerHeader(
                              prev,
                              { title: evt.title, channel: evt.channel, id: evt.id },
                              ''
                          )
                        : prev
                );
            }
            if (evt.kind === 'entries' && evt.entries.length) {
                accumulated = accumulated.concat(evt.entries);
                setMultiPickerPlaylist((prev) => (prev ? { ...prev, entries: accumulated } : prev));
            }
            if (evt.kind === 'error') {
                setMultiPickerPlainPlaylistStreaming(false);
                plainPlaylistStreamCancelRef.current = null;
                setMultiPickerPlainPlaylistError(evt.message);
            }
            if (evt.kind === 'done') {
                setMultiPickerPlainPlaylistStreaming(false);
                plainPlaylistStreamCancelRef.current = null;
                if (accumulated.length === 0) {
                    setMultiPickerPlainPlaylistError(t('errors:playlistEmpty'));
                } else if (accumulated.length > PLAYLIST_SOFT_CAP) {
                    const shouldContinue = window.confirm(
                        t('app:playlistConfirm', {
                            count: accumulated.length
                        })
                    );
                    if (!shouldContinue) {
                        resetMultiPicker();
                    }
                }
            }
        });
        plainPlaylistStreamCancelRef.current = cancel;

        if (gen !== plainPlaylistStreamGenRef.current) {
            cancel();
        }
        return true;
    };

    const openBatchPickerModalRef = useRef(openBatchPickerModal);
    // Latest callback for async auto-open path; must not be listed on the effect below (unstable identity).
    // eslint-disable-next-line react-hooks/refs -- ref is not read during render, only kept current for IPC effect
    openBatchPickerModalRef.current = openBatchPickerModal;

    useEffect(() => {
        if (!window.api) {
            return;
        }
        if (multilineBatchPasteActive) {
            return;
        }
        if (!trimmedUrl || urlValidationError) {
            return;
        }
        if (metadataResolvePending) {
            return;
        }
        if (metadataResolve?.kind !== 'multi') {
            return;
        }
        if (metadataResolve.youtubeWatchPlaylistFork && youtubeWatchPlaylistChoice !== 'playlist') {
            return;
        }
        if (isYoutubeChannelBatch) {
            return;
        }
        if (!outputDir?.trim()) {
            return;
        }
        if (!ytdlpReady) {
            return;
        }
        if (multiPickerOpen) {
            return;
        }
        if (isStartingDownload) {
            return;
        }
        if (autoBatchPickerOpenedUrlRef.current === trimmedUrl) {
            return;
        }

        let cancelled = false;

        void (async () => {
            try {
                if (cancelled) {
                    return;
                }
                const opened = await openBatchPickerModalRef.current();
                if (cancelled) {
                    return;
                }
                if (opened) {
                    autoBatchPickerOpenedUrlRef.current = trimmedUrl;
                }
            } catch (cause) {
                if (!cancelled) {
                    setError(getErrorMessage(cause, t('errors:failedStartDownload')));
                }
            }
        })();

        return () => {
            cancelled = true;
        };
    }, [
        autoBatchPickerOpenedUrlRef,
        isStartingDownload,
        isYoutubeChannelBatch,
        multilineBatchPasteActive,
        metadataResolve,
        metadataResolvePending,
        multiPickerOpen,
        youtubeWatchPlaylistChoice,
        outputDir,
        setError,
        trimmedUrl,
        t,
        urlValidationError,
        ytdlpReady
    ]);

    const handleMultiPickerConfirm = async (
        selections: MultiVideoPickerSelection[]
    ): Promise<void> => {
        const clearMultilinePickerBridge = (): void => {
            if (multilinePickerLineIndexRef.current !== null) {
                multilinePickerLineIndexRef.current = null;
                setMetadataResolve(null);
            }
        };

        if (selections.length === 0 || !multiPickerSourceUrl.trim()) {
            clearMultilinePickerBridge();
            return;
        }
        const useChannelTabKeys = Boolean(multiPickerChannelTabs?.length);
        let playlistInfoForBatch: PlaylistInfo | null = null;
        if (useChannelTabKeys) {
            if (!multiPickerPlaylist) {
                clearMultilinePickerBridge();
                return;
            }
            const tabs = multiPickerChannelTabs ?? [];
            const sections = tabs
                .map((tab) => multiPickerChannelBundles[tab])
                .filter((b): b is YoutubeChannelFetchedSection => Boolean(b?.info.entries.length));
            if (sections.length === 0) {
                clearMultilinePickerBridge();
                return;
            }
            playlistInfoForBatch = mergeYoutubeChannelSectionsForPlaylistInfo(
                sections.map((s) => ({ lookupUrl: s.lookupUrl, info: s.info })),
                {
                    channelPageUrl: multiPickerSourceUrl.trim(),
                    title:
                        multiPickerPlaylist.title?.trim() ||
                        sections[0]?.info.channel?.trim() ||
                        sections[0]?.info.title?.trim() ||
                        t('app:channelBatchFallbackTitle')
                }
            );
        } else if (multiPickerPlaylist) {
            playlistInfoForBatch = multiPickerPlaylist;
        }
        if (!playlistInfoForBatch) {
            clearMultilinePickerBridge();
            return;
        }

        setIsStartingDownload(true);
        setError(null);
        try {
            const selectedEntries = selections.map((s) => s.entry);

            // For channel downloads, create per-section subfolders (videos/shorts/live).
            // For playlists, create a single folder named after the playlist.
            let playlistOutputDir: string;
            let getOutputDirForEntry:
                | ((entry: MediaCandidate, index: number) => string | undefined)
                | undefined;

            if (useChannelTabKeys) {
                const usedSections = [
                    ...new Set(
                        selectedEntries
                            .map((e) => e.channelSection)
                            .filter(
                                (s): s is 'videos' | 'shorts' | 'live' =>
                                    s === 'videos' || s === 'shorts' || s === 'live'
                            )
                    )
                ];
                const channelResult = await window.api.prepareChannelOutputDir({
                    outputDir,
                    channelTitle: playlistInfoForBatch.title,
                    sections: usedSections.length > 0 ? usedSections : (['videos'] as const)
                });
                if (!channelResult) {
                    throw new Error(t('errors:playlistPrepareFolderFailed'));
                }
                playlistOutputDir = channelResult.channelDir;
                const sectionDirs = channelResult.sectionDirs;
                getOutputDirForEntry = (entry) => {
                    const section = entry.channelSection;
                    if (section && sectionDirs[section]) {
                        return sectionDirs[section];
                    }
                    return channelResult.channelDir;
                };
            } else {
                const dir = await window.api.preparePlaylistOutputDir({
                    outputDir,
                    playlistTitle: playlistInfoForBatch.title
                });
                if (!dir) {
                    throw new Error(t('errors:playlistPrepareFolderFailed'));
                }
                playlistOutputDir = dir;
                getOutputDirForEntry = undefined;
            }

            const batchGroupId = crypto.randomUUID();
            const batchExtractedAt = multiPickerExtractedAt ?? Date.now();
            const batchSourceUrl = playlistInfoForBatch.sourceUrl ?? multiPickerSourceUrl;
            const batchSiteLabel = batchSiteLabelFromUrl(multiPickerSourceUrl);
            // Free, fully unlocked downloader: section trim is always available.
            const trimByKey = new Map<string, { start: string; end: string }>();
            for (const s of selections) {
                if (s.sectionTrim) {
                    const k =
                        useChannelTabKeys && s.entry.channelSection
                            ? `${s.entry.channelSection}:${multiVideoPickerEntryKey(s.entry)}`
                            : multiVideoPickerEntryKey(s.entry);
                    trimByKey.set(k, s.sectionTrim);
                }
            }
            const getSectionTrimForEntry = (entry: MediaCandidate) => {
                const k =
                    useChannelTabKeys && entry.channelSection
                        ? `${entry.channelSection}:${multiVideoPickerEntryKey(entry)}`
                        : multiVideoPickerEntryKey(entry);
                return trimByKey.get(k);
            };
            // Preserve each entry's original position in the full playlist/channel-tab list.
            const originalOrdinalMap = new Map<MediaCandidate, number>();
            for (const s of selections) {
                if (s.originalOrdinal !== undefined) {
                    originalOrdinalMap.set(s.entry, s.originalOrdinal);
                }
            }
            const getSequenceNumber =
                originalOrdinalMap.size > 0
                    ? (entry: MediaCandidate) => originalOrdinalMap.get(entry)
                    : undefined;
            const payloads = buildPlaylistBatchPayloads({
                playlistInfo: playlistInfoForBatch,
                entries: selectedEntries,
                playlistInputUrl: multiPickerSourceUrl,
                playlistOutputDir,
                numberPlaylistItems,
                batchGroupId,
                batchSourceUrl,
                batchSiteLabel,
                batchExtractedAt,
                siteFieldsForUrl: (u, siteOpts) =>
                    queueSiteFieldsFromResolve(metadataResolve, u, siteOpts),
                getSectionTrimForEntry,
                getSequenceNumber,
                getOutputDirForEntry,
                preferredQuality: effectivePreferredQuality
            });
            prependDownloads(payloads);
            resetMultiPicker();
            const multilineLine = multilinePickerLineIndexRef.current;
            if (multilineLine !== null) {
                multilinePickerLineIndexRef.current = null;
                setMultilinePreviewRows((prev) =>
                    prev.map((r) =>
                        r.lineIndex === multilineLine ? { ...r, multiBatchQueued: true } : r
                    )
                );
                setMetadataResolve(null);
            } else {
                setUrl('');
                setClipboardHint(null);
                setVideoInfo(null);
                setSelectedFormatId('');
                setAudioOnly(false);
                focusUrlInput();
            }
        } catch (cause) {
            if (multilinePickerLineIndexRef.current !== null) {
                multilinePickerLineIndexRef.current = null;
                setMetadataResolve(null);
            }
            setError(getErrorMessage(cause, t('errors:failedStartDownload')));
        } finally {
            setIsStartingDownload(false);
        }
    };

    return { openBatchPickerModal, handleMultiPickerConfirm };
}
