/**
 * Native modules must match the runtime that loads them. `pnpm install` builds any
 * native deps for the **host Node** used by Vitest/CI. Before `electron-vite dev` /
 * `electron-vite build`, run `pnpm run rebuild:natives` (`electron-builder
 * install-app-deps`) so binaries match Electron's Node ABI.
 */

import fs from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';

const root = path.join(import.meta.dirname, '..');
const require = createRequire(path.join(root, 'package.json'));

try {
    const electronPkg = require.resolve('electron/package.json', { paths: [root] });
    const electronDir = path.dirname(electronPkg);
    const pathFile = path.join(electronDir, 'path.txt');
    const runtimeReady =
        fs.existsSync(pathFile) &&
        fs.existsSync(path.join(electronDir, 'dist', fs.readFileSync(pathFile, 'utf8').trim()));

    if (!runtimeReady) {
        console.warn(
            '[kajo-downloader] Electron runtime not installed yet (pnpm may have skipped postinstall).\n' +
                '  First dev/preview run will download it via scripts/ensure-electron.mjs, or run:\n' +
                '  node node_modules/electron/install.js'
        );
    }
} catch {
    process.exit(0);
}

console.info(
    '[kajo-downloader] Native deps: use host Node build from install. Before Electron dev/build run: pnpm run rebuild:natives'
);
process.exit(0);
