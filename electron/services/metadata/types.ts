export type SiteCookiesPathGetter = (url: string) => Promise<string | null> | string | null;

/** Pushed from main when a preview thumbnail is ready as a `data:` URL (YouTube auth/CDN, or non-YouTube embed fetch). */
export interface EmbeddedThumbnailEvent {
    videoId: string;
    thumbnailUrl: string;
    /** Canonical watch/page URL (matches `VideoInfo.url`) for queue thumbnail upgrades. */
    mediaPageUrl: string;
}

export interface FetchMetadataOptions {
    /** Per-site embedded sign-in cookie jar materialized as a Netscape file for yt-dlp (YouTube included). */
    getSiteCookiesFilePath?: SiteCookiesPathGetter;
    extraArgs?: string[];
    /**
     * YouTube: when set, used instead of {@link getYoutubeExtractorArgs} for this yt-dlp build only
     * (internal consent/bot retry — see `runYtDlpWithAuthCookieStrategies`).
     */
    youtubeExtractorArgsOverride?: readonly string[];
    /**
     * When set, thumbnails that cannot load in the renderer (YouTube private/CDN, hot-linked hosts, etc.)
     * are fetched via yt-dlp `--write-thumbnail` in the background; `fetchMetadata` still returns immediately
     * with the HTTP URL when present.
     */
    onEmbeddedThumbnail?: (event: EmbeddedThumbnailEvent) => void;
}

export interface BuiltArgsResult {
    args: string[];
    usedCookies: boolean;
}

export interface YtDlpFormat {
    format_id?: string;
    ext?: string;
    resolution?: string;
    format_note?: string;
    vcodec?: string;
    acodec?: string;
    fps?: number;
    tbr?: number | string;
    /** Video bitrate (kbps); often set when `tbr` is null on split streams. */
    vbr?: number | string | null;
    filesize?: number | null;
    filesize_approx?: number | null;
    width?: number;
    height?: number;
    abr?: number;
    protocol?: string;
}

export interface YtDlpMetadata {
    extractor?: string;
    extractor_key?: string;
    id?: string;
    title?: string;
    channel?: string;
    uploader?: string;
    duration?: number;
    thumbnail?: string;
    thumbnails?: Array<{ url?: string; width?: number; height?: number }>;
    /** e.g. public, private, needs_auth — used to decide when a remote thumbnail URL will not load in the renderer without cookies */
    availability?: string | null;
    webpage_url?: string;
    original_url?: string;
    formats?: YtDlpFormat[];
}

export interface YtDlpPlaylistEntry {
    id?: string;
    title?: string;
    url?: string;
    webpage_url?: string;
    original_url?: string;
    availability?: string | null;
    channel?: string;
    uploader?: string;
    duration?: number;
    filesize?: number | null;
    filesize_approx?: number | null;
    thumbnail?: string;
    thumbnails?: Array<{ url?: string; width?: number; height?: number }>;
    /** yt-dlp extractor key on flat entries when present. */
    ie_key?: string;
    /**
     * yt-dlp live status: 'not_live' | 'is_live' | 'is_upcoming' | 'was_live' | 'post_live'.
     * For live/was_live entries, filesize_approx is derived from HLS peak BANDWIDTH and is
     * significantly inflated compared to actual encoded average bitrate.
     */
    live_status?: string | null;
}

export interface YtDlpPlaylistMetadata {
    extractor?: string;
    extractor_key?: string;
    id?: string;
    webpage_url?: string;
    original_url?: string;
    title?: string;
    playlist_title?: string;
    channel?: string;
    uploader?: string;
    entries?: YtDlpPlaylistEntry[];
}

export interface YoutubeDownloadPreambleParams {
    outputTemplateFullPath: string;
    formatId: string;
    audioOnly: boolean;
    /** Video merge container; default mp4. */
    mergeOutputFormat?: string;
    /** Audio extraction format; default mp3. */
    audioFormat?: string;
}

export type MetadataArgsBuilder = (
    url: string,
    options: FetchMetadataOptions
) => Promise<BuiltArgsResult>;
