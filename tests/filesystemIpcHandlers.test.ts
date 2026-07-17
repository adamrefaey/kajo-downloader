import { access, mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { IPC_INVOKE } from '../src/shared/ipcChannels';
import { IPC_ERROR_CODES } from '../src/shared/ipcErrors';

const ipcHandleSpy = vi.hoisted(() => vi.fn());

vi.mock('electron', () => ({
    ipcMain: { handle: ipcHandleSpy },
    app: {
        getPath: vi.fn(() => '/tmp'),
        isPackaged: false,
        getAppPath: vi.fn(() => '/'),
        getLocale: vi.fn(() => 'en-US'),
        on: vi.fn(),
        isReady: vi.fn(() => true)
    },
    BrowserWindow: class MockBrowserWindow {
        static fromWebContents = vi.fn().mockReturnValue(null);
        isDestroyed = vi.fn().mockReturnValue(false);
    }
}));

vi.mock('../electron/i18n/mainI18n', () => ({
    translateMainError: (key: string) => key
}));

vi.mock('../electron/services/desktopNotifications', () => ({
    notifyDownloadComplete: vi.fn(),
    notifyDownloadError: vi.fn()
}));

vi.mock('../electron/services/historyArchive', () => ({
    appendDownloadHistoryEvent: vi.fn()
}));

vi.mock('../electron/ipc/rateLimiter', () => ({
    tryConsumeIpcRateLimitSlot: vi.fn(() => true)
}));

import { registerStartDownloadHandlers } from '../electron/ipc/downloadHandlers/startDownloadHandler';
import type { IpcHandlerDeps } from '../electron/ipc/types';

describe('filesystem IPC handlers', () => {
    let outputDir = '';
    let handlers = new Map<string, (...args: unknown[]) => Promise<unknown>>();

    const loadYtdlpService = vi.fn(async () => ({}) as never);
    const mockDeps = {
        getSettings: vi.fn(() => ({ outputDir })),
        isValidIpcSender: vi.fn(() => true),
        loadYtdlpService,
        resolveEffectiveOutputTemplate: vi.fn(() => '%(title)s.%(ext)s'),
        resolveFetchMetadataOptions: vi.fn(async () => ({}))
    } as unknown as IpcHandlerDeps;

    const mockEvent = { sender: { isDestroyed: () => false } };

    beforeEach(async () => {
        outputDir = await mkdtemp(join(tmpdir(), 'kajo-fs-ipc-'));
        handlers = new Map();
        ipcHandleSpy.mockImplementation(
            (channel: string, handler: (...args: unknown[]) => unknown) => {
                handlers.set(channel, handler as (...args: unknown[]) => Promise<unknown>);
            }
        );
        registerStartDownloadHandlers(mockDeps);
    });

    afterEach(async () => {
        await rm(outputDir, { recursive: true, force: true });
        vi.clearAllMocks();
    });

    it('cleanupEmptyBatchDirs accepts empty array', async () => {
        const handler = handlers.get(IPC_INVOKE.downloadCleanupEmptyBatchDirs);
        await expect(handler?.(mockEvent, [])).resolves.toBeUndefined();
    });

    it('cleanupEmptyBatchDirs rejects invalid payload', async () => {
        const handler = handlers.get(IPC_INVOKE.downloadCleanupEmptyBatchDirs);
        const result = await handler?.(mockEvent, 'not-an-array');
        expect(result).toEqual({
            ok: false,
            code: IPC_ERROR_CODES.invalidPayload,
            message: 'invalidRendererRequest'
        });
    });

    it('cleanupEmptyBatchDirs rejects paths outside outputDir', async () => {
        const handler = handlers.get(IPC_INVOKE.downloadCleanupEmptyBatchDirs);
        const result = await handler?.(mockEvent, ['/etc/passwd']);
        expect(result).toEqual({
            ok: false,
            code: IPC_ERROR_CODES.invalidPayload,
            message: 'invalidRendererRequest'
        });
    });

    it('cleanupEmptyBatchDirs removes empty dirs under outputDir but keeps the root', async () => {
        const nested = join(outputDir, 'playlist-empty');
        await mkdir(nested, { recursive: true });
        const handler = handlers.get(IPC_INVOKE.downloadCleanupEmptyBatchDirs);
        await handler?.(mockEvent, [nested]);
        // Nested batch dir is gone; configured download root must remain.
        await expect(access(nested)).rejects.toThrow();
        await expect(access(outputDir)).resolves.toBeUndefined();
    });

    it('checkDownloadFilePaths accepts empty array', async () => {
        const handler = handlers.get(IPC_INVOKE.downloadCheckFilePaths);
        await expect(handler?.(mockEvent, [])).resolves.toEqual([]);
    });

    it('checkDownloadFilePaths rejects invalid payload', async () => {
        const handler = handlers.get(IPC_INVOKE.downloadCheckFilePaths);
        const result = await handler?.(mockEvent, [{ id: '', filePath: '/x' }]);
        expect(result).toEqual({
            ok: false,
            code: IPC_ERROR_CODES.invalidPayload,
            message: 'invalidRendererRequest'
        });
    });

    it('checkDownloadFilePaths rejects paths outside outputDir', async () => {
        const handler = handlers.get(IPC_INVOKE.downloadCheckFilePaths);
        const result = await handler?.(mockEvent, [{ id: 'd1', filePath: '/etc/passwd' }]);
        expect(result).toEqual({
            ok: false,
            code: IPC_ERROR_CODES.invalidPayload,
            message: 'invalidRendererRequest'
        });
    });

    it('checkDownloadFilePaths returns stale ids for missing files under outputDir', async () => {
        const missing = join(outputDir, 'gone.mp4');
        const present = join(outputDir, 'here.mp4');
        await writeFile(present, 'x');
        const handler = handlers.get(IPC_INVOKE.downloadCheckFilePaths);
        const staleIds = await handler?.(mockEvent, [
            { id: 'missing', filePath: missing },
            { id: 'present', filePath: present }
        ]);
        expect(staleIds).toEqual(['missing']);
        expect(resolve(present)).toBe(resolve(present));
    });

    it('startDownload rejects outputDir outside settings outputDir', async () => {
        const startDownload = vi.fn();
        loadYtdlpService.mockResolvedValue({ startDownload } as never);
        const handler = handlers.get(IPC_INVOKE.downloadStart);
        const result = await handler?.(mockEvent, {
            url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
            formatId: 'best',
            outputDir: '/etc'
        });
        expect(result).toEqual({
            ok: false,
            code: IPC_ERROR_CODES.invalidPayload,
            message: 'invalidRendererRequest'
        });
        expect(startDownload).not.toHaveBeenCalled();
    });

    it('cleanupArtifacts rejects paths outside settings outputDir', async () => {
        const cleanup = vi.fn();
        loadYtdlpService.mockResolvedValue({
            cleanupDownloadArtifactsForQueuedRemoval: cleanup
        } as never);
        const handler = handlers.get(IPC_INVOKE.downloadCleanupArtifacts);
        const result = await handler?.(mockEvent, {
            downloadId: 'd1',
            outputDir: '/etc',
            reservedOutputPath: '/etc/passwd'
        });
        expect(result).toEqual({
            ok: false,
            code: IPC_ERROR_CODES.invalidPayload,
            message: 'invalidRendererRequest'
        });
        expect(cleanup).not.toHaveBeenCalled();
    });

    it('cleanupArtifacts rejects reserved path outside outputDir even when outputDir is valid', async () => {
        const cleanup = vi.fn();
        loadYtdlpService.mockResolvedValue({
            cleanupDownloadArtifactsForQueuedRemoval: cleanup
        } as never);
        const handler = handlers.get(IPC_INVOKE.downloadCleanupArtifacts);
        const result = await handler?.(mockEvent, {
            downloadId: 'd1',
            outputDir,
            reservedOutputPath: '/tmp/outside-kajo.mp4'
        });
        expect(result).toEqual({
            ok: false,
            code: IPC_ERROR_CODES.invalidPayload,
            message: 'invalidRendererRequest'
        });
        expect(cleanup).not.toHaveBeenCalled();
    });

    it('cleanupArtifacts calls engine when all paths are under outputDir', async () => {
        const cleanup = vi.fn().mockResolvedValue(undefined);
        loadYtdlpService.mockResolvedValue({
            cleanupDownloadArtifactsForQueuedRemoval: cleanup
        } as never);
        const reserved = join(outputDir, 'clip.mp4');
        const handler = handlers.get(IPC_INVOKE.downloadCleanupArtifacts);
        await expect(
            handler?.(mockEvent, {
                downloadId: 'd1',
                outputDir,
                reservedOutputPath: reserved,
                audioOnly: false
            })
        ).resolves.toBeUndefined();
        expect(cleanup).toHaveBeenCalledWith({
            downloadId: 'd1',
            outputDir: resolve(outputDir),
            audioOnly: false,
            reservedOutputPath: reserved,
            partialFilePath: null
        });
    });
});
