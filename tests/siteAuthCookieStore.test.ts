import { join } from 'node:path';
import type { Cookie } from 'electron';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const vaultDisk = vi.hoisted(() => ({ blobs: {} as Record<string, string> }));
const encryptionOn = vi.hoisted(() => ({ value: false }));

const readFile = vi.hoisted(() => vi.fn());
const writeFile = vi.hoisted(() => vi.fn<(...args: unknown[]) => Promise<void>>());
const mkdir = vi.hoisted(() =>
    vi.fn<(...args: unknown[]) => Promise<void>>(() => Promise.resolve())
);
const unlink = vi.hoisted(() =>
    vi.fn<(...args: unknown[]) => Promise<void>>(() => Promise.resolve())
);

vi.mock('../electron/lib/kajoElectronStore', () => ({
    createKajoElectronStore: () => ({
        get: (key: 'blobs') => {
            if (key === 'blobs') {
                return { ...vaultDisk.blobs };
            }
            return {};
        },
        set: (key: 'blobs', val: Record<string, string>) => {
            if (key === 'blobs') {
                vaultDisk.blobs = { ...val };
            }
        }
    })
}));

vi.mock('electron', () => ({
    app: {
        getPath: (name: string) => {
            if (name === 'temp') {
                return '/mock/temp';
            }
            if (name === 'userData') {
                return '/mock/userdata';
            }
            return '/mock';
        }
    },
    safeStorage: {
        isEncryptionAvailable: () => encryptionOn.value,
        encryptString: (s: string) => Buffer.from(`enc:${s}`, 'utf8'),
        decryptString: (buf: Buffer) => {
            const t = buf.toString('utf8');
            if (!t.startsWith('enc:')) {
                throw new Error('not encrypted');
            }
            return t.slice(4);
        }
    }
}));

vi.mock('node:fs/promises', () => ({
    readFile: (path: string, enc: BufferEncoding) => readFile(path, enc),
    writeFile: (...args: unknown[]) => writeFile(...args),
    mkdir: (...args: unknown[]) => mkdir(...args),
    unlink: (...args: unknown[]) => unlink(...args)
}));

vi.mock('node:crypto', async (importOriginal) => {
    const crypto = await importOriginal<typeof import('node:crypto')>();
    return {
        ...crypto,
        randomBytes: vi.fn((size: number) => Buffer.alloc(size, 0xab))
    };
});

import {
    captureAndPersistSessionCookies,
    clearSiteCookieSnapshot,
    cookieFilePathsFromArgv,
    getSignedSiteSummary,
    hasSiteCookieSnapshot,
    isManagedEphemeralCookieJarPath,
    listSignedSiteStorageKeys,
    listSignedSiteSummaries,
    materializeSiteCookiesForYtDlp,
    mergeNetscapeCookieFiles,
    netscapeHeaderLines,
    persistSiteCookieSnapshot,
    randomTempCookiePath,
    unlinkManagedCookieFilesFromArgv,
    unlinkMaterializedSiteCookieJar,
    unlinkQuiet,
    writeEphemeralMergedCookiesFile
} from '../electron/services/siteAuthCookieStore';
import * as signedSiteSummaryGuard from '../src/shared/signedSiteSummaryGuard';

function baseCookie(overrides: Partial<Cookie> = {}): Cookie {
    return {
        name: 'n',
        value: 'v',
        domain: '.youtube.com',
        path: '/',
        secure: true,
        httpOnly: false,
        sameSite: 'lax',
        ...overrides
    } as Cookie;
}

