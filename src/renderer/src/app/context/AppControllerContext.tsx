import type { TFunction } from 'i18next';
import type { ReactElement, RefObject } from 'react';
import { type Context, createContext, useContext } from 'react';
import type { AdvancedDownloadDefaultsPatch } from '../../../../shared/advancedDownloadSettings';
import type { AddDownloadPayload } from '../../../../store/downloadStore';
import { useDownloadStore } from '../../../../store/downloadStore';
import { usePlatformStore } from '../../../../store/platformStore';
import type {
    AppSettings,
    DownloadItem,
    Format,
    MediaCandidate,
    MetadataResolveResult,
    NotificationSettings,
    VideoInfo,
    YoutubeChannelSectionTab
} from '../../../../types';
import type { MultiVideoPickerSelection } from '../../components/MultiVideoPickerModal';
import type { SiteAuthManualOpenContext } from '../../components/SiteAuthBrowserModal';
import type { RendererPlatform } from '../controller/rendererPlatform';

type ModalStateApi = ReturnType<typeof import('../useModalState').useModalState>;
type MultiPickerStateApi = ReturnType<typeof import('../useMultiPickerState').useMultiPickerState>;
type ConcurrentDownloadUiOptions = typeof import('../appConstants').CONCURRENT_DOWNLOAD_OPTIONS;

export type WorkflowContextValue = {
    t: TFunction;
    url: string;
    setUrl: React.Dispatch<React.SetStateAction<string>>;
    videoInfo: VideoInfo | null;
    selectedFormatId: string;
    setSelectedFormatId: React.Dispatch<React.SetStateAction<string>>;
    audioOnly: boolean;
    setAudioOnly: React.Dispatch<React.SetStateAction<boolean>>;
    previewTrimStart: string;
    setPreviewTrimStart: React.Dispatch<React.SetStateAction<string>>;
    previewTrimEnd: string;
    setPreviewTrimEnd: React.Dispatch<React.SetStateAction<string>>;
    previewTrimExpanded: boolean;
    setPreviewTrimExpanded: React.Dispatch<React.SetStateAction<boolean>>;
    numberPlaylistItems: boolean;
    setNumberPlaylistItems: React.Dispatch<React.SetStateAction<boolean>>;
    channelQueueVideos: boolean;
    setChannelQueueVideos: React.Dispatch<React.SetStateAction<boolean>>;
    channelQueueShorts: boolean;
    setChannelQueueShorts: React.Dispatch<React.SetStateAction<boolean>>;
    channelQueueLive: boolean;
    setChannelQueueLive: React.Dispatch<React.SetStateAction<boolean>>;
    clipboardHint: string | null;
    setClipboardHint: React.Dispatch<React.SetStateAction<string | null>>;
    metadataResolve: MetadataResolveResult | null;
    metadataResolvePending: boolean;
    isFetchingInfo: boolean;
    isStartingDownload: boolean;
    setIsStartingDownload: React.Dispatch<React.SetStateAction<boolean>>;
    isYoutubeLibraryQueueing: boolean;
    error: string | null;
    setError: React.Dispatch<React.SetStateAction<string | null>>;
    setMetadataResolveRefreshKey: React.Dispatch<React.SetStateAction<number>>;
    effectivePreferredQuality: number | null;
    formatsForQualityUi: Format[];
    urlInputRef: RefObject<HTMLTextAreaElement | null>;
    focusUrlInput: () => void;
    trimmedUrl: string;
    urlValidationError: string | null;
    canStartDownload: boolean;
    isBatchUrl: boolean;
    isYoutubeChannelBatch: boolean;
    loadingPreviewKind: 'channel' | 'playlist' | 'video';
    showSetupGate: boolean;
    isAuthGate: boolean;
    workflowStateText: string;
    previewQueueItem: ReactElement;
    handleStartDownload: () => Promise<void>;
    handleInstallYtdlp: () => Promise<void>;
    executePlaylistDownload: (
        url: string,
        opts?: { clearWorkflowAfter?: boolean }
    ) => Promise<boolean>;
    openChannelMultiPicker: () => Promise<boolean>;
    assertBatchDownloadAllowed: () => boolean;
    openBatchPickerModal: () => Promise<boolean>;
    prependDownloads: (items: AddDownloadPayload[]) => void;
    pauseDownloadWithReason: (
        downloadId: string,
        pauseReason: 'manual' | 'concurrency'
    ) => Promise<void>;
    resumeDownloadFromPause: (downloadId: string, manualOverride: boolean) => Promise<void>;
    startQueuedDownload: (downloadId: string) => Promise<void>;
};

