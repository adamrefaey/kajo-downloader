import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { IPC_MAIN_TO_RENDERER } from '../src/shared/ipcChannels';
import * as siteAuthRefreshUrls from '../src/shared/siteAuthRefreshUrls';

const safeSend = vi.hoisted(() => vi.fn());
const getActiveSiteAuthSiteKey = vi.hoisted(() => vi.fn(() => null as string | null));
const listSignedSiteStorageKeys = vi.hoisted(() => vi.fn(() => [] as string[]));
const getSignedSiteSummary = vi.hoisted(() => vi.fn());
const captureAndPersistSessionCookies = vi.hoisted(() => vi.fn());

type MockWindow = {
    webContents: {
        once: ReturnType<typeof vi.fn>;
        on: ReturnType<typeof vi.fn>;
        setWindowOpenHandler: ReturnType<typeof vi.fn>;
        session: Record<string, unknown>;
    };
    loadURL: ReturnType<typeof vi.fn>;
    destroy: ReturnType<typeof vi.fn>;
    isDestroyed: ReturnType<typeof vi.fn>;
};

function mockWebContents(): MockWindow['webContents'] {
    return {
        once: vi.fn(),
        on: vi.fn(),
        setWindowOpenHandler: vi.fn(),
        session: {
            cookies: {},
            setPermissionRequestHandler: vi.fn(),
            setPermissionCheckHandler: vi.fn(),
            setDevicePermissionHandler: vi.fn()
        }
    };
}

const ctx = vi.hoisted(() => {
    const windowsList: MockWindow[] = [];
    const getAllWindows = vi.fn(() => [] as unknown as Electron.BrowserWindow[]);
    const BrowserWindow = vi.fn(function MockBrowserWindow() {
        let finishCb: (() => void) | undefined;
        let destroyed = false;
        const webContents = mockWebContents();
        webContents.once.mockImplementation((event: string, fn: () => void) => {
            if (event === 'did-finish-load') {
                finishCb = fn;
            }
        });
        const win: MockWindow = {
            webContents,
            loadURL: vi.fn((url: string) => {
                void url;
                queueMicrotask(() => {
                    finishCb?.();
                });
                return Promise.resolve();
            }),
            destroy: vi.fn(() => {
                destroyed = true;
            }),
            isDestroyed: vi.fn(() => destroyed)
        };
        windowsList.push(win);
        return win;
    });
    Object.assign(BrowserWindow, { getAllWindows });
    return { windowsList, getAllWindows, BrowserWindow };
});

vi.mock('../electron/mainHelpers', () => ({
    safeSend: (...args: unknown[]) => safeSend(...args)
}));

vi.mock('../electron/services/siteAuthBrowserController', () => ({
    getActiveSiteAuthSiteKey: () => getActiveSiteAuthSiteKey(),
    siteAuthPersistPartition: (k: string) => `persist:kajo-siteauth-${k}`
}));

vi.mock('../electron/services/siteAuthCookieStore', () => ({
    listSignedSiteStorageKeys: () => listSignedSiteStorageKeys(),
    getSignedSiteSummary: (k: string) => getSignedSiteSummary(k),
    captureAndPersistSessionCookies: (...args: unknown[]) =>
        captureAndPersistSessionCookies(...args)
}));

vi.mock('electron', () => ({
    BrowserWindow: ctx.BrowserWindow
}));

import { BrowserWindow } from 'electron';
import {
    runSignedSiteSessionRefreshCycle,
    startSignedSiteSessionBackgroundRefresh
} from '../electron/services/siteAuthSessionRefresher';

