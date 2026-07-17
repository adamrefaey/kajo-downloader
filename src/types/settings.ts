import type { AdvancedDownloadDefaults } from './download';

/** Desktop notifications for download outcomes (user-controlled). */
export interface NotificationSettings {
    enabled: boolean;
    onDownloadComplete: boolean;
    onDownloadError: boolean;
    /** Summarize multiple completions after a short idle window. */
    batchSummary: boolean;
}

export interface AppSettings {
    outputDir: string;
    maxConcurrentDownloads: number;
    preferredQuality: number | null;
    /** BCP 47 tag, or empty string to follow the OS locale. */
    uiLocale: string;
    /** Advanced download defaults (full merged object from main). */
    advancedDownloadDefaults: AdvancedDownloadDefaults;
    /** True when the selected proxy profile has a stored URL (main-only; not a secret). */
    proxyConfigured: boolean;
    notificationSettings: NotificationSettings;
    /**
     * Custom filename template in display {{var}} format.
     * When set, overrides advancedDownloadDefaults.filenameTemplate.
     * Converted to yt-dlp %(field)s format in main before download.
     */
    customFilenameTemplate?: string | undefined;
}

/** Baseline defaults when settings have never been written. */
export const DEFAULT_ADVANCED_DOWNLOAD_DEFAULTS: AdvancedDownloadDefaults = {
    subtitles: { mode: 'off', languages: [] },
    output: { videoContainer: 'mp4', audioFormat: 'mp3' },
    network: { rateLimit: '' },
    proxy: { enabled: false, profileId: 'default' },
    sponsorblock: {
        mode: 'off',
        categories: ['sponsor', 'intro', 'outro', 'selfpromo', 'interaction']
    },
    archive: { enabled: false },
    filenameTemplate: '%(title)s.%(ext)s'
};

export const DEFAULT_NOTIFICATION_SETTINGS: NotificationSettings = {
    enabled: true,
    onDownloadComplete: true,
    onDownloadError: true,
    batchSummary: true
};
