/**
 * IPC payload Zod schemas. `z.unknown()` on nested settings/capability blobs is intentional:
 * main sanitizes after parse; unknown keys stay forward-compatible across app versions.
 */
import { z } from 'zod';
import { parseHttpMediaUrl } from './mediaUrlResolver';
import { YT_DLP_FORMAT_SELECTOR_RE } from './ytDlpFormatSelector';

/** Generic non-empty URL string (e.g. open-external); use {@link httpMediaUrlSchema} for yt-dlp media. */
export const urlArgSchema: z.ZodType<string> = z.string().trim().min(1);
export const nonEmptyTrimmedStringSchema: z.ZodType<string> = z.string().trim().min(1);

/** http(s) media URL only — rejects file:, data:, and other schemes before yt-dlp. */
export const httpMediaUrlSchema: z.ZodType<string> = z
    .string()
    .trim()
    .min(1)
    .refine((s) => parseHttpMediaUrl(s) !== null, {
        message: 'url must be http or https'
    });

export const ytDlpFormatIdSchema: z.ZodType<string> = z
    .string()
    .min(1)
    .regex(YT_DLP_FORMAT_SELECTOR_RE);

/** Absolute filesystem path with no NUL (dirs, files, batch roots). */
const absoluteFilesystemPathSchema = z
    .string()
    .trim()
    .min(1)
    .refine(
        (s) =>
            !s.includes('\0') &&
            (s.startsWith('/') || /^[A-Za-z]:[\\/]/.test(s) || s.startsWith('\\\\')),
        {
            message: 'path must be absolute'
        }
    );

/** Download / settings output roots — same absolute-path rules. */
const absoluteOutputDirSchema = absoluteFilesystemPathSchema;

export const startDownloadPayloadSchema: z.ZodType<StartDownloadPayload> = z.object({
    url: httpMediaUrlSchema,
    formatId: ytDlpFormatIdSchema,
    outputDir: absoluteOutputDirSchema,
    outputTemplate: z.string().optional(),
    downloadId: z.string().optional(),
    audioOnly: z.boolean().optional(),
    videoHeight: z.number().finite().optional(),
    progressVideoBytes: z.number().finite().optional(),
    progressAudioBytes: z.number().finite().optional(),
    playlistId: z.string().nullable().optional(),
    capabilities: z.unknown().optional(),
    mediaTitle: z.string().nullable().optional(),
    queuedAtMs: z.number().finite().optional(),
    reservedOutputPath: absoluteFilesystemPathSchema.optional()
});

export type StartDownloadPayload = {
    url: string;
    formatId: string;
    outputDir: string;
    outputTemplate?: string | undefined;
    downloadId?: string | undefined;
    audioOnly?: boolean | undefined;
    videoHeight?: number | undefined;
    progressVideoBytes?: number | undefined;
    progressAudioBytes?: number | undefined;
    playlistId?: string | null | undefined;
    capabilities?: unknown;
    mediaTitle?: string | null | undefined;
    queuedAtMs?: number | undefined;
    reservedOutputPath?: string | undefined;
};

export const cleanupDownloadArtifactsPayloadSchema: z.ZodType<CleanupDownloadArtifactsPayload> =
    z.object({
        downloadId: z.string().min(1),
        outputDir: absoluteOutputDirSchema,
        audioOnly: z.boolean().optional(),
        reservedOutputPath: absoluteFilesystemPathSchema.nullable().optional(),
        partialFilePath: absoluteFilesystemPathSchema.nullable().optional()
    });

export type CleanupDownloadArtifactsPayload = {
    downloadId: string;
    outputDir: string;
    audioOnly?: boolean | undefined;
    reservedOutputPath?: string | null | undefined;
    partialFilePath?: string | null | undefined;
};

export const preparePlaylistOutputDirPayloadSchema: z.ZodType<PreparePlaylistOutputDirPayload> =
    z.object({
        outputDir: absoluteOutputDirSchema,
        playlistTitle: z.string().min(1)
    });

export type PreparePlaylistOutputDirPayload = {
    outputDir: string;
    playlistTitle: string;
};

const channelSectionSubdirSchema = z.enum(['videos', 'shorts', 'live']);

export const prepareChannelOutputDirPayloadSchema: z.ZodType<PrepareChannelOutputDirPayload> =
    z.object({
        outputDir: absoluteOutputDirSchema,
        channelTitle: z.string().min(1),
        sections: z.array(channelSectionSubdirSchema).min(1)
    });

export type PrepareChannelOutputDirPayload = {
    outputDir: string;
    channelTitle: string;
    sections: Array<'videos' | 'shorts' | 'live'>;
};

export type PrepareChannelOutputDirResult = {
    channelDir: string;
    sectionDirs: Partial<Record<'videos' | 'shorts' | 'live', string>>;
};

/** Settings patch: keys beyond these are stripped by Zod. */
export const setSettingsPayloadSchema: z.ZodType<SetSettingsPayload> = z.object({
    outputDir: absoluteOutputDirSchema.optional(),
    maxConcurrentDownloads: z.number().finite().optional(),
    preferredQuality: z.number().nullable().optional(),
    uiLocale: z.string().optional(),
    notificationSettings: z.unknown().optional(),
    advancedDownloadDefaults: z.unknown().optional(),
    customFilenameTemplate: z.string().optional()
});

export type SetSettingsPayload = {
    outputDir?: string | undefined;
    maxConcurrentDownloads?: number | undefined;
    preferredQuality?: number | null | undefined;
    uiLocale?: string | undefined;
    notificationSettings?: unknown;
    advancedDownloadDefaults?: unknown;
    customFilenameTemplate?: string | undefined;
};

