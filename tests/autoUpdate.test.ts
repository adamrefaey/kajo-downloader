import type { BrowserWindow } from 'electron';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const flags = vi.hoisted(() => ({
    isPackaged: false,
    isDev: true
}));

const showMessageBox = vi.hoisted(() => vi.fn().mockResolvedValue({ response: 0 }));

vi.mock('@electron-toolkit/utils', () => ({
    is: {
        get dev() {
            return flags.isDev;
        }
    }
}));

vi.mock('electron', () => ({
    app: {
        name: 'TestApp',
        get isPackaged() {
            return flags.isPackaged;
        }
    },
    dialog: {
        showMessageBox: (...args: unknown[]) => showMessageBox(...args)
    },
    BrowserWindow: class {}
}));

const checkForUpdates = vi.hoisted(() => vi.fn());
const setFeedURL = vi.hoisted(() => vi.fn());
const on = vi.hoisted(() => vi.fn());
const quitAndInstall = vi.hoisted(() => vi.fn());
const autoDownloadEnabled = vi.hoisted(() => ({ value: true }));

vi.mock('../electron/i18n/mainI18n', () => ({
    translateUpdate: (key: string, options?: { version?: string; appName?: string }) => {
        if (key === 'availablePrefix' && options?.version) {
            return `Version ${options.version} is available.`;
        }
        if (key === 'readyTitle' && options?.appName) {
            return `Update ready — ${options.appName}`;
        }
        const literals: Record<string, string> = {
            devBuildMessage:
                'Automatic updates apply to the installed release. Development builds do not use the update channel.',
            disabledMessage: 'Update checks are disabled for this installation.',
            linuxPackageManagedMessage:
                'In-app updates are available for the AppImage build. Install updates for .deb/.rpm packages with your system package manager.',
            latestMessage: 'You are running the latest version.',
            availableTailAuto:
                ' It is downloading in the background; you will be prompted when it is ready to install.',
            availableTailManual:
                ' Enable automatic downloads or install the update using your release process.',
            checkFailedTitle: 'Update check failed',
            readyMessage:
                'A new version has been downloaded. Restart now to finish installing, or choose Later to install on quit.',
            restart: 'Restart',
            later: 'Later'
        };
        return literals[key] ?? key;
    }
}));

vi.mock('electron-updater', () => ({
    autoUpdater: {
        get autoDownload() {
            return autoDownloadEnabled.value;
        },
        set autoDownload(_v: boolean) {},
        get autoInstallOnAppQuit() {
            return true;
        },
        set autoInstallOnAppQuit(_v: boolean) {},
        setFeedURL: (...args: unknown[]) => setFeedURL(...args),
        on: (...args: unknown[]) => on(...args),
        checkForUpdates: (...args: unknown[]) => checkForUpdates(...args),
        quitAndInstall: (...args: unknown[]) => quitAndInstall(...args)
    }
}));

import {
    initAutoUpdate,
    isElectronUpdaterSupportedOnThisInstall,
    manualCheckForUpdates
} from '../electron/services/autoUpdate';

