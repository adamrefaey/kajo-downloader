/** Pin userData before any module that may call `app.getPath('userData')`. */
import './lib/configureUserDataPaths';
import { dirname, join } from 'node:path';
import { is } from '@electron-toolkit/utils';
import { app } from 'electron';
import icon from '../resources/icon.png?asset';
import { IPC_MAIN_TO_RENDERER } from '../src/shared/ipcChannels';
import { registerMainProcessLifecycle } from './bootstrap';
import { registerDownloadHandlers } from './ipc/downloadHandlers/index';
import { registerExternalLinkHandlers } from './ipc/externalLinkHandlers';
import { registerRendererErrorHandlers } from './ipc/rendererErrorHandlers';
import { registerSettingsHandlers } from './ipc/settingsHandlers';
import { registerSiteAuthHandlers } from './ipc/siteAuthHandlers';
import type { SettingsDisk } from './ipc/types';
import { killAllTrackedMainChildren } from './lib/childProcessRegistry';
import { createKajoElectronStore } from './lib/kajoElectronStore';
import { validateSender } from './mainHelpers';
import { mainLog } from './mainLogger';
import { createMainSettingsApi } from './mainSettings';
import {
    checkSetupStatus,
    commandExists,
    prepareChannelOutputDirectoryForMain,
    preparePlaylistOutputDirectoryForMain
} from './mainSetup';
import { createWindowTrayManager } from './mainWindowTray';
import type { AutoUpdateMenuActions } from './services/autoUpdate';
import * as downloadCapabilitiesMod from './services/downloadCapabilities';

const mainHeavyMods = {
    caps: downloadCapabilitiesMod
};

function requireMainHeavyMods(): typeof mainHeavyMods {
    return mainHeavyMods;
}

const IS_MAC = process.platform === 'darwin';
const IS_WINDOWS = process.platform === 'win32';

/** Trusted file roots kept for legacy reference; production uses kajo-app: protocol instead of file://. */
const TRUSTED_RENDERER_FILE_ROOTS = [dirname(join(__dirname, '../renderer/index.html'))] as const;

/**
 * DevTools / View menu / Inspect: always in unpackaged/dev builds.
 * Packaged production builds require both KAJO_DEBUG_TOOLS=1 and KAJO_SUPPORT_BUILD=1
 * (support/debug channel only — env alone must not unlock DevTools on user installs).
 */
const ALLOW_ELECTRON_DEV_TOOLS =
    is.dev ||
    (!app.isPackaged && process.env.KAJO_DEBUG_TOOLS?.trim() === '1') ||
    (app.isPackaged &&
        process.env.KAJO_SUPPORT_BUILD?.trim() === '1' &&
        process.env.KAJO_DEBUG_TOOLS?.trim() === '1');

const defaultDiskSettings: SettingsDisk = {
    outputDir: app.getPath('downloads'),
    maxConcurrentDownloads: 1,
    preferredQuality: 1080,
    uiLocale: ''
};

const settingsStore = createKajoElectronStore<SettingsDisk>({
    name: 'settings',
    defaults: defaultDiskSettings
});

const autoUpdateMenuActions: AutoUpdateMenuActions = {
    checkForUpdates: () => {}
};

const windowTray = createWindowTrayManager({
    iconPath: String(icon),
    clipboardUrlChannel: IPC_MAIN_TO_RENDERER.appClipboardUrlDetected,
    allowElectronDevTools: ALLOW_ELECTRON_DEV_TOOLS,
    isMac: IS_MAC,
    isWindows: IS_WINDOWS,
    autoUpdateMenuActions
});

function getEffectiveMainLocaleTag(): string {
    const saved = settingsStore.get('uiLocale');
    if (typeof saved === 'string' && saved.trim()) {
        return saved.trim();
    }
    return app.getLocale();
}

function isValidIpcSender(
    event: Pick<Electron.IpcMainInvokeEvent, 'senderFrame' | 'sender'>
): boolean {
    return validateSender(event.senderFrame, is.dev, event.sender.getURL(), {
        trustedFileRoots: TRUSTED_RENDERER_FILE_ROOTS
    });
}

let metadataServicePromise: Promise<typeof import('./services/metadata')> | null = null;
function loadMetadataService(): Promise<typeof import('./services/metadata')> {
    if (!metadataServicePromise) {
        metadataServicePromise = import('./services/metadata');
    }
    return metadataServicePromise;
}

let ytdlpServicePromise: Promise<typeof import('./services/ytdlp')> | null = null;
function loadYtdlpService(): Promise<typeof import('./services/ytdlp')> {
    if (!ytdlpServicePromise) {
        ytdlpServicePromise = import('./services/ytdlp');
    }
    return ytdlpServicePromise;
}

