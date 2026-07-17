/**
 * Single source of truth for app identity strings.
 * Keep aligned with `package.json` `name` / `productName` and
 * `electron-builder.config.mjs` `productName` / `appId` (enforced by tests).
 */

/** Display / crash-reporter name (spaces OK). Not used for on-disk userData. */
export const KAJO_PRODUCT_DISPLAY_NAME = 'Kajo Downloader';

/** Bundle id — macOS Preferences / Saved Application State. */
export const KAJO_APP_ID = 'app.kajodownloader.desktop';

/**
 * Filesystem-friendly Electron `userData` directory for packaged builds.
 * Unpackaged runs use `${KAJO_USER_DATA_DIR}-dev`.
 */
export const KAJO_USER_DATA_DIR = 'kajo-downloader';

export function kajoUserDataDirName(isPackaged: boolean): string {
    return isPackaged ? KAJO_USER_DATA_DIR : `${KAJO_USER_DATA_DIR}-dev`;
}
