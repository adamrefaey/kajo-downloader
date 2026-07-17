import { join } from 'node:path';
import { is } from '@electron-toolkit/utils';
import { app, BrowserWindow, clipboard, Menu, nativeImage, session, shell, Tray } from 'electron';
import { KAJO_APP_RENDERER_URL, KAJO_APP_SCHEME } from './customProtocol';
import { translateMenu } from './i18n/mainI18n';
import { extractAutopasteClipboardInput, isSafeOpenExternalUrl, safeSend } from './mainHelpers';
import { SECURE_MAIN_WEB_PREFERENCES_BASE } from './mainWindowSecurity';
import type { AutoUpdateMenuActions } from './services/autoUpdate';

export type WindowTrayManagerDeps = {
    iconPath: string;
    clipboardUrlChannel: string;
    allowElectronDevTools: boolean;
    isMac: boolean;
    isWindows: boolean;
    autoUpdateMenuActions: AutoUpdateMenuActions;
};

const TRAY_ICON_MAX_PX = 16;
const CLIPBOARD_EMIT_DEBOUNCE_MS = 90;
/** Backoff steps (ms) when clipboard is idle: 450 → 1 s → 2 s → 5 s → 10 s */
const CLIPBOARD_BACKOFF_STEPS = [450, 1_000, 2_000, 5_000, 10_000];

export type WindowTrayManager = {
    getMainWindow: () => BrowserWindow | null;
    setMainWindow: (w: BrowserWindow | null) => void;
    createMainWindow: () => BrowserWindow;
    showMainWindow: () => void;
    setupTray: () => void;
    rebuildApplicationMenu: () => void;
    prepareForQuit: () => void;
};

