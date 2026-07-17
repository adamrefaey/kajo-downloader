import type { IpcRenderer } from 'electron';

export function onChannel<T>(
    ipcRenderer: Pick<IpcRenderer, 'on' | 'off'>,
    channel: string,
    callback: (payload: T) => void
): () => void {
    const handler = (_event: Electron.IpcRendererEvent, payload: T): void => callback(payload);
    ipcRenderer.on(channel, handler);
    return () => {
        ipcRenderer.off(channel, handler);
    };
}

export function onSignalChannel(
    ipcRenderer: Pick<IpcRenderer, 'on' | 'off'>,
    channel: string,
    callback: () => void
): () => void {
    const handler = (): void => callback();
    ipcRenderer.on(channel, handler);
    return () => {
        ipcRenderer.off(channel, handler);
    };
}
