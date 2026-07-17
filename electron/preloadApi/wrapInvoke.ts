import type { IpcRenderer } from 'electron';
import { IPC_INVOKE } from '../../src/shared/ipcChannels';
import { createIpcInvokeTimeoutError } from '../../src/shared/ipcErrors';
import {
    type InvokeFailureMap,
    mapInvokeResult,
    recordIfIpcFailureEnvelope
} from '../preloadInvokeMapping';

export { recordIfIpcFailureEnvelope };

const DEFAULT_IPC_TIMEOUT_MS = 30_000;
const LONG_IPC_TIMEOUT_MS = 120_000;

/**
 * Channels that may take up to 2 minutes: media fetches, in-app search,
 * downloads, and installation.
 */
const LONG_TIMEOUT_CHANNELS = new Set<string>([
    IPC_INVOKE.downloadFetchVideoInfo,
    IPC_INVOKE.downloadFetchPlaylistInfo,
    IPC_INVOKE.downloadMetadataResolveUrl,
    IPC_INVOKE.downloadStart,
    IPC_INVOKE.setupInstallYtdlp,
    IPC_INVOKE.youtubeSearch
]);

function ipcWithTimeout<T>(promise: Promise<T>, ms: number, channel: string): Promise<T> {
    const { promise: result, resolve, reject } = Promise.withResolvers<T>();
    /* v8 ignore start — timeout callback only fires after 30-120s; not exercised in unit tests */
    const timer = setTimeout(() => reject(createIpcInvokeTimeoutError(channel)), ms);
    /* v8 ignore stop */
    promise.then(
        (value) => {
            clearTimeout(timer);
            resolve(value);
        },
        (err: unknown) => {
            clearTimeout(timer);
            reject(err);
        }
    );
    return result;
}

/** IPC calls taking longer than this threshold emit a `kajo:slow-ipc` window event. */
const SLOW_IPC_THRESHOLD_MS = 5_000;

export function wrapInvoke<T>(
    ipcRenderer: Pick<IpcRenderer, 'invoke'>,
    mode: InvokeFailureMap,
    channel: string,
    ...args: unknown[]
): Promise<T> {
    const timeoutMs = LONG_TIMEOUT_CHANNELS.has(channel)
        ? LONG_IPC_TIMEOUT_MS
        : DEFAULT_IPC_TIMEOUT_MS;
    const invoke = ipcRenderer
        .invoke(channel, ...args)
        .then((raw) => mapInvokeResult<T>(raw, mode));

    // Slow-IPC detection: emit a window event after the threshold so the renderer
    // can show a subtle loading indicator.
    /* v8 ignore start — slow-IPC timer only fires after 5s; not exercised in unit tests */
    if (typeof window !== 'undefined') {
        let didTriggerSlow = false;
        const slowTimer = setTimeout(() => {
            didTriggerSlow = true;
            window.dispatchEvent(new CustomEvent('kajo:slow-ipc', { detail: { channel } }));
        }, SLOW_IPC_THRESHOLD_MS);
        const disarmSlow = (): void => {
            clearTimeout(slowTimer);
            if (didTriggerSlow) {
                window.dispatchEvent(new CustomEvent('kajo:slow-ipc-done'));
            }
        };
        invoke.then(disarmSlow, disarmSlow);
    }
    /* v8 ignore stop */

    return ipcWithTimeout(invoke, timeoutMs, channel);
}