export function createWindowTrayManager(deps: WindowTrayManagerDeps): WindowTrayManager {
    let mainWindow: BrowserWindow | null = null;
    let allowMainWindowClose = false;
    /** The default-session CSP header hook is process-global — register it once, not per window. */
    let cspHandlerRegistered = false;
    let tray: Tray | null = null;
    let clipboardPollTimer: NodeJS.Timeout | null = null;
    let lastClipboardUrl = '';
    let lastClipboardRaw = '';
    let clipboardEmitDebounceTimer: NodeJS.Timeout | null = null;
    /** Index into CLIPBOARD_BACKOFF_STEPS — incremented on no-change, reset on change. */
    let clipboardBackoffIndex = 0;

    function buildTrayContextMenu(): Menu {
        return Menu.buildFromTemplate([
            {
                label: translateMenu('trayShow'),
                click: () => showMainWindow()
            },
            { type: 'separator' },
            {
                label: translateMenu('trayQuit'),
                click: () => {
                    app.quit();
                }
            }
        ]);
    }

    function buildApplicationMenuTemplate(): Electron.MenuItemConstructorOptions[] {
        const viewMenuDebug: Electron.MenuItemConstructorOptions | null = deps.allowElectronDevTools
            ? {
                  label: translateMenu('view'),
                  submenu: [
                      { role: 'reload' },
                      { role: 'forceReload' },
                      { type: 'separator' },
                      { role: 'toggleDevTools' }
                  ]
              }
            : null;

        const editMenu: Electron.MenuItemConstructorOptions = {
            label: translateMenu('edit'),
            submenu: [
                { role: 'undo' },
                { role: 'redo' },
                { type: 'separator' },
                { role: 'cut' },
                { role: 'copy' },
                { role: 'paste' },
                { role: 'pasteAndMatchStyle' },
                { type: 'separator' },
                { role: 'selectAll' }
            ]
        };

        const toolsMenu: Electron.MenuItemConstructorOptions = {
            label: translateMenu('tools'),
            submenu: [
                {
                    label: translateMenu('checkForUpdates'),
                    click: () => deps.autoUpdateMenuActions.checkForUpdates()
                }
            ]
        };

        if (deps.isMac) {
            return [
                {
                    label: app.name,
                    submenu: [
                        { role: 'about' },
                        { type: 'separator' },
                        { role: 'services' },
                        { type: 'separator' },
                        { role: 'hide' },
                        { role: 'hideOthers' },
                        { role: 'unhide' },
                        { type: 'separator' },
                        { role: 'quit' }
                    ]
                },
                {
                    label: translateMenu('file'),
                    submenu: [{ role: 'close' }]
                },
                editMenu,
                ...(viewMenuDebug ? [viewMenuDebug] : []),
                toolsMenu
            ];
        }

        return [
            {
                label: translateMenu('file'),
                submenu: [{ role: 'quit' }]
            },
            editMenu,
            ...(viewMenuDebug ? [viewMenuDebug] : []),
            toolsMenu
        ];
    }

    function rebuildApplicationMenu(): void {
        Menu.setApplicationMenu(Menu.buildFromTemplate(buildApplicationMenuTemplate()));
    }

    function registerWebContentsContextMenu(window: BrowserWindow): void {
        window.webContents.on('context-menu', (_event, params) => {
            const template: Electron.MenuItemConstructorOptions[] = [];

            if (params.isEditable) {
                template.push(
                    { role: 'undo' },
                    { role: 'redo' },
                    { type: 'separator' },
                    { role: 'cut' },
                    { role: 'copy' },
                    { role: 'paste' },
                    { role: 'pasteAndMatchStyle' },
                    { type: 'separator' },
                    { role: 'selectAll' }
                );
            } else if (params.selectionText?.trim()) {
                template.push({ role: 'copy' });
            }

            if (deps.allowElectronDevTools) {
                if (template.length > 0) {
                    template.push({ type: 'separator' });
                }
                template.push({
                    label: 'Inspect Element',
                    click: () => {
                        window.webContents.inspectElement(params.x, params.y);
                    }
                });
            }

            if (template.length === 0) {
                return;
            }

            Menu.buildFromTemplate(template).popup({ window });
        });
    }

    function createMainWindow(): BrowserWindow {
        const window = new BrowserWindow({
            width: 1080,
            height: 980,
            minWidth: 1080,
            minHeight: 980,
            show: false,
            autoHideMenuBar: true,
            icon: deps.iconPath,
            ...(deps.isMac
                ? {
                      titleBarStyle: 'hiddenInset' as const,
                      vibrancy: 'sidebar' as const,
                      visualEffectState: 'active' as const
                  }
                : {}),
            ...(deps.isWindows
                ? {
                      titleBarStyle: 'hidden' as const,
                      titleBarOverlay: {
                          color: '#00000000',
                          symbolColor: '#d6d6d6',
                          height: 32
                      },
                      backgroundMaterial: 'mica' as const
                  }
                : {}),
            webPreferences: {
                ...SECURE_MAIN_WEB_PREFERENCES_BASE,
                preload: join(__dirname, '../preload/index.js'),
                devTools: deps.allowElectronDevTools
            }
        });

        window.on('ready-to-show', () => {
            window.show();
        });

        window.webContents.on('will-navigate', (event, url) => {
            let proto: string;
            try {
                proto = new URL(url).protocol;
            } catch {
                event.preventDefault();
                return;
            }
            // Allow kajo-app: (production renderer) and http://localhost (dev Vite HMR).
            const isKajoApp = proto === `${KAJO_APP_SCHEME}:`;
            const isDevLocal = is.dev && proto === 'http:' && url.startsWith('http://localhost');
            if (!isKajoApp && !isDevLocal) {
                event.preventDefault();
            }
        });

        window.webContents.setWindowOpenHandler(({ url }) => {
            // Open only allowlisted external URLs in the default browser, using the SAME allowlist
            // as the authOpenExternal IPC path (isSafeOpenExternalUrl: product domain + LinkedIn).
            // A bare url.startsWith('https://') would let any window.open() / target=_blank
            // reachable from renderer content (or injected via XSS) launch an arbitrary site — a
            // phishing / drive-by vector. Everything else (other https hosts, http, about:, data:,
            // javascript:, custom schemes) is denied.
            if (isSafeOpenExternalUrl(url)) {
                void shell.openExternal(url);
            }
            return { action: 'deny' };
        });

        // CSP applied in both dev and production. Dev allows unsafe-inline for Vite HMR style injection.
        // Production uses style-src 'self' only: Vite bundles all CSS into external .css files so
        // inline style sheets are never needed. Removing 'unsafe-inline' eliminates CSS injection risk.
        // 'self' resolves to kajo-app://localhost in production (narrower than file://).
        const csp = is.dev
            ? "default-src 'self'; script-src 'self' 'unsafe-inline'; worker-src blob:; style-src 'self' 'unsafe-inline'; font-src 'self'; img-src 'self' data: https:; connect-src 'self' ws://localhost:*"
            : "default-src 'self'; script-src 'self'; worker-src blob:; style-src 'self'; font-src 'self'; img-src 'self' data: https:; connect-src 'self'";

        if (!cspHandlerRegistered) {
            cspHandlerRegistered = true;
            session.defaultSession.webRequest.onHeadersReceived((details, callback) => {
                callback({
                    responseHeaders: {
                        ...details.responseHeaders,
                        'Content-Security-Policy': [csp]
                    }
                });
            });
        }

        registerWebContentsContextMenu(window);

        if (is.dev && process.env.ELECTRON_RENDERER_URL) {
            window.loadURL(process.env.ELECTRON_RENDERER_URL);
        } else {
            // Use the custom kajo-app: protocol instead of file:// so the renderer runs
            // in a narrower origin (Electron security checklist #18).
            window.loadURL(KAJO_APP_RENDERER_URL);
        }

        window.on('focus', () => startClipboardPolling(window));
        window.on('blur', stopClipboardPolling);

        window.on('close', (event) => {
            if (!allowMainWindowClose) {
                event.preventDefault();
                if (!window.isDestroyed()) {
                    window.hide();
                }
            }
        });

        window.on('closed', () => {
            stopClipboardPolling();
            if (mainWindow === window) {
                mainWindow = null;
            }
        });

        return window;
    }

    function showMainWindow(): void {
        if (mainWindow && !mainWindow.isDestroyed()) {
            if (mainWindow.isMinimized()) {
                mainWindow.restore();
            }
            mainWindow.show();
            mainWindow.focus();
            return;
        }
        const alive = BrowserWindow.getAllWindows().filter((w) => !w.isDestroyed());
        if (alive.length > 0) {
            const first = alive[0];
            if (first) {
                mainWindow = first;
            }
            for (let i = 1; i < alive.length; i++) {
                try {
                    alive[i]?.destroy();
                } catch {
                    /* ignore */
                }
            }
        } else {
            mainWindow = createMainWindow();
        }
        if (mainWindow && !mainWindow.isDestroyed()) {
            if (mainWindow.isMinimized()) {
                mainWindow.restore();
            }
            mainWindow.show();
            mainWindow.focus();
        }
    }

    function scaleNativeImageForTray(source: Electron.NativeImage): Electron.NativeImage {
        const { width, height } = source.getSize();
        if (width <= 0 || height <= 0) {
            return source;
        }
        if (width <= TRAY_ICON_MAX_PX && height <= TRAY_ICON_MAX_PX) {
            return source;
        }
        const scale = Math.min(TRAY_ICON_MAX_PX / width, TRAY_ICON_MAX_PX / height);
        const w = Math.max(1, Math.round(width * scale));
        const h = Math.max(1, Math.round(height * scale));
        return source.resize({ width: w, height: h, quality: 'best' });
    }

    function setupTray(): void {
        if (tray) {
            return;
        }

        const rawTrayImage = nativeImage.createFromPath(deps.iconPath);
        if (rawTrayImage.isEmpty()) {
            return;
        }

        const trayImage = scaleNativeImageForTray(rawTrayImage);
        tray = new Tray(trayImage);
        tray.setToolTip(app.name);

        tray.setContextMenu(null);
        tray.on('click', () => {
            showMainWindow();
        });
        if (deps.isMac || deps.isWindows) {
            tray.on('right-click', () => {
                if (!tray || tray.isDestroyed()) {
                    return;
                }
                tray.popUpContextMenu(buildTrayContextMenu());
            });
        } else {
            tray.setContextMenu(buildTrayContextMenu());
        }
    }

    function stopClipboardPolling(): void {
        if (!clipboardPollTimer) {
            return;
        }

        clearTimeout(clipboardPollTimer);
        clipboardPollTimer = null;
        lastClipboardRaw = '';
        clipboardBackoffIndex = 0;
        if (clipboardEmitDebounceTimer) {
            clearTimeout(clipboardEmitDebounceTimer);
            clipboardEmitDebounceTimer = null;
        }
    }

    function startClipboardPolling(window: BrowserWindow): void {
        stopClipboardPolling();

        const scheduleNextPoll = (): void => {
            const baseMs =
                CLIPBOARD_BACKOFF_STEPS[
                    Math.min(clipboardBackoffIndex, CLIPBOARD_BACKOFF_STEPS.length - 1)
                ] ?? 450;
            const jitter = 1 + (Math.random() * 0.3 - 0.15);
            clipboardPollTimer = setTimeout(
                () => {
                    pollClipboardUrl(window);
                    scheduleNextPoll();
                },
                Math.round(baseMs * jitter)
            );
        };
        pollClipboardUrl(window);
        scheduleNextPoll();
    }

    function pollClipboardUrl(window: BrowserWindow): void {
        const text = clipboard.readText().trim();
        if (text === lastClipboardRaw) {
            // No change — advance backoff (capped at last step).
            clipboardBackoffIndex = Math.min(
                clipboardBackoffIndex + 1,
                CLIPBOARD_BACKOFF_STEPS.length - 1
            );
            return;
        }
        // Change detected — reset backoff to base interval.
        clipboardBackoffIndex = 0;
        lastClipboardRaw = text;
        const extractedUrl = extractAutopasteClipboardInput(text);
        if (!extractedUrl || extractedUrl === lastClipboardUrl) {
            return;
        }

        lastClipboardUrl = extractedUrl;
        if (clipboardEmitDebounceTimer) {
            clearTimeout(clipboardEmitDebounceTimer);
        }
        clipboardEmitDebounceTimer = setTimeout(() => {
            clipboardEmitDebounceTimer = null;
            safeSend(window.webContents, deps.clipboardUrlChannel, {
                url: extractedUrl
            });
        }, CLIPBOARD_EMIT_DEBOUNCE_MS);
    }

    function getMainWindow(): BrowserWindow | null {
        return mainWindow;
    }

    function setMainWindow(w: BrowserWindow | null): void {
        mainWindow = w;
    }

    function prepareForQuit(): void {
        allowMainWindowClose = true;
        if (tray) {
            tray.destroy();
            tray = null;
        }
    }

    return {
        getMainWindow,
        setMainWindow,
        createMainWindow,
        showMainWindow,
        setupTray,
        rebuildApplicationMenu,
        prepareForQuit
    };
}
