import type { WebContents } from 'electron';
import { describe, expect, it, vi } from 'vitest';
import { sendDownloadError } from '../electron/ipc/sendDownloadError';
import { IPC_MAIN_TO_RENDERER } from '../src/shared/ipcChannels';

describe('sendDownloadError', () => {
    it('validates and forwards download:error payloads', () => {
        const send = vi.fn();
        const webContents = { send, isDestroyed: () => false } as unknown as WebContents;

        sendDownloadError(webContents, {
            downloadId: 'dl-1',
            message: 'Network error'
        });

        expect(send).toHaveBeenCalledWith(IPC_MAIN_TO_RENDERER.downloadError, {
            downloadId: 'dl-1',
            message: 'Network error'
        });
    });

    it('includes cancelled when the user explicitly cancelled', () => {
        const send = vi.fn();
        const webContents = { send, isDestroyed: () => false } as unknown as WebContents;

        sendDownloadError(webContents, {
            downloadId: 'dl-2',
            message: 'Download cancelled',
            cancelled: true
        });

        expect(send).toHaveBeenCalledWith(IPC_MAIN_TO_RENDERER.downloadError, {
            downloadId: 'dl-2',
            message: 'Download cancelled',
            cancelled: true
        });
    });
});
