import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { IPC_INVOKE } from '../src/shared/ipcChannels';
import { IPC_ERROR_CODES } from '../src/shared/ipcErrors';

const ipcHandleSpy = vi.hoisted(() => vi.fn());
const openPathSpy = vi.hoisted(() => vi.fn(async () => ''));
const showItemInFolderSpy = vi.hoisted(() => vi.fn());

vi.mock('electron', () => ({
    ipcMain: { handle: ipcHandleSpy },
    shell: {
        openPath: openPathSpy,
        showItemInFolder: showItemInFolderSpy
    }
}));

vi.mock('../electron/i18n/mainI18n', () => ({
    translateMainError: (key: string) => key
}));

import { registerLocalFilesHandlers } from '../electron/ipc/localFilesHandlers';
import type { IpcHandlerDeps } from '../electron/ipc/types';

describe('localFilesHandlers', () => {
    let outputDir = '';
    let handlers = new Map<string, (...args: unknown[]) => Promise<unknown>>();

    const mockDeps = {
        getSettings: vi.fn(() => ({ outputDir })),
        isValidIpcSender: vi.fn(() => true)
    } as unknown as IpcHandlerDeps;

    beforeEach(async () => {
        outputDir = await mkdtemp(join(tmpdir(), 'kajo-local-files-'));
        handlers = new Map();
        ipcHandleSpy.mockImplementation(
            (channel: string, handler: (...args: unknown[]) => unknown) => {
                handlers.set(channel, handler as (...args: unknown[]) => Promise<unknown>);
            }
        );
        openPathSpy.mockReset().mockResolvedValue('');
        showItemInFolderSpy.mockReset();
        registerLocalFilesHandlers(mockDeps);
    });

    afterEach(async () => {
        await rm(outputDir, { recursive: true, force: true });
        vi.clearAllMocks();
    });

    it('openPath rejects files outside outputDir', async () => {
        const handler = handlers.get(IPC_INVOKE.localFilesOpenPath);
        const result = await handler?.({}, '/etc/hosts.mp4');
        expect(result).toEqual({
            ok: false,
            code: IPC_ERROR_CODES.invalidPayload,
            message: 'invalidRendererRequest'
        });
        expect(openPathSpy).not.toHaveBeenCalled();
    });

    it('openPath opens media files under outputDir', async () => {
        const file = join(outputDir, 'clip.mp4');
        await writeFile(file, 'x');
        const handler = handlers.get(IPC_INVOKE.localFilesOpenPath);
        await expect(handler?.({}, file)).resolves.toBe(true);
        expect(openPathSpy).toHaveBeenCalledWith(file);
    });

    it('revealPath rejects paths outside outputDir', async () => {
        const handler = handlers.get(IPC_INVOKE.localFilesRevealPath);
        const result = await handler?.({}, '/tmp/outside.mp4');
        expect(result).toEqual({
            ok: false,
            code: IPC_ERROR_CODES.invalidPayload,
            message: 'invalidRendererRequest'
        });
        expect(showItemInFolderSpy).not.toHaveBeenCalled();
    });

    it('revealPath reveals media files under outputDir', async () => {
        const file = join(outputDir, 'clip.mkv');
        await writeFile(file, 'x');
        const handler = handlers.get(IPC_INVOKE.localFilesRevealPath);
        await expect(handler?.({}, file)).resolves.toBe(true);
        expect(showItemInFolderSpy).toHaveBeenCalledWith(file);
    });
});
