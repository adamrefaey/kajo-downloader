import { app } from 'electron';
import { loadDotenvForProcess } from './load-env-core';

if (!app.requestSingleInstanceLock()) {
    app.quit();
    process.exit(0);
}

loadDotenvForProcess(import.meta.dirname, {
    isPackaged: app.isPackaged,
    cwd: process.cwd(),
    resourcesPath: process.resourcesPath,
    platform: process.platform,
    getExePath: () => app.getPath('exe')
});