describe('manualCheckForUpdates', () => {
    beforeEach(() => {
        flags.isPackaged = false;
        flags.isDev = true;
        autoDownloadEnabled.value = true;
        showMessageBox.mockClear();
        checkForUpdates.mockReset();
        // electron-updater on Linux requires AppImage; keep CI (ubuntu) tests on the happy path.
        process.env.APPIMAGE = '/tmp/Kajo.AppImage';
    });

    afterEach(() => {
        flags.isPackaged = false;
        flags.isDev = true;
        delete process.env.KAJO_DISABLE_AUTO_UPDATE;
        delete process.env.APPIMAGE;
    });

    it('explains dev / unpackaged builds', async () => {
        await manualCheckForUpdates(() => null);
        expect(checkForUpdates).not.toHaveBeenCalled();
        expect(showMessageBox).toHaveBeenCalledWith(
            expect.objectContaining({
                type: 'info',
                message: expect.stringContaining('Development builds') as string
            })
        );
    });

    it('when disabled via env, does not call checkForUpdates', async () => {
        flags.isPackaged = true;
        flags.isDev = false;
        process.env.KAJO_DISABLE_AUTO_UPDATE = '1';
        await manualCheckForUpdates(() => null);
        expect(checkForUpdates).not.toHaveBeenCalled();
        expect(showMessageBox).toHaveBeenCalledWith(
            expect.objectContaining({
                message: expect.stringContaining('disabled') as string
            })
        );
    });

    it('explains package-manager updates for non-AppImage Linux installs', async () => {
        flags.isPackaged = true;
        flags.isDev = false;
        delete process.env.APPIMAGE;
        const platformDesc = Object.getOwnPropertyDescriptor(process, 'platform');
        Object.defineProperty(process, 'platform', { value: 'linux' });
        try {
            expect(isElectronUpdaterSupportedOnThisInstall()).toBe(false);
            await manualCheckForUpdates(() => null);
            expect(checkForUpdates).not.toHaveBeenCalled();
            expect(showMessageBox).toHaveBeenCalledWith(
                expect.objectContaining({
                    message: expect.stringContaining('AppImage') as string
                })
            );
        } finally {
            if (platformDesc) {
                Object.defineProperty(process, 'platform', platformDesc);
            }
        }
    });

    it('shows up-to-date when none available', async () => {
        flags.isPackaged = true;
        flags.isDev = false;
        checkForUpdates.mockResolvedValue({ isUpdateAvailable: false, updateInfo: {} });
        await manualCheckForUpdates(() => null);
        expect(checkForUpdates).toHaveBeenCalledOnce();
        expect(showMessageBox).toHaveBeenCalledWith(
            expect.objectContaining({
                message: expect.stringContaining('latest version') as string
            })
        );
    });

    it('shows error when checkForUpdates throws', async () => {
        flags.isPackaged = true;
        flags.isDev = false;
        checkForUpdates.mockRejectedValue(new Error('network'));
        await manualCheckForUpdates(() => null);
        expect(showMessageBox).toHaveBeenCalledWith(
            expect.objectContaining({
                type: 'error',
                title: 'Update check failed',
                message: 'network'
            })
        );
    });

    it('shows stringified message when checkForUpdates rejects a non-Error', async () => {
        flags.isPackaged = true;
        flags.isDev = false;
        checkForUpdates.mockRejectedValue('offline');
        await manualCheckForUpdates(() => null);
        expect(showMessageBox).toHaveBeenCalledWith(
            expect.objectContaining({
                type: 'error',
                message: 'offline'
            })
        );
    });

    it('passes parent window to dialog when available', async () => {
        flags.isPackaged = true;
        flags.isDev = false;
        const parent = { tag: 'bw' } as unknown as BrowserWindow;
        checkForUpdates.mockResolvedValue({ isUpdateAvailable: false, updateInfo: {} });
        await manualCheckForUpdates(() => parent);
        expect(showMessageBox).toHaveBeenCalledWith(
            parent,
            expect.objectContaining({ type: 'info' })
        );
    });

    it('announces available update with auto-download tail', async () => {
        flags.isPackaged = true;
        flags.isDev = false;
        autoDownloadEnabled.value = true;
        checkForUpdates.mockResolvedValue({
            isUpdateAvailable: true,
            updateInfo: { version: '9.9.9' }
        });
        await manualCheckForUpdates(() => null);
        expect(showMessageBox).toHaveBeenCalledWith(
            expect.objectContaining({
                message: expect.stringMatching(/9\.9\.9.*background/i) as string
            })
        );
    });

    it('announces available update with manual tail when autoDownload is off', async () => {
        flags.isPackaged = true;
        flags.isDev = false;
        autoDownloadEnabled.value = false;
        checkForUpdates.mockResolvedValue({
            isUpdateAvailable: true,
            updateInfo: { version: '1.0.1' }
        });
        await manualCheckForUpdates(() => null);
        expect(showMessageBox).toHaveBeenCalledWith(
            expect.objectContaining({
                message: expect.stringMatching(/1\.0\.1.*automatic downloads/i) as string
            })
        );
    });
});

