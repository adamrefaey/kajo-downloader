import { mkdtemp, readdir, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { bestEffort } from '../../lib/bestEffort';
import { buildThumbnailOnlyArgs, buildYtDlpDirectImageDownloadArgs } from './argsBuilders';
import type { FetchMetadataOptions, MetadataArgsBuilder, YtDlpMetadata } from './types';
import { runYtDlpWithAuthCookieStrategies } from './ytdlpProcess';

const YOUTUBE_DEFAULT_IN_PATH = /\/default\.(jpg|webp)(\?|$)/i;
const YOUTUBE_HQDEFAULT_IN_PATH = /\/hqdefault\.(jpg|webp)(\?|$)/i;
const YOUTUBE_MQDEFAULT_IN_PATH = /\/mqdefault\.(jpg|webp)(\?|$)/i;

/** Max edge length for a "preview" thumb — avoids maxres while keeping UI sharp (~hq / 480p height). */
export const PREVIEW_THUMB_MAX_DIM = 720;

/**
 * YouTube thumbnails from --dump-json are often missing for private videos, or the URL needs
 * the same cookies as yt-dlp while the renderer cannot attach those to a normal image request.
 * In those cases we fetch the file via yt-dlp --write-thumbnail and embed it as a data URL.
 *
 * yt-dlp frequently leaves `availability` empty for private videos you can still open with cookies
 * (see https://github.com/yt-dlp/yt-dlp/issues/9845); the JSON may still include a generic CDN URL
 * that will not render in the app without that path.
 */
export function youtubeMetadataWantsYtdlpThumbnail(
    raw: Pick<YtDlpMetadata, 'availability' | 'thumbnail' | 'thumbnails'>,
    resolvedHttpThumbnailUrl: string
): boolean {
    if (!resolvedHttpThumbnailUrl.trim()) {
        return true;
    }
    const a = (raw.availability ?? '').trim().toLowerCase();
    if (a === 'private' || a === 'needs_auth' || a === 'subscriber_only' || a === 'premium_only') {
        return true;
    }
    if (a === '') {
        return true;
    }
    return false;
}

export function thumbnailMimeForFileExtension(ext: string): string {
    const e = ext.toLowerCase();
    if (e === 'png') {
        return 'image/png';
    }
    if (e === 'jpg' || e === 'jpeg') {
        return 'image/jpeg';
    }
    return 'image/webp';
}

/**
 * Picks a YouTube thumbnail URL for UI previews (queue row, video card).
 * Prefers `hqdefault`, then `mqdefault`, then the largest entry up to PREVIEW_THUMB_MAX_DIM.
 */
export function pickPreviewThumbnailUrlFromEntries(
    thumbnails: Array<{ url?: string; width?: number; height?: number }>
): string | null {
    const list = thumbnails.filter((t): t is typeof t & { url: string } => Boolean(t.url?.trim()));
    if (!list.length) {
        return null;
    }

    const hq = list.find((t) => YOUTUBE_HQDEFAULT_IN_PATH.test(t.url));
    if (hq) {
        return hq.url;
    }

    const mq = list.find((t) => YOUTUBE_MQDEFAULT_IN_PATH.test(t.url));
    if (mq) {
        return mq.url;
    }

    const scored = list.map((t) => {
        const w =
            typeof t.width === 'number' && Number.isFinite(t.width) && t.width > 0
                ? Math.floor(t.width)
                : 0;
        const h =
            typeof t.height === 'number' && Number.isFinite(t.height) && t.height > 0
                ? Math.floor(t.height)
                : 0;
        return { t, area: w * h, maxDim: Math.max(w, h) };
    });

    const underPreviewCap = scored.filter((s) => s.maxDim > 0 && s.maxDim <= PREVIEW_THUMB_MAX_DIM);
    if (underPreviewCap.length) {
        underPreviewCap.sort((a, b) => {
            if (b.area !== a.area) {
                return b.area - a.area;
            }
            return b.maxDim - a.maxDim;
        });
        // biome-ignore lint/style/noNonNullAssertion: underPreviewCap is non-empty (length checked above)
        return underPreviewCap[0]!.t.url;
    }

    const withArea = scored.filter((s) => s.area > 0);
    if (withArea.length) {
        withArea.sort((a, b) => {
            if (b.area !== a.area) {
                return b.area - a.area;
            }
            return b.maxDim - a.maxDim;
        });
        // biome-ignore lint/style/noNonNullAssertion: withArea is non-empty (length checked above)
        return withArea[0]!.t.url;
    }

    const byMaxDim = [...scored].filter((s) => s.maxDim > 0).sort((a, b) => b.maxDim - a.maxDim);
    if (byMaxDim.length) {
        // biome-ignore lint/style/noNonNullAssertion: byMaxDim is non-empty (length checked above)
        return byMaxDim[0]!.t.url;
    }

    // biome-ignore lint/style/noNonNullAssertion: list is filtered non-empty at function start
    return list.at(-1)!.url;
}

/**
 * Cookie-embed fetch order: try nicer mid-res CDN thumbs before tiny default, maxres last (large/slow).
 */
function youtubeThumbnailEmbedTryOrder(url: string): number {
    const u = url.toLowerCase();
    if (/(maxresdefault|maxres)\.(jpg|webp)/.test(u)) {
        return 60;
    }
    if (YOUTUBE_DEFAULT_IN_PATH.test(u)) {
        return 50;
    }
    if (/sddefault\.(jpg|webp)/.test(u)) {
        return 30;
    }
    if (/hqdefault\.(jpg|webp)/.test(u)) {
        return 10;
    }
    if (/mqdefault\.(jpg|webp)/.test(u)) {
        return 20;
    }
    return 40;
}

/**
 * URLs to try for cookie-authenticated thumbnail fetches (private videos).
 * Tries hq/mq CDN paths first, then metadata URLs in quality order (not smallest-first).
 */
export function collectYoutubeEmbeddedThumbnailDirectUrls(
    raw: Pick<YtDlpMetadata, 'thumbnail' | 'thumbnails'>,
    videoId: string
): string[] {
    const out: string[] = [];
    const add = (u?: string | null): void => {
        const t = u?.trim();
        if (t && !out.includes(t)) {
            out.push(t);
        }
    };

    add(`https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`);
    add(`https://i.ytimg.com/vi/${videoId}/mqdefault.jpg`);

    const list = (raw.thumbnails ?? []).filter((t): t is typeof t & { url: string } =>
        Boolean(t.url?.trim())
    );
    const scored = list.map((t) => {
        const w =
            typeof t.width === 'number' && Number.isFinite(t.width) && t.width > 0
                ? Math.floor(t.width)
                : 0;
        const h =
            typeof t.height === 'number' && Number.isFinite(t.height) && t.height > 0
                ? Math.floor(t.height)
                : 0;
        const area = w > 0 && h > 0 ? w * h : Number.POSITIVE_INFINITY;
        return { url: t.url.trim(), area, order: youtubeThumbnailEmbedTryOrder(t.url) };
    });
    scored.sort((a, b) => {
        if (a.order !== b.order) {
            return a.order - b.order;
        }
        if (a.area !== b.area) {
            return a.area - b.area;
        }
        return a.url.length - b.url.length;
    });
    for (const s of scored) {
        add(s.url);
    }

    add(`https://i.ytimg.com/vi/${videoId}/default.jpg`);

    const thumb = raw.thumbnail?.trim();
    if (thumb) {
        add(thumb);
    }

    return out;
}

async function tryDirectYtDlpImageToDataUrl(
    pageUrl: string,
    options: FetchMetadataOptions,
    imageUrl: string,
    tempDir: string,
    fileBaseName: string
): Promise<string | null> {
    const outputTemplate = join(tempDir, `${fileBaseName}.%(ext)s`);
    const buildDirect: MetadataArgsBuilder = (_u, opts) =>
        buildYtDlpDirectImageDownloadArgs(imageUrl, opts, outputTemplate);

    const { exitCode } = await runYtDlpWithAuthCookieStrategies(pageUrl, options, buildDirect);
    if (exitCode !== 0) {
        return null;
    }

    const files = await readdir(tempDir);
    const name = files.find((f) => f.startsWith(`${fileBaseName}.`) && !f.endsWith('.part'));
    if (!name) {
        return null;
    }

    const buf = await readFile(join(tempDir, name));
    if (!buf.length) {
        return null;
    }
    const dot = name.lastIndexOf('.');
    /* v8 ignore start -- `fileBase.` matches always include a dot before the extension */
    const ext = dot > 0 ? name.slice(dot + 1) || 'jpg' : 'jpg';
    /* v8 ignore stop */
    return `data:${thumbnailMimeForFileExtension(ext)};base64,${buf.toString('base64')}`;
}

/**
 * Runs yt-dlp `--write-thumbnail` for `pageUrl` into `workDir` and returns a data URL for `%(id)s` === videoId.
 */
async function tryYtdlpWriteThumbnailToDataUrl(
    pageUrl: string,
    options: FetchMetadataOptions,
    videoId: string,
    workDir: string
): Promise<string | null> {
    const outputTemplate = join(workDir, '%(id)s');
    const buildThumbnailArgs: MetadataArgsBuilder = (u, opts) =>
        buildThumbnailOnlyArgs(u, opts, outputTemplate);

    const { exitCode } = await runYtDlpWithAuthCookieStrategies(
        pageUrl,
        options,
        buildThumbnailArgs
    );
    if (exitCode !== 0) {
        return null;
    }

    const files = await readdir(workDir);
    const fileSet = new Set(files);
    const preferredNames = [
        `${videoId}.webp`,
        `${videoId}.jpg`,
        `${videoId}.jpeg`,
        `${videoId}.png`
    ];
    let name: string | undefined;
    for (const candidate of preferredNames) {
        if (fileSet.has(candidate)) {
            name = candidate;
            break;
        }
    }
    if (!name) {
        const prefix = `${videoId}.`;
        name = files.find((f) => f.startsWith(prefix));
    }
    if (!name) {
        return null;
    }

    const buf = await readFile(join(workDir, name));
    const dot = name.lastIndexOf('.');
    /* v8 ignore start -- picked filenames always include a dot before the extension */
    const ext = dot > 0 ? name.slice(dot + 1) || 'webp' : 'webp';
    /* v8 ignore stop */
    return `data:${thumbnailMimeForFileExtension(ext)};base64,${buf.toString('base64')}`;
}

export async function tryFetchThumbnailDataUrlViaYtdlpWrite(
    pageUrl: string,
    options: FetchMetadataOptions,
    videoId: string
): Promise<string | null> {
    const dir = await mkdtemp(join(tmpdir(), 'kajo-ytdlp-thumb-'));
    try {
        return await tryYtdlpWriteThumbnailToDataUrl(pageUrl, options, videoId, dir);
    } catch {
        return null;
    } finally {
        bestEffort('rm thumbnail temp dir', rm(dir, { recursive: true, force: true }));
    }
}

export async function tryFetchYoutubeThumbnailDataUrl(
    pageUrl: string,
    options: FetchMetadataOptions,
    videoId: string,
    raw: Pick<YtDlpMetadata, 'thumbnail' | 'thumbnails'>
): Promise<string | null> {
    const dir = await mkdtemp(join(tmpdir(), 'kajo-ytdlp-thumb-'));
    try {
        const directCandidates = collectYoutubeEmbeddedThumbnailDirectUrls(raw, videoId);
        for (const [i, imageUrl] of directCandidates.entries()) {
            const embedded = await tryDirectYtDlpImageToDataUrl(
                pageUrl,
                options,
                imageUrl,
                dir,
                `thumb${i}`
            );
            if (embedded) {
                return embedded;
            }
        }

        return await tryYtdlpWriteThumbnailToDataUrl(pageUrl, options, videoId, dir);
    } catch {
        return null;
    } finally {
        bestEffort('rm thumbnail temp dir', rm(dir, { recursive: true, force: true }));
    }
}

/**
 * Normalizes yt-dlp thumbnail URLs for the renderer: protocol-relative `//host/...` becomes `https:`,
 * and `data:` / `blob:` previews are left unchanged.
 */
export function normalizeThumbnailDisplayUrl(url: string): string {
    const t = url.trim();
    if (!t) {
        return '';
    }
    if (t.startsWith('data:') || t.startsWith('blob:')) {
        return t;
    }
    if (t.startsWith('//')) {
        return `https:${t}`;
    }
    return t;
}

export function getThumbnailUrl(raw: YtDlpMetadata): string {
    const fromList = pickPreviewThumbnailUrlFromEntries(raw.thumbnails ?? []);
    const picked = fromList ?? raw.thumbnail?.trim() ?? '';
    return normalizeThumbnailDisplayUrl(picked);
}
