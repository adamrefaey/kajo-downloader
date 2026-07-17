import type { TFunction } from 'i18next';
import type { Dispatch, MutableRefObject, SetStateAction } from 'react';
import { primaryBatchOrSingleUrl } from '../../../../shared/batchUrlInput';
import type { AddDownloadPayload } from '../../../../store/downloadStore';
import { useSetupStore } from '../../../../store/setupStore';
import type {
    MediaCandidate,
    MediaLookupResult,
    MetadataResolveResult,
    PlaylistInfo,
    VideoInfo,
    YoutubeChannelSectionTab
} from '../../../../types';
import type { MultiVideoPickerSelection } from '../../components/MultiVideoPickerModal';
import { queueSiteFieldsFromResolve } from '../../lib/queueSiteHelpers';
import {
    batchSectionTrimFromPreview,
    batchSiteLabelFromUrl,
    buildPlaylistBatchPayloads
} from '../../utils/playlistBatchPayloads';
import { PLAYLIST_SOFT_CAP } from '../appConstants';
import type { MultilinePreviewRowState } from '../multilinePreview.types';
import type { MultiPickerState } from '../useMultiPickerState';
import type { YoutubeWatchPlaylistChoice } from './useAppControllerLocalState';
import { useBatchPickerModal } from './useBatchPickerModal';
import type { ChannelPickerOverrides } from './useChannelPickerFetch';
import { useChannelPickerFetch } from './useChannelPickerFetch';

type MediaLookupFn = (
    result: MediaLookupResult<VideoInfo> | MediaLookupResult<PlaylistInfo> | null | undefined,
    authReady: boolean,
    mediaLabel: 'video' | 'playlist'
) => string;

// Re-export for consumers that import ChannelPickerOverrides from this module.
export type { ChannelPickerOverrides };

