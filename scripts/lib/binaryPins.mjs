/**
 * Shared binary-pins.json validation and BtbN ffmpeg helpers.
 * Used by fetch-binaries, verify-binary-pins, and bump-ffmpeg-pins.
 */

/** Target ids that consume BtbN FFmpeg-Builds (Linux + Windows). */
export const FFMPEG_BTBN_TARGET_IDS = Object.freeze([
    'linux-x64',
    'linux-arm64',
    'win32-x64',
    'win32-arm64'
]);

/**
 * Map app target id → substring that appears in BtbN asset names
 * (e.g. linux64, winarm64).
 */
export const FFMPEG_BTBN_ASSET_ARCH = Object.freeze({
    'linux-x64': 'linux64',
    'linux-arm64': 'linuxarm64',
    'win32-x64': 'win64',
    'win32-arm64': 'winarm64'
});

const SHA256_HEX = /^[a-f0-9]{64}$/i;

/**
 * @param {unknown} pins
 * @returns {asserts pins is Record<string, unknown>}
 */
export function validateBinaryPins(pins) {
    if (!pins || typeof pins !== 'object') {
        throw new Error('Invalid binary pins file.');
    }
    if (pins.policyVersion !== 1) {
        throw new Error(`Unsupported binary pins policyVersion: ${pins.policyVersion}`);
    }

    const minCal = pins.minimumYtDlpCalver;
    const ytdlp = pins.ytdlp;
    if (typeof minCal !== 'string' || !ytdlp || typeof ytdlp !== 'object') {
        throw new Error('binary-pins.json: missing minimumYtDlpCalver or ytdlp');
    }
    if (typeof ytdlp.owner !== 'string' || typeof ytdlp.repo !== 'string') {
        throw new Error('binary-pins.json: ytdlp.owner/repo required');
    }
    if (typeof ytdlp.tag !== 'string') {
        throw new Error('binary-pins.json: missing ytdlp.tag');
    }
    if (compareCalver(ytdlp.tag, minCal) < 0) {
        throw new Error(`yt-dlp pin ${ytdlp.tag} is below minimumYtDlpCalver ${minCal}`);
    }
    assertSha256Map(ytdlp.sha256, 'ytdlp.sha256');

    validateFfmpegBtbn(pins.ffmpegBtbn);
    validateFfmpegDarwin(pins.ffmpegDarwinStatic);
    validateDeno(pins.deno);
}

/**
 * @param {unknown} block
 */
function validateFfmpegBtbn(block) {
    if (!block || typeof block !== 'object') {
        throw new Error('binary-pins.json: missing ffmpegBtbn');
    }
    if (typeof block.owner !== 'string' || typeof block.repo !== 'string') {
        throw new Error('binary-pins.json: ffmpegBtbn.owner/repo required');
    }
    if (typeof block.tag !== 'string' || !block.tag.trim()) {
        throw new Error('binary-pins.json: ffmpegBtbn.tag required');
    }
    if (!isMonthEndAutobuildTag(block.tag)) {
        throw new Error(
            `binary-pins.json: ffmpegBtbn.tag "${block.tag}" must be a month-end autobuild (kept ~2 years). Run \`pnpm run binaries:bump-ffmpeg\`.`
        );
    }
    if (typeof block.releaseLine !== 'string' || !/^\d+\.\d+$/.test(block.releaseLine)) {
        throw new Error(
            'binary-pins.json: ffmpegBtbn.releaseLine required (e.g. "8.1") — prefer release-line builds over master N-*'
        );
    }
    if (!block.targets || typeof block.targets !== 'object') {
        throw new Error('binary-pins.json: ffmpegBtbn.targets required');
    }
    for (const targetId of FFMPEG_BTBN_TARGET_IDS) {
        const spec = block.targets[targetId];
        if (!spec || typeof spec !== 'object') {
            throw new Error(`binary-pins.json: missing ffmpegBtbn.targets.${targetId}`);
        }
        if (typeof spec.assetName !== 'string' || !spec.assetName.trim()) {
            throw new Error(`binary-pins.json: ffmpegBtbn.targets.${targetId}.assetName required`);
        }
        assertSha256Hex(spec.sha256, `ffmpegBtbn.targets.${targetId}.sha256`);
        assertBtbnAssetMatchesPolicy(spec.assetName, targetId, block.releaseLine);
    }
}

/**
 * Ensure asset is release-line GPL (not master N-*, not lgpl, not shared).
 * @param {string} assetName
 * @param {string} targetId
 * @param {string} releaseLine
 */
