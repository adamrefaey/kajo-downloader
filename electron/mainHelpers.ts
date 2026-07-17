import { extname, isAbsolute, type join, normalize, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { WebContents, WebFrameMain } from 'electron';
import { isProhibitedAdultMediaUrl } from '../src/shared/prohibitedAdultContentHosts';
import { getSiteProfileByHostOrUrl } from '../src/shared/siteProfiles';
import { KAJO_APP_SCHEME } from './customProtocol';

/** First loose http(s) token in text (whitespace-delimited). */
const CLIPBOARD_HTTP_URL_START = /\bhttps?:\/\/[^\s]+/gi;

/** Avoid scanning megabyte clipboards on every poll. */
const CLIPBOARD_AUTOPASTE_MAX_SCAN_CHARS = 48_000;

function stripTrailingUrlJunk(raw: string): string {
    let s = raw.trim();
    for (;;) {
        const next = s.replace(/[)\]},.;:!?<>]+$/g, '');
        if (next === s) {
            break;
        }
        s = next;
    }
    return s;
}

function extractFirstAutopasteMediaUrlInHaystack(haystack: string): string | null {
    if (!haystack?.trim()) {
        return null;
    }

    CLIPBOARD_HTTP_URL_START.lastIndex = 0;
    for (;;) {
        const match = CLIPBOARD_HTTP_URL_START.exec(haystack);
        if (!match) {
            break;
        }
        const cleaned = stripTrailingUrlJunk(match[0]);
        try {
            const u = new URL(cleaned);
            if (u.protocol !== 'http:' && u.protocol !== 'https:') {
                continue;
            }
            if (!u.hostname) {
                continue;
            }
            const href = u.href;
            if (isProhibitedAdultMediaUrl(href)) {
                continue;
            }
            if (!getSiteProfileByHostOrUrl(href)) {
                continue;
            }
            return href;
        } catch {}
    }
    return null;
}

/**
 * Extracts the first valid `http:` / `https:` URL from clipboard text for autopaste.
 * Supports any host yt-dlp might handle; skips adult sites blocked elsewhere in the app.
 */
export function extractAutopasteMediaUrl(text: string): string | null {
    if (!text?.trim()) {
        return null;
    }

    const haystack =
        text.length <= CLIPBOARD_AUTOPASTE_MAX_SCAN_CHARS
            ? text
            : text.slice(0, CLIPBOARD_AUTOPASTE_MAX_SCAN_CHARS);

    return extractFirstAutopasteMediaUrlInHaystack(haystack);
}

/**
 * Value to autopaste into the URL field: one URL, or newline-separated URLs when the clipboard
 * is multiple lines and each non-empty line contains a valid media URL.
 */
export function extractAutopasteClipboardInput(text: string): string | null {
    if (!text?.trim()) {
        return null;
    }

    const lines = text
        .split(/\r?\n/)
        .map((line) => line.trim())
        .filter((line) => line.length > 0);

    if (lines.length >= 2) {
        const urls: string[] = [];
        for (const line of lines) {
            const bounded =
                line.length <= CLIPBOARD_AUTOPASTE_MAX_SCAN_CHARS
                    ? line
                    : line.slice(0, CLIPBOARD_AUTOPASTE_MAX_SCAN_CHARS);
            const href = extractFirstAutopasteMediaUrlInHaystack(bounded);
            if (!href) {
                return extractAutopasteMediaUrl(text);
            }
            urls.push(href);
        }
        return urls.join('\n');
    }

    return extractAutopasteMediaUrl(text);
}

function fileUrlPathUnderTrustedRoots(
    rawUrl: string,
    trustedFileRoots: readonly string[]
): boolean {
    if (trustedFileRoots.length === 0) {
        return false;
    }
    const pathOnDisk = normalize(fileURLToPath(new URL(rawUrl).href));
    for (const root of trustedFileRoots) {
        const r = normalize(resolve(root));
        if (pathOnDisk === r || pathOnDisk.startsWith(`${r}${sep}`)) {
            return true;
        }
    }
    return false;
}

export type ValidateSenderOptions = {
    /** Directory roots allowed for `file:` senders (e.g. the packaged `renderer` output dir). */
    trustedFileRoots: readonly string[];
};

/**
 * @param fallbackSenderUrl - When `frame.url` is missing (seen with some Electron / packaged
 *   `loadFile` + IPC paths), use `event.sender.getURL()` so production builds still accept invokes
 *   from the real renderer window.
 */