export function useBatchPlaylistWorkflow(options: {
    t: TFunction;
    trimmedUrl: string;
    urlValidationError: string | null;
    metadataResolve: MetadataResolveResult | null;
    metadataResolvePending: boolean;
    isYoutubeChannelBatch: boolean;
    authSessionReady: boolean;
    getMediaLookupErrorMessage: MediaLookupFn;
    outputDir: string;
    numberPlaylistItems: boolean;
    previewTrimStart: string;
    previewTrimEnd: string;
    prependDownloads: (payloads: AddDownloadPayload[]) => void;
    focusUrlInput: () => void;
    setUrl: Dispatch<SetStateAction<string>>;
    setClipboardHint: Dispatch<SetStateAction<string | null>>;
    setVideoInfo: Dispatch<SetStateAction<VideoInfo | null>>;
    setSelectedFormatId: Dispatch<SetStateAction<string>>;
    setAudioOnly: Dispatch<SetStateAction<boolean>>;
    channelQueueVideos: boolean;
    channelQueueShorts: boolean;
    channelQueueLive: boolean;
    multiPicker: MultiPickerState;
    isStartingDownload: boolean;
    setError: Dispatch<SetStateAction<string | null>>;
    setIsStartingDownload: Dispatch<SetStateAction<boolean>>;
    youtubeWatchPlaylistChoice: YoutubeWatchPlaylistChoice;
    multilineBatchPasteActive: boolean;
    multilinePickerLineIndexRef: MutableRefObject<number | null>;
    setMultilinePreviewRows: Dispatch<SetStateAction<MultilinePreviewRowState[]>>;
    setMetadataResolve: Dispatch<SetStateAction<MetadataResolveResult | null>>;
    effectivePreferredQuality: number | null;
}): {
    executePlaylistDownload: (
        playlistUrl: string,
        options?: { clearWorkflowAfter?: boolean }
    ) => Promise<boolean>;
    openChannelMultiPicker: (overrides?: ChannelPickerOverrides) => Promise<boolean>;
    multiPickerChannelTabEntries: Partial<Record<YoutubeChannelSectionTab, MediaCandidate[]>>;
    assertBatchDownloadAllowed: () => boolean;
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
        authSessionReady,
        getMediaLookupErrorMessage,
        outputDir,
        numberPlaylistItems,
        previewTrimStart,
        previewTrimEnd,
        prependDownloads,
        focusUrlInput,
        setUrl,
        setClipboardHint,
        setVideoInfo,
        setSelectedFormatId,
        setAudioOnly,
        channelQueueVideos,
        channelQueueShorts,
        channelQueueLive,
        multiPicker,
        isStartingDownload,
        setError,
        setIsStartingDownload,
        youtubeWatchPlaylistChoice,
        multilineBatchPasteActive,
        multilinePickerLineIndexRef,
        setMultilinePreviewRows,
        setMetadataResolve,
        effectivePreferredQuality
    } = options;

    const primaryWorkflowUrl = primaryBatchOrSingleUrl(trimmedUrl);
    const ytdlpReady = useSetupStore((s) => s.setupStatus?.ytdlpReady);

    const executePlaylistDownload = async (
        playlistUrl: string,
        opts?: { clearWorkflowAfter?: boolean }
    ): Promise<boolean> => {
        const trimmedPlaylistUrl = playlistUrl.trim();
        const clearWorkflowAfter = opts?.clearWorkflowAfter !== false;

        const playlistLookup = await window.api.fetchPlaylistInfo(trimmedPlaylistUrl);
        if (!playlistLookup.data) {
            throw new Error(
                getMediaLookupErrorMessage(playlistLookup, authSessionReady, 'playlist')
            );
        }
        const playlistInfo = playlistLookup.data;

        if (playlistInfo.entries.length === 0) {
            throw new Error(t('errors:playlistEmpty'));
        }

        if (playlistInfo.entries.length > PLAYLIST_SOFT_CAP) {
            const shouldContinue = window.confirm(
                t('app:playlistConfirm', {
                    count: playlistInfo.entries.length
                })
            );
            if (!shouldContinue) {
                return false;
            }
        }

        const playlistOutputDir = await window.api.preparePlaylistOutputDir({
            outputDir,
            playlistTitle: playlistInfo.title
        });
        if (!playlistOutputDir) {
            throw new Error(t('errors:playlistPrepareFolderFailed'));
        }

        const batchGroupId = crypto.randomUUID();
        const batchExtractedAt = Date.now();
        const batchSourceUrl = playlistInfo.sourceUrl ?? trimmedPlaylistUrl;
        const batchSiteLabel = batchSiteLabelFromUrl(trimmedPlaylistUrl);
        // Free, fully unlocked downloader: section trim is always available.
        const batchSectionTrim = batchSectionTrimFromPreview(previewTrimStart, previewTrimEnd);
        const batchPayloads = buildPlaylistBatchPayloads({
            playlistInfo,
            entries: playlistInfo.entries,
            playlistInputUrl: trimmedPlaylistUrl,
            playlistOutputDir,
            numberPlaylistItems,
            batchGroupId,
            batchSourceUrl,
            batchSiteLabel,
            batchExtractedAt,
            siteFieldsForUrl: (u, siteOpts) =>
                queueSiteFieldsFromResolve(metadataResolve, u, siteOpts),
            batchSectionTrim,
            preferredQuality: effectivePreferredQuality
        });
        prependDownloads(batchPayloads);

        if (clearWorkflowAfter) {
            setUrl('');
            setClipboardHint(null);
            setVideoInfo(null);
            setSelectedFormatId('');
            setAudioOnly(false);
            focusUrlInput();
        }
        return true;
    };

    const { openChannelMultiPicker, multiPickerChannelTabEntries } = useChannelPickerFetch({
        t,
        trimmedUrl,
        metadataResolve,
        channelQueueVideos,
        channelQueueShorts,
        channelQueueLive,
        primaryWorkflowUrl,
        multiPicker
    });

    /** Kept for call sites; gating happens when the user confirms a batch or runs a library queue. */
    const assertBatchDownloadAllowed = (): boolean => true;

    const { openBatchPickerModal, handleMultiPickerConfirm } = useBatchPickerModal({
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
    });

    return {
        executePlaylistDownload,
        openChannelMultiPicker,
        multiPickerChannelTabEntries,
        assertBatchDownloadAllowed,
        openBatchPickerModal,
        handleMultiPickerConfirm
    };
}