describe('siteAuthSessionRefresher', () => {
    beforeEach(() => {
        vi.useFakeTimers({ shouldAdvanceTime: true });
        ctx.windowsList.length = 0;
        safeSend.mockReset();
        getActiveSiteAuthSiteKey.mockReset();
        getActiveSiteAuthSiteKey.mockReturnValue(null);
        listSignedSiteStorageKeys.mockReset();
        getSignedSiteSummary.mockReset();
        captureAndPersistSessionCookies.mockReset();
        ctx.getAllWindows.mockReset();
        ctx.getAllWindows.mockReturnValue([]);
        vi.mocked(BrowserWindow).mockClear();
        Object.assign(BrowserWindow, { getAllWindows: ctx.getAllWindows });
    });

    afterEach(() => {
        vi.useRealTimers();
    });

    it('skips when seed URL cannot be resolved', async () => {
        vi.spyOn(siteAuthRefreshUrls, 'resolveSiteSessionRefreshSeedUrl').mockReturnValueOnce(null);
        listSignedSiteStorageKeys.mockReturnValue(['unknown-slug']);
        getSignedSiteSummary.mockReturnValue(null);
        await runSignedSiteSessionRefreshCycle();
        expect(BrowserWindow).not.toHaveBeenCalled();
    });

    it('skips when embedded auth is open for the same site', async () => {
        listSignedSiteStorageKeys.mockReturnValue(['youtube']);
        getSignedSiteSummary.mockReturnValue({
            siteKey: 'youtube',
            siteId: 'youtube',
            displayName: 'YouTube',
            domainLabel: 'youtube.com',
            signedInAs: null,
            lastSavedAt: 1,
            cookieCount: 1,
            expiresAt: null,
            cookieHealth: 'healthy'
        });
        getActiveSiteAuthSiteKey.mockReturnValue('youtube');
        await runSignedSiteSessionRefreshCycle();
        expect(BrowserWindow).not.toHaveBeenCalled();
    });

    it('returns early from URL parse failure (defensive)', async () => {
        vi.spyOn(siteAuthRefreshUrls, 'resolveSiteSessionRefreshSeedUrl').mockReturnValueOnce(
            'http://['
        );
        listSignedSiteStorageKeys.mockReturnValue(['youtube']);
        getSignedSiteSummary.mockReturnValue({
            siteKey: 'youtube',
            siteId: 'youtube',
            displayName: 'YouTube',
            domainLabel: 'youtube.com',
            signedInAs: null,
            lastSavedAt: 1,
            cookieCount: 1,
            expiresAt: null,
            cookieHealth: 'healthy'
        });
        await runSignedSiteSessionRefreshCycle();
        expect(BrowserWindow).not.toHaveBeenCalled();
    });

    it('loads, settles, captures, broadcasts success, and destroys window', async () => {
        listSignedSiteStorageKeys.mockReturnValue(['youtube']);
        getSignedSiteSummary.mockReturnValue({
            siteKey: 'youtube',
            siteId: 'youtube',
            displayName: 'YouTube',
            domainLabel: 'youtube.com',
            signedInAs: '  hint  ',
            lastSavedAt: 1,
            cookieCount: 2,
            expiresAt: null,
            cookieHealth: 'healthy'
        });
        captureAndPersistSessionCookies.mockResolvedValue({ ok: true, cookieCount: 9 });

        const fakeWc = { id: 'wc1' };
        ctx.getAllWindows.mockReturnValue([
            { isDestroyed: () => true, webContents: fakeWc } as unknown as Electron.BrowserWindow,
            { isDestroyed: () => false, webContents: fakeWc } as unknown as Electron.BrowserWindow
        ]);

        const p = runSignedSiteSessionRefreshCycle();
        await vi.runAllTimersAsync();
        await p;

        expect(captureAndPersistSessionCookies).toHaveBeenCalledWith(
            expect.objectContaining({ cookies: {} }),
            'youtube',
            expect.objectContaining({
                displayHint: 'hint',
                allowedDomainSuffixes: expect.any(Array)
            })
        );
        expect(safeSend).toHaveBeenCalledWith(
            fakeWc,
            IPC_MAIN_TO_RENDERER.siteAuthCookieRefresh,
            expect.objectContaining({
                siteKey: 'youtube',
                outcome: 'success',
                cookieCount: 9
            })
        );
        expect(ctx.windowsList[0]?.destroy).toHaveBeenCalled();
    });

    it('destroys window and returns when loadURL rejects', async () => {
        listSignedSiteStorageKeys.mockReturnValue(['youtube']);
        getSignedSiteSummary.mockReturnValue({
            siteKey: 'youtube',
            siteId: 'youtube',
            displayName: 'YouTube',
            domainLabel: 'youtube.com',
            signedInAs: null,
            lastSavedAt: 1,
            cookieCount: 1,
            expiresAt: null,
            cookieHealth: 'healthy'
        });
        vi.mocked(BrowserWindow).mockImplementationOnce(function createFailingWindow() {
            let destroyed = false;
            const win: MockWindow = {
                webContents: mockWebContents(),
                loadURL: vi.fn(() => Promise.reject('boom')),
                destroy: vi.fn(() => {
                    destroyed = true;
                }),
                isDestroyed: vi.fn(() => destroyed)
            };
            ctx.windowsList.push(win);
            return win as unknown as Electron.BrowserWindow;
        });

        const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
        await runSignedSiteSessionRefreshCycle();
        expect(warn).toHaveBeenCalled();
        warn.mockRestore();
        expect(ctx.windowsList[0]?.destroy).toHaveBeenCalled();
        expect(captureAndPersistSessionCookies).not.toHaveBeenCalled();
    });

    it('loadURL rejection passes through Error instances', async () => {
        listSignedSiteStorageKeys.mockReturnValue(['youtube']);
        getSignedSiteSummary.mockReturnValue({
            siteKey: 'youtube',
            siteId: 'youtube',
            displayName: 'YouTube',
            domainLabel: 'youtube.com',
            signedInAs: null,
            lastSavedAt: 1,
            cookieCount: 1,
            expiresAt: null,
            cookieHealth: 'healthy'
        });
        vi.mocked(BrowserWindow).mockImplementationOnce(function createWindowRejectError() {
            let destroyed = false;
            const win: MockWindow = {
                webContents: mockWebContents(),
                loadURL: vi.fn(() => Promise.reject(new Error('net'))),
                destroy: vi.fn(() => {
                    destroyed = true;
                }),
                isDestroyed: vi.fn(() => destroyed)
            };
            ctx.windowsList.push(win);
            return win as unknown as Electron.BrowserWindow;
        });

        const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
        await runSignedSiteSessionRefreshCycle();
        warn.mockRestore();
        expect(captureAndPersistSessionCookies).not.toHaveBeenCalled();
    });

    it('load failure does not call destroy when window already destroyed', async () => {
        listSignedSiteStorageKeys.mockReturnValue(['youtube']);
        getSignedSiteSummary.mockReturnValue({
            siteKey: 'youtube',
            siteId: 'youtube',
            displayName: 'YouTube',
            domainLabel: 'youtube.com',
            signedInAs: null,
            lastSavedAt: 1,
            cookieCount: 1,
            expiresAt: null,
            cookieHealth: 'healthy'
        });
        vi.mocked(BrowserWindow).mockImplementationOnce(function createDeadWindow() {
            const win: MockWindow = {
                webContents: mockWebContents(),
                loadURL: vi.fn(() => Promise.reject('x')),
                destroy: vi.fn(),
                isDestroyed: vi.fn(() => true)
            };
            ctx.windowsList.push(win);
            return win as unknown as Electron.BrowserWindow;
        });

        const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
        await runSignedSiteSessionRefreshCycle();
        warn.mockRestore();
        expect(ctx.windowsList[0]?.destroy).not.toHaveBeenCalled();
    });

    it('times out load, destroys window, and skips capture', async () => {
        listSignedSiteStorageKeys.mockReturnValue(['youtube']);
        getSignedSiteSummary.mockReturnValue({
            siteKey: 'youtube',
            siteId: 'youtube',
            displayName: 'YouTube',
            domainLabel: 'youtube.com',
            signedInAs: null,
            lastSavedAt: 1,
            cookieCount: 1,
            expiresAt: null,
            cookieHealth: 'healthy'
        });
        vi.mocked(BrowserWindow).mockImplementationOnce(function createTimeoutWindow() {
            let destroyed = false;
            const win: MockWindow = {
                webContents: mockWebContents(),
                loadURL: vi.fn(() => Promise.resolve()),
                destroy: vi.fn(() => {
                    destroyed = true;
                }),
                isDestroyed: vi.fn(() => destroyed)
            };
            ctx.windowsList.push(win);
            return win as unknown as Electron.BrowserWindow;
        });

        const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
        const p = runSignedSiteSessionRefreshCycle();
        await vi.advanceTimersByTimeAsync(46_000);
        await p;
        warn.mockRestore();
        expect(captureAndPersistSessionCookies).not.toHaveBeenCalled();
        expect(ctx.windowsList[0]?.destroy).toHaveBeenCalled();
    });

    it('does not broadcast when capture reports no session', async () => {
        listSignedSiteStorageKeys.mockReturnValue(['youtube']);
        getSignedSiteSummary.mockReturnValue({
            siteKey: 'youtube',
            siteId: 'youtube',
            displayName: 'YouTube',
            domainLabel: 'youtube.com',
            signedInAs: null,
            lastSavedAt: 1,
            cookieCount: 1,
            expiresAt: null,
            cookieHealth: 'healthy'
        });
        captureAndPersistSessionCookies.mockResolvedValue({
            ok: false,
            error: 'site_auth_no_session'
        });
        ctx.getAllWindows.mockReturnValue([]);

        const p = runSignedSiteSessionRefreshCycle();
        await vi.runAllTimersAsync();
        await p;

        expect(safeSend).not.toHaveBeenCalled();
    });

    it('warns when capture throws but still destroys window', async () => {
        listSignedSiteStorageKeys.mockReturnValue(['youtube']);
        getSignedSiteSummary.mockReturnValue({
            siteKey: 'youtube',
            siteId: 'youtube',
            displayName: 'YouTube',
            domainLabel: 'youtube.com',
            signedInAs: null,
            lastSavedAt: 1,
            cookieCount: 1,
            expiresAt: null,
            cookieHealth: 'healthy'
        });
        captureAndPersistSessionCookies.mockRejectedValue(new Error('vault'));
        ctx.getAllWindows.mockReturnValue([]);

        const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
        const p = runSignedSiteSessionRefreshCycle();
        await vi.runAllTimersAsync();
        await p;
        warn.mockRestore();

        expect(ctx.windowsList[0]?.destroy).toHaveBeenCalled();
    });

    it('skips destroy in finally when window was already destroyed during capture', async () => {
        listSignedSiteStorageKeys.mockReturnValue(['youtube']);
        getSignedSiteSummary.mockReturnValue({
            siteKey: 'youtube',
            siteId: 'youtube',
            displayName: 'YouTube',
            domainLabel: 'youtube.com',
            signedInAs: null,
            lastSavedAt: 1,
            cookieCount: 1,
            expiresAt: null,
            cookieHealth: 'healthy'
        });
        captureAndPersistSessionCookies.mockImplementation(async () => {
            const w = ctx.windowsList[0];
            if (w) {
                (w.destroy as () => void)();
            }
            return { ok: true, cookieCount: 1 };
        });
        ctx.getAllWindows.mockReturnValue([]);

        const p = runSignedSiteSessionRefreshCycle();
        await vi.runAllTimersAsync();
        await p;

        expect(ctx.windowsList[0]?.destroy).toHaveBeenCalledTimes(1);
    });

    it('skips second concurrent refresh cycle', async () => {
        listSignedSiteStorageKeys.mockReturnValue(['youtube']);
        getSignedSiteSummary.mockReturnValue({
            siteKey: 'youtube',
            siteId: 'youtube',
            displayName: 'YouTube',
            domainLabel: 'youtube.com',
            signedInAs: null,
            lastSavedAt: 1,
            cookieCount: 1,
            expiresAt: null,
            cookieHealth: 'healthy'
        });
        let release!: () => void;
        const gate = new Promise<void>((r) => {
            release = r;
        });
        captureAndPersistSessionCookies.mockReturnValue(
            gate.then(() => ({ ok: true as const, cookieCount: 1 }))
        );
        ctx.getAllWindows.mockReturnValue([]);

        const first = runSignedSiteSessionRefreshCycle();
        await vi.runAllTimersAsync();
        const second = runSignedSiteSessionRefreshCycle();
        await expect(second).resolves.toBeUndefined();
        release();
        await first;
    });

    it('startSignedSiteSessionBackgroundRefresh schedules first tick after 60s; tick logs on rejection', async () => {
        vi.useRealTimers();
        const setT = vi.spyOn(global, 'setTimeout');
        const err = vi.spyOn(console, 'error').mockImplementation(() => {});

        listSignedSiteStorageKeys.mockImplementation(() => {
            throw new Error('disk');
        });

        startSignedSiteSessionBackgroundRefresh();

        expect(setT).toHaveBeenCalledWith(expect.any(Function), 60_000);

        const firstCallArgs = setT.mock.calls[0];
        const firstTick = firstCallArgs?.[0] as (() => void) | undefined;
        if (!firstTick) throw new Error('setInterval was not called');
        firstTick();
        await new Promise<void>((r) => {
            setImmediate(r);
        });

        expect(err).toHaveBeenCalledWith(
            expect.stringContaining('[kajo] signed site session refresh cycle')
        );

        setT.mockRestore();
        err.mockRestore();
    });

    it('periodic background refresh logs when refresh cycle rejects', async () => {
        let cycle = 0;
        listSignedSiteStorageKeys.mockImplementation(() => {
            cycle += 1;
            if (cycle === 1) return [];
            if (cycle === 2) throw new Error('disk');
            return [];
        });

        const err = vi.spyOn(console, 'error').mockImplementation(() => {});

        startSignedSiteSessionBackgroundRefresh();
        await vi.advanceTimersByTimeAsync(60_000);
        await vi.advanceTimersByTimeAsync(Math.ceil(5 * 60 * 1000 * 1.15));

        expect(err).toHaveBeenCalledWith(
            expect.stringContaining('[kajo] signed site session refresh cycle')
        );

        err.mockRestore();
    });
});