describe('initAutoUpdate', () => {
    beforeEach(() => {
        flags.isPackaged = true;
        flags.isDev = false;
        autoDownloadEnabled.value = true;
        showMessageBox.mockClear();
        checkForUpdates.mockReset();
        checkForUpdates.mockResolvedValue({ isUpdateAvailable: false, updateInfo: {} });
        setFeedURL.mockClear();
        on.mockClear();
        quitAndInstall.mockClear();
        vi.useFakeTimers();
        process.env.APPIMAGE = '/tmp/Kajo.AppImage';
        delete process.env.KAJO_AUTO_UPDATE_FEED_URL;
        delete process.env.KAJO_DISABLE_AUTO_UPDATE;
    });

    afterEach(() => {
        flags.isPackaged = false;
        flags.isDev = true;
        vi.useRealTimers();
        delete process.env.APPIMAGE;
        delete process.env.KAJO_AUTO_UPDATE_FEED_URL;
        delete process.env.KAJO_DISABLE_AUTO_UPDATE;
    });

    it('registers menu handler and schedules checks when packaged', () => {
        const actions = { checkForUpdates: () => {} };
        initAutoUpdate(actions, () => null);
        expect(typeof actions.checkForUpdates).toBe('function');
        expect(on).toHaveBeenCalledWith('update-downloaded', expect.any(Function));
        expect(on).toHaveBeenCalledWith('error', expect.any(Function));
        expect(checkForUpdates).not.toHaveBeenCalled();
        vi.advanceTimersByTime(60_000);
        expect(checkForUpdates).toHaveBeenCalled();
    });

    it('sets generic feed URL from env when HTTPS', () => {
        process.env.KAJO_AUTO_UPDATE_FEED_URL = 'https://cdn.example/updates/';
        initAutoUpdate({ checkForUpdates: () => {} }, () => null);
        expect(setFeedURL).toHaveBeenCalledWith({
            provider: 'generic',
            url: 'https://cdn.example/updates/'
        });
    });

    it('quitAndInstall runs when user confirms restart after download', async () => {
        showMessageBox.mockResolvedValue({ response: 0 });
        initAutoUpdate({ checkForUpdates: () => {} }, () => null);
        const downloadedHandler = on.mock.calls.find((c) => c[0] === 'update-downloaded')?.[1] as
            | (() => void)
            | undefined;
        expect(typeof downloadedHandler).toBe('function');
        downloadedHandler?.();
        await vi.waitFor(() => expect(quitAndInstall).toHaveBeenCalledWith(false, true));
    });

    it('does not quit when user dismisses restart prompt', async () => {
        showMessageBox.mockResolvedValue({ response: 1 });
        initAutoUpdate({ checkForUpdates: () => {} }, () => null);
        const downloadedHandler = on.mock.calls.find((c) => c[0] === 'update-downloaded')?.[1] as
            | (() => void)
            | undefined;
        downloadedHandler?.();
        await vi.waitFor(() => expect(showMessageBox).toHaveBeenCalled());
        expect(quitAndInstall).not.toHaveBeenCalled();
    });

    it('logs autoUpdater errors', () => {
        const err = vi.spyOn(console, 'error').mockImplementation(() => {});
        initAutoUpdate({ checkForUpdates: () => {} }, () => null);
        const errorHandler = on.mock.calls.find((c) => c[0] === 'error')?.[1] as
            | ((e: Error) => void)
            | undefined;
        errorHandler?.(new Error('updater'));
        expect(err).toHaveBeenCalled();
        err.mockRestore();
    });

    it('logs when initial scheduled checkForUpdates rejects', async () => {
        const err = vi.spyOn(console, 'error').mockImplementation(() => {});
        checkForUpdates.mockRejectedValueOnce(new Error('sched'));
        initAutoUpdate({ checkForUpdates: () => {} }, () => null);
        vi.advanceTimersByTime(60_000);
        await vi.waitFor(() => expect(err).toHaveBeenCalled());
        err.mockRestore();
    });

    it('runs periodic update checks on interval', () => {
        initAutoUpdate({ checkForUpdates: () => {} }, () => null);
        vi.advanceTimersByTime(60_000);
        checkForUpdates.mockClear();
        // initAutoUpdate schedules the next check with ±15% jitter on the 4h interval.
        vi.advanceTimersByTime(Math.ceil(4 * 60 * 60 * 1000 * 1.15));
        expect(checkForUpdates).toHaveBeenCalled();
    });

    it('logs when periodic checkForUpdates rejects', async () => {
        const err = vi.spyOn(console, 'error').mockImplementation(() => {});
        let calls = 0;
        checkForUpdates.mockImplementation(() => {
            calls += 1;
            if (calls >= 2) {
                return Promise.reject(new Error('interval'));
            }
            return Promise.resolve({ isUpdateAvailable: false, updateInfo: {} });
        });
        initAutoUpdate({ checkForUpdates: () => {} }, () => null);
        vi.advanceTimersByTime(60_000);
        vi.advanceTimersByTime(Math.ceil(4 * 60 * 60 * 1000 * 1.15));
        await vi.waitFor(() => expect(err).toHaveBeenCalled());
        err.mockRestore();
    });

    it('wires manual check for unpackaged builds without scheduling listeners', () => {
        flags.isPackaged = false;
        flags.isDev = true;
        on.mockClear();
        const actions = { checkForUpdates: () => {} };
        initAutoUpdate(actions, () => null);
        expect(on).not.toHaveBeenCalled();
        expect(typeof actions.checkForUpdates).toBe('function');
    });

    it('invokes manual check from menu when unpackaged', async () => {
        flags.isPackaged = false;
        flags.isDev = true;
        showMessageBox.mockClear();
        const actions = { checkForUpdates: () => {} };
        initAutoUpdate(actions, () => null);
        await actions.checkForUpdates();
        expect(showMessageBox).toHaveBeenCalled();
    });

    it('does not register listeners when packaged but auto update is disabled', () => {
        flags.isPackaged = true;
        flags.isDev = false;
        process.env.KAJO_DISABLE_AUTO_UPDATE = '1';
        on.mockClear();
        initAutoUpdate({ checkForUpdates: () => {} }, () => null);
        expect(on).not.toHaveBeenCalled();
    });
});
