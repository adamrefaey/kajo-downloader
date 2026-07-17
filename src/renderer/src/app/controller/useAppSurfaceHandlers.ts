import type { TFunction } from 'i18next';
import type { Dispatch, MutableRefObject, SetStateAction } from 'react';
import type { AdvancedDownloadDefaultsPatch } from '../../../../shared/advancedDownloadSettings';
import type { AddDownloadPayload } from '../../../../store/downloadStore';
import type {
    AppSettings,
    DownloadItem,
    Format,
    MetadataResolveResult,
    NotificationSettings,
    VideoInfo
} from '../../../../types';
import type { SiteAuthManualOpenContext } from '../../components/SiteAuthBrowserModal';
import type { MultilinePreviewRowState } from '../multilinePreview.types';
import { useQueueItemHandlers } from './useQueueItemHandlers';
import { useSettingsHandlers } from './useSettingsHandlers';
import { useSiteAuthSetupHandlers } from './useSiteAuthSetupHandlers';
import { useStartDownloadHandler } from './useStartDownloadHandler';

export type UseAppSurfaceHandlersOptions = {
    t: TFunction;
    settings: Pick<AppSettings, 'outputDir' | 'maxConcurrentDownloads' | 'preferredQuality'>;
    setError: Dispatch<SetStateAction<string | null>>;
    hydrateSettings: (s: AppSettings | null) => void;
    canQuickStartDownload: boolean;
    modals: {
        setSettingsOpen: Dispatch<SetStateAction<boolean>>;
        setSiteSessionsModalOpen: Dispatch<SetStateAction<boolean>>;
        setSiteAuthManualOpen: Dispatch<SetStateAction<SiteAuthManualOpenContext | null>>;
        setSiteAuthModalOpen: Dispatch<SetStateAction<boolean>>;
    };
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
    queue: {
        addDownload: (payload: AddDownloadPayload) => string;
        updateDownload: (id: string, patch: Partial<DownloadItem>) => void;
        startInFlightRef: MutableRefObject<Set<string>>;
        pauseInFlightRef: MutableRefObject<Set<string>>;
        resumeInFlightRef: MutableRefObject<Set<string>>;
        removeDuringStartRef: MutableRefObject<Set<string>>;
        removeDownloadState: (id: string) => void;
        pauseDownloadWithReason: (id: string, reason: 'manual' | 'concurrency') => Promise<void>;
        resumeDownloadFromPause: (id: string, manual: boolean) => Promise<void>;
        setIsYoutubeLibraryQueueing: Dispatch<SetStateAction<boolean>>;
    };
};

export function useAppSurfaceHandlers({
    t,
    settings,
    setError,
    hydrateSettings,
    canQuickStartDownload,
    modals: { setSiteSessionsModalOpen, setSiteAuthManualOpen, setSiteAuthModalOpen },
    preview,
    queue: {
        addDownload,
        updateDownload,
        startInFlightRef,
        pauseInFlightRef,
        resumeInFlightRef,
        removeDuringStartRef,
        removeDownloadState,
        pauseDownloadWithReason,
        resumeDownloadFromPause,
        setIsYoutubeLibraryQueueing
    }
}: UseAppSurfaceHandlersOptions): {
    handleSelectOutputFolder: () => Promise<void>;
    handleStartDownload: () => Promise<void>;
    handleStartDownloadRow: (lineIndex: number) => Promise<void>;
    handlePreferredQualityChange: (value: string) => Promise<void>;
    handleMaxConcurrentDownloadsChange: (value: string) => Promise<void>;
    handleQueueLikedVideos: () => Promise<void>;
    handleQueueWatchLater: () => Promise<void>;
    handleSectionTrimPatch: (
        downloadId: string,
        patch: Partial<{ start: string; end: string }>
    ) => void;
    handlePauseDownload: (downloadId: string) => Promise<void>;
    handleResumeDownload: (downloadId: string) => Promise<void>;
    handleRetryDownload: (downloadId: string) => Promise<void>;
    handleOpenDownloadedFile: (filePath: string) => Promise<void>;
    handleRevealDownloadedFile: (filePath: string) => Promise<void>;
    handleRemoveDownload: (downloadId: string) => Promise<void>;
    handlePauseBatch: (batchGroupId: string) => Promise<void>;
    handleResumeBatch: (batchGroupId: string) => Promise<void>;
    handleRemoveBatch: (batchGroupId: string) => Promise<void>;
    handleOpenSiteAuthFromSessions: (ctx: SiteAuthManualOpenContext) => void;
    handleInstallYtdlp: () => Promise<void>;
    handleUiLocaleChange: (value: string) => Promise<void>;
    handlePatchNotificationSettings: (patch: Partial<NotificationSettings>) => Promise<void>;
    handleSaveProxyUrl: (url: string | null) => Promise<void>;
    handlePatchAdvancedDownloadDefaults: (patch: AdvancedDownloadDefaultsPatch) => Promise<void>;
    handleCustomFilenameTemplateChange: (value: string) => Promise<void>;
} {
    const settingsHandlers = useSettingsHandlers({
        t,
        setError,
        hydrateSettings
    });

    const { handleSectionTrimPatch: applySectionTrimPatch, ...queueItemHandlersRest } =
        useQueueItemHandlers({
            updateDownload,
            startInFlightRef,
            pauseInFlightRef,
            resumeInFlightRef,
            removeDuringStartRef,
            removeDownloadState,
            pauseDownloadWithReason,
            resumeDownloadFromPause
        });

    const handleSectionTrimPatch = (
        downloadId: string,
        patch: Partial<{ start: string; end: string }>
    ) => {
        applySectionTrimPatch(downloadId, patch);
    };

    const startDownloadHandlers = useStartDownloadHandler({
        t,
        settings,
        setError,
        canQuickStartDownload,
        preview,
        addDownload,
        updateDownload,
        setIsYoutubeLibraryQueueing
    });

    const authHandlers = useSiteAuthSetupHandlers({
        t,
        setError,
        setSiteSessionsModalOpen,
        setSiteAuthManualOpen,
        setSiteAuthModalOpen
    });

    return {
        ...settingsHandlers,
        ...queueItemHandlersRest,
        handleSectionTrimPatch,
        ...startDownloadHandlers,
        ...authHandlers
    };
}
