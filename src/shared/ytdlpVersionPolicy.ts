/**
 * yt-dlp versioning policy (CalVer-style releases like `2025.03.21`).
 *
 * ## Audit summary (desktop app)
 *
 * - **Bundled builds**: `scripts/fetch-binaries.mjs` downloads **pinned** GitHub release
 *   assets listed in `scripts/binary-pins.json` and verifies SHA-256 for each artifact.
 *   The pin’s CalVer tag must stay at or above `MIN_YTDLP_VERSION`.
 * - **System installs**: `electron/services/binaries.ts` falls back to `yt-dlp` on `PATH`
 *   when no bundled binary is present. Health check only verified exit 0 of `--version`
 *   until `ytdlpVersionProbe` added a minimum calver gate.
 * - **Invocation**: All runs go through `buildYtDlpInvocation()` so `--js-runtimes` and
 *   bundled `--ffmpeg-location` stay consistent (`ytdlp.ts`, `metadata.ts`).
 *
 * ## Minimum version rationale
 *
 * Extractors and site-specific fixes ship continuously. `MIN_YTDLP_VERSION` is the
 * oldest release we consider acceptable for **multi-site** metadata/download flows
 * (beyond YouTube-only assumptions). Bump when the app starts depending on newer
 * yt-dlp flags or extractor behavior.
 *
 * **2025.03.26 floor:** `resolveMediaUrlMetadata` relies on `--dump-single-json`
 * `--flat-playlist` plus stable `extractor` / `extractor_key` fields in JSON for
 * site routing; older 2025.01.x builds can lag on TikTok/Instagram/Facebook-style
 * extractors. Bundled binaries follow `scripts/fetch-binaries.mjs` (current
 * yt-dlp release); this gate mainly rejects stale PATH installs.
 */
export const MIN_YTDLP_VERSION = '2025.03.26';

const CALVER_REGEX = /(\d{4})\.(\d{2})\.(\d{2})(?:\.(\d+))?/;

/** First yt-dlp calver token found in `yt-dlp --version` output. */
export function parseYtDlpVersionLine(raw: string): string | null {
    const match = raw.match(CALVER_REGEX);
    if (!match) {
        return null;
    }
    const [, y, m, d, tail] = match;
    return tail ? `${y}.${m}.${d}.${tail}` : `${y}.${m}.${d}`;
}

function calverParts(version: string): [number, number, number, number] | null {
    const match = version.trim().match(/^(\d{4})\.(\d{2})\.(\d{2})(?:\.(\d+))?$/);
    if (!match) {
        return null;
    }
    const y = Number(match[1]);
    const mo = Number(match[2]);
    const d = Number(match[3]);
    const tail = match[4] !== undefined ? Number(match[4]) : 0;
    if ([y, mo, d, tail].some((n) => !Number.isFinite(n))) {
        return null;
    }
    return [y, mo, d, tail];
}

/**
 * Comparator for yt-dlp calver strings.
 * @returns negative if `a < b`, zero if equal, positive if `a > b`
 */
export function compareYtDlpCalver(a: string, b: string): number {
    const pa = calverParts(a);
    const pb = calverParts(b);
    if (!pa || !pb) {
        return a.localeCompare(b);
    }
    for (let i = 0; i < 4; i += 1) {
        if (pa[i] !== pb[i]) {
            return (pa[i] ?? 0) - (pb[i] ?? 0);
        }
    }
    return 0;
}

export function isYtDlpVersionAtLeast(reported: string, minimum: string): boolean {
    return compareYtDlpCalver(reported, minimum) >= 0;
}