async function registerIpcHandlers(): Promise<void> {
    const settings = createMainSettingsApi({
        settingsStore,
        defaultDiskSettings,
        getHeavyMods: requireMainHeavyMods
    });

    const getSiteCookiesFilePath = async (mediaUrl: string): Promise<string | null> => {
        const { materializeSiteCookiesForYtDlp } = await import('./services/siteAuthCookieStore');
        return materializeSiteCookiesForYtDlp(mediaUrl);
    };

    const cookieOptions = {
        getSiteCookiesFilePath
    };

    const resolveFetchMetadataOptions = async (): Promise<
        import('./services/metadata/types').FetchMetadataOptions
    > => cookieOptions;

    const deps: import('./ipc/types').IpcHandlerDeps = {
        getMainWindow: () => windowTray.getMainWindow(),
        settingsStore,
        isValidIpcSender,
        resolveFetchMetadataOptions,
        loadMetadataService,
        loadYtdlpService,
        getSettings: () => settings.getSettings(),
        applySettingsPatch: (patch) => settings.applySettingsPatch(patch),
        checkSetupStatus,
        preparePlaylistOutputDir: preparePlaylistOutputDirectoryForMain,
        prepareChannelOutputDir: prepareChannelOutputDirectoryForMain,
        resolveEffectiveOutputTemplate: (payload, advancedDefaults) =>
            settings.resolveEffectiveOutputTemplate(payload, advancedDefaults),
        commandExists,
        getEffectiveMainLocaleTag,
        rebuildApplicationMenu: () => windowTray.rebuildApplicationMenu()
    };

    registerRendererErrorHandlers(deps);
    registerExternalLinkHandlers(deps);
    registerDownloadHandlers(deps);
    registerSettingsHandlers(deps);
    registerSiteAuthHandlers(deps);
    const { registerLocalFilesHandlers } = await import('./ipc/localFilesHandlers');
    registerLocalFilesHandlers(deps);

    // In-app YouTube Search handler (yt-dlp ytsearchN:), lazily imported.
    const { registerSearchHandlers } = await import('./ipc/searchHandlers');
    registerSearchHandlers(deps);
}

function startSignedSiteSessionBackgroundRefresh(): void {
    void import('./services/siteAuthSessionRefresher').then((m) =>
        m.startSignedSiteSessionBackgroundRefresh()
    );
}

registerMainProcessLifecycle({
    getEffectiveMainLocaleTag,
    rebuildApplicationMenu: () => windowTray.rebuildApplicationMenu(),
    registerIpcHandlers,
    getMainWindow: () => windowTray.getMainWindow(),
    setMainWindow: (w) => {
        windowTray.setMainWindow(w);
    },
    createMainWindow: () => windowTray.createMainWindow(),
    setupTray: () => windowTray.setupTray(),
    startSignedSiteSessionBackgroundRefresh,
    autoUpdateMenuActions,
    showMainWindow: () => windowTray.showMainWindow(),
    getRendererDistDir: () => join(__dirname, '../renderer'),
    onBeforeQuit: async () => {
        windowTray.prepareForQuit();
        // Quit must PRESERVE in-flight downloads so they resume on next launch via yt-dlp's
        // default `--continue`. Mark the engine as shutting down BEFORE killing any yt-dlp process
        // trees so the terminal handlers keep .part/.ytdl/fragment files on disk instead of treating
        // the kill as a user cancellation (which deletes them). The kill still runs so no
        // yt-dlp/ffmpeg processes are orphaned.
        if (ytdlpServicePromise) {
            try {
                const m = await ytdlpServicePromise;
                m.markEngineShuttingDown();
                m.cancelAllDownloads();
            } catch (e: unknown) {
                mainLog.warn('download shutdown preservation failed during quit', {
                    error: String(e)
                });
            }
        }

        // Gracefully shut down the yt-dlp utility worker. It receives a `shutdown`
        // message, kills its tracked child processes (yt-dlp, ffmpeg) with
        // SIGTERM → SIGKILL, then exits.
        await Promise.allSettled([
            (async () => {
                if (!ytdlpServicePromise) return;
                try {
                    const m = await ytdlpServicePromise;
                    await m.teardownYtdlpWorker();
                } catch (e: unknown) {
                    mainLog.warn('yt-dlp worker teardown failed during quit', {
                        error: String(e)
                    });
                }
            })()
        ]);

        // Kill any remaining main-process-spawned children (yt-dlp metadata probes,
        // version probes, brew install, python env setup, binary probes, …). The
        // registry tracks everything registered via `trackMainChildProcess` and
        // escalates SIGTERM → SIGKILL.
        try {
            await killAllTrackedMainChildren({
                forceKillAfterMs: 1_200,
                totalTimeoutMs: 3_000
            });
        } catch (e: unknown) {
            mainLog.warn('killAllTrackedMainChildren failed during quit', { error: String(e) });
        }
    }
});
