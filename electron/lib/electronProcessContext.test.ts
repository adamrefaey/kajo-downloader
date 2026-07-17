import { homedir, tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { KAJO_USER_DATA_DIR, kajoUserDataDirName } from './appIdentity';

const existsSyncMock = vi.fn();

afterEach(() => {
    vi.restoreAllMocks();
    vi.resetModules();
    vi.unstubAllEnvs();
    existsSyncMock.mockReset();
    Reflect.deleteProperty(process, 'defaultApp');
    Reflect.deleteProperty(process, 'resourcesPath');
});

async function loadContext(mocks: { electronApp?: unknown } = {}) {
    const { electronApp = null } = mocks;
    vi.doMock('node:fs', () => ({
        existsSync: existsSyncMock
    }));
    vi.doMock('electron', () => ({
        app: electronApp
    }));
    return import('./electronProcessContext');
}

describe('electronAppIsPackaged', () => {
    it('returns app.isPackaged when it is a boolean', async () => {
        const { electronAppIsPackaged } = await loadContext({
            electronApp: { isPackaged: true }
        });
        expect(electronAppIsPackaged()).toBe(true);

        vi.resetModules();
        const { electronAppIsPackaged: again } = await loadContext({
            electronApp: { isPackaged: false }
        });
        expect(again()).toBe(false);
    });

    it('uses process.defaultApp when app.isPackaged is unavailable', async () => {
        (process as NodeJS.Process & { defaultApp?: boolean }).defaultApp = true;
        const { electronAppIsPackaged } = await loadContext({ electronApp: {} });
        expect(electronAppIsPackaged()).toBe(false);

        vi.resetModules();
        (process as NodeJS.Process & { defaultApp?: boolean }).defaultApp = false;
        const { electronAppIsPackaged: packaged } = await loadContext({ electronApp: {} });
        expect(packaged()).toBe(true);
    });

    it('infers from resourcesPath/bin when defaultApp is unset', async () => {
        (process as NodeJS.Process & { resourcesPath?: string }).resourcesPath = '/res';
        existsSyncMock.mockReturnValue(true);
        const { electronAppIsPackaged } = await loadContext({ electronApp: {} });
        expect(electronAppIsPackaged()).toBe(true);
        expect(existsSyncMock).toHaveBeenCalledWith(join('/res', 'bin'));

        vi.resetModules();
        (process as NodeJS.Process & { resourcesPath?: string }).resourcesPath = '/res';
        existsSyncMock.mockReturnValue(false);
        const { electronAppIsPackaged: notPackaged } = await loadContext({ electronApp: {} });
        expect(notPackaged()).toBe(false);
    });

    it('returns false when no signal indicates a packaged app', async () => {
        const { electronAppIsPackaged } = await loadContext({ electronApp: {} });
        expect(electronAppIsPackaged()).toBe(false);
    });
});

describe('electronUserDataPath', () => {
    it('uses app.getPath(userData) when available', async () => {
        const { electronUserDataPath } = await loadContext({
            electronApp: {
                getPath: (name: string) => (name === 'userData' ? '/from-app' : '/other')
            }
        });
        expect(electronUserDataPath()).toBe('/from-app');
    });

    it('falls back when getPath throws', async () => {
        vi.stubEnv('KAJO_USER_DATA', '/from-env');
        const { electronUserDataPath } = await loadContext({
            electronApp: {
                getPath: () => {
                    throw new Error('not ready');
                }
            }
        });
        expect(electronUserDataPath()).toBe('/from-env');
    });

    it('uses KAJO_USER_DATA when app path is unavailable', async () => {
        vi.stubEnv('KAJO_USER_DATA', '  /trimmed  ');
        const { electronUserDataPath } = await loadContext({ electronApp: {} });
        expect(electronUserDataPath()).toBe('/trimmed');
    });

    it('uses unpackaged platform defaults without app or env', async () => {
        vi.spyOn(process, 'platform', 'get').mockReturnValue('darwin');
        const { electronUserDataPath } = await loadContext({
            electronApp: { isPackaged: false }
        });
        expect(electronUserDataPath()).toBe(
            join(homedir(), 'Library', 'Application Support', kajoUserDataDirName(false))
        );

        vi.resetModules();
        vi.spyOn(process, 'platform', 'get').mockReturnValue('win32');
        vi.stubEnv('APPDATA', '/fake-appdata-roaming');
        const { electronUserDataPath: winPath } = await loadContext({
            electronApp: { isPackaged: false }
        });
        expect(winPath()).toBe(join('/fake-appdata-roaming', kajoUserDataDirName(false)));

        vi.resetModules();
        vi.spyOn(process, 'platform', 'get').mockReturnValue('win32');
        vi.unstubAllEnvs();
        delete process.env.APPDATA;
        const { electronUserDataPath: winFallback } = await loadContext({
            electronApp: { isPackaged: false }
        });
        expect(winFallback()).toBe(
            join(homedir(), 'AppData', 'Roaming', kajoUserDataDirName(false))
        );

        vi.resetModules();
        vi.spyOn(process, 'platform', 'get').mockReturnValue('linux');
        vi.stubEnv('XDG_CONFIG_HOME', '/xdg-config');
        const { electronUserDataPath: linuxXdg } = await loadContext({
            electronApp: { isPackaged: false }
        });
        expect(linuxXdg()).toBe(join('/xdg-config', kajoUserDataDirName(false)));

        vi.resetModules();
        vi.spyOn(process, 'platform', 'get').mockReturnValue('linux');
        vi.unstubAllEnvs();
        delete process.env.XDG_CONFIG_HOME;
        const { electronUserDataPath: linuxDefault } = await loadContext({
            electronApp: { isPackaged: false }
        });
        expect(linuxDefault()).toBe(join(homedir(), '.config', kajoUserDataDirName(false)));
    });

    it('uses packaged filesystem slug defaults without app or env', async () => {
        vi.spyOn(process, 'platform', 'get').mockReturnValue('darwin');
        const { electronUserDataPath } = await loadContext({
            electronApp: { isPackaged: true }
        });
        expect(electronUserDataPath()).toBe(
            join(homedir(), 'Library', 'Application Support', KAJO_USER_DATA_DIR)
        );
    });
});

describe('electronTempPath', () => {
    it('uses app.getPath(temp) when available', async () => {
        const { electronTempPath } = await loadContext({
            electronApp: {
                getPath: (name: string) => (name === 'temp' ? '/app-temp' : '/x')
            }
        });
        expect(electronTempPath()).toBe('/app-temp');
    });

    it('falls back to os.tmpdir when getPath is missing or throws', async () => {
        const { electronTempPath } = await loadContext({
            electronApp: {
                getPath: () => {
                    throw new Error('not ready');
                }
            }
        });
        expect(electronTempPath()).toBe(tmpdir());

        vi.resetModules();
        const { electronTempPath: noGetPath } = await loadContext({
            electronApp: { isPackaged: false }
        });
        expect(noGetPath()).toBe(tmpdir());
    });
});
