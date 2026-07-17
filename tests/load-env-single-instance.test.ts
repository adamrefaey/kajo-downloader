import { afterEach, describe, expect, it, vi } from 'vitest';

const loadDotenvForProcess = vi.fn();

vi.mock('../src/main/load-env-core', () => ({
    loadDotenvForProcess
}));

vi.mock('electron', () => ({
    app: {
        requestSingleInstanceLock: () => false,
        quit: vi.fn()
    }
}));

describe('src/main/load-env (secondary instance)', () => {
    afterEach(() => {
        vi.resetModules();
        loadDotenvForProcess.mockClear();
    });

    it('calls app.quit and process.exit(0) without loading env when the instance lock is not acquired', async () => {
        vi.resetModules();
        const { app } = await import('electron');
        const exitSpy = vi.spyOn(process, 'exit').mockImplementation((code) => {
            throw new Error(`process.exit(${String(code)})`);
        });
        await expect(import('../src/main/load-env')).rejects.toThrow('process.exit(0)');
        expect(app.quit).toHaveBeenCalledTimes(1);
        expect(exitSpy).toHaveBeenCalledWith(0);
        expect(loadDotenvForProcess).not.toHaveBeenCalled();
        exitSpy.mockRestore();
    });
});
