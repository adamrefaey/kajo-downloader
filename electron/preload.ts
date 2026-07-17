import { contextBridge, ipcRenderer } from 'electron';
import { createRendererApi, type RendererApi } from './preloadApi';

function exposePreloadApi(api: RendererApi): void {
    if (!process.contextIsolated) {
        throw new Error(
            'Context isolation must be enabled. Refusing to expose preload API without it.'
        );
    }
    try {
        contextBridge.exposeInMainWorld('api', api);
    } catch (error) {
        console.error(error);
        // A window without `window.api` is unusable — fail hard so we never limp along.
        throw error instanceof Error ? error : new Error(String(error));
    }
}

exposePreloadApi(createRendererApi(ipcRenderer, process.platform));
