/**
 * Ensure the Electron runtime binary is present under node_modules/electron/dist.
 *
 * pnpm 11 blocks lifecycle scripts unless allowBuilds lists the package. If install
 * ran before that setting existed (or deps were already up to date), postinstall may
 * never have executed and electron-vite fails at dev start with "Electron uninstall".
 */
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';

const root = path.join(import.meta.dirname, '..');
const require = createRequire(path.join(root, 'package.json'));

let electronDir;
try {
    const pkgPath = require.resolve('electron/package.json', { paths: [root] });
    electronDir = path.dirname(pkgPath);
} catch {
    console.error('[ensure-electron] electron is not installed. Run: pnpm install');
    process.exit(1);
}

const pathFile = path.join(electronDir, 'path.txt');

function electronRuntimeReady() {
    if (!fs.existsSync(pathFile)) {
        return false;
    }
    const relativeExec = fs.readFileSync(pathFile, 'utf8').trim();
    return fs.existsSync(path.join(electronDir, 'dist', relativeExec));
}

if (electronRuntimeReady()) {
    process.exit(0);
}

console.info('[ensure-electron] Electron runtime missing — running electron/install.js …');

const installScript = path.join(electronDir, 'install.js');
const result = spawnSync(process.execPath, [installScript], {
    cwd: electronDir,
    stdio: 'inherit',
    env: process.env
});

if (result.status !== 0) {
    console.error(
        '[ensure-electron] Failed to download Electron. Check network access to GitHub releases.\n' +
            '  If GitHub is slow, retry with a mirror:\n' +
            '  ELECTRON_MIRROR=https://npmmirror.com/mirrors/electron/ node node_modules/electron/install.js\n' +
            '  Or: pnpm run ensure-electron'
    );
    process.exit(result.status ?? 1);
}

if (!electronRuntimeReady()) {
    console.error('[ensure-electron] install.js finished but Electron runtime is still missing.');
    process.exit(1);
}

console.info('[ensure-electron] Electron runtime ready.');
