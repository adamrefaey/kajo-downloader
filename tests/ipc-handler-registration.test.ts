/**
 * IPC handler registration integration test.
 *
 * Verifies that every channel declared in IPC_INVOKE has a corresponding
 * ipcMain.handle() registration in the main process handler files. This is
 * the counterpart to ipcPreloadParity.test.ts (which checks that the preload
 * references every channel) — together they provide bidirectional coverage of
 * the IPC contract.
 */
import { beforeAll, describe, expect, it, vi } from 'vitest';

const ipcHandleSpy = vi.hoisted(() => vi.fn());

vi.mock('electron', () => ({
    ipcMain: { handle: ipcHandleSpy },
    app: {
        getPath: vi.fn(() => '/tmp'),
        isPackaged: false,
        getAppPath: vi.fn(() => '/'),
        getLocale: vi.fn(() => 'en-US'),
        on: vi.fn(),
        isReady: vi.fn(() => true)
    },
    BrowserWindow: class MockBrowserWindow {
        static fromWebContents = vi.fn().mockReturnValue(null);
        isDestroyed = vi.fn().mockReturnValue(false);
    },
    dialog: { showOpenDialog: vi.fn() },
    shell: { openExternal: vi.fn(), openPath: vi.fn(), showItemInFolder: vi.fn() },
    Notification: class MockNotification {
        static isSupported = vi.fn().mockReturnValue(false);
        show = vi.fn();
    },
    safeStorage: {
        isEncryptionAvailable: vi.fn().mockReturnValue(false),
        encryptString: vi.fn().mockReturnValue(Buffer.from('')),
        decryptString: vi.fn().mockReturnValue('')
    },
    nativeImage: { createFromPath: vi.fn() }
}));

vi.mock('electron-store', () => ({
    default: class MockElectronStore {
        get = vi.fn();
        set = vi.fn();
        store = {};
    }
}));

vi.mock('../electron/i18n/mainI18n', () => ({
    translateMainError: (key: string) => key,
    initMainI18n: vi.fn()
}));

import { registerDownloadHandlers } from '../electron/ipc/downloadHandlers';
import { registerExternalLinkHandlers } from '../electron/ipc/externalLinkHandlers';
import { registerLocalFilesHandlers } from '../electron/ipc/localFilesHandlers';
import { registerRendererErrorHandlers } from '../electron/ipc/rendererErrorHandlers';
import { registerSearchHandlers } from '../electron/ipc/searchHandlers';
import { registerSettingsHandlers } from '../electron/ipc/settingsHandlers';
import { registerSiteAuthHandlers } from '../electron/ipc/siteAuthHandlers';
import type { IpcHandlerDeps } from '../electron/ipc/types';
import { IPC_INVOKE } from '../src/shared/ipcChannels';

const mockDeps = {
    getMainWindow: vi.fn(() => null),
    settingsStore: { get: vi.fn(), set: vi.fn(), store: {} },
    isValidIpcSender: vi.fn(() => true),
    resolveFetchMetadataOptions: vi.fn(async () => ({})),
    loadMetadataService: vi.fn(async () => ({})),
    loadYtdlpService: vi.fn(async () => ({})),
    getSettings: vi.fn(() => ({})),
    applySettingsPatch: vi.fn(() => ({})),
    checkSetupStatus: vi.fn(async () => ({ ytdlpReady: true, ytdlpVersion: null })),
    preparePlaylistOutputDir: vi.fn(async () => '/tmp/out'),
    resolveEffectiveOutputTemplate: vi.fn(() => '%(title)s.%(ext)s'),
    commandExists: vi.fn(async () => false),
    getEffectiveMainLocaleTag: vi.fn(() => 'en'),
    rebuildApplicationMenu: vi.fn()
} as unknown as IpcHandlerDeps;

let registeredChannels: string[];