describe('siteAuthCookieStore', () => {
    beforeEach(() => {
        vaultDisk.blobs = {};
        encryptionOn.value = true;
        readFile.mockReset();
        writeFile.mockReset();
        mkdir.mockReset();
        unlink.mockReset();
        mkdir.mockImplementation(() => Promise.resolve());
        unlink.mockImplementation(() => Promise.resolve());
        vi.spyOn(signedSiteSummaryGuard, 'isSignedSiteSummary').mockRestore();
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    it('netscapeHeaderLines returns the standard header block', () => {
        expect(netscapeHeaderLines()[0]).toContain('Netscape');
    });

    it('mergeNetscapeCookieFiles returns null for empty paths after trimming', async () => {
        await expect(mergeNetscapeCookieFiles(['', '  '])).resolves.toBeNull();
    });

    it('mergeNetscapeCookieFiles returns null when given no paths', async () => {
        await expect(mergeNetscapeCookieFiles([])).resolves.toBeNull();
    });

    it('mergeNetscapeCookieFiles returns the sole path when only one file is provided', async () => {
        await expect(mergeNetscapeCookieFiles(['/a/cookies.txt'])).resolves.toBe('/a/cookies.txt');
    });

    it('mergeNetscapeCookieFiles merges non-comment lines from multiple files', async () => {
        readFile.mockImplementation(async (p: string) => {
            if (p === '/one.txt') {
                return '# skip\n   \nfoo\tbar\n';
            }
            if (p === '/two.txt') {
                return '\n\n';
            }
            return '';
        });
        const out = await mergeNetscapeCookieFiles(['/one.txt', '/two.txt']);
        expect(out).toBeTruthy();
        expect(mkdir).toHaveBeenCalled();
        expect(writeFile).toHaveBeenCalled();
        const written = String(writeFile.mock.calls[0]?.[1]);
        expect(written).toContain('foo\tbar');
    });

    it('persistSiteCookieSnapshot omits optional cookie fields when properties are undefined', () => {
        persistSiteCookieSnapshot('bare', [
            {
                name: 'session',
                value: '1',
                sameSite: 'lax'
            } as Cookie
        ]);
        expect(hasSiteCookieSnapshot('bare')).toBe(true);
    });

    it('persistSiteCookieSnapshot drops whitespace-only display hints', () => {
        persistSiteCookieSnapshot('nohint', [baseCookie({ name: 'LOGIN_INFO' })], {
            displayHint: '   \t  '
        });
        expect(getSignedSiteSummary('nohint')?.signedInAs).toBeNull();
    });

    it('persistSiteCookieSnapshot, has, clear, and list keys round-trip', () => {
        expect(hasSiteCookieSnapshot('yt')).toBe(false);
        persistSiteCookieSnapshot('yt', [baseCookie({ name: 'LOGIN_INFO', value: 'x' })], {
            displayHint: `  ${'x'.repeat(130)}  `
        });
        expect(hasSiteCookieSnapshot('yt')).toBe(true);
        expect(listSignedSiteStorageKeys()).toContain('yt');
        clearSiteCookieSnapshot('yt');
        expect(hasSiteCookieSnapshot('yt')).toBe(false);
    });

    it('getSignedSiteSummary returns null for unknown keys and invalid vault payloads', () => {
        expect(getSignedSiteSummary('missing')).toBeNull();
        vaultDisk.blobs.bad = '%%%not-base64%%%';
        expect(getSignedSiteSummary('bad')).toBeNull();
        const corrupt = Buffer.from('{', 'utf8').toString('base64');
        vaultDisk.blobs.bad2 = corrupt;
        expect(getSignedSiteSummary('bad2')).toBeNull();
        vaultDisk.blobs.bad3 = Buffer.from(JSON.stringify({ v: 9, cookies: [] }), 'utf8').toString(
            'base64'
        );
        expect(getSignedSiteSummary('bad3')).toBeNull();
        vaultDisk.blobs.bad4 = Buffer.from(JSON.stringify({ v: 2, cookies: {} }), 'utf8').toString(
            'base64'
        );
        expect(getSignedSiteSummary('bad4')).toBeNull();
    });

    it('supports v1 snapshots without display hints', () => {
        const snap = {
            v: 1 as const,
            savedAt: 10,
            cookies: [baseCookie({ name: 'a', expirationDate: 9e12 })]
        };
        vaultDisk.blobs.v1 = Buffer.from(JSON.stringify(snap), 'utf8').toString('base64');
        const row = getSignedSiteSummary('v1');
        expect(row?.signedInAs).toBeNull();
        expect(row?.cookieHealth).toBeDefined();
    });

    it('v2 snapshots treat blank display hints as absent', () => {
        vaultDisk.blobs.blankhint = Buffer.from(
            JSON.stringify({
                v: 2,
                savedAt: 3,
                displayHint: '   ',
                cookies: [baseCookie({ name: 'LOGIN_INFO' })]
            }),
            'utf8'
        ).toString('base64');
        expect(getSignedSiteSummary('blankhint')?.signedInAs).toBeNull();
    });

    it('computes cookie health states from persisted expiration dates', () => {
        const nowSec = Math.floor(Date.now() / 1000);
        const past = nowSec - 10;
        const soon = nowSec + 3600;
        const far = nowSec + 14 * 24 * 3600;
        const mk = (exp: number) =>
            Buffer.from(
                JSON.stringify({
                    v: 2,
                    savedAt: 1,
                    cookies: [baseCookie({ name: 'c', expirationDate: exp })]
                }),
                'utf8'
            ).toString('base64');
        vaultDisk.blobs.hpast = mk(past);
        vaultDisk.blobs.hsoon = mk(soon);
        vaultDisk.blobs.hfar = mk(far);
        vaultDisk.blobs.hnone = Buffer.from(
            JSON.stringify({
                v: 2,
                savedAt: 1,
                cookies: [baseCookie({ name: 'session', expirationDate: 0 })]
            }),
            'utf8'
        ).toString('base64');
        expect(getSignedSiteSummary('hpast')?.cookieHealth).toBe('expired');
        expect(getSignedSiteSummary('hsoon')?.cookieHealth).toBe('expiring_soon');
        expect(getSignedSiteSummary('hfar')?.cookieHealth).toBe('healthy');
        expect(getSignedSiteSummary('hnone')?.cookieHealth).toBe('healthy');
        vaultDisk.blobs.empty = Buffer.from(
            JSON.stringify({ v: 2, savedAt: 1, cookies: [] }),
            'utf8'
        ).toString('base64');
        expect(getSignedSiteSummary('empty')?.cookieHealth).toBe('missing');
    });

    it('trims oversized youtube snapshots on read', () => {
        const cookies = Array.from({ length: 4001 }, (_, i) =>
            baseCookie({
                name: `c${i}`,
                domain: '.youtube.com'
            })
        );
        const snap = { v: 2 as const, savedAt: 1, cookies };
        vaultDisk.blobs.youtube = Buffer.from(JSON.stringify(snap), 'utf8').toString('base64');
        const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
        const row = getSignedSiteSummary('youtube');
        expect(row?.cookieCount).toBeLessThanOrEqual(2500);
        expect(warn).toHaveBeenCalled();
        warn.mockRestore();
    });

    it('listSignedSiteSummaries filters rows rejected by isSignedSiteSummary', () => {
        persistSiteCookieSnapshot('ok', [baseCookie({ name: 'LOGIN_INFO' })]);
        vi.spyOn(signedSiteSummaryGuard, 'isSignedSiteSummary').mockReturnValue(false);
        expect(listSignedSiteSummaries()).toEqual([]);
    });

    it('listSignedSiteSummaries skips keys that do not decode to a snapshot', () => {
        vaultDisk.blobs['not-a-snapshot'] = '%%%';
        persistSiteCookieSnapshot('keep', [baseCookie({ name: 'LOGIN_INFO' })]);
        const rows = listSignedSiteSummaries();
        expect(rows.map((r) => r.siteKey)).toEqual(['keep']);
    });

    it('listSignedSiteSummaries sorts newest snapshots first when multiple keys exist', () => {
        vaultDisk.blobs.older = Buffer.from(
            JSON.stringify({
                v: 2,
                savedAt: 10,
                cookies: [baseCookie({ name: 'LOGIN_INFO', domain: '.youtube.com' })]
            }),
            'utf8'
        ).toString('base64');
        vaultDisk.blobs.newer = Buffer.from(
            JSON.stringify({
                v: 2,
                savedAt: 99,
                cookies: [baseCookie({ name: 'LOGIN_INFO', domain: '.youtube.com' })]
            }),
            'utf8'
        ).toString('base64');
        const rows = listSignedSiteSummaries();
        expect(rows.map((r) => r.siteKey)).toEqual(['newer', 'older']);
    });

    it('trims oversized snapshots without a domain allowlist when site key has no profile root', () => {
        const cookies = Array.from({ length: 4001 }, (_, i) =>
            baseCookie({
                name: `c${i}`,
                domain: '.example.com'
            })
        );
        const snap = { v: 2 as const, savedAt: 2, cookies };
        vaultDisk.blobs['   '] = Buffer.from(JSON.stringify(snap), 'utf8').toString('base64');
        const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
        const row = getSignedSiteSummary('   ');
        expect(row?.cookieCount).toBe(2500);
        expect(warn).toHaveBeenCalled();
        warn.mockRestore();
    });

    it('materializeSiteCookiesForYtDlp writes an ephemeral jar when a snapshot exists', async () => {
        persistSiteCookieSnapshot('youtube', [
            baseCookie({ name: 'LOGIN_INFO', value: '1', domain: '.youtube.com' })
        ]);
        const p = await materializeSiteCookiesForYtDlp(
            'https://www.youtube.com/watch?v=dQw4w9WgXcQ'
        );
        expect(p).toMatch(/kajo-site-cookies-youtube-.*\.txt$/);
        expect(writeFile).toHaveBeenCalled();
        const writeArgs = writeFile.mock.calls.at(-1);
        expect(writeArgs?.[2]).toMatchObject({ mode: 0o600 });
    });

    it('materializeSiteCookiesForYtDlp returns null when no cookies are stored', async () => {
        await expect(
            materializeSiteCookiesForYtDlp('https://www.youtube.com/watch?v=abc')
        ).resolves.toBeNull();
    });

    it('materializeSiteCookiesForYtDlp resolves storage key from hostname when no site profile matches', async () => {
        persistSiteCookieSnapshot('app-acme-corp-local', [
            baseCookie({ name: 'sid', value: '1', domain: '.acme.corp.local' })
        ]);
        const p = await materializeSiteCookiesForYtDlp('https://app.acme.corp.local/video/1');
        expect(p).toMatch(/kajo-site-cookies-app-acme-corp-local-.*\.txt$/);
        expect(writeFile).toHaveBeenCalled();
    });

    it('unlinkMaterializedSiteCookieJar asks fs to remove the jar', async () => {
        await unlinkMaterializedSiteCookieJar('youtube');
        expect(unlink).toHaveBeenCalledWith(
            join('/mock/userdata', 'site-cookie-jars', 'youtube.cookies.txt')
        );
    });

    it('unlinkQuiet swallows unlink errors', async () => {
        unlink.mockRejectedValueOnce(new Error('gone'));
        await expect(unlinkQuiet('/nope')).resolves.toBeUndefined();
    });

    it('unlinkManagedCookieFilesFromArgv removes only managed cookie paths', async () => {
        expect(isManagedEphemeralCookieJarPath('/tmp/kajo-site-cookies-youtube-ab12.txt')).toBe(
            true
        );
        expect(isManagedEphemeralCookieJarPath('/tmp/other.txt')).toBe(false);
        expect(
            cookieFilePathsFromArgv(['--cookies', '   ', '--cookies', '/tmp/kajo-x.txt'])
        ).toEqual(['/tmp/kajo-x.txt']);
        await unlinkManagedCookieFilesFromArgv([
            '--cookies',
            '/tmp/kajo-site-cookies-x.txt',
            '--cookies',
            '/etc/passwd'
        ]);
        expect(unlink).toHaveBeenCalledWith('/tmp/kajo-site-cookies-x.txt');
        expect(unlink).not.toHaveBeenCalledWith('/etc/passwd');
    });

    it('captureAndPersistSessionCookies persists youtube sessions when heuristics pass', async () => {
        const session = {
            cookies: {
                get: vi
                    .fn()
                    .mockResolvedValue([
                        baseCookie({ name: 'LOGIN_INFO', value: 'tok', domain: '.youtube.com' })
                    ])
            }
        } as unknown as import('electron').Session;
        const r = await captureAndPersistSessionCookies(session, 'youtube', {
            allowedDomainSuffixes: ['youtube.com']
        });
        expect(r).toEqual({ ok: true, cookieCount: 1 });
        expect(session.cookies.get).toHaveBeenCalledWith({});
    });

    it('captureAndPersistSessionCookies returns site_auth_no_session when heuristics fail', async () => {
        const session = {
            cookies: {
                get: vi
                    .fn()
                    .mockResolvedValue([baseCookie({ name: 'CONSENT', domain: '.youtube.com' })])
            }
        } as unknown as import('electron').Session;
        const r = await captureAndPersistSessionCookies(session, 'youtube', {
            allowedDomainSuffixes: ['youtube.com']
        });
        expect(r).toEqual({ ok: false, error: 'site_auth_no_session' });
    });

    it('captureAndPersistSessionCookies caps huge exports and passes display hints', async () => {
        const session = {
            cookies: {
                get: vi
                    .fn()
                    .mockResolvedValue(
                        Array.from({ length: 2600 }, (_, i) =>
                            baseCookie({ name: `n${i}`, domain: '.example.com' })
                        )
                    )
            }
        } as unknown as import('electron').Session;
        const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
        const r = await captureAndPersistSessionCookies(session, 'rarehost', {
            displayHint: 'Title',
            allowedDomainSuffixes: []
        });
        expect(r.ok).toBe(true);
        expect(r).toMatchObject({ cookieCount: 2500 });
        expect(warn).toHaveBeenCalled();
        warn.mockRestore();
    });

    it('writeEphemeralMergedCookiesFile delegates to mergeNetscapeCookieFiles', async () => {
        readFile.mockResolvedValue('line\n');
        const p = await writeEphemeralMergedCookiesFile('/a.txt', '/b.txt');
        expect(p).toBeTruthy();
    });

    it('writeEphemeralMergedCookiesFile passes a single jar when the other side is null', async () => {
        await expect(writeEphemeralMergedCookiesFile(null, '/only-google.txt')).resolves.toBe(
            '/only-google.txt'
        );
        await expect(writeEphemeralMergedCookiesFile('/only-site.txt', null)).resolves.toBe(
            '/only-site.txt'
        );
    });

    it('writeEphemeralMergedCookiesFile returns null when both inputs are null', async () => {
        await expect(writeEphemeralMergedCookiesFile(null, null)).resolves.toBeNull();
    });

    it('randomTempCookiePath joins tmpdir with a random suffix', () => {
        const p = randomTempCookiePath('kajo-test');
        expect(p).toContain('kajo-test-');
        expect(p).toMatch(/\.txt$/);
    });

    it('uses safeStorage encryption when available', () => {
        encryptionOn.value = true;
        persistSiteCookieSnapshot('enc', [baseCookie()]);
        const encBlob = vaultDisk.blobs.enc;
        expect(encBlob).toBeTruthy();
        expect(String(encBlob).startsWith('ZW5j')).toBe(true);
        expect(getSignedSiteSummary('enc')).toBeTruthy();
    });

    it('cookie materialization uses netscape line formatting edge cases', async () => {
        persistSiteCookieSnapshot('youtube', [
            baseCookie({
                name: 'n',
                value: 'v',
                domain: 'youtube.com',
                path: '  ',
                secure: false,
                expirationDate: Number.NaN
            })
        ]);
        await materializeSiteCookiesForYtDlp('https://youtu.be/x');
        const body = String(writeFile.mock.calls.at(-1)?.[1]);
        expect(body).toContain('.youtube.com');
        expect(body).toContain('\tFALSE\t0\t');
    });

    it('cookie materialization covers netscape fallbacks for missing fields and secure cookies', async () => {
        persistSiteCookieSnapshot('example-com', [
            {
                domain: undefined,
                path: undefined,
                secure: true,
                expirationDate: 1700000000.7,
                name: undefined,
                value: undefined
            } as unknown as Cookie
        ]);
        await materializeSiteCookiesForYtDlp('https://example.com/v');
        const body = String(writeFile.mock.calls.at(-1)?.[1]);
        expect(body).toMatch(/\tTRUE\t1700000000\t\t/);
        expect(body).toContain('.\tTRUE\t/\tTRUE\t');
    });
});
