import type ElectronStore from 'electron-store';
import { createKajoElectronStore } from '../lib/kajoElectronStore';
import { decryptField, encryptField } from '../lib/safeStorageHelpers';

/** Primary profile id used by the settings UI. */
export const DEFAULT_PROXY_PROFILE_ID = 'default';

interface ProxyDisk {
    /** Profile id → encrypted proxy URL (`encryptField`). */
    profiles: Record<string, { url: string }>;
}

function defaultDisk(): ProxyDisk {
    return { profiles: {} };
}

let proxyStore: ElectronStore<ProxyDisk> | null = null;

function store(): ElectronStore<ProxyDisk> {
    if (!proxyStore) {
        proxyStore = createKajoElectronStore<ProxyDisk>({
            name: 'proxy-profiles',
            defaults: defaultDisk()
        });
    }
    return proxyStore;
}

const MAX_PROXY_URL_LEN = 2048;

/**
 * Validates proxy URL for yt-dlp `--proxy` (no raw newlines / control chars).
 */
export function validateProxyUrlForStorage(
    raw: string
): { ok: true; url: string } | { ok: false; error: string } {
    const trimmed = raw.trim();
    if (trimmed.length === 0) {
        return { ok: false, error: 'Empty proxy URL' };
    }
    if (trimmed.length > MAX_PROXY_URL_LEN) {
        return { ok: false, error: 'Proxy URL is too long' };
    }
    if (trimmed.includes('\r') || trimmed.includes('\n') || trimmed.includes('\u0000')) {
        return { ok: false, error: 'Invalid characters in proxy URL' };
    }
    let parsed: URL;
    try {
        parsed = new URL(trimmed);
    } catch {
        return { ok: false, error: 'Proxy URL must be a valid URL' };
    }
    const scheme = parsed.protocol.replace(/:$/, '').toLowerCase();
    const allowed = new Set(['http', 'https', 'socks5', 'socks5h', 'socks4', 'socks4a']);
    if (!allowed.has(scheme)) {
        return { ok: false, error: 'Unsupported proxy scheme' };
    }
    return { ok: true, url: trimmed };
}

function decryptStoredProxyUrl(encoded: string): string | null {
    try {
        return decryptField(encoded);
    } catch {
        return null;
    }
}

export function getProxyUrlForProfile(profileId: string): string | null {
    const id = profileId.trim() || DEFAULT_PROXY_PROFILE_ID;
    const row = store().get('profiles')[id];
    if (!row?.url?.trim()) {
        return null;
    }
    const plaintext = decryptStoredProxyUrl(row.url);
    if (!plaintext) {
        return null;
    }
    // Re-validate on read: electron-store JSON can be edited on disk (CLAUDE.md pitfall), and this
    // value is handed to yt-dlp as `--proxy`. Re-run the same scheme / control-char / length checks
    // enforced on write so a tampered store cannot smuggle an unsupported scheme into the argv.
    const validated = validateProxyUrlForStorage(plaintext);
    if (!validated.ok) {
        return null;
    }
    return validated.url;
}

export function isProxyProfileConfigured(profileId: string): boolean {
    return getProxyUrlForProfile(profileId) != null;
}

export function setProxyProfileUrl(
    profileId: string,
    url: string | null
): { ok: true } | { ok: false; error: string } {
    const id = (profileId.trim() || DEFAULT_PROXY_PROFILE_ID).slice(0, 64);
    const s = store();
    const next = { ...s.get('profiles') };

    if (url == null || url.trim() === '') {
        delete next[id];
        s.set('profiles', next);
        return { ok: true };
    }

    const v = validateProxyUrlForStorage(url);
    if (!v.ok) {
        return v;
    }
    next[id] = { url: encryptField(v.url) };
    s.set('profiles', next);
    return { ok: true };
}