export function assertBtbnAssetMatchesPolicy(assetName, targetId, releaseLine) {
    const archToken = FFMPEG_BTBN_ASSET_ARCH[targetId];
    if (!archToken) {
        throw new Error(`Unknown BtbN target id: ${targetId}`);
    }
    if (
        assetName.includes('-latest-') ||
        assetName.includes('-shared') ||
        assetName.includes('-lgpl')
    ) {
        throw new Error(
            `ffmpegBtbn asset "${assetName}" must be a pinned release-line GPL build (not latest/shared/lgpl)`
        );
    }
    if (assetName.startsWith('ffmpeg-N-') || assetName.startsWith('ffmpeg-master-')) {
        throw new Error(
            `ffmpegBtbn asset "${assetName}" must use release-line n${releaseLine} (not master N-*)`
        );
    }
    // Parse with prefix/suffix string checks + a hardcoded middle regex (no dynamic RegExp).
    // e.g. ffmpeg-n8.1.2-21-gce3c09c101-linux64-gpl-8.1.tar.xz
    //      ffmpeg-n8.1-11-g75d37c499d-win64-gpl-8.1.zip
    const ext = targetId.startsWith('win32') ? 'zip' : 'tar.xz';
    const expectedSuffix = `-${archToken}-gpl-${releaseLine}.${ext}`;
    const expectedPrefix = `ffmpeg-n${releaseLine}`;
    if (!assetName.endsWith(expectedSuffix) || !assetName.startsWith(expectedPrefix)) {
        throw new Error(
            `ffmpegBtbn asset "${assetName}" for ${targetId} must match n${releaseLine} GPL release-line pattern`
        );
    }
    const middle = assetName.slice(expectedPrefix.length, assetName.length - expectedSuffix.length);
    // Optional patch (.N) then zero or more -token segments (commit / build id).
    if (!/^(?:\.\d+)?(?:-[\w.]+)*$/.test(middle)) {
        throw new Error(
            `ffmpegBtbn asset "${assetName}" for ${targetId} must match n${releaseLine} GPL release-line pattern`
        );
    }
}

/**
 * @param {unknown} block
 */
function validateFfmpegDarwin(block) {
    if (!block || typeof block !== 'object') {
        throw new Error('binary-pins.json: missing ffmpegDarwinStatic');
    }
    if (typeof block.owner !== 'string' || typeof block.repo !== 'string') {
        throw new Error('binary-pins.json: ffmpegDarwinStatic.owner/repo required');
    }
    if (typeof block.tag !== 'string') {
        throw new Error('binary-pins.json: ffmpegDarwinStatic.tag required');
    }
    assertSha256Map(block.sha256, 'ffmpegDarwinStatic.sha256');
}

/**
 * @param {unknown} block
 */
function validateDeno(block) {
    if (!block || typeof block !== 'object') {
        throw new Error('binary-pins.json: missing deno');
    }
    if (typeof block.owner !== 'string' || typeof block.repo !== 'string') {
        throw new Error('binary-pins.json: deno.owner/repo required');
    }
    if (typeof block.tag !== 'string') {
        throw new Error('binary-pins.json: deno.tag required');
    }
    if (!block.assets || typeof block.assets !== 'object') {
        throw new Error('binary-pins.json: deno.assets required');
    }
    assertSha256Map(block.sha256, 'deno.sha256');
}

/**
 * @param {unknown} map
 * @param {string} label
 */
function assertSha256Map(map, label) {
    if (!map || typeof map !== 'object') {
        throw new Error(`binary-pins.json: missing ${label}`);
    }
    for (const [key, value] of Object.entries(map)) {
        assertSha256Hex(value, `${label}.${key}`);
    }
}

/**
 * @param {unknown} value
 * @param {string} label
 */
function assertSha256Hex(value, label) {
    if (typeof value !== 'string' || !SHA256_HEX.test(value.trim())) {
        throw new Error(`binary-pins.json: ${label} must be a 64-char hex SHA-256`);
    }
}

/** @returns negative if a < b, zero if equal, positive if a > b */
export function compareCalver(a, b) {
    const pa = String(a)
        .trim()
        .split('.')
        .map((x) => Number.parseInt(x, 10));
    const pb = String(b)
        .trim()
        .split('.')
        .map((x) => Number.parseInt(x, 10));
    const n = Math.max(pa.length, pb.length);
    for (let i = 0; i < n; i += 1) {
        const da = Number.isFinite(pa[i]) ? pa[i] : 0;
        const db = Number.isFinite(pb[i]) ? pb[i] : 0;
        if (da !== db) {
            return da - db;
        }
    }
    return 0;
}

/**
 * BtbN keeps the last build of each month for ~2 years.
 * Tag shape: autobuild-YYYY-MM-DD-HH-MM where DD is the calendar month's last day.
 * @param {string} tag
 */
export function isMonthEndAutobuildTag(tag) {
    const m = /^autobuild-(\d{4})-(\d{2})-(\d{2})-\d{2}-\d{2}$/.exec(tag);
    if (!m) {
        return false;
    }
    const year = Number(m[1]);
    const month = Number(m[2]);
    const day = Number(m[3]);
    const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate();
    return day === lastDay;
}

/**
 * Pick GPL release-line asset for a target from a GitHub release assets list.
 * @param {Array<{ name: string }>} assets
 * @param {string} targetId
 * @param {string} releaseLine
 * @returns {string | null}
 */
export function pickBtbnReleaseLineAssetName(assets, targetId, releaseLine) {
    const matches = [];
    for (const entry of assets) {
        const name = entry?.name;
        if (typeof name !== 'string') {
            continue;
        }
        try {
            assertBtbnAssetMatchesPolicy(name, targetId, releaseLine);
            matches.push(name);
        } catch {
            // not a policy-matching asset for this target
        }
    }
    if (matches.length === 0) {
        return null;
    }
    // Prefer the longest name (more specific patch/commit token) when multiple match.
    matches.sort((a, b) => b.length - a.length || a.localeCompare(b));
    return matches[0];
}