export function validateSender(
    frame: WebFrameMain | null,
    isDev: boolean,
    fallbackSenderUrl?: string,
    options?: ValidateSenderOptions
): boolean {
    const rawUrl = frame?.url?.trim() || fallbackSenderUrl?.trim();
    if (!rawUrl) {
        return false;
    }

    let protocol: string;
    try {
        protocol = new URL(rawUrl).protocol;
    } catch {
        return false;
    }

    if (protocol === 'file:') {
        const roots = options?.trustedFileRoots ?? [];
        return fileUrlPathUnderTrustedRoots(rawUrl, roots);
    }

    // kajo-app://localhost is the custom protocol used for the renderer in production builds.
    // Only accept requests from our own host.
    if (protocol === `${KAJO_APP_SCHEME}:`) {
        return new URL(rawUrl).hostname === 'localhost';
    }

    return isDev && protocol.startsWith('http');
}

function stripAsciiControlChars(value: string): string {
    let out = '';
    for (const char of value) {
        const code = char.codePointAt(0);
        if (code !== undefined && code >= 32 && code !== 127) {
            out += char;
        }
    }
    return out;
}

/** Sanitizes a string for use as a folder name on all major OS filesystems. */
export function sanitizeFolderName(input: string, fallback: string): string {
    const normalized = stripAsciiControlChars(input.normalize('NFKC'))
        .replace(/[<>:"/\\|?*]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim()
        .replace(/[. ]+$/g, '');

    if (!normalized) {
        return fallback;
    }

    return normalized.slice(0, 96);
}

export function sanitizePlaylistDirectoryName(input: string): string {
    return sanitizeFolderName(input, 'playlist');
}

export async function getUniqueDirectoryPath(
    basePath: string,
    pathExists: (path: string) => Promise<boolean>
): Promise<string> {
    if (!(await pathExists(basePath))) {
        return basePath;
    }

    for (let i = 2; i < 10_000; i += 1) {
        const candidate = `${basePath} (${i})`;
        if (!(await pathExists(candidate))) {
            return candidate;
        }
    }

    return `${basePath} (${Date.now()})`;
}

export interface PreparePlaylistDirDeps {
    join: typeof join;
    /** Creates `path` recursively (e.g. `fs.promises.mkdir(path, { recursive: true })`). */
    mkdirRecursive: (path: string) => Promise<void>;
    pathExists: (path: string) => Promise<boolean>;
}

export async function preparePlaylistOutputDirectory(
    payload: { outputDir: string; playlistTitle: string },
    deps: PreparePlaylistDirDeps
): Promise<string> {
    const playlistFolderName = sanitizePlaylistDirectoryName(payload.playlistTitle);
    const baseTargetDir = deps.join(payload.outputDir, playlistFolderName);
    const targetDir = await getUniqueDirectoryPath(baseTargetDir, deps.pathExists);
    await deps.mkdirRecursive(targetDir);
    return targetDir;
}

/** Valid channel content section subfolder names. */
export type ChannelSectionSubdir = 'videos' | 'shorts' | 'live';

/**
 * Creates the channel output folder (`outputDir/<channelTitle>/`) plus one subfolder per requested
 * section (`videos`, `shorts`, `live`). Returns the channel base dir and a map of section → path.
 */
export async function prepareChannelOutputDirectory(
    payload: { outputDir: string; channelTitle: string; sections: ChannelSectionSubdir[] },
    deps: PreparePlaylistDirDeps
): Promise<{ channelDir: string; sectionDirs: Partial<Record<ChannelSectionSubdir, string>> }> {
    const channelFolderName = sanitizeFolderName(payload.channelTitle, 'channel');
    const baseChannelDir = deps.join(payload.outputDir, channelFolderName);
    const channelDir = await getUniqueDirectoryPath(baseChannelDir, deps.pathExists);
    await deps.mkdirRecursive(channelDir);
    const sectionDirs: Partial<Record<ChannelSectionSubdir, string>> = {};
    for (const section of payload.sections) {
        const sectionDir = deps.join(channelDir, section);
        await deps.mkdirRecursive(sectionDir);
        sectionDirs[section] = sectionDir;
    }
    return { channelDir, sectionDirs };
}

/**
 * Base registrable domains (and their subdomains) allowed for `https:` openExternal from the renderer.
 *
 * The product domain comes from `__KAJO_WEBSITE_DOMAIN__` (injected at build time by
 * `electron.vite.config.ts` from the `KAJO_WEBSITE_URL` env var, default `github.com`).
 * `linkedin.com` is for the author/about link in the app shell.
 */
const OPEN_EXTERNAL_HTTPS_BASE_DOMAINS = [__KAJO_WEBSITE_DOMAIN__, 'linkedin.com'] as const;

function isAllowlistedHttpsHostname(hostname: string): boolean {
    const h = hostname.toLowerCase();
    for (const base of OPEN_EXTERNAL_HTTPS_BASE_DOMAINS) {
        if (h === base || h.endsWith(`.${base}`)) {
            return true;
        }
    }
    return false;
}

function isLocalDevHttpHost(hostname: string): boolean {
    const h = hostname.toLowerCase();
    return h === 'localhost' || h === '127.0.0.1' || h === '[::1]';
}

/** Local `http:` for dev servers (vite, tests); packaged builds use `NODE_ENV=production`. */
function allowLocalDevHttp(): boolean {
    return process.env.NODE_ENV !== 'production';
}

/**
 * Returns true when `url` may be passed to `shell.openExternal()` from the renderer preload.
 * - `file:` is intentionally blocked (arbitrary local file access via shell.openExternal is a
 *   security risk if the renderer is compromised — Electron security checklist #15).
 * - `https:` requires an allowlisted hostname (product domain + subdomains, LinkedIn).
 * - `http:` is allowed only for local dev hosts when running in dev.
 */
export function isSafeOpenExternalUrl(url: string): boolean {
    try {
        const parsed = new URL(url);
        // file:// is intentionally blocked: opening arbitrary local files via shell.openExternal
        // could expose sensitive data or execute malicious files if the renderer is compromised
        // (Electron security checklist #15).
        if (parsed.protocol === 'https:') {
            return isAllowlistedHttpsHostname(parsed.hostname);
        }
        if (parsed.protocol === 'http:' && allowLocalDevHttp()) {
            return isLocalDevHttpHost(parsed.hostname);
        }
        return false;
    } catch {
        return false;
    }
}

/**
 * File extensions `localFiles.openPath` is allowed to hand to `shell.openPath` — the media,
 * audio, subtitle, and sidecar-image files yt-dlp / ffmpeg can produce.
 *
 * `shell.openPath` asks the OS to open a path with its default handler, so the extension IS the
 * security boundary. An allowlist (never a denylist) guarantees a compromised renderer — or a
 * tampered download-history entry — can never make the OS *launch* an executable, script,
 * shortcut, or document (`.app` / `.command` / `.sh` / `.scpt` / `.lnk` / `.desktop` / `.exe` /
 * `.html` / `.webloc` / …). Double extensions defeat themselves: `extname('v.mp4.command')` is
 * `.command`, which is not on the list.
 */
const OPENABLE_LOCAL_MEDIA_EXTENSIONS = new Set<string>([
    // Video
    'mp4',
    'm4v',
    'mkv',
    'webm',
    'mov',
    'avi',
    'flv',
    'ts',
    'mts',
    'm2ts',
    '3gp',
    'ogv',
    'wmv',
    'mpg',
    'mpeg',
    // Audio
    'mp3',
    'm4a',
    'm4b',
    'aac',
    'opus',
    'ogg',
    'oga',
    'flac',
    'wav',
    'weba',
    'mka',
    'wma',
    'aiff',
    // Subtitles
    'srt',
    'vtt',
    'ass',
    'ssa',
    'lrc',
    // Sidecar images (thumbnails / cover art)
    'jpg',
    'jpeg',
    'png',
    'webp',
    'gif'
]);

/**
 * True when `rawPath` is safe to hand to `shell.openPath` from the `localFiles.openPath` IPC
 * channel. Rejects empty/relative paths, ASCII control chars / NUL, UNC network paths
 * (`\\server\share`, `//server/share`, which could pull credentials to a remote SMB/WebDAV host),
 * and any file extension outside {@link OPENABLE_LOCAL_MEDIA_EXTENSIONS}. The IPC handler
 * additionally `stat`s the path and confirms it is a regular file before opening.
 */
export function isOpenableLocalMediaPath(rawPath: string): boolean {
    const p = rawPath.trim();
    if (!p) {
        return false;
    }
    // Reject NUL / ASCII control characters (a NUL could truncate the path at the OS
    // boundary; newlines enable log-forging) before the extension allowlist sees it.
    for (let i = 0; i < p.length; i += 1) {
        const code = p.charCodeAt(i);
        if (code < 32 || code === 127) {
            return false;
        }
    }
    // Block UNC / network paths before they ever reach the OS opener.
    if (p.startsWith('\\\\') || p.startsWith('//')) {
        return false;
    }
    // Require a concrete absolute on-disk path (no relative paths, no bare schemes).
    if (!isAbsolute(p)) {
        return false;
    }
    const ext = extname(p).replace(/^\./, '').toLowerCase();
    if (!ext) {
        return false;
    }
    return OPENABLE_LOCAL_MEDIA_EXTENSIONS.has(ext);
}

export function safeSend(webContents: WebContents, channel: string, payload?: unknown): void {
    if (webContents.isDestroyed()) {
        return;
    }

    if (payload === undefined) {
        webContents.send(channel);
        return;
    }

    webContents.send(channel, payload);
}
