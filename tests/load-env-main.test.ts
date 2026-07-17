import { afterEach, describe, expect, it, vi } from 'vitest';

const loadDotenvForProcess = vi.fn();

vi.mock('../src/main/load-env-core', () => ({
    loadDotenvForProcess
}));

vi.mock('electron', () => ({
    app: {
        isPackaged: false,
        getPath: () => '/Applications/Kajo.app/Contents/MacOS/Kajo',
        requestSingleInstanceLock: () => true,
        quit: vi.fn()
    }
}));

describe('src/main/load-env', () => {
    afterEach(() => {
        vi.resetModules();
        loadDotenvForProcess.mockClear();
    });

    it('invokes loadDotenvForProcess with main directory and process hints', async () => {
        await import('../src/main/load-env');
        expect(loadDotenvForProcess).toHaveBeenCalledTimes(1);
        const [mainDir, opts] = loadDotenvForProcess.mock.calls[0] as [
            string,
            Record<string, unknown>
        ];
        expect(mainDir).toContain('src');
        expect(mainDir).toContain('main');
        expect(opts).toMatchObject({
            isPackaged: false,
            cwd: process.cwd(),
            resourcesPath: process.resourcesPath,
            platform: process.platform
        });
        expect(typeof opts.getExePath).toBe('function');
        expect((opts.getExePath as () => string)()).toBe(
            '/Applications/Kajo.app/Contents/MacOS/Kajo'
        );
    });
});
