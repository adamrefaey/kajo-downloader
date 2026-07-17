import {
    isMultilineBatchInput,
    parseBatchUrlLines,
    primaryBatchOrSingleUrl
} from '../../../../shared/batchUrlInput';
import { resolveMediaInputUrl } from '../../../../shared/mediaUrlResolver';
import { useSetupStore } from '../../../../store/setupStore';
import type { Format, MetadataResolveResult, VideoInfo } from '../../../../types';
import { getMultilineBatchValidationMessage } from '../../lib/batchUrlInputValidation';
import { getMediaUrlValidationMessage } from '../../lib/mediaUrlValidation';
import type { MultilinePreviewRowState } from '../multilinePreview.types';
import { multilineRowIsDownloadReady } from '../multilinePreview.types';
import type { YoutubeWatchPlaylistChoice } from './useAppControllerLocalState';

export function deriveCanQuickStartDownload(inputs: {
    multilineBatchMode: boolean;
    isBatchUrl: boolean;
    videoInfo: VideoInfo | null;
    metadataResolve: MetadataResolveResult | null;
    metadataResolvePending: boolean;
    urlResolution: ReturnType<typeof resolveMediaInputUrl>;
    settingsOutputDir: string;
    isStartingDownload: boolean;
    setupYtdlpReady: boolean;
    urlValidationError: string | null;
    trimmedUrl: string;
    isFetchingInfo: boolean;
}): boolean {
    const resolveAllowsQuickStart =
        inputs.metadataResolve?.kind === 'single' ||
        (inputs.metadataResolvePending &&
            inputs.urlResolution.candidateMode === 'single' &&
            inputs.metadataResolve?.kind !== 'auth-required' &&
            inputs.metadataResolve?.kind !== 'blocked' &&
            inputs.metadataResolve?.kind !== 'unsupported');
    return Boolean(
        !inputs.multilineBatchMode &&
            !inputs.isBatchUrl &&
            !inputs.videoInfo &&
            resolveAllowsQuickStart &&
            inputs.settingsOutputDir &&
            !inputs.isStartingDownload &&
            inputs.setupYtdlpReady &&
            !inputs.urlValidationError &&
            inputs.trimmedUrl &&
            (inputs.isFetchingInfo || inputs.metadataResolvePending)
    );
}

