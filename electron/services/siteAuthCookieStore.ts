import { createHash, randomBytes } from 'node:crypto';
import { mkdir, readFile, unlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { app, type Cookie, type Session } from 'electron';
import { isSignedSiteSummary } from '../../src/shared/signedSiteSummaryGuard';
import {
    isCookieDomainAllowedForSiteAuth,
    listAllowedDomainSuffixesForSiteAuth
} from '../../src/shared/siteAuthDomains';
import { resolveSiteCookieStorageKey } from '../../src/shared/siteAuthKeys';
import { persistedCookiesLookLikeSignedIn } from '../../src/shared/siteAuthSessionEvidence';
import { getSiteProfileByHostOrUrl, getSiteProfileBySiteId } from '../../src/shared/siteProfiles';
import type { SignedSiteSummary, SiteCookieHealth } from '../../src/types';
import { createKajoElectronStore } from '../lib/kajoElectronStore';
import { decryptField, encryptField } from '../lib/safeStorageHelpers';

type PersistedCookieRow = Pick<
    Cookie,
    'name' | 'value' | 'domain' | 'path' | 'secure' | 'httpOnly' | 'sameSite' | 'expirationDate'
>;

interface SiteCookieSnapshotV1 {
    v: 1;
    savedAt: number;
    cookies: PersistedCookieRow[];
}

interface SiteCookieSnapshotV2 {
    v: 2;
    savedAt: number;
    cookies: PersistedCookieRow[];
    /** Truncated document title when cookies were saved (UX hint only). */
    displayHint?: string;
}

interface CookieVaultShape {
    blobs: Record<string, string>;
}

const vault = createKajoElectronStore<CookieVaultShape>({
    name: 'site-auth-cookie-vault',
    defaults: { blobs: {} }
});

/** Encrypt vault payload; uses OS keychain when available, else PBKDF2 fallback (never plaintext). */
function encryptJson(json: string): string {
    return encryptField(json);
}

/**
 * Decrypt vault payload. Supports:
 * - current `encryptField` output (safeStorage base64 or `fbk:` PBKDF2)
 * - legacy base64(utf8) plaintext from when keychain was unavailable
 */
function decryptToJson(stored: string): string {
    const viaField = decryptField(stored);
    try {
        JSON.parse(viaField);
        return viaField;
    } catch {
        // Legacy: Buffer.from(json, 'utf8').toString('base64') when encryption was unavailable
        try {
            const decoded = Buffer.from(stored, 'base64').toString('utf8');
            JSON.parse(decoded);
            return decoded;
        } catch {
            throw new Error('cookie vault decrypt failed');
        }
    }
}

function cookieToNetscapeLine(c: PersistedCookieRow): string {
    const rawDomain = (c.domain ?? '').trim();
    const domain = rawDomain.startsWith('.') ? rawDomain : `.${rawDomain}`;
    const path = (c.path ?? '/').trim() || '/';
    const secure = c.secure ? 'TRUE' : 'FALSE';
    const expires =
        typeof c.expirationDate === 'number' && Number.isFinite(c.expirationDate)
            ? Math.floor(c.expirationDate)
            : 0;
    const name = c.name ?? '';
    const value = c.value ?? '';
    return `${domain}\tTRUE\t${path}\t${secure}\t${expires}\t${name}\t${value}`;
}

export function netscapeHeaderLines(): string[] {
    return [
        '# Netscape HTTP Cookie File',
        '# https://curl.haxx.se/rfc/cookie_spec.html',
        '# Exported for yt-dlp',
        ''
    ];
}

export async function mergeNetscapeCookieFiles(paths: string[]): Promise<string | null> {
    const existing: string[] = [];
    for (const p of paths) {
        if (p.trim()) {
            existing.push(p);
        }
    }
    if (existing.length === 0) {
        return null;
    }
    if (existing.length === 1) {
        return existing[0] as string;
    }
    const body: string[] = [];
    for (const p of existing) {
        const raw = await readFile(p, 'utf8');
        for (const line of raw.split(/\r?\n/)) {
            const t = line.trim();
            if (!t || t.startsWith('#')) {
                continue;
            }
            body.push(line);
        }
    }
    const dir = join(app.getPath('temp'), 'kajo-merged-cookies');
    await mkdir(dir, { recursive: true });
    const outPath = join(
        dir,
        `merged-${createHash('sha256').update(body.join('\n')).digest('hex').slice(0, 16)}-${Date.now()}.txt`
    );
    await writeFile(outPath, [...netscapeHeaderLines(), ...body].join('\n'), {
        encoding: 'utf8',
        mode: 0o600
    });
    return outPath;
}

const DISPLAY_HINT_MAX = 120;

/** After filtering by domain, cap rows so the vault cannot grow without bound. */
const MAX_COOKIES_PER_SNAPSHOT = 2500;

/** If an older snapshot already on disk is huge, trim on read to avoid blocking the main process. */
const SNAPSHOT_TRIM_THRESHOLD = 4000;

function normalizeDisplayHint(raw: string | undefined): string | undefined {
    const t = raw?.trim();
    if (!t) {
        return undefined;
    }
    const cut = t.length > DISPLAY_HINT_MAX ? `${t.slice(0, DISPLAY_HINT_MAX - 1)}…` : t;
    return cut;
}

export function persistSiteCookieSnapshot(
    siteKey: string,
    cookies: Cookie[],
    opts?: { displayHint?: string }
): void {
    const hint = normalizeDisplayHint(opts?.displayHint);
    const snapshot: SiteCookieSnapshotV2 = {
        v: 2,
        savedAt: Date.now(),
        cookies: cookies.map((c) => ({
            name: c.name,
            value: c.value,
            ...(c.domain !== undefined ? { domain: c.domain } : {}),
            ...(c.path !== undefined ? { path: c.path } : {}),
            ...(c.secure !== undefined ? { secure: c.secure } : {}),
            ...(c.httpOnly !== undefined ? { httpOnly: c.httpOnly } : {}),
            sameSite: c.sameSite,
            ...(c.expirationDate !== undefined ? { expirationDate: c.expirationDate } : {})
        })),
        ...(hint ? { displayHint: hint } : {})
    };
    vault.set('blobs', {
        ...vault.get('blobs'),
        [siteKey]: encryptJson(JSON.stringify(snapshot))
    });
}

export function clearSiteCookieSnapshot(siteKey: string): void {
    const next = { ...vault.get('blobs') };
    delete next[siteKey];
    vault.set('blobs', next);
}

export function hasSiteCookieSnapshot(siteKey: string): boolean {
    return Boolean(vault.get('blobs')[siteKey]);
}

function trimOversizedSnapshotCookies(
    siteKey: string,
    cookies: PersistedCookieRow[]
): PersistedCookieRow[] {
    const profile = getSiteProfileBySiteId(siteKey);
    const rootFallback = (profile?.domains?.[0] ?? siteKey).trim();
    const allowed = listAllowedDomainSuffixesForSiteAuth(profile, rootFallback);
    const filtered = cookies.filter((c) =>
        allowed.length === 0 ? true : isCookieDomainAllowedForSiteAuth(c.domain, allowed)
    );
    const next = filtered.slice(0, MAX_COOKIES_PER_SNAPSHOT);
    console.warn(
        `[kajo] Trimmed oversized site-auth snapshot for "${siteKey}" (${cookies.length} → ${next.length} cookies)`
    );
    return next;
}

function loadSnapshot(siteKey: string): SiteCookieSnapshotV1 | SiteCookieSnapshotV2 | null {
    const b64 = vault.get('blobs')[siteKey];
    if (!b64) {
        return null;
    }
    try {
        const raw = decryptToJson(b64);
        const parsed = JSON.parse(raw) as SiteCookieSnapshotV1 | SiteCookieSnapshotV2;
        if ((parsed?.v !== 1 && parsed?.v !== 2) || !Array.isArray(parsed.cookies)) {
            return null;
        }
        if (parsed.cookies.length > SNAPSHOT_TRIM_THRESHOLD) {
            return { ...parsed, cookies: trimOversizedSnapshotCookies(siteKey, parsed.cookies) };
        }
        return parsed;
    } catch {
        return null;
    }
}

const EXPIRING_SOON_SEC = 7 * 24 * 60 * 60;

function computeCookieHealthFromRows(
    cookies: PersistedCookieRow[],
    nowSec: number
): { health: SiteCookieHealth; expiresAtMs: number | null } {
    if (cookies.length === 0) {
        return { health: 'missing', expiresAtMs: null };
    }
    const persistent = cookies
        .map((c) => c.expirationDate)
        .filter((e): e is number => typeof e === 'number' && Number.isFinite(e) && e > 0);
    if (persistent.length === 0) {
        return { health: 'healthy', expiresAtMs: null };
    }
    const minExpSec = Math.min(...persistent);
    const expiresAtMs = minExpSec * 1000;
    if (minExpSec < nowSec) {
        return { health: 'expired', expiresAtMs };
    }
    if (minExpSec < nowSec + EXPIRING_SOON_SEC) {
        return { health: 'expiring_soon', expiresAtMs };
    }
    return { health: 'healthy', expiresAtMs };
}

function snapshotToSummary(
    siteKey: string,
    snap: SiteCookieSnapshotV1 | SiteCookieSnapshotV2
): SignedSiteSummary {
    const nowSec = Math.floor(Date.now() / 1000);
    const { health, expiresAtMs } = computeCookieHealthFromRows(snap.cookies, nowSec);
    const profile = getSiteProfileBySiteId(siteKey);
    const displayName = profile?.displayName ?? siteKey;
    const domainLabel = profile?.domains?.[0] ?? siteKey;
    const siteId = profile?.siteId ?? siteKey;
    const hint = snap.v === 2 ? snap.displayHint?.trim() : undefined;
    return {
        siteKey,
        siteId,
        displayName,
        domainLabel,
        signedInAs: hint || null,
        lastSavedAt: snap.savedAt,
        cookieCount: snap.cookies.length,
        expiresAt: expiresAtMs,
        cookieHealth: health
    };
}

export function listSignedSiteStorageKeys(): string[] {
    return Object.keys(vault.get('blobs'));
}

export function getSignedSiteSummary(siteKey: string): SignedSiteSummary | null {
    const snap = loadSnapshot(siteKey);
    if (!snap) {
        return null;
    }
    return snapshotToSummary(siteKey, snap);
}

export function listSignedSiteSummaries(): SignedSiteSummary[] {
    const keys = listSignedSiteStorageKeys();
    const out: SignedSiteSummary[] = [];
    for (const key of keys) {
        const row = getSignedSiteSummary(key);
        if (row && isSignedSiteSummary(row)) {
            out.push(row);
        }
    }
    out.sort((a, b) => b.lastSavedAt - a.lastSavedAt);
    return out;
}

/**
 * Writes a yt-dlp-compatible Netscape cookie file for the given media URL's site key.
 * Returns null when no snapshot exists.
 */
/** Removes a legacy persistent Netscape jar under userData (pre-ephemeral layout). */
export async function unlinkMaterializedSiteCookieJar(siteKey: string): Promise<void> {
    const filePath = join(app.getPath('userData'), 'site-cookie-jars', `${siteKey}.cookies.txt`);
    await unlinkQuiet(filePath);
}

/** True when the path is an app-managed cookie jar safe to delete after yt-dlp exits. */
export function isManagedEphemeralCookieJarPath(filePath: string): boolean {
    const p = filePath.replace(/\\/g, '/');
    return (
        p.includes('/kajo-site-cookies-') ||
        p.includes('/kajo-merged-cookies/') ||
        p.includes('/site-cookie-jars/')
    );
}

/** Collect `--cookies <path>` values from a yt-dlp argv fragment. */
export function cookieFilePathsFromArgv(argv: readonly string[]): string[] {
    const out: string[] = [];
    for (let i = 0; i < argv.length - 1; i++) {
        if (argv[i] === '--cookies') {
            const next = argv[i + 1];
            if (typeof next === 'string' && next.trim()) {
                out.push(next);
            }
        }
    }
    return out;
}

/** Unlink managed cookie jars referenced by a yt-dlp argv fragment. */
export async function unlinkManagedCookieFilesFromArgv(argv: readonly string[]): Promise<void> {
    for (const p of cookieFilePathsFromArgv(argv)) {
        if (isManagedEphemeralCookieJarPath(p)) {
            await unlinkQuiet(p);
        }
    }
}

/**
 * Writes an ephemeral yt-dlp Netscape cookie file for the media URL's site key.
 * Unlinked after metadata probes (`runYtDlpWithAuthCookieStrategies`) and after each
 * download finishes (`cleanupDownloadTracking`); download preambles retain the path until then.
 */
export async function materializeSiteCookiesForYtDlp(mediaUrl: string): Promise<string | null> {
    const profile = getSiteProfileByHostOrUrl(mediaUrl);
    const siteKey = resolveSiteCookieStorageKey({
        url: mediaUrl,
        ...(profile?.siteId !== undefined ? { siteId: profile.siteId } : {})
    });
    const snap = loadSnapshot(siteKey);
    if (!snap?.cookies.length) {
        return null;
    }
    const filePath = randomTempCookiePath(`kajo-site-cookies-${siteKey}`);
    const lines = [...netscapeHeaderLines(), ...snap.cookies.map(cookieToNetscapeLine)];
    await writeFile(filePath, lines.join('\n'), { encoding: 'utf8', mode: 0o600 });
    return filePath;
}

export type CaptureSiteSessionCookiesOutcome =
    | { ok: true; cookieCount: number }
    | { ok: false; error: 'site_auth_no_session' };

export async function captureAndPersistSessionCookies(
    session: Session,
    siteKey: string,
    opts: { displayHint?: string; allowedDomainSuffixes: string[] }
): Promise<CaptureSiteSessionCookiesOutcome> {
    const all = await session.cookies.get({});
    const allowed = opts.allowedDomainSuffixes;
    const rows = all.filter((c) =>
        allowed.length === 0 ? true : isCookieDomainAllowedForSiteAuth(c.domain, allowed)
    );
    const capped =
        rows.length > MAX_COOKIES_PER_SNAPSHOT ? rows.slice(0, MAX_COOKIES_PER_SNAPSHOT) : rows;
    if (rows.length > MAX_COOKIES_PER_SNAPSHOT) {
        console.warn(
            `[kajo] Capped site-auth cookie export for "${siteKey}" (${rows.length} → ${capped.length})`
        );
    }
    if (!persistedCookiesLookLikeSignedIn(siteKey, capped)) {
        return { ok: false, error: 'site_auth_no_session' };
    }
    persistSiteCookieSnapshot(siteKey, capped, {
        ...(opts.displayHint !== undefined ? { displayHint: opts.displayHint } : {})
    });
    return { ok: true, cookieCount: capped.length };
}

/** Ephemeral merged path for yt-dlp when both Google jar and site snapshot exist. */
export async function writeEphemeralMergedCookiesFile(
    siteFile: string | null,
    googleFile: string | null
): Promise<string | null> {
    const paths: string[] = [];
    if (siteFile) {
        paths.push(siteFile);
    }
    if (googleFile) {
        paths.push(googleFile);
    }
    return mergeNetscapeCookieFiles(paths);
}

export async function unlinkQuiet(path: string): Promise<void> {
    try {
        await unlink(path);
    } catch {
        /* ignore */
    }
}

export function randomTempCookiePath(prefix: string): string {
    return join(tmpdir(), `${prefix}-${randomBytes(8).toString('hex')}.txt`);
}