beforeAll(() => {
    ipcHandleSpy.mockClear();
    registerRendererErrorHandlers(mockDeps);
    registerExternalLinkHandlers(mockDeps);
    registerDownloadHandlers(mockDeps);
    registerSettingsHandlers(mockDeps);
    registerSiteAuthHandlers(mockDeps);
    registerLocalFilesHandlers(mockDeps);
    registerSearchHandlers(mockDeps);
    registeredChannels = ipcHandleSpy.mock.calls.map((args) => args[0] as string);
});

describe('IPC handler registration', () => {
    it('every registered handler corresponds to a declared IPC_INVOKE channel', () => {
        const declared = new Set<string>(Object.values(IPC_INVOKE));
        for (const channel of registeredChannels) {
            expect(
                declared.has(channel),
                `ipcMain.handle registered an unknown channel "${channel}" that is not in IPC_INVOKE`
            ).toBe(true);
        }
    });

    it('registers a handler for every IPC_INVOKE channel', () => {
        const registered = new Set<string>(registeredChannels);
        for (const channel of Object.values(IPC_INVOKE)) {
            expect(
                registered.has(channel),
                `IPC_INVOKE channel "${channel}" has no ipcMain.handle registration`
            ).toBe(true);
        }
    });

    it('total registered channel count matches IPC_INVOKE count', () => {
        expect(new Set(registeredChannels).size).toBe(Object.values(IPC_INVOKE).length);
    });

    it('registers no duplicate channels', () => {
        const seen = new Set<string>();
        const duplicates: string[] = [];
        for (const ch of registeredChannels) {
            if (seen.has(ch)) duplicates.push(ch);
            else seen.add(ch);
        }
        expect(duplicates).toEqual([]);
    });

    it('registers the external-link channel', () => {
        expect(registeredChannels).toContain(IPC_INVOKE.authOpenExternal);
    });

    it('registers all settings channels', () => {
        expect(registeredChannels).toContain(IPC_INVOKE.settingsGet);
        expect(registeredChannels).toContain(IPC_INVOKE.settingsSet);
        expect(registeredChannels).toContain(IPC_INVOKE.settingsGetSystemLocale);
        expect(registeredChannels).toContain(IPC_INVOKE.settingsProxySetProfileUrl);
        expect(registeredChannels).toContain(IPC_INVOKE.setupCheck);
        expect(registeredChannels).toContain(IPC_INVOKE.setupInstallYtdlp);
    });

    it('registers all download channels', () => {
        expect(registeredChannels).toContain(IPC_INVOKE.downloadFetchVideoInfo);
        expect(registeredChannels).toContain(IPC_INVOKE.downloadFetchPlaylistInfo);
        expect(registeredChannels).toContain(IPC_INVOKE.downloadStart);
        expect(registeredChannels).toContain(IPC_INVOKE.downloadCancel);
        expect(registeredChannels).toContain(IPC_INVOKE.downloadHistoryList);
        expect(registeredChannels).toContain(IPC_INVOKE.downloadHistoryClear);
        expect(registeredChannels).toContain(IPC_INVOKE.downloadHistoryTotal);
    });

    it('registers all site-auth channels', () => {
        expect(registeredChannels).toContain(IPC_INVOKE.siteAuthOpen);
        expect(registeredChannels).toContain(IPC_INVOKE.siteAuthClose);
        expect(registeredChannels).toContain(IPC_INVOKE.siteAuthSave);
        expect(registeredChannels).toContain(IPC_INVOKE.siteAuthListSignedSites);
        expect(registeredChannels).toContain(IPC_INVOKE.siteAuthValidateSignedSite);
        expect(registeredChannels).toContain(IPC_INVOKE.siteAuthClearSignedSite);
    });

    it('registers the in-app Search channels', () => {
        expect(registeredChannels).toContain(IPC_INVOKE.youtubeSearch);
        expect(registeredChannels).toContain(IPC_INVOKE.searchGetUsage);
    });

    it('registers the local-files open-path channel', () => {
        expect(registeredChannels).toContain(IPC_INVOKE.localFilesOpenPath);
    });

    it('registers the local-files reveal-path channel', () => {
        expect(registeredChannels).toContain(IPC_INVOKE.localFilesRevealPath);
    });
});
