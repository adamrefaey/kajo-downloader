import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';

const mkdirSyncMock = vi.fn();
const setPathMock = vi.fn();
const setAppLogsPathMock = vi.fn();
const getPathMock = vi.fn((name: string) => (name === 'appData' ? '/mock-app-data' : '/other'));

afterEach(() => {
    vi.restoreAllMocks();
    vi.resetModules();
    vi.unstubAllEnvs();
    mkdirSyncMock.mockReset();
    setPathMock.mockReset();
    setAppLogsPathMock.mockReset();
    getPathMock.mockClear();
});

async function loadConfigure(isPackaged: boolean) {
    vi.doMock('node:fs', () => ({
        mkdirSync: mkdirSyncMock
    }));
    vi.doMock('electron', () => ({
        app: {
            isPackaged,
            getPath: getPathMock,
            setPath: setPathMock,
            setAppLogsPath: setAppLogsPathMock
        }
    }));
    await import('./configureUserDataPaths');
}

describe('configureUserDataPaths', () => {
    it('pins packaged userData, session subdirectory, and logs', async () => {
        await loadConfigure(true);
        const userData = join('/mock-app-data', 'kajo-downloader');
        const sessionData = join(userData, 'session');
        expect(mkdirSyncMock).toHaveBeenCalledWith(sessionData, { recursive: true });
        expect(mkdirSyncMock).toHaveBeenCalledTimes(1);
        expect(setPathMock).toHaveBeenCalledWith('userData', userData);
        expect(setPathMock).toHaveBeenCalledWith('sessionData', sessionData);
        expect(setAppLogsPathMock).toHaveBeenCalledWith(join(userData, 'logs'));
    });

    it('pins unpackaged paths under the -dev profile', async () => {
        await loadConfigure(false);
        const userData = join('/mock-app-data', 'kajo-downloader-dev');
        expect(setPathMock).toHaveBeenCalledWith('userData', userData);
        expect(setPathMock).toHaveBeenCalledWith('sessionData', join(userData, 'session'));
        expect(setAppLogsPathMock).toHaveBeenCalledWith(join(userData, 'logs'));
    });

    it('honors KAJO_USER_DATA override for the whole layout', async () => {
        vi.stubEnv('KAJO_USER_DATA', '  /portable/kajo-data  ');
        await loadConfigure(true);
        const userData = '/portable/kajo-data';
        expect(setPathMock).toHaveBeenCalledWith('userData', userData);
        expect(setPathMock).toHaveBeenCalledWith('sessionData', join(userData, 'session'));
        expect(setAppLogsPathMock).toHaveBeenCalledWith(join(userData, 'logs'));
        expect(getPathMock).not.toHaveBeenCalled();
    });
});
