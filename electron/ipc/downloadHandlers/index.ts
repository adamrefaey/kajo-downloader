import type { IpcHandlerDeps } from '../types';
import { registerHistoryHandlers } from './historyHandlers';
import { registerMetadataHandler } from './metadataHandler';
import { registerPlaylistInfoHandlers } from './playlistInfoHandler';
import { registerStartDownloadHandlers } from './startDownloadHandler';
import { registerVideoInfoHandler } from './videoInfoHandler';

export function registerDownloadHandlers(deps: IpcHandlerDeps): void {
    registerVideoInfoHandler(deps);
    registerPlaylistInfoHandlers(deps);
    registerMetadataHandler(deps);
    registerStartDownloadHandlers(deps);
    registerHistoryHandlers(deps);
}
