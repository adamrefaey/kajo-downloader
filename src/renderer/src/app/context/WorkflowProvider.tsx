import { useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { useShallow } from 'zustand/react/shallow';
import { isMultilineBatchInput, parseBatchUrlLines } from '../../../../shared/batchUrlInput';
import { useDownloadStore } from '../../../../store/downloadStore';
import { usePlatformStore } from '../../../../store/platformStore';
import { CONCURRENT_DOWNLOAD_OPTIONS, MAX_CONCURRENT_DOWNLOADS_UI } from '../appConstants';
import { getAppWorkflowStateText } from '../controller/appWorkflowStateText';
import type { RendererPlatform } from '../controller/rendererPlatform';
import { useAppControllerLocalState } from '../controller/useAppControllerLocalState';
import { useAppControllerMedia } from '../controller/useAppControllerMedia';
import { useAppControllerPreviewPanel } from '../controller/useAppControllerPreviewPanel';
import { useAppInitAndCatalogEffects } from '../controller/useAppInitAndCatalogEffects';
import { useAppLocaleAndSiteEffects } from '../controller/useAppLocaleAndSiteEffects';
import { useAppSurfaceHandlers } from '../controller/useAppSurfaceHandlers';
import { useAppWorkflowDerived } from '../controller/useAppWorkflowDerived';
import { useBatchPlaylistWorkflow } from '../controller/useBatchPlaylistWorkflow';
import { useDownloadQueueControl } from '../controller/useDownloadQueueControl';
import { useMultilineYoutubeHandlers } from '../controller/useMultilineYoutubeHandlers';
import { useUrlWorkflowEffects } from '../controller/useUrlWorkflowEffects';
import { useMainProcessSubscriptions } from '../useMainProcessSubscriptions';
import {
    AppModalsContext,
    QueueActionsContext,
    SettingsActionsContext,
    WorkflowContext
} from './AppControllerContext';

export function WorkflowProvider({ children }: { children: React.ReactNode }): React.JSX.Element {
    const { t } = useTranslation(['app', 'errors', 'common', 'components']);
    const platform: RendererPlatform = window.api?.getPlatform?.() ?? 'unknown';

    useEffect(() => {
        usePlatformStore.getState().setPlatform(platform);
    }, [platform]);

    const store = useDownloadStore(
        useShallow((state) => ({
            settings: state.settings,
            addDownload: state.addDownload,
            prependDownloads: state.prependDownloads,
            cancelDownloadState: state.cancelDownload,
            completeDownload: state.completeDownload,
            setSettings: state.setSettings,
            updateDownload: state.updateDownload,
            updateDownloadProgress: state.updateDownloadProgress,
            removeDownloadState: state.removeDownload,
            hydrateSettings: state.hydrateSettings
        }))
    );
    const s = useAppControllerLocalState();
    const { autoBatchPickerOpenedUrlRef } = s.multiPicker;

    const { effectivePreferredQuality, formatsForQualityUi, getMediaLookupErrorMessage } =
        useAppControllerMedia(s.videoInfo, store.settings.preferredQuality);

    const urlInputRef = useRef<HTMLTextAreaElement>(null);
    const focusUrlInput = (): void => {
        requestAnimationFrame(() => {
            urlInputRef.current?.focus();
        });
    };

    const {
        startInFlightRef,
        pauseInFlightRef,
        resumeInFlightRef,
        removeDuringStartRef,
        startQueuedDownload,
        pauseDownloadWithReason,
        resumeDownloadFromPause
    } = useDownloadQueueControl({
        t,
        updateDownload: store.updateDownload
    });

    useAppInitAndCatalogEffects({
        platform,
        hydrateSettings: store.hydrateSettings,
        t,
        setError: s.setError
    });

    useMainProcessSubscriptions({
        updateDownloadProgress: store.updateDownloadProgress,
        completeDownload: store.completeDownload,
        cancelDownloadState: store.cancelDownloadState,
        updateDownload: store.updateDownload,
        removeDownload: store.removeDownloadState,
        setVideoInfo: s.setVideoInfo,
        setUrl: s.setUrl,
        setClipboardHint: s.setClipboardHint,
        setError: s.setError
    });

    const {
        selectedFormat,
        trimmedUrl,
        isBatchUrl,
        isYoutubeChannelBatch,
        loadingPreviewKind,
        authSessionReady,
        urlValidationError,
        canStartDownload,
        canQuickStartDownload,
        canStartBatchDownload,
        showSetupGate,
        channelSelectionResetKey
    } = useAppWorkflowDerived({
        url: s.url,
        videoInfo: s.videoInfo,
        selectedFormatId: s.selectedFormatId,
        metadataResolve: s.metadataResolve,
        metadataResolvePending: s.metadataResolvePending,
        isFetchingInfo: s.isFetchingInfo,
        settingsOutputDir: store.settings.outputDir,
        isStartingDownload: s.isStartingDownload,
        channelQueueVideos: s.channelQueueVideos,
        channelQueueShorts: s.channelQueueShorts,
        channelQueueLive: s.channelQueueLive,
        youtubeWatchPlaylistChoice: s.youtubeWatchPlaylistChoice,
        multilinePreviewRows: s.multilinePreviewRows
    });

    const multilinePickerLineIndexRef = useRef<number | null>(null);
    const multilineBatchPasteActive = isMultilineBatchInput(parseBatchUrlLines(trimmedUrl));

    useAppLocaleAndSiteEffects({
        uiLocale: store.settings.uiLocale,
        videoInfo: s.videoInfo,
        multilineBatchActive: s.multilinePreviewRows.length >= 2,
        trimmedUrl,
        setPreviewTrimStart: s.setPreviewTrimStart,
        setPreviewTrimEnd: s.setPreviewTrimEnd,
        setPreviewTrimExpanded: s.setPreviewTrimExpanded
    });

    useUrlWorkflowEffects({
        isYoutubeChannelBatch,
        channelSelectionResetKey,
        setChannelQueueVideos: s.setChannelQueueVideos,
        setChannelQueueShorts: s.setChannelQueueShorts,
        setChannelQueueLive: s.setChannelQueueLive,
        showSetupGate,
        focusUrlInput,
        trimmedUrl,
        urlValidationError,
        authSessionReady,
        getMediaLookupErrorMessage,
        t,
        metadataResolveRefreshKey: s.metadataResolveRefreshKey,
        setIsFetchingInfo: s.setIsFetchingInfo,
        setMetadataResolvePending: s.setMetadataResolvePending,
        setMetadataResolve: s.setMetadataResolve,
        setVideoInfo: s.setVideoInfo,
        setSelectedFormatId: s.setSelectedFormatId,
        setError: s.setError,
        videoInfo: s.videoInfo,
        effectivePreferredQuality,
        setAudioOnly: s.setAudioOnly,
        setMultilinePreviewRows: s.setMultilinePreviewRows
    });

    const {
        executePlaylistDownload,
        openChannelMultiPicker,
        multiPickerChannelTabEntries,
        assertBatchDownloadAllowed,
        openBatchPickerModal,
        handleMultiPickerConfirm
    } = useBatchPlaylistWorkflow({
        t,
        trimmedUrl,
        urlValidationError,
        metadataResolve: s.metadataResolve,
        metadataResolvePending: s.metadataResolvePending,
        isYoutubeChannelBatch,
        authSessionReady,
        getMediaLookupErrorMessage,
        outputDir: store.settings.outputDir,
        numberPlaylistItems: s.numberPlaylistItems,
        previewTrimStart: s.previewTrimStart,
        previewTrimEnd: s.previewTrimEnd,
        prependDownloads: store.prependDownloads,
        focusUrlInput,
        setUrl: s.setUrl,
        setClipboardHint: s.setClipboardHint,
        setVideoInfo: s.setVideoInfo,
        setSelectedFormatId: s.setSelectedFormatId,
        setAudioOnly: s.setAudioOnly,
        channelQueueVideos: s.channelQueueVideos,
        channelQueueShorts: s.channelQueueShorts,
        channelQueueLive: s.channelQueueLive,
        multiPicker: s.multiPicker,
        isStartingDownload: s.isStartingDownload,
        setError: s.setError,
        setIsStartingDownload: s.setIsStartingDownload,
        youtubeWatchPlaylistChoice: s.youtubeWatchPlaylistChoice,
        multilineBatchPasteActive,
        multilinePickerLineIndexRef,
        setMultilinePreviewRows: s.setMultilinePreviewRows,
        setMetadataResolve: s.setMetadataResolve,
        effectivePreferredQuality
    });

    const {
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
    } = useMultilineYoutubeHandlers({
        t,
        authSessionReady,
        getMediaLookupErrorMessage,
        outputDir: store.settings.outputDir,
        multilinePickerLineIndexRef,
        multilinePreviewRows: s.multilinePreviewRows,
        setMultilinePreviewRows: s.setMultilinePreviewRows,
        metadataResolve: s.metadataResolve,
        setMetadataResolve: s.setMetadataResolve,
        metadataResolvePending: s.metadataResolvePending,
        setError: s.setError,
        setIsStartingDownload: s.setIsStartingDownload,
        setYoutubeWatchPlaylistChoice: s.setYoutubeWatchPlaylistChoice,
        setVideoInfo: s.setVideoInfo,
        setSelectedFormatId: s.setSelectedFormatId,
        setIsFetchingInfo: s.setIsFetchingInfo,
        setAudioOnly: s.setAudioOnly,
        setChannelQueueVideos: s.setChannelQueueVideos,
        setChannelQueueShorts: s.setChannelQueueShorts,
        setChannelQueueLive: s.setChannelQueueLive,
        channelQueueVideos: s.channelQueueVideos,
        channelQueueShorts: s.channelQueueShorts,
        channelQueueLive: s.channelQueueLive,
        youtubeWatchPlaylistChoice: s.youtubeWatchPlaylistChoice,
        openBatchPickerModal,
        openChannelMultiPicker
    });

    // Reset batch picker state whenever the URL changes.
    useEffect(() => {
        void trimmedUrl;
        autoBatchPickerOpenedUrlRef.current = null;
        s.setYoutubeWatchPlaylistChoice(null);
        // eslint-disable-next-line react-hooks/exhaustive-deps -- s is a controller wrapper; stable properties are listed individually
    }, [autoBatchPickerOpenedUrlRef, s.setYoutubeWatchPlaylistChoice, trimmedUrl]);

    const handleYoutubeWatchPlaylistForkDismiss = (): void => {
        s.setYoutubeWatchPlaylistChoice('dismissed');
        autoBatchPickerOpenedUrlRef.current = trimmedUrl;
    };

    const surface = useAppSurfaceHandlers({
        t,
        settings: store.settings,
        setError: s.setError,
        hydrateSettings: store.hydrateSettings,
        canQuickStartDownload,
        modals: {
            setSettingsOpen: s.modal.setSettingsOpen,
            setSiteSessionsModalOpen: s.modal.setSiteSessionsModalOpen,
            setSiteAuthManualOpen: s.modal.setSiteAuthManualOpen,
            setSiteAuthModalOpen: s.modal.setSiteAuthModalOpen
        },
        preview: {
            url: s.url,
            metadataResolve: s.metadataResolve,
            videoInfo: s.videoInfo,
            selectedFormatId: s.selectedFormatId,
            selectedFormat,
            audioOnly: s.audioOnly,
            previewTrimStart: s.previewTrimStart,
            previewTrimEnd: s.previewTrimEnd,
            focusUrlInput,
            setUrl: s.setUrl,
            setClipboardHint: s.setClipboardHint,
            setVideoInfo: s.setVideoInfo,
            setSelectedFormatId: s.setSelectedFormatId,
            setAudioOnly: s.setAudioOnly,
            setPreviewTrimStart: s.setPreviewTrimStart,
            setPreviewTrimEnd: s.setPreviewTrimEnd,
            multilinePreviewRows: s.multilinePreviewRows,
            setMultilinePreviewRows: s.setMultilinePreviewRows,
            isBatchUrl,
            openBatchPickerModal,
            setIsStartingDownload: s.setIsStartingDownload,
            executePlaylistDownload
        },
        queue: {
            addDownload: store.addDownload,
            updateDownload: store.updateDownload,
            startInFlightRef,
            pauseInFlightRef,
            resumeInFlightRef,
            removeDuringStartRef,
            removeDownloadState: store.removeDownloadState,
            pauseDownloadWithReason,
            resumeDownloadFromPause,
            setIsYoutubeLibraryQueueing: s.setIsYoutubeLibraryQueueing
        }
    });

    const isAuthGate = s.metadataResolve?.kind === 'auth-required';
    const workflowStateText = getAppWorkflowStateText({
        t,
        showSetupGate,
        error: s.error,
        isAuthGate,
        isBatchUrl,
        isYoutubeChannelBatch,
        videoInfo: s.videoInfo,
        trimmedUrl,
        multilinePreviewRows: s.multilinePreviewRows
    });
    const clampedConcurrent = Math.max(
        1,
        Math.min(
            MAX_CONCURRENT_DOWNLOADS_UI,
            Math.floor(store.settings.maxConcurrentDownloads) || 1
        )
    );

    const previewQueueItem = useAppControllerPreviewPanel({
        multilinePreviewRows: s.multilinePreviewRows,
        setMultilinePreviewRows: s.setMultilinePreviewRows,
        videoInfo: s.videoInfo,
        formatsForQualityUi,
        selectedFormatId: s.selectedFormatId,
        audioOnly: s.audioOnly,
        setSelectedFormatId: s.setSelectedFormatId,
        setAudioOnly: s.setAudioOnly,
        previewTrimExpanded: s.previewTrimExpanded,
        setPreviewTrimExpanded: s.setPreviewTrimExpanded,
        previewTrimStart: s.previewTrimStart,
        previewTrimEnd: s.previewTrimEnd,
        setPreviewTrimStart: s.setPreviewTrimStart,
        setPreviewTrimEnd: s.setPreviewTrimEnd,
        canStartDownload,
        canQuickStartDownload,
        isStartingDownload: s.isStartingDownload,
        onStartDownload: surface.handleStartDownload,
        quickStartQualityMax: effectivePreferredQuality,
        isBatchUrl,
        isYoutubeChannelBatch,
        channelQueueVideos: s.channelQueueVideos,
        channelQueueShorts: s.channelQueueShorts,
        channelQueueLive: s.channelQueueLive,
        setChannelQueueVideos: s.setChannelQueueVideos,
        setChannelQueueShorts: s.setChannelQueueShorts,
        setChannelQueueLive: s.setChannelQueueLive,
        canStartBatchDownload,
        isAuthGate,
        metadataResolve: s.metadataResolve,
        metadataResolvePending: s.metadataResolvePending,
        isFetchingInfo: s.isFetchingInfo,
        trimmedUrl,
        urlValidationError,
        loadingPreviewKind,
        modal: s.modal,
        t,
        settingsOutputDir: store.settings.outputDir,
        setError: s.setError,
        setIsStartingDownload: s.setIsStartingDownload,
        openChannelMultiPicker,
        onMultilineRowOpenPlaylistPicker: openMultilineRowPlaylistPicker,
        onMultilineRowOpenChannelPicker: openMultilineRowChannelPicker,
        onMultilineYoutubeForkVideo: handleMultilineYoutubeForkVideo,
        onMultilineYoutubeForkPlaylist: handleMultilineYoutubeForkPlaylist,
        onMultilineYoutubeForkDismiss: handleMultilineYoutubeForkDismiss,
        onMultilineRowChannelOptionsChange: handleMultilineRowChannelOptionsChange,
        onStartDownloadRow: surface.handleStartDownloadRow
    });

    const workflowValue = {
        t,
        url: s.url,
        setUrl: s.setUrl,
        videoInfo: s.videoInfo,
        selectedFormatId: s.selectedFormatId,
        setSelectedFormatId: s.setSelectedFormatId,
        audioOnly: s.audioOnly,
        setAudioOnly: s.setAudioOnly,
        previewTrimStart: s.previewTrimStart,
        setPreviewTrimStart: s.setPreviewTrimStart,
        previewTrimEnd: s.previewTrimEnd,
        setPreviewTrimEnd: s.setPreviewTrimEnd,
        previewTrimExpanded: s.previewTrimExpanded,
        setPreviewTrimExpanded: s.setPreviewTrimExpanded,
        numberPlaylistItems: s.numberPlaylistItems,
        setNumberPlaylistItems: s.setNumberPlaylistItems,
        channelQueueVideos: s.channelQueueVideos,
        setChannelQueueVideos: s.setChannelQueueVideos,
        channelQueueShorts: s.channelQueueShorts,
        setChannelQueueShorts: s.setChannelQueueShorts,
        channelQueueLive: s.channelQueueLive,
        setChannelQueueLive: s.setChannelQueueLive,
        clipboardHint: s.clipboardHint,
        setClipboardHint: s.setClipboardHint,
        metadataResolve: s.metadataResolve,
        metadataResolvePending: s.metadataResolvePending,
        isFetchingInfo: s.isFetchingInfo,
        isStartingDownload: s.isStartingDownload,
        setIsStartingDownload: s.setIsStartingDownload,
        isYoutubeLibraryQueueing: s.isYoutubeLibraryQueueing,
        error: s.error,
        setError: s.setError,
        setMetadataResolveRefreshKey: s.setMetadataResolveRefreshKey,
        effectivePreferredQuality,
        formatsForQualityUi,
        urlInputRef,
        focusUrlInput,
        trimmedUrl,
        urlValidationError,
        canStartDownload,
        isBatchUrl,
        isYoutubeChannelBatch,
        loadingPreviewKind,
        showSetupGate,
        isAuthGate,
        workflowStateText,
        previewQueueItem,
        handleStartDownload: surface.handleStartDownload,
        handleInstallYtdlp: surface.handleInstallYtdlp,
        executePlaylistDownload,
        openChannelMultiPicker,
        assertBatchDownloadAllowed,
        openBatchPickerModal,
        prependDownloads: store.prependDownloads,
        pauseDownloadWithReason,
        resumeDownloadFromPause,
        startQueuedDownload
    };

    const queueActionsValue = {
        handlePauseDownload: surface.handlePauseDownload,
        handleResumeDownload: surface.handleResumeDownload,
        handleRetryDownload: surface.handleRetryDownload,
        handleRemoveDownload: surface.handleRemoveDownload,
        handlePauseBatch: surface.handlePauseBatch,
        handleResumeBatch: surface.handleResumeBatch,
        handleRemoveBatch: surface.handleRemoveBatch,
        handleOpenDownloadedFile: surface.handleOpenDownloadedFile,
        handleRevealDownloadedFile: surface.handleRevealDownloadedFile,
        handleSectionTrimPatch: surface.handleSectionTrimPatch
    };

    const settingsActionsValue = {
        settings: store.settings,
        handleSelectOutputFolder: surface.handleSelectOutputFolder,
        handlePreferredQualityChange: surface.handlePreferredQualityChange,
        handleMaxConcurrentDownloadsChange: surface.handleMaxConcurrentDownloadsChange,
        handleUiLocaleChange: surface.handleUiLocaleChange,
        handlePatchNotificationSettings: surface.handlePatchNotificationSettings,
        handleSaveProxyUrl: surface.handleSaveProxyUrl,
        handlePatchAdvancedDownloadDefaults: surface.handlePatchAdvancedDownloadDefaults,
        handleCustomFilenameTemplateChange: surface.handleCustomFilenameTemplateChange,
        clampedConcurrent,
        CONCURRENT_DOWNLOAD_OPTIONS
    };

    const appModalsValue = {
        modal: s.modal,
        multiPicker: s.multiPicker,
        multiPickerChannelTabEntries,
        handleMultiPickerConfirm,
        handleOpenSiteAuthFromSessions: surface.handleOpenSiteAuthFromSessions,
        handleQueueLikedVideos: surface.handleQueueLikedVideos,
        handleQueueWatchLater: surface.handleQueueWatchLater,
        youtubeWatchPlaylistForkModalOpen,
        handleYoutubeWatchPlaylistForkVideo,
        handleYoutubeWatchPlaylistForkPlaylist,
        handleYoutubeWatchPlaylistForkDismiss,
        handleMultilineMultiPickerDismiss
    };

    return (
        <SettingsActionsContext.Provider value={settingsActionsValue}>
            <AppModalsContext.Provider value={appModalsValue}>
                <QueueActionsContext.Provider value={queueActionsValue}>
                    <WorkflowContext.Provider value={workflowValue}>
                        {children}
                    </WorkflowContext.Provider>
                </QueueActionsContext.Provider>
            </AppModalsContext.Provider>
        </SettingsActionsContext.Provider>
    );
}