export function useAppWorkflowDerived(options: {
    url: string;
    videoInfo: VideoInfo | null;
    selectedFormatId: string;
    metadataResolve: MetadataResolveResult | null;
    metadataResolvePending: boolean;
    isFetchingInfo: boolean;
    settingsOutputDir: string;
    isStartingDownload: boolean;
    channelQueueVideos: boolean;
    channelQueueShorts: boolean;
    channelQueueLive: boolean;
    /** When null with a YouTube watch+list fork, batch actions stay gated until the user chooses. */
    youtubeWatchPlaylistChoice: YoutubeWatchPlaylistChoice;
    multilinePreviewRows: MultilinePreviewRowState[];
}): {
    selectedFormat: Format | null;
    trimmedUrl: string;
    urlResolution: ReturnType<typeof resolveMediaInputUrl>;
    isBatchUrl: boolean;
    isYoutubeChannelBatch: boolean;
    loadingPreviewKind: 'channel' | 'playlist' | 'video';
    authSessionReady: boolean;
    urlValidationError: string | null;
    canStartVideoDownload: boolean;
    canQuickStartDownload: boolean;
    channelSectionsSelected: boolean;
    canStartBatchDownload: boolean;
    canStartDownload: boolean;
    showSetupGate: boolean;
    channelSelectionResetKey: string;
} {
    const {
        url,
        videoInfo,
        selectedFormatId,
        metadataResolve,
        metadataResolvePending,
        isFetchingInfo,
        settingsOutputDir,
        isStartingDownload,
        channelQueueVideos,
        channelQueueShorts,
        channelQueueLive,
        youtubeWatchPlaylistChoice,
        multilinePreviewRows
    } = options;

    const setupYtdlpReady = useSetupStore((s) => s.setupStatus?.ytdlpReady);

    const selectedFormat = videoInfo
        ? (videoInfo.formats.find((format) => format.id === selectedFormatId) ?? null)
        : null;

    const trimmedUrl = url.trim();
    const batchLines = parseBatchUrlLines(url);
    const multilineBatchMode = isMultilineBatchInput(batchLines);
    const primaryInputUrl = primaryBatchOrSingleUrl(trimmedUrl);
    const urlResolution = resolveMediaInputUrl(primaryInputUrl);
    const isBatchUrl = metadataResolve?.kind === 'multi';
    const youtubeForkNeedsChoice =
        isBatchUrl &&
        Boolean(metadataResolve?.youtubeWatchPlaylistFork) &&
        youtubeWatchPlaylistChoice === null;
    const isYoutubeChannelBatch = isBatchUrl && metadataResolve?.youtubeBatchKind === 'channel';
    /** Prefer server resolve over raw URL so watch+list → single (after "This video only") shows video copy. */
    const loadingPreviewKind =
        metadataResolve?.kind === 'single'
            ? 'video'
            : metadataResolve?.kind === 'multi'
              ? metadataResolve.youtubeBatchKind === 'channel'
                  ? 'channel'
                  : metadataResolve.youtubeBatchKind === 'playlist'
                    ? 'playlist'
                    : urlResolution.youtubeBatchKind === 'channel'
                      ? 'channel'
                      : urlResolution.youtubeBatchKind === 'playlist'
                        ? 'playlist'
                        : 'video'
              : urlResolution.youtubeBatchKind === 'channel'
                ? 'channel'
                : urlResolution.youtubeBatchKind === 'playlist'
                  ? 'playlist'
                  : 'video';
    /** Site sessions supply cookies; use signed-out copy for auth-gated media hints. */
    const authSessionReady = false;
    const urlValidationError = multilineBatchMode
        ? getMultilineBatchValidationMessage(batchLines)
        : getMediaUrlValidationMessage(trimmedUrl, urlResolution);
    const canStartVideoDownload = Boolean(
        videoInfo && selectedFormatId && settingsOutputDir && !isStartingDownload && setupYtdlpReady
    );
    const canQuickStartDownload = deriveCanQuickStartDownload({
        multilineBatchMode,
        isBatchUrl,
        videoInfo,
        metadataResolve,
        metadataResolvePending,
        urlResolution,
        settingsOutputDir,
        isStartingDownload,
        setupYtdlpReady: Boolean(setupYtdlpReady),
        urlValidationError,
        trimmedUrl,
        isFetchingInfo
    });
    const channelSectionsSelected =
        !isYoutubeChannelBatch || channelQueueVideos || channelQueueShorts || channelQueueLive;
    const canStartBatchDownload = Boolean(
        isBatchUrl &&
            settingsOutputDir &&
            !isStartingDownload &&
            setupYtdlpReady &&
            channelSectionsSelected &&
            !youtubeForkNeedsChoice
    );
    const multilineRowsAlignWithInput =
        multilineBatchMode &&
        multilinePreviewRows.length === batchLines.length &&
        multilinePreviewRows.every((row, i) => row.inputUrl === batchLines[i]);
    const allMultilineRowsReady =
        multilineRowsAlignWithInput &&
        multilinePreviewRows.length > 0 &&
        multilinePreviewRows.every(multilineRowIsDownloadReady);
    const canStartMultilineBatch = Boolean(
        multilineBatchMode &&
            !urlValidationError &&
            allMultilineRowsReady &&
            settingsOutputDir &&
            !isStartingDownload &&
            setupYtdlpReady
    );
    /** In multiline paste mode, ignore temporary single-line `metadataResolve` (e.g. batch picker). */
    const canStartDownload = multilineBatchMode
        ? canStartMultilineBatch
        : canStartVideoDownload || canStartBatchDownload || canQuickStartDownload;
    const showSetupGate = !setupYtdlpReady;
    const channelSelectionResetKey = isYoutubeChannelBatch ? trimmedUrl : '';

    return {
        selectedFormat,
        trimmedUrl,
        urlResolution,
        isBatchUrl,
        isYoutubeChannelBatch,
        loadingPreviewKind,
        authSessionReady,
        urlValidationError,
        canStartVideoDownload,
        canQuickStartDownload,
        channelSectionsSelected,
        canStartBatchDownload,
        canStartDownload,
        showSetupGate,
        channelSelectionResetKey
    };
}
