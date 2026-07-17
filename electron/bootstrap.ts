import { electronApp } from '@electron-toolkit/utils';
import { app, type BrowserWindow, crashReporter, session } from 'electron';
import { handleKajoAppProtocol, registerKajoAppScheme } from './customProtocol';
import { initMainI18n } from './i18n/mainI18n';
import { KAJO_APP_ID, KAJO_PRODUCT_DISPLAY_NAME } from './lib/appIdentity';
import { captureMainException } from './lib/errorTelemetry';
import { initSafeStorageAsync } from './lib/safeStorageHelpers';
import { mainLog } from './mainLogger';
import { type AutoUpdateMenuActions, initAutoUpdate } from './services/autoUpdate';

// Register the kajo-app: scheme as privileged BEFORE app.whenReady() — Chromium requires
// this at process startup before any window is created.
registerKajoAppScheme();

/**
 * Main-process `app.whenReady()` sequence and global `app` event wiring (Phase A4).
 * Window/tray/IPC implementations stay in `main.ts` and are injected here.
 */
export type MainLifecycleApi = {
    getEffectiveMainLocaleTag: () => string;
    rebuildApplicationMenu: () => void;
    registerIpcHandlers: () => void | Promise<void>;
    getMainWindow: () => BrowserWindow | null;
    setMainWindow: (w: BrowserWindow | null) => void;
    createMainWindow: () => BrowserWindow;
    setupTray: () => void;
    startSignedSiteSessionBackgroundRefresh: () => void;
    autoUpdateMenuActions: AutoUpdateMenuActions;
    showMainWindow: () => void;
    onBeforeQuit: () => void | Promise<void>;
    /** Absolute path to the packaged renderer dist directory (contains index.html). */
    getRendererDistDir: () => string;
};

export function registerMainProcessLifecycle(api: MainLifecycleApi): void {
    // Configure crash reporter as early as possible.
    // Crash dumps are written to the OS crash dump directory by default.
    // Set KAJO_CRASH_REPORTER_URL (HTTPS) to a Sentry DSN or custom ingest endpoint
    // to enable remote crash collection; leave unset for local-only dump collection.
    crashReporter.start({
        productName: KAJO_PRODUCT_DISPLAY_NAME,
        companyName: 'Kajo',
        submitURL: process.env.KAJO_CRASH_REPORTER_URL?.trim() ?? '',
        uploadToServer: Boolean(process.env.KAJO_CRASH_REPORTER_URL?.trim()),
        rateLimit: true
    });

    let isQuitting = false;

    process.on('uncaughtException', (error) => {
        mainLog.error('[main:uncaughtException]', { detail: String(error) });
        captureMainException(error, { source: 'uncaughtException' });
    });
    process.on('unhandledRejection', (reason) => {
        mainLog.error('[main:unhandledRejection]', { detail: String(reason) });
        captureMainException(reason, { source: 'unhandledRejection' });
    });

    app.whenReady().then(async () => {
        electronApp.setAppUserModelId(KAJO_APP_ID);

        // Lock down the default session. Deny every permission *request* (camera, mic,
        // geolocation, notifications, etc.) AND every synchronous permission *check*
        // (navigator.permissions.query, getUserMedia preflight) — checks bypass the request
        // handler (Electron security checklist #16/#17). Device selection (WebUSB/Serial/HID) is
        // denied too. getDisplayMedia / screen capture is denied by default because no
        // setDisplayMediaRequestHandler is registered. The embedded site sign-in session sets its
        // own handlers in siteAuthBrowserController.ts.
        session.defaultSession.setPermissionRequestHandler((_wc, _permission, callback) => {
            callback(false);
        });
        session.defaultSession.setPermissionCheckHandler(() => false);
        session.defaultSession.setDevicePermissionHandler(() => false);

        await initMainI18n(api.getEffectiveMainLocaleTag());
        api.rebuildApplicationMenu();

        // Pre-warm the PBKDF2 fallback key asynchronously so encryptField/decryptField
        // never block the main thread on first use.
        await initSafeStorageAsync();

        // Mount the custom protocol handler for production renderer loading.
        handleKajoAppProtocol(api.getRendererDistDir());

        await api.registerIpcHandlers();

        api.setMainWindow(api.createMainWindow());
        const mainWindow = api.getMainWindow();
        if (!mainWindow || mainWindow.isDestroyed()) {
            return;
        }

        api.setupTray();
        api.startSignedSiteSessionBackgroundRefresh();

        initAutoUpdate(api.autoUpdateMenuActions, () => api.getMainWindow());

        app.on('activate', () => {
            if (!isQuitting) {
                api.showMainWindow();
            }
        });
    });

    let quitFinalized = false;
    app.on('before-quit', (event) => {
        // Ensure we get one chance to tear down child processes before Electron exits.
        if (quitFinalized) {
            return;
        }
        quitFinalized = true;
        event.preventDefault();

        isQuitting = true;

        const FORCE_EXIT_AFTER_MS = 8_000;
        const forceTimer = setTimeout(() => {
            try {
                app.exit(0);
            } catch {
                // ignore
            }
        }, FORCE_EXIT_AFTER_MS);

        void Promise.resolve()
            .then(() => api.onBeforeQuit())
            .catch(() => {
                // ignore — quit must proceed even if cleanup fails
            })
            .finally(() => {
                clearTimeout(forceTimer);
                try {
                    app.exit(0);
                } catch {
                    // ignore
                }
            });
    });

    app.on('window-all-closed', () => {
        if (process.platform !== 'darwin') {
            app.quit();
        }
    });
}