export type QueueActionsContextValue = {
    handlePauseDownload: (downloadId: string) => Promise<void>;
    handleResumeDownload: (downloadId: string) => Promise<void>;
    handleRetryDownload: (downloadId: string) => Promise<void>;
    handleRemoveDownload: (downloadId: string) => Promise<void>;
    handlePauseBatch: (batchGroupId: string) => Promise<void>;
    handleResumeBatch: (batchGroupId: string) => Promise<void>;
    handleRemoveBatch: (batchGroupId: string) => Promise<void>;
    handleOpenDownloadedFile: (filePath: string) => Promise<void>;
    handleRevealDownloadedFile: (filePath: string) => Promise<void>;
    handleSectionTrimPatch: (
        downloadId: string,
        patch: Partial<{ start: string; end: string }>
    ) => void;
};

export type SettingsActionsContextValue = {
    settings: AppSettings;
    handleSelectOutputFolder: () => Promise<void>;
    handlePreferredQualityChange: (value: string) => Promise<void>;
    handleMaxConcurrentDownloadsChange: (value: string) => Promise<void>;
    handleUiLocaleChange: (value: string) => Promise<void>;
    handlePatchNotificationSettings: (patch: Partial<NotificationSettings>) => Promise<void>;
    handleSaveProxyUrl: (url: string | null) => Promise<void>;
    handlePatchAdvancedDownloadDefaults: (patch: AdvancedDownloadDefaultsPatch) => Promise<void>;
    handleCustomFilenameTemplateChange: (value: string) => Promise<void>;
    clampedConcurrent: number;
    CONCURRENT_DOWNLOAD_OPTIONS: ConcurrentDownloadUiOptions;
};

export type AppModalsContextValue = {
    modal: ModalStateApi;
    multiPicker: MultiPickerStateApi;
    multiPickerChannelTabEntries: Partial<Record<YoutubeChannelSectionTab, MediaCandidate[]>>;
    handleMultiPickerConfirm: (selections: MultiVideoPickerSelection[]) => Promise<void>;
    handleOpenSiteAuthFromSessions: (ctx: SiteAuthManualOpenContext) => void;
    handleQueueLikedVideos: () => Promise<void>;
    handleQueueWatchLater: () => Promise<void>;
    youtubeWatchPlaylistForkModalOpen: boolean;
    handleYoutubeWatchPlaylistForkVideo: () => void;
    handleYoutubeWatchPlaylistForkPlaylist: () => void;
    handleYoutubeWatchPlaylistForkDismiss: () => void;
    handleMultilineMultiPickerDismiss: () => void;
};

export type AppPlatformContextValue = {
    platform: RendererPlatform;
};

export const WorkflowContext: Context<WorkflowContextValue | null> =
    createContext<WorkflowContextValue | null>(null);
export const QueueActionsContext: Context<QueueActionsContextValue | null> =
    createContext<QueueActionsContextValue | null>(null);
export const SettingsActionsContext: Context<SettingsActionsContextValue | null> =
    createContext<SettingsActionsContextValue | null>(null);
export const AppModalsContext: Context<AppModalsContextValue | null> =
    createContext<AppModalsContextValue | null>(null);

export function useDownloadQueueForDisplay(): DownloadItem[] {
    return useDownloadStore((s) => s.queue);
}

function useWorkflowContext(): WorkflowContextValue {
    const ctx = useContext(WorkflowContext);
    if (!ctx) {
        throw new Error('useWorkflow must be used within WorkflowProvider');
    }
    return ctx;
}

function useQueueActionsContext(): QueueActionsContextValue {
    const ctx = useContext(QueueActionsContext);
    if (!ctx) {
        throw new Error('useQueueActions must be used within WorkflowProvider');
    }
    return ctx;
}

function useSettingsActionsContext(): SettingsActionsContextValue {
    const ctx = useContext(SettingsActionsContext);
    if (!ctx) {
        throw new Error('useSettingsActions must be used within WorkflowProvider');
    }
    return ctx;
}

function useAppModalsContext(): AppModalsContextValue {
    const ctx = useContext(AppModalsContext);
    if (!ctx) {
        throw new Error('useAppModals must be used within WorkflowProvider');
    }
    return ctx;
}

function useAppPlatformComposed(): AppPlatformContextValue {
    const platform = usePlatformStore((s) => s.platform);
    return { platform };
}

/** Workflow state: URL input, video preview, metadata, format selection, trim, batch */
export function useWorkflow(): WorkflowContextValue {
    return useWorkflowContext();
}

/** Queue action handlers: pause, resume, remove, open file */
export function useQueueActions(): QueueActionsContextValue {
    return useQueueActionsContext();
}

/** Settings and preferences handlers */
export function useSettingsActions(): SettingsActionsContextValue {
    return useSettingsActionsContext();
}

/** Auth and modal state */
export function useAppModals(): AppModalsContextValue {
    return useAppModalsContext();
}

/** Platform info */
export function useAppPlatform(): AppPlatformContextValue {
    return useAppPlatformComposed();
}
