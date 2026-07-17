import type { Format, MetadataResolveResult, VideoInfo } from '../../../types';
import type { MultilinePreviewRowState } from '../app/multilinePreview.types';
import { AppWorkflowAuthRequiredCard } from './appWorkflowPreview/AppWorkflowAuthRequiredCard';
import { AppWorkflowChannelBatchCard } from './appWorkflowPreview/AppWorkflowChannelBatchCard';
import { AppWorkflowLoadingCard } from './appWorkflowPreview/AppWorkflowLoadingCard';
import { AppWorkflowSingleVideoCard } from './appWorkflowPreview/AppWorkflowSingleVideoCard';
import { MultilineBatchPreviewPanel } from './MultilineBatchPreviewPanel';
import type { VideoInfoLoadingPreviewKind } from './VideoInfoLoadingPreview';

export type AppWorkflowPreviewProps = {
    multilinePreviewRows: MultilinePreviewRowState[];
    onMultilineRowFormatChange: (lineIndex: number, formatId: string) => void;
    onMultilineRowAudioOnly: (lineIndex: number, next: boolean) => void;
    videoInfo: VideoInfo | null;
    formatsForQualityUi: Format[];
    selectedFormatId: string;
    audioOnly: boolean;
    onChangeFormatId: (id: string) => void;
    onToggleAudioOnly: (next: boolean) => void;
    previewTrimExpanded: boolean;
    onTogglePreviewTrimExpanded: () => void;
    previewTrimStart: string;
    previewTrimEnd: string;
    onPreviewTrimStartChange: (value: string) => void;
    onPreviewTrimEndChange: (value: string) => void;
    canStartDownload: boolean;
    canQuickStartDownload: boolean;
    quickStartQualityMax: number | null;
    isStartingDownload: boolean;
    onStartDownload: () => void;
    isBatchUrl: boolean;
    isYoutubeChannelBatch: boolean;
    channelQueueVideos: boolean;
    channelQueueShorts: boolean;
    channelQueueLive: boolean;
    onChannelQueueVideosChange: (checked: boolean) => void;
    onChannelQueueShortsChange: (checked: boolean) => void;
    onChannelQueueLiveChange: (checked: boolean) => void;
    canStartBatchDownload: boolean;
    onChannelBatchBrowse: () => void;
    isAuthGate: boolean;
    metadataResolve: MetadataResolveResult | null;
    onOpenSiteAuthFromPreview: () => void;
    metadataResolvePending: boolean;
    isFetchingInfo: boolean;
    trimmedUrl: string;
    urlValidationError: string | null;
    loadingPreviewKind: VideoInfoLoadingPreviewKind;
    onMultilineRowOpenPlaylistPicker: (lineIndex: number) => void | Promise<void>;
    onMultilineRowOpenChannelPicker: (lineIndex: number) => void | Promise<void>;
    onMultilineYoutubeForkVideo: (lineIndex: number) => void;
    onMultilineYoutubeForkPlaylist: (lineIndex: number) => void;
    onMultilineYoutubeForkDismiss: (lineIndex: number) => void;
    onMultilineRowChannelOptionsChange: (
        lineIndex: number,
        options: Partial<{
            channelQueueVideos: boolean;
            channelQueueShorts: boolean;
            channelQueueLive: boolean;
        }>
    ) => void;
    onStartDownloadRow: (lineIndex: number) => Promise<void>;
};

/**
 * Dispatcher for the workflow preview pane: picks one of the mutually-exclusive
 * preview states and renders the matching card. The fat branches live in focused
 * sub-components under `appWorkflowPreview/`; the thin multiline delegation and the
 * loading shell stay inline so the branch logic reads at a glance.
 */
