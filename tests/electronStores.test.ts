import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { disk } = vi.hoisted(() => {
    const disk: Record<string, unknown> = {};
    return { disk };
});

vi.mock('electron-store', () => ({
    default: class MockElectronStore {
        constructor(opts: { defaults?: Record<string, unknown> }) {
            Object.assign(disk, structuredClone(opts?.defaults ?? {}));
        }
        get(key: string) {
            return disk[key];
        }
        set(key: string, value: unknown) {
            disk[key] = value;
        }
    }
}));

vi.mock('../electron/lib/safeStorageHelpers', () => ({
    encryptField: (value: string) => `enc:${value}`,
    decryptField: (encoded: string) => {
        if (!encoded.startsWith('enc:')) {
            throw new Error('not encrypted');
        }
        return encoded.slice(4);
    }
}));

describe('historyArchive', () => {
    beforeEach(async () => {
        vi.resetModules();
        for (const k of Object.keys(disk)) {
            delete disk[k];
        }
    });

    afterEach(() => {
        vi.resetModules();
    });

    it('appends, lists with clamp, clears, and reports total', async () => {
        const h = await import('../electron/services/historyArchive');
        const row = h.appendDownloadHistoryEvent({
            downloadId: 'd1',
            url: 'https://youtu.be/x',
            title: 'T',
            status: 'complete',
            filePath: '/f.mp4',
            errorMessage: null,
            queuedAtMs: 1
        });
        expect(row.downloadId).toBe('d1');
        expect(h.getDownloadHistoryTotal()).toBe(1);
        expect(h.listDownloadHistory({ limit: 10, offset: 0 })).toHaveLength(1);
        expect(h.listDownloadHistory({ limit: 999, offset: 0 })).toHaveLength(1);
        h.clearDownloadHistory();
        expect(h.getDownloadHistoryTotal()).toBe(0);
    });

    it('filters invalid rows on read and persists the cleaned list', async () => {
        const h = await import('../electron/services/historyArchive');
        h.appendDownloadHistoryEvent({
            downloadId: 'd1',
            url: 'https://youtu.be/x',
            title: 'T',
            status: 'complete',
            filePath: '/f.mp4',
            errorMessage: null,
            queuedAtMs: 1
        });
        if (Array.isArray(disk.entries)) {
            disk.entries.push({ id: 'bad', status: 'complete' });
        }
        expect(h.getDownloadHistoryTotal()).toBe(1);
        expect(h.listDownloadHistory({ limit: 10, offset: 0 })).toHaveLength(1);
        expect(disk.entries).toHaveLength(1);
    });

    it('treats a non-array entries value as empty and resets the store', async () => {
        const h = await import('../electron/services/historyArchive');
        // Initialize the store first — the mock constructor merges defaults into `disk`.
        expect(h.getDownloadHistoryTotal()).toBe(0);
        disk.entries = { not: 'an-array' };
        expect(h.getDownloadHistoryTotal()).toBe(0);
        expect(h.listDownloadHistory({ limit: 10, offset: 0 })).toEqual([]);
        expect(disk.entries).toEqual([]);
    });

    it('treats a missing entries key as empty without rewriting the store', async () => {
        const h = await import('../electron/services/historyArchive');
        expect(h.getDownloadHistoryTotal()).toBe(0);
        delete disk.entries;
        expect(h.listDownloadHistory({ limit: 10, offset: 0 })).toEqual([]);
        expect(disk.entries).toBeUndefined();
    });
});

describe('proxyProfileStore', () => {
    beforeEach(async () => {
        vi.resetModules();
        for (const k of Object.keys(disk)) {
            delete disk[k];
        }
    });

    afterEach(() => {
        vi.resetModules();
    });

    it('validates URLs and stores profiles', async () => {
        const p = await import('../electron/services/proxyProfileStore');
        expect(p.validateProxyUrlForStorage('')).toEqual({ ok: false, error: 'Empty proxy URL' });
        expect(p.validateProxyUrlForStorage('socks5://h:1\rx')).toEqual({
            ok: false,
            error: 'Invalid characters in proxy URL'
        });
        expect(p.validateProxyUrlForStorage('ftp://h')).toEqual({
            ok: false,
            error: 'Unsupported proxy scheme'
        });
        expect(p.validateProxyUrlForStorage('http://127.0.0.1:9')).toEqual({
            ok: true,
            url: 'http://127.0.0.1:9'
        });
        expect(p.setProxyProfileUrl('  ', 'http://127.0.0.1:9').ok).toBe(true);
        expect(p.getProxyUrlForProfile('default')).toBe('http://127.0.0.1:9');
        expect(p.getProxyUrlForProfile('  ')).toBe('http://127.0.0.1:9');
        const storedDefault = (disk.profiles as Record<string, { url: string } | undefined>)
            .default;
        expect(storedDefault?.url).toBe('enc:http://127.0.0.1:9');
        expect(p.isProxyProfileConfigured('default')).toBe(true);
        expect(p.setProxyProfileUrl('p1', null).ok).toBe(true);
        expect(p.getProxyUrlForProfile('p1')).toBeNull();
        const long = `http://127.0.0.1/${'x'.repeat(2040)}`;
        expect(p.validateProxyUrlForStorage(long).ok).toBe(false);
        expect(p.validateProxyUrlForStorage('not a url').ok).toBe(false);
        expect(p.setProxyProfileUrl('bad', 'not a url').ok).toBe(false);
        p.setProxyProfileUrl('ws', 'http://127.0.0.1:1');
        disk.profiles = { ws: { url: '   ' } };
        expect(p.getProxyUrlForProfile('ws')).toBeNull();
        expect(p.isProxyProfileConfigured('ws')).toBe(false);
        // Plaintext / unsupported ciphertext is rejected (no plaintext fallback).
        disk.profiles = { default: { url: 'ftp://evil.example/' } };
        expect(p.getProxyUrlForProfile('default')).toBeNull();
        expect(p.isProxyProfileConfigured('default')).toBe(false);
        // Encrypted but scheme-invalid plaintext is re-rejected on read.
        disk.profiles = { default: { url: 'enc:ftp://evil.example/' } };
        expect(p.getProxyUrlForProfile('default')).toBeNull();
        // Valid encrypted URL round-trips.
        disk.profiles = { default: { url: 'enc:socks5://127.0.0.1:1080' } };
        expect(p.getProxyUrlForProfile('default')).toBe('socks5://127.0.0.1:1080');
    });
});