export const setProxyProfileUrlPayloadSchema: z.ZodType<SetProxyProfileUrlPayload> = z.object({
    profileId: z.string().optional(),
    url: z.union([z.string(), z.null()]).optional()
});

export type SetProxyProfileUrlPayload = {
    profileId?: string | undefined;
    url?: string | null | undefined;
};

export const downloadHistoryListOptsSchema: z.ZodType<DownloadHistoryListOpts> = z.object({
    limit: z.number().finite().optional(),
    offset: z.number().finite().optional()
});

export type DownloadHistoryListOpts = {
    limit?: number | undefined;
    offset?: number | undefined;
};

/** Bounds for the embedded site sign-in WebContentsView (renderer reports its layout rect). */
export const embedBoundsSchema: z.ZodType<{
    x: number;
    y: number;
    width: number;
    height: number;
}> = z.object({
    x: z.number().finite().min(0),
    y: z.number().finite().min(0),
    width: z.number().finite().min(1).max(100_000),
    height: z.number().finite().min(1).max(100_000)
});

const siteAuthInitialUrlSchema = z
    .string()
    .trim()
    .min(1)
    .refine((raw) => {
        const lower = raw.toLowerCase();
        if (
            lower.startsWith('javascript:') ||
            lower.startsWith('data:') ||
            lower.startsWith('file:') ||
            lower.startsWith('vbscript:') ||
            lower.startsWith('blob:')
        ) {
            return false;
        }
        try {
            const href = raw.includes('://') ? raw : `https://${raw}`;
            const u = new URL(href);
            return u.protocol === 'https:' || u.protocol === 'http:';
        } catch {
            return false;
        }
    }, 'initialUrl must be an http(s) URL');

export const siteAuthOpenPayloadSchema: z.ZodType<SiteAuthOpenPayload> = z.object({
    initialUrl: siteAuthInitialUrlSchema,
    siteId: z.string().trim().min(1).max(64).optional(),
    siteDomain: z
        .string()
        .trim()
        .min(1)
        .max(253)
        .regex(/^[a-z0-9.-]+$/i)
        .optional()
});

export const reportRendererErrorPayloadSchema: z.ZodType<{
    message: string;
    source: string;
    stack?: string | undefined;
}> = z.object({
    message: z.string().max(4000).optional().default('Renderer error'),
    source: z.string().max(200).optional().default('renderer'),
    stack: z.string().max(16_000).optional()
});

export type SiteAuthOpenPayload = {
    initialUrl: string;
    siteId?: string | undefined;
    siteDomain?: string | undefined;
};

/** Main→renderer push when a download fails or is cancelled by the user. */
export const downloadErrorPayloadSchema: z.ZodType<DownloadErrorPayload> = z.object({
    downloadId: z.string().min(1),
    message: z.string().min(1),
    cancelled: z.boolean().optional()
});

export type DownloadErrorPayload = {
    downloadId: string;
    message: string;
    /** True when the user explicitly cancelled — not a transient or permanent failure. */
    cancelled?: boolean | undefined;
};

export const cleanupEmptyBatchDirsPayloadSchema: z.ZodType<CleanupEmptyBatchDirsPayload> = z.array(
    absoluteFilesystemPathSchema
);

export type CleanupEmptyBatchDirsPayload = string[];

const checkDownloadFilePathEntrySchema = z.object({
    id: z.string().trim().min(1),
    filePath: absoluteFilesystemPathSchema
});

export const checkDownloadFilePathsPayloadSchema: z.ZodType<CheckDownloadFilePathsPayload> =
    z.array(checkDownloadFilePathEntrySchema);

export type CheckDownloadFilePathsPayload = Array<{ id: string; filePath: string }>;

/** yt-dlp `ytsearchN:` upper bound per invocation (must match `electron/services/youtubeSearch.ts`). */
export const YTSEARCH_MAX_N = 60;

const SEARCH_DEFAULT_MAX_RESULTS = 6;
const SEARCH_YOUTUBE_PLATFORMS = ['youtube'] as const;

export const searchIpcPayloadObjectSchema: z.ZodType<SearchIpcPayload> = z
    .object({
        query: z.unknown().optional(),
        maxResults: z.unknown().optional()
    })
    .transform((o) => {
        const query = typeof o.query === 'string' ? o.query : '';
        let maxResults = SEARCH_DEFAULT_MAX_RESULTS;
        if (typeof o.maxResults === 'number' && Number.isFinite(o.maxResults)) {
            maxResults = Math.max(1, Math.min(YTSEARCH_MAX_N, Math.floor(o.maxResults)));
        }
        return {
            query,
            platforms: [...SEARCH_YOUTUBE_PLATFORMS],
            maxResults
        };
    });

export type SearchIpcPayload = {
    query: string;
    platforms: Array<(typeof SEARCH_YOUTUBE_PLATFORMS)[number]>;
    maxResults: number;
};

/**
 * Normalize renderer search IPC payloads. Accepts a bare string query or `{ query, maxResults }`.
 * Always returns YouTube as the sole platform (Search tab is YouTube-only).
 * Returns `null` when the payload shape is invalid (caller should `ipcFail`).
 */
export function parseSearchIpcPayload(raw: unknown): SearchIpcPayload | null {
    if (typeof raw === 'string') {
        return {
            query: raw,
            platforms: [...SEARCH_YOUTUBE_PLATFORMS],
            maxResults: SEARCH_DEFAULT_MAX_RESULTS
        };
    }
    if (!raw || typeof raw !== 'object') {
        return null;
    }
    const parsed = searchIpcPayloadObjectSchema.safeParse(raw);
    if (!parsed.success) {
        return null;
    }
    return parsed.data;
}