export function AppWorkflowPreview({
    multilinePreviewRows,
    onMultilineRowFormatChange,
    onMultilineRowAudioOnly,
    videoInfo,
    formatsForQualityUi,
    selectedFormatId,
    audioOnly,
    onChangeFormatId,
    onToggleAudioOnly,
    previewTrimExpanded,
    onTogglePreviewTrimExpanded,
    previewTrimStart,
    previewTrimEnd,
    onPreviewTrimStartChange,
    onPreviewTrimEndChange,
    canStartDownload,
    canQuickStartDownload,
    quickStartQualityMax,
    isStartingDownload,
    onStartDownload,
    isBatchUrl,
    isYoutubeChannelBatch,
    channelQueueVideos,
    channelQueueShorts,
    channelQueueLive,
    onChannelQueueVideosChange,
    onChannelQueueShortsChange,
    onChannelQueueLiveChange,
    canStartBatchDownload,
    onChannelBatchBrowse,
    isAuthGate,
    metadataResolve,
    onOpenSiteAuthFromPreview,
    metadataResolvePending,
    isFetchingInfo,
    trimmedUrl,
    urlValidationError,
    loadingPreviewKind,
    onMultilineRowOpenPlaylistPicker,
    onMultilineRowOpenChannelPicker,
    onMultilineYoutubeForkVideo,
    onMultilineYoutubeForkPlaylist,
    onMultilineYoutubeForkDismiss,
    onMultilineRowChannelOptionsChange,
    onStartDownloadRow
}: AppWorkflowPreviewProps): React.JSX.Element | null {
    if (multilinePreviewRows.length >= 2) {
        return (
            <MultilineBatchPreviewPanel
                rows={multilinePreviewRows}
                onRowFormatChange={onMultilineRowFormatChange}
                onRowAudioOnly={onMultilineRowAudioOnly}
                previewTrimExpanded={previewTrimExpanded}
                onTogglePreviewTrimExpanded={onTogglePreviewTrimExpanded}
                previewTrimStart={previewTrimStart}
                previewTrimEnd={previewTrimEnd}
                onPreviewTrimStartChange={onPreviewTrimStartChange}
                onPreviewTrimEndChange={onPreviewTrimEndChange}
                isStartingDownload={isStartingDownload}
                onOpenSiteAuthFromPreview={onOpenSiteAuthFromPreview}
                onMultilineRowOpenPlaylistPicker={onMultilineRowOpenPlaylistPicker}
                onMultilineRowOpenChannelPicker={onMultilineRowOpenChannelPicker}
                onMultilineYoutubeForkVideo={onMultilineYoutubeForkVideo}
                onMultilineYoutubeForkPlaylist={onMultilineYoutubeForkPlaylist}
                onMultilineYoutubeForkDismiss={onMultilineYoutubeForkDismiss}
                onMultilineRowChannelOptionsChange={onMultilineRowChannelOptionsChange}
                onStartDownloadRow={onStartDownloadRow}
            />
        );
    }

    if (videoInfo) {
        return (
            <AppWorkflowSingleVideoCard
                videoInfo={videoInfo}
                formatsForQualityUi={formatsForQualityUi}
                selectedFormatId={selectedFormatId}
                audioOnly={audioOnly}
                onChangeFormatId={onChangeFormatId}
                onToggleAudioOnly={onToggleAudioOnly}
                previewTrimExpanded={previewTrimExpanded}
                onTogglePreviewTrimExpanded={onTogglePreviewTrimExpanded}
                previewTrimStart={previewTrimStart}
                previewTrimEnd={previewTrimEnd}
                onPreviewTrimStartChange={onPreviewTrimStartChange}
                onPreviewTrimEndChange={onPreviewTrimEndChange}
                canStartDownload={canStartDownload}
                isStartingDownload={isStartingDownload}
                onStartDownload={onStartDownload}
            />
        );
    }

    if (isBatchUrl && isYoutubeChannelBatch) {
        return (
            <AppWorkflowChannelBatchCard
                channelQueueVideos={channelQueueVideos}
                channelQueueShorts={channelQueueShorts}
                channelQueueLive={channelQueueLive}
                onChannelQueueVideosChange={onChannelQueueVideosChange}
                onChannelQueueShortsChange={onChannelQueueShortsChange}
                onChannelQueueLiveChange={onChannelQueueLiveChange}
                canStartBatchDownload={canStartBatchDownload}
                isStartingDownload={isStartingDownload}
                onChannelBatchBrowse={onChannelBatchBrowse}
            />
        );
    }

    if (isAuthGate && metadataResolve?.kind === 'auth-required') {
        return (
            <AppWorkflowAuthRequiredCard
                siteDisplayName={metadataResolve.siteDisplayName}
                siteDomain={metadataResolve.siteDomain}
                onOpenSiteAuthFromPreview={onOpenSiteAuthFromPreview}
            />
        );
    }

    if ((metadataResolvePending || isFetchingInfo) && trimmedUrl && !urlValidationError) {
        return (
            <AppWorkflowLoadingCard
                loadingPreviewKind={loadingPreviewKind}
                canQuickStartDownload={canQuickStartDownload}
                quickStartQualityMax={quickStartQualityMax}
                canStartDownload={canStartDownload}
                isStartingDownload={isStartingDownload}
                onStartDownload={onStartDownload}
            />
        );
    }

    return null;
}
