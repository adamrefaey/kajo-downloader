import type { TFunction } from 'i18next';
import type { Dispatch, ReactElement, SetStateAction } from 'react';
import { useSetupStore } from '../../../../store/setupStore';
import type { Format, MetadataResolveResult, VideoInfo } from '../../../../types';
import { AppWorkflowPreview } from '../../components/AppWorkflowPreview';
import type { VideoInfoLoadingPreviewKind } from '../../components/VideoInfoLoadingPreview';
import { getErrorMessage } from '../../lib/youtubeAppHelpers';
import type { MultilinePreviewRowState } from '../multilinePreview.types';
import type { ModalState } from '../useModalState';

export type UseAppControllerPreviewPanelArgs = {
    multilinePreviewRows: MultilinePreviewRowState[];
    setMultilinePreviewRows: Dispatch<SetStateAction<MultilinePreviewRowState[]>>;
    videoInfo: VideoInfo | null;
    formatsForQualityUi: Format[];
    selectedFormatId: string;
    audioOnly: boolean;
    setSelectedFormatId: Dispatch<SetStateAction<string>>;
    setAudioOnly: Dispatch<SetStateAction<boolean>>;
    previewTrimExpanded: boolean;
    setPreviewTrimExpanded: Dispatch<SetStateAction<boolean>>;
    previewTrimStart: string;
    previewTrimEnd: string;
    setPreviewTrimStart: Dispatch<SetStateAction<string>>;
    setPreviewTrimEnd: Dispatch<SetStateAction<string>>;
    canStartDownload: boolean;
    canQuickStartDownload: boolean;
    quickStartQualityMax: number | null;
    isStartingDownload: boolean;
    onStartDownload: () => void | Promise<void>;
    isBatchUrl: boolean;
    isYoutubeChannelBatch: boolean;
    channelQueueVideos: boolean;
    channelQueueShorts: boolean;
    channelQueueLive: boolean;
    setChannelQueueVideos: Dispatch<SetStateAction<boolean>>;
    setChannelQueueShorts: Dispatch<SetStateAction<boolean>>;
    setChannelQueueLive: Dispatch<SetStateAction<boolean>>;
    canStartBatchDownload: boolean;
    isAuthGate: boolean;
    metadataResolve: MetadataResolveResult | null;
    metadataResolvePending: boolean;
    isFetchingInfo: boolean;
    trimmedUrl: string;
    urlValidationError: string | null;
    loadingPreviewKind: VideoInfoLoadingPreviewKind;
    modal: ModalState;
    t: TFunction;
    settingsOutputDir: string | undefined;
    setError: Dispatch<SetStateAction<string | null>>;
    setIsStartingDownload: Dispatch<SetStateAction<boolean>>;
    openChannelMultiPicker: () => Promise<boolean>;
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

export function useAppControllerPreviewPanel(args: UseAppControllerPreviewPanelArgs): ReactElement {
    const {
        multilinePreviewRows,
        setMultilinePreviewRows,
        onStartDownload,
        modal,
        t,
        settingsOutputDir,
        setError,
        setIsStartingDownload,
        openChannelMultiPicker,
        onMultilineRowOpenPlaylistPicker,
        onMultilineRowOpenChannelPicker,
        onMultilineYoutubeForkVideo,
        onMultilineYoutubeForkPlaylist,
        onMultilineYoutubeForkDismiss,
        onMultilineRowChannelOptionsChange,
        onStartDownloadRow,
        videoInfo,
        formatsForQualityUi,
        selectedFormatId,
        audioOnly,
        setSelectedFormatId,
        setAudioOnly,
        previewTrimExpanded,
        setPreviewTrimExpanded,
        previewTrimStart,
        previewTrimEnd,
        setPreviewTrimStart,
        setPreviewTrimEnd,
        canStartDownload,
        canQuickStartDownload,
        quickStartQualityMax,
        isStartingDownload,
        isBatchUrl,
        isYoutubeChannelBatch,
        channelQueueVideos,
        channelQueueShorts,
        channelQueueLive,
        setChannelQueueVideos,
        setChannelQueueShorts,
        setChannelQueueLive,
        canStartBatchDownload,
        isAuthGate,
        metadataResolve,
        metadataResolvePending,
        isFetchingInfo,
        trimmedUrl,
        urlValidationError,
        loadingPreviewKind
    } = args;

    const onOpenSiteAuthFromPreview = (): void => {
        modal.setSiteAuthManualOpen(null);
        modal.setSiteAuthModalOpen(true);
    };

    const handleChannelBatchBrowse = (): void => {
        void (async () => {
            if (!settingsOutputDir?.trim()) {
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
                await openChannelMultiPicker();
            } catch (cause) {
                setError(getErrorMessage(cause, t('errors:failedStartDownload')));
            } finally {
                setIsStartingDownload(false);
            }
        })();
    };

    const handleTogglePreviewTrim = (): void => {
        setPreviewTrimExpanded((open) => !open);
    };

    const handlePreviewTrimStartChange = (value: string): void => {
        setPreviewTrimStart(value);
    };

    const handlePreviewTrimEndChange = (value: string): void => {
        setPreviewTrimEnd(value);
    };

    const handleMultilineRowFormatChange = (lineIndex: number, formatId: string): void => {
        setMultilinePreviewRows((prev) =>
            prev.map((r) => {
                if (r.lineIndex !== lineIndex) {
                    return r;
                }
                const fmt = r.videoInfo?.formats.find((f) => f.id === formatId);
                return {
                    ...r,
                    selectedFormatId: formatId,
                    audioOnly: fmt ? Boolean(fmt.audioOnly) : r.audioOnly
                };
            })
        );
    };

    const handleMultilineRowAudioOnly = (lineIndex: number, next: boolean): void => {
        setMultilinePreviewRows((prev) =>
            prev.map((r) => (r.lineIndex === lineIndex ? { ...r, audioOnly: next } : r))
        );
    };

    return (
        <AppWorkflowPreview
            multilinePreviewRows={multilinePreviewRows}
            onMultilineRowFormatChange={handleMultilineRowFormatChange}
            onMultilineRowAudioOnly={handleMultilineRowAudioOnly}
            videoInfo={videoInfo}
            formatsForQualityUi={formatsForQualityUi}
            selectedFormatId={selectedFormatId}
            audioOnly={audioOnly}
            onChangeFormatId={setSelectedFormatId}
            onToggleAudioOnly={setAudioOnly}
            previewTrimExpanded={previewTrimExpanded}
            onTogglePreviewTrimExpanded={handleTogglePreviewTrim}
            previewTrimStart={previewTrimStart}
            previewTrimEnd={previewTrimEnd}
            onPreviewTrimStartChange={handlePreviewTrimStartChange}
            onPreviewTrimEndChange={handlePreviewTrimEndChange}
            canStartDownload={canStartDownload}
            canQuickStartDownload={canQuickStartDownload}
            quickStartQualityMax={quickStartQualityMax}
            isStartingDownload={isStartingDownload}
            onStartDownload={onStartDownload}
            isBatchUrl={isBatchUrl}
            isYoutubeChannelBatch={isYoutubeChannelBatch}
            channelQueueVideos={channelQueueVideos}
            channelQueueShorts={channelQueueShorts}
            channelQueueLive={channelQueueLive}
            onChannelQueueVideosChange={setChannelQueueVideos}
            onChannelQueueShortsChange={setChannelQueueShorts}
            onChannelQueueLiveChange={setChannelQueueLive}
            canStartBatchDownload={canStartBatchDownload}
            onChannelBatchBrowse={handleChannelBatchBrowse}
            isAuthGate={isAuthGate}
            metadataResolve={metadataResolve}
            onOpenSiteAuthFromPreview={onOpenSiteAuthFromPreview}
            metadataResolvePending={metadataResolvePending}
            isFetchingInfo={isFetchingInfo}
            trimmedUrl={trimmedUrl}
            urlValidationError={urlValidationError}
            loadingPreviewKind={loadingPreviewKind}
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
