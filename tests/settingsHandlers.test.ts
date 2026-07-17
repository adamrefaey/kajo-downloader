import { beforeEach, describe, expect, it, vi } from 'vitest';
import { IPC_INVOKE } from '../src/shared/ipcChannels';
import { IPC_ERROR_CODES } from '../src/shared/ipcErrors';

const ipcHandleSpy = vi.hoisted(() => vi.fn());

vi.mock('electron', () => ({
    ipcMain: { handle: ipcHandleSpy },
    app: { getLocale: vi.fn(() => 'en-US') },
    BrowserWindow: {
        fromWebContents: vi.fn(() => null)
    },
    dialog: { showOpenDialog: vi.fn() }
}));

vi.mock('../electron/i18n/mainI18n', () => ({
    translateMainError: (key: string) => key,
    initMainI18n: vi.fn()
}));

vi.mock('../electron/services/proxyProfileStore', () => ({
    DEFAULT_PROXY_PROFILE_ID: 'default',
    setProxyProfileUrl: vi.fn()
}));

vi.mock('../electron/ipc/rateLimiter', () => ({
    tryConsumeIpcRateLimitSlot: vi.fn(() => true)
}));

import { registerSettingsHandlers } from '../electron/ipc/settingsHandlers';
import type { IpcHandlerDeps } from '../electron/ipc/types';

describe('settingsHandlers', () => {
    let handlers = new Map<string, (...args: unknown[]) => Promise<unknown>>();

    const applySettingsPatch = vi.fn(() => ({ outputDir: '/tmp/out' }));
    const mockDeps = {
        getMainWindow: vi.fn(() => null),
        getSettings: vi.fn(() => ({ outputDir: '/tmp/out' })),
        applySettingsPatch,
        getEffectiveMainLocaleTag: vi.fn(() => 'en'),
        rebuildApplicationMenu: vi.fn(),
        isValidIpcSender: vi.fn(() => true)
    } as unknown as IpcHandlerDeps;

    beforeEach(() => {
        handlers = new Map();
        ipcHandleSpy.mockImplementation(
            (channel: string, handler: (...args: unknown[]) => unknown) => {
                handlers.set(channel, handler as (...args: unknown[]) => Promise<unknown>);
            }
        );
        applySettingsPatch.mockClear();
        registerSettingsHandlers(mockDeps);
    });

    it('settingsSet rejects invalid payloads', async () => {
        const handler = handlers.get(IPC_INVOKE.settingsSet);
        const result = await handler?.({}, { outputDir: 123 });
        expect(result).toEqual({
            ok: false,
            code: IPC_ERROR_CODES.invalidPayload,
            message: 'invalidRendererRequest'
        });
        expect(applySettingsPatch).not.toHaveBeenCalled();
    });

    it('settingsSet applies a valid patch', async () => {
        const handler = handlers.get(IPC_INVOKE.settingsSet);
        const result = await handler?.({}, { outputDir: '/downloads' });
        expect(applySettingsPatch).toHaveBeenCalledWith({ outputDir: '/downloads' });
        expect(result).toEqual({ outputDir: '/tmp/out' });
    });
});
