import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const exposeInMainWorld = vi.fn();

vi.mock('../electron/preloadApi', () => ({
    createRendererApi: vi.fn(() => ({ __api: true }))
}));

vi.mock('electron', () => ({
    contextBridge: {
        exposeInMainWorld
    },
    ipcRenderer: {
        invoke: vi.fn(),
        on: vi.fn()
    }
}));

describe('electron/preload', () => {
    beforeEach(() => {
        vi.resetModules();
        exposeInMainWorld.mockClear();
        vi.stubGlobal('window', {} as unknown as Window & typeof globalThis);
    });

    afterEach(() => {
        vi.unstubAllGlobals();
    });

    it('exposes renderer api when contextIsolated', async () => {
        vi.stubGlobal('process', {
            ...process,
            contextIsolated: true,
            platform: 'darwin'
        });
        await import('../electron/preload');
        expect(exposeInMainWorld).toHaveBeenCalledTimes(1);
        expect(exposeInMainWorld).toHaveBeenCalledWith('api', { __api: true });
    });

    it('throws when contextIsolated is false', async () => {
        vi.resetModules();
        exposeInMainWorld.mockClear();
        const w: Record<string, unknown> = {};
        vi.stubGlobal('window', w as unknown as Window & typeof globalThis);
        vi.stubGlobal('process', {
            ...process,
            contextIsolated: false,
            platform: 'darwin'
        });
        await expect(import('../electron/preload')).rejects.toThrow(
            'Context isolation must be enabled'
        );
    });

    it('rethrows when contextBridge.exposeInMainWorld throws', async () => {
        vi.resetModules();
        exposeInMainWorld.mockClear();
        exposeInMainWorld.mockImplementation(() => {
            throw new Error('expose failed');
        });
        const err = vi.spyOn(console, 'error').mockImplementation(() => {});
        vi.stubGlobal('process', {
            ...process,
            contextIsolated: true,
            platform: 'darwin'
        });
        await expect(import('../electron/preload')).rejects.toThrow('expose failed');
        expect(err).toHaveBeenCalled();
        err.mockRestore();
    });

    it('wraps non-Error expose failures in Error', async () => {
        vi.resetModules();
        exposeInMainWorld.mockClear();
        exposeInMainWorld.mockImplementation(() => {
            throw 'string failure';
        });
        vi.spyOn(console, 'error').mockImplementation(() => {});
        vi.stubGlobal('process', {
            ...process,
            contextIsolated: true,
            platform: 'darwin'
        });
        await expect(import('../electron/preload')).rejects.toThrow('string failure');
    });
});
