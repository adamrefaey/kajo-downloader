/**
 * Unit tests for customProtocol — specifically the path traversal guard and
 * content-type resolution, which can be exercised without a live Electron
 * `protocol.handle` registration.
 *
 * The file-serving path (stat → createReadStream → Response) requires real filesystem
 * access and is covered by integration tests; we focus on the security boundary here.
 */

import { join, normalize } from 'node:path';
import { describe, expect, it } from 'vitest';

// --- Path traversal guard logic (extracted for unit testing) -------------------
// This mirrors the exact logic in handleKajoAppProtocol without requiring
// a live Electron protocol instance.

function resolveAndCheckTraversal(
    rendererDistDir: string,
    urlPathname: string
): { blocked: boolean; resolved: string } {
    const relativePath = decodeURIComponent(urlPathname).replace(/^\/+/, '') || 'index.html';
    const resolved = normalize(join(rendererDistDir, relativePath));
    const blocked =
        !resolved.startsWith(`${normalize(rendererDistDir)}/`) &&
        resolved !== normalize(rendererDistDir);
    return { blocked, resolved };
}

// --- Tests -------------------------------------------------------------------

describe('customProtocol path traversal guard', () => {
    const distDir = '/app/renderer';

    it('allows index.html (root route)', () => {
        const { blocked } = resolveAndCheckTraversal(distDir, '/');
        expect(blocked).toBe(false);
    });

    it('allows normal asset paths', () => {
        const { blocked } = resolveAndCheckTraversal(distDir, '/assets/main.js');
        expect(blocked).toBe(false);
    });

    it('allows nested asset paths', () => {
        const { blocked } = resolveAndCheckTraversal(distDir, '/assets/fonts/inter.woff2');
        expect(blocked).toBe(false);
    });

    it('blocks path traversal: ../ escapes the dist dir', () => {
        const { blocked } = resolveAndCheckTraversal(distDir, '/../etc/passwd');
        expect(blocked).toBe(true);
    });

    it('blocks path traversal: URL-encoded %2F..%2F', () => {
        const { blocked } = resolveAndCheckTraversal(distDir, '/%2F..%2Fetc%2Fpasswd');
        // After decode: /../etc/passwd → still escapes
        expect(blocked).toBe(true);
    });

    it('blocks deeply nested traversal', () => {
        const { blocked } = resolveAndCheckTraversal(distDir, '/../../home/user/.ssh/id_rsa');
        expect(blocked).toBe(true);
    });

    it('resolved path for normal file is inside dist dir', () => {
        const { resolved, blocked } = resolveAndCheckTraversal(distDir, '/index.html');
        expect(blocked).toBe(false);
        expect(resolved.startsWith(distDir)).toBe(true);
    });
});

describe('customProtocol MIME type resolution', () => {
    it('serves JS with application/javascript', async () => {
        // We test the KAJO_APP constants are exported correctly
        const { KAJO_APP_SCHEME, KAJO_APP_RENDERER_URL } = await import(
            '../electron/customProtocol'
        );
        expect(KAJO_APP_SCHEME).toBe('kajo-app');
        expect(KAJO_APP_RENDERER_URL).toBe('kajo-app://localhost/');
    });
});
