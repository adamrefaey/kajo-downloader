import type {
    AppSettings,
    DownloadHistoryEntry,
    DownloadPauseReason,
    MediaLookupResult,
    MetadataResolveResult,
    PlaylistInfo,
    PlaylistInfoStreamIpcEvent,
    SetupStatus,
    SignedSiteSummary,
    SiteAuthCookieRefreshPayload,
    SiteAuthLoadingPayload,
    SiteAuthNavBlockedPayload,
    SiteAuthUrlStatePayload,
    StartDownloadOutcome,
    VideoInfo
} from '../types';
import type {
    CleanupDownloadArtifactsPayload,
    DownloadErrorPayload,
    SetSettingsPayload,
    SiteAuthOpenPayload,
    StartDownloadPayload
} from './ipcPayloadSchemas';
import type { SearchUsage, SearchUsageResponse } from './searchQuota';

interface ProgressEventPayload {
    downloadId: string;
    percent: number;
    size: string;
    speed: string;
    eta: string;
    totalSize?: string;
    totalSizeBytes?: number;
}

interface DownloadCompletePayload {
    downloadId: string;
    filePath: string | null;
    /** Final output file size when the path was stat’d successfully in main. */
    outputFileSizeBytes?: number;
    /** SHA-256 of the output file (hex) when hashing succeeds in main. */
    contentSha256?: string;
}

export type { DownloadErrorPayload };

interface ClipboardUrlPayload {
    url: string;
}

interface SetupLogPayload {
    line: string;
}

interface VideoInfoThumbnailPayload {
    videoId: string;
    thumbnailUrl: string;
    /** Canonical media page URL; used to upgrade matching queue rows when thumbs load async. */
    mediaPageUrl: string;
}

interface SiteAuthEmbedBoundsPayload {
    x: number;
    y: number;
    width: number;
    height: number;
}

export interface RendererApi {
    getPlatform: () => 'macos' | 'windows' | 'linux' | 'unknown';
    fetchVideoInfo: (url: string) => Promise<MediaLookupResult<VideoInfo>>;
    fetchPlaylistInfo: (url: string) => Promise<MediaLookupResult<PlaylistInfo>>;
    /**
     * Incremental flat-playlist enumeration (picker UX). Invoke cancel fn on modal close.
     * Events are {@link PlaylistInfoStreamIpcEvent}; stream ends with `done` or `error`.
     */
    fetchPlaylistInfoStream: (
        url: string,
        onEvent: (event: PlaylistInfoStreamIpcEvent) => void
    ) => Promise<() => void>;
    resolveMetadataUrl: (url: string) => Promise<MetadataResolveResult>;
    preparePlaylistOutputDir: (payload: {
        outputDir: string;
        playlistTitle: string;
    }) => Promise<string | null>;
    prepareChannelOutputDir: (payload: {
        outputDir: string;
        channelTitle: string;
        sections: Array<'videos' | 'shorts' | 'live'>;
    }) => Promise<{
        channelDir: string;
        sectionDirs: Partial<Record<'videos' | 'shorts' | 'live', string>>;
    } | null>;
    startDownload: (payload: StartDownloadPayload) => Promise<StartDownloadOutcome | null>;
    cancelDownload: (downloadId: string) => Promise<boolean>;
    cleanupDownloadArtifacts: (payload: CleanupDownloadArtifactsPayload) => Promise<void>;
    cleanupEmptyBatchDirs: (dirs: string[]) => Promise<void>;
    pauseDownload: (downloadId: string) => Promise<boolean>;
    resumeDownload: (downloadId: string) => Promise<boolean>;
    checkDownloadFilePaths: (entries: Array<{ id: string; filePath: string }>) => Promise<string[]>;
    selectOutputFolder: () => Promise<string | null>;
    getSettings: () => Promise<AppSettings | null>;
    /** OS locale tag (e.g. from Chromium/Electron); use when UI follows system language. */
    getSystemLocale: () => Promise<string | null>;
    setSettings: (patch: SetSettingsPayload) => Promise<AppSettings | null>;
    downloadHistory: {
        list: (opts: { limit: number; offset: number }) => Promise<DownloadHistoryEntry[] | null>;
        clear: () => Promise<boolean | null>;
        total: () => Promise<number | null>;
    };
    setProxyProfileUrl: (payload: {
        profileId?: string;
        url: string | null;
    }) => Promise<{ ok: true } | { ok: false; error: string } | null>;
    checkSetup: () => Promise<SetupStatus | null>;
    installYtdlp: () => Promise<SetupStatus | null>;
    openExternal: (url: string) => Promise<boolean>;
    onDownloadProgress: (callback: (payload: ProgressEventPayload) => void) => () => void;
    onDownloadComplete: (callback: (payload: DownloadCompletePayload) => void) => () => void;
    onDownloadError: (callback: (payload: DownloadErrorPayload) => void) => () => void;
    /** Main pushes authoritative state transitions (pause confirmed, resume confirmed). */
    onDownloadStateChange: (
        callback: (payload: {
            downloadId: string;
            state: string;
            pauseReason?: DownloadPauseReason;
        }) => void
    ) => () => void;
    onClipboardUrlDetected: (callback: (payload: ClipboardUrlPayload) => void) => () => void;
    onSetupLog: (callback: (payload: SetupLogPayload) => void) => () => void;
    onSetupComplete: (callback: () => void) => () => void;
    onVideoInfoThumbnail: (callback: (payload: VideoInfoThumbnailPayload) => void) => () => void;
    siteAuth: {
        open: (
            payload: SiteAuthOpenPayload
        ) => Promise<
            { ok: true; siteKey: string; allowedSuffixes: string[] } | { ok: false; error: string }
        >;
        close: () => Promise<boolean>;
        setEmbedBounds: (bounds: SiteAuthEmbedBoundsPayload) => Promise<boolean>;
        goBack: () => Promise<boolean>;
        goForward: () => Promise<boolean>;
        reload: () => Promise<boolean>;
        saveAndClose: () => Promise<
            { ok: true; cookieCount: number; siteKey: string } | { ok: false; error: string }
        >;
        onLoading: (callback: (payload: SiteAuthLoadingPayload) => void) => () => void;
        onUrlState: (callback: (payload: SiteAuthUrlStatePayload) => void) => () => void;
        onNavBlocked: (callback: (payload: SiteAuthNavBlockedPayload) => void) => () => void;
        listSignedSites: () => Promise<SignedSiteSummary[]>;
        /** Re-reads the local cookie snapshot and returns fresh cookieHealth (not a network probe). */
        validateSignedSite: (
            siteKey: string
        ) => Promise<{ ok: true; row: SignedSiteSummary } | { ok: false; error: string }>;
        clearSignedSite: (siteKey: string) => Promise<{ ok: true } | { ok: false; error: string }>;
        onCookieRefresh: (callback: (payload: SiteAuthCookieRefreshPayload) => void) => () => void;
    };
    search: {
        getUsage: () => Promise<SearchUsageResponse | null>;
        search: (payload: { query: string; platforms?: string[]; maxResults?: number }) => Promise<
            | {
                  ok: true;
                  results: import('../types').SearchResultRow[];
                  usage?: SearchUsage;
              }
            | { ok: false; error: string; usage?: SearchUsage }
            | null
        >;
    };
    localFiles: {
        openPath: (filePath: string) => Promise<boolean>;
        revealPath: (filePath: string) => Promise<boolean>;
    };
    /** Report an uncaught renderer JS error to the main process for logging and telemetry. */
    reportRendererError: (payload: { message: string; source: string; stack?: string }) => void;
}
