export type DownloadState =
    | 'pending'
    | 'starting'
    | 'downloading'
    | 'paused'
    | 'complete'
    | 'error'
    | 'cancelled';

export type DownloadPauseReason = 'manual' | 'concurrency';

/** Video container passed to `--merge-output-format` / `--recode-video`. */
export type VideoContainer = 'mp4' | 'mkv' | 'webm';

/** Audio extraction format (`-x --audio-format`). */
export type AudioOutputFormat = 'mp3' | 'm4a' | 'flac' | 'wav' | 'aac' | 'ogg';

/** SponsorBlock API categories accepted by yt-dlp. */
export type SponsorBlockCategory =
    | 'sponsor'
    | 'intro'
    | 'outro'
    | 'selfpromo'
    | 'preview'
    | 'filler'
    | 'interaction'
    | 'music_offtopic'
    | 'poi_highlight'
    | 'chapter';

/**
 * Persisted advanced download defaults (settings store). Main merges with {@link DEFAULT_ADVANCED_DOWNLOAD_DEFAULTS}.
 */
export interface AdvancedDownloadDefaults {
    subtitles: {
        mode: 'off' | 'sidecar' | 'embed';
        /** BCP 47-ish tags (e.g. en, en-US). */
        languages: string[];
    };
    output: {
        videoContainer: VideoContainer;
        audioFormat: AudioOutputFormat;
    };
    network: {
        /** Empty = no `--limit-rate`. Examples: 500K, 1M, 2.5M */
        rateLimit: string;
    };
    proxy: {
        enabled: boolean;
        /** Profile id resolved in main against the proxy store (`default` is the primary profile). */
        profileId: string;
    };
    /** SponsorBlock integration. */
    sponsorblock: {
        mode: 'off' | 'mark' | 'remove';
        categories: SponsorBlockCategory[];
    };
    /** yt-dlp download archive dedupe (path resolved in main). */
    archive: {
        enabled: boolean;
    };
    /**
     * Filename pattern for `-o` (no directories / traversal). Default `%(title)s.%(ext)s`.
     */
    filenameTemplate: string;
}

/**
 * Structured download options for IPC → main. Sanitized in main and mapped to yt-dlp argv
 * via applyStructuredDownloadCapabilities. File embedding (metadata/thumbnail/chapters) is
 * always applied at start through mergeWithAutomaticFileEmbedding; per-item section trim uses `trim`.
 */
export interface DownloadEngineCapabilities {
    subtitles?: {
        mode: 'off' | 'sidecar' | 'embed';
        /** BCP 47-ish tags, bounded length (e.g. en, en-US). */
        languages?: string[] | undefined;
    };
    embedding?: {
        metadata?: boolean;
        thumbnail?: boolean;
        chapters?: boolean;
    };
    output?: {
        videoContainer?: VideoContainer;
        audioFormat?: AudioOutputFormat;
    };
    network?: {
        /** Validated rate string for `--limit-rate` (e.g. 500K, 1M). */
        rateLimit?: string;
    };
    /** Per-download proxy profile (resolved in main from secure storage — never a raw URL from renderer). */
    proxy?: {
        enabled: boolean;
        profileId?: string;
    };
    sponsorblock?: {
        mode: 'off' | 'mark' | 'remove';
        categories?: SponsorBlockCategory[];
    };
    trim?: {
        start?: string;
        end?: string;
    };
    archive?: {
        enabled: boolean;
    };
}

export interface DownloadItem {
    id: string;
    url: string;
    /** Rollout profile id, or `ytdlp-generic` for other yt-dlp-supported hosts. */
    siteId?: string | undefined;
    /** Normalized hostname from the queued media URL (lowercase). */
    siteDomain?: string | undefined;
    /** yt-dlp extractor / IE key when known from metadata or entries. */
    extractorKey?: string | undefined;
    /** True when this row is expected to need site cookies / embedded sign-in to complete. */
    authRequired?: boolean | undefined;
    title?: string | undefined;
    channel?: string | undefined;
    thumbnailUrl?: string | undefined;
    playlistId?: string | undefined;
    playlistTitle?: string | undefined;
    /** Set when this row was queued as part of one playlist/channel batch (UI grouping). */
    batchGroupId?: string | undefined;
    /** Original pasted or resolved URL for the multi-item fetch (playlist, tab, profile, etc.). */
    batchSourceUrl?: string | undefined;
    /** Human-readable site name (profile displayName or hostname). */
    batchSiteLabel?: string | undefined;
    /** When flat metadata was resolved for this batch (ms since epoch). */
    batchExtractedAt?: number | undefined;
    /**
     * yt-dlp live_status from flat playlist extraction: 'is_live' | 'was_live' | 'post_live' | 'not_live'.
     * When set to a live/past-live value, size estimates from HLS download progress are suppressed
     * to avoid showing the inflated peak-bandwidth-based totals that yt-dlp reports.
     */
    liveStatus?: string | undefined;
    formatId: string;
    audioOnly?: boolean | undefined;
    /** Video height (px) for quality selection; omitted for audio-only or unknown. */
    videoHeight?: number | undefined;
    outputTemplate?: string | undefined;
    /** Main-process resolved output file path once a download has started (for artifact cleanup). */
    reservedOutputPath?: string | undefined;
    outputDir: string;
    /** Byte weights for merged video+audio progress (optional). */
    progressVideoBytes?: number | undefined;
    progressAudioBytes?: number | undefined;
    /** Pre-trim format size estimate (bytes); used with `mediaDurationSeconds` to scale `totalSize` when section trim changes. */
    sizeEstimateFullBytes?: number | undefined;
    /** Full media duration (seconds) from metadata; pairs with `sizeEstimateFullBytes` for trim scaling. */
    mediaDurationSeconds?: number | undefined;
    state: DownloadState;
    progressPercent?: number | undefined;
    speed?: string | undefined;
    eta?: string | undefined;
    totalSize?: string | undefined;
    filePath?: string | undefined;
    /** SHA-256 of downloaded file (hex), from main when hashing succeeds. */
    contentSha256?: string | undefined;
    errorMessage?: string | undefined;
    pauseReason?: DownloadPauseReason | undefined;
    createdAt: number;
    /**
     * Optional `--download-sections` range for this queue row only (both times required when set).
     */
    sectionTrim?: { start: string; end: string } | undefined;
}

/** Upper bound for offered and auto-selected video height (8K UHD). */
export const MAX_SUPPORTED_VIDEO_HEIGHT = 4320;
