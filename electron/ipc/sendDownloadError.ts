import type { WebContents } from 'electron';
import { IPC_MAIN_TO_RENDERER } from '../../src/shared/ipcChannels';
import {
    type DownloadErrorPayload,
    downloadErrorPayloadSchema
} from '../../src/shared/ipcPayloadSchemas';
import { safeSend } from '../mainHelpers';

/** Validate and push a main→renderer download error (failure or user cancellation). */
export function sendDownloadError(webContents: WebContents, payload: DownloadErrorPayload): void {
    safeSend(
        webContents,
        IPC_MAIN_TO_RENDERER.downloadError,
        downloadErrorPayloadSchema.parse(payload)
    );
}
