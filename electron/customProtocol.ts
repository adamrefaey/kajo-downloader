/**
 * Custom application protocol — `kajo-app://`
 *
 * Replaces `file://` for loading the renderer in production builds (Electron security
 * checklist item #18). Key benefits:
 *
 * - Narrower origin: the renderer runs in the `kajo-app://localhost` origin, not the
 *   broader `file://` origin, so XSS cannot access arbitrary local files via `fetch`.
 * - Renderers cannot navigate to other `file:` paths even if exploited.
 * - Allows tighter CSP policies since `kajo-app:` is an explicit allowlist entry.
 *
 * Usage:
 *   1. Call `registerKajoAppScheme()` **before** `app.whenReady()` (at module load time)
 *      so Chromium knows the scheme is privileged.
 *   2. Call `handleKajoAppProtocol(rendererDistDir)` inside `app.whenReady()` to attach the
 *      actual file-serving handler.
 *   3. Load the window with `window.loadURL(KAJO_APP_RENDERER_URL)` instead of `loadFile`.
 */

import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import { join, normalize } from 'node:path';
import { Readable } from 'node:stream';
import { protocol } from 'electron';
import { mainLog } from './mainLogger';

/** The origin used for the renderer in production builds. */
export const KAJO_APP_SCHEME = 'kajo-app';
export const KAJO_APP_RENDERER_URL: string = `${KAJO_APP_SCHEME}://localhost/`;

/**
 * Map common file extensions to MIME types.
 * Electron's built-in `net.fetch` handles most of these, but we need explicit types
 * for the custom protocol handler.
 */
const MIME_TYPES: Readonly<Record<string, string>> = {
    '.html': 'text/html; charset=utf-8',
    '.js': 'application/javascript; charset=utf-8',
    '.css': 'text/css; charset=utf-8',
    '.json': 'application/json; charset=utf-8',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.gif': 'image/gif',
    '.webp': 'image/webp',
    '.svg': 'image/svg+xml',
    '.ico': 'image/x-icon',
    '.woff': 'font/woff',
    '.woff2': 'font/woff2',
    '.ttf': 'font/ttf',
    '.otf': 'font/otf',
    '.eot': 'application/vnd.ms-fontobject',
    '.mp4': 'video/mp4',
    '.webm': 'video/webm',
    '.mp3': 'audio/mpeg',
    '.map': 'application/json; charset=utf-8'
};

function mimeTypeForPath(filePath: string): string {
    const ext = filePath.match(/\.[^.]+$/)?.[0]?.toLowerCase() ?? '';
    return MIME_TYPES[ext] ?? 'application/octet-stream';
}

/**
 * Must be called **before** `app.whenReady()` to register the scheme as privileged.
 * This grants the `kajo-app://localhost` origin:
 *   - `standard`: enables relative URL resolution (like `https:`)
 *   - `secure`: treated as a secure origin (HTTPS equivalent)
 *   - `supportFetchAPI`: allows `fetch()` from the renderer
 *   - `corsEnabled`: enables CORS for the origin
 */
export function registerKajoAppScheme(): void {
    protocol.registerSchemesAsPrivileged([
        {
            scheme: KAJO_APP_SCHEME,
            privileges: {
                standard: true,
                secure: true,
                supportFetchAPI: true,
                corsEnabled: true
            }
        }
    ]);
}

/**
 * Mounts the file-serving handler for `kajo-app://localhost/*`.
 * Must be called inside `app.whenReady()`.
 *
 * @param rendererDistDir Absolute path to the packaged renderer output directory
 *   (i.e. the directory containing `index.html`). In production this is
 *   `join(__dirname, '../renderer')`.
 */
export function handleKajoAppProtocol(rendererDistDir: string): void {
    protocol.handle(KAJO_APP_SCHEME, async (request) => {
        const url = new URL(request.url);

        // Only serve from our own host.
        if (url.hostname !== 'localhost') {
            return new Response('Not found', { status: 404 });
        }

        // Strip leading slash; default to index.html for SPA routing.
        const relativePath = decodeURIComponent(url.pathname).replace(/^\/+/, '') || 'index.html';

        // Normalise to prevent path traversal: ensure the resolved path stays within
        // rendererDistDir.
        const resolved = normalize(join(rendererDistDir, relativePath));
        if (
            !resolved.startsWith(`${normalize(rendererDistDir)}/`) &&
            resolved !== normalize(rendererDistDir)
        ) {
            mainLog.warn('[customProtocol] path traversal attempt blocked', { path: relativePath });
            return new Response('Forbidden', { status: 403 });
        }

        // Check whether the file exists; fall back to index.html for SPA client-side routes.
        let finalPath = resolved;
        try {
            const fileStat = await stat(finalPath);
            if (fileStat.isDirectory()) {
                finalPath = join(finalPath, 'index.html');
            }
        } catch {
            // File not found — serve index.html so the SPA router can handle the route.
            finalPath = join(rendererDistDir, 'index.html');
        }

        try {
            const stream = createReadStream(finalPath);
            // Node Readable → Web ReadableStream conversion for Electron's Response.
            const webStream = Readable.toWeb(stream) as ReadableStream<Uint8Array>;
            return new Response(webStream, {
                status: 200,
                headers: { 'Content-Type': mimeTypeForPath(finalPath) }
            });
        } catch (err) {
            mainLog.error('[customProtocol] failed to serve file', { path: finalPath, err });
            return new Response('Internal Server Error', { status: 500 });
        }
    });
}
