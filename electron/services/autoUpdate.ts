import { is } from '@electron-toolkit/utils';
import type { MessageBoxOptions } from 'electron';
import { app, type BrowserWindow, dialog } from 'electron';
import { autoUpdater } from 'electron-updater';
import { translateUpdate } from '../i18n/mainI18n';
import { mainLog } from '../mainLogger';

const CHECK_INTERVAL_MS = 4 * 60 * 60 * 1000;
const INITIAL_CHECK_DELAY_MS = 60_000;

function showMessageForWindow(
    parent: BrowserWindow | null,
    options: MessageBoxOptions
): Promise<Electron.MessageBoxReturnValue> {
    if (parent) {
        return dialog.showMessageBox(parent, options);
    }
    return dialog.showMessageBox(options);
}

export interface AutoUpdateMenuActions {
    checkForUpdates: () => void;
}

/**
 * electron-updater on Linux only supports AppImage installs (`APPIMAGE` is set by the
 * AppImage runtime). deb/rpm users update via their package manager.
 */
export function isElectronUpdaterSupportedOnThisInstall(): boolean {
    if (process.platform !== 'linux') {
        return true;
    }
    return Boolean(process.env.APPIMAGE?.trim());
}

function shouldSkipBuiltInUpdater(): boolean {
    return !app.isPackaged || is.dev || !isElectronUpdaterSupportedOnThisInstall();
}

function applyOptionalFeedUrlFromEnv(): void {
    const url = process.env.KAJO_AUTO_UPDATE_FEED_URL?.trim();
    if (url?.startsWith('https://')) {
        autoUpdater.setFeedURL({ provider: 'generic', url });
    }
}

export async function manualCheckForUpdates(
    getMainWindow: () => BrowserWindow | null
): Promise<void> {
    const win = getMainWindow();

    if (!app.isPackaged || is.dev) {
        await showMessageForWindow(win, {
            type: 'info',
            title: app.name,
            message: translateUpdate('devBuildMessage')
        });
        return;
    }

    if (!isElectronUpdaterSupportedOnThisInstall()) {
        await showMessageForWindow(win, {
            type: 'info',
            title: app.name,
            message: translateUpdate('linuxPackageManagedMessage')
        });
        return;
    }

    if (process.env.KAJO_DISABLE_AUTO_UPDATE === '1') {
        await showMessageForWindow(win, {
            type: 'info',
            title: app.name,
            message: translateUpdate('disabledMessage')
        });
        return;
    }

    try {
        const result = await autoUpdater.checkForUpdates();
        if (!result?.isUpdateAvailable) {
            await showMessageForWindow(win, {
                type: 'info',
                title: app.name,
                message: translateUpdate('latestMessage')
            });
            return;
        }
        const tail = autoUpdater.autoDownload
            ? translateUpdate('availableTailAuto')
            : translateUpdate('availableTailManual');
        await showMessageForWindow(win, {
            type: 'info',
            title: app.name,
            message:
                translateUpdate('availablePrefix', { version: result.updateInfo.version }) + tail
        });
    } catch (e) {
        const message = e instanceof Error ? e.message : String(e);
        await showMessageForWindow(win, {
            type: 'error',
            title: translateUpdate('checkFailedTitle'),
            message
        });
    }
}

/**
 * Background checks + restart prompt when a build is downloaded.
 * Uses `publish` from the packaged `app-update.yml`, unless `KAJO_AUTO_UPDATE_FEED_URL` is set (HTTPS generic feed).
 */
export function initAutoUpdate(
    menuActions: AutoUpdateMenuActions,
    getMainWindow: () => BrowserWindow | null
): void {
    menuActions.checkForUpdates = () => {
        void manualCheckForUpdates(getMainWindow);
    };

    if (shouldSkipBuiltInUpdater()) {
        return;
    }

    if (process.env.KAJO_DISABLE_AUTO_UPDATE === '1') {
        return;
    }

    applyOptionalFeedUrlFromEnv();

    // Prevent downgrade attacks: never install a version older than the running app.
    autoUpdater.allowDowngrade = false;
    autoUpdater.autoDownload = true;
    autoUpdater.autoInstallOnAppQuit = true;

    autoUpdater.on('update-downloaded', () => {
        void showMessageForWindow(getMainWindow(), {
            type: 'info',
            title: translateUpdate('readyTitle', { appName: app.name }),
            message: translateUpdate('readyMessage'),
            buttons: [translateUpdate('restart'), translateUpdate('later')],
            defaultId: 0,
            cancelId: 1
        }).then(({ response }) => {
            if (response === 0) {
                autoUpdater.quitAndInstall(false, true);
            }
        });
    });

    autoUpdater.on('error', (err) => {
        mainLog.error('[autoUpdate] error', { err: String(err) });
    });

    setTimeout(() => {
        void autoUpdater.checkForUpdates().catch((err) => {
            mainLog.error('[autoUpdate] checkForUpdates failed', { err: String(err) });
        });
    }, INITIAL_CHECK_DELAY_MS);

    const scheduleNextCheck = (): void => {
        const jitter = 1 + (Math.random() * 0.3 - 0.15); // ±15%
        setTimeout(
            () => {
                void autoUpdater
                    .checkForUpdates()
                    .catch((err) => {
                        mainLog.error('[autoUpdate] checkForUpdates failed', { err: String(err) });
                    })
                    .finally(scheduleNextCheck);
            },
            Math.round(CHECK_INTERVAL_MS * jitter)
        );
    };
    scheduleNextCheck();
}
