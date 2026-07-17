/** Standard codes for structured IPC / validation failures (renderer-safe). */
export const IPC_ERROR_CODES = {
    invalidPayload: 'ipc_invalid_payload',
    invalidSender: 'invalid_sender',
    rateLimited: 'ipc_rate_limited'
} as const;

export type IpcErrorCode = (typeof IPC_ERROR_CODES)[keyof typeof IPC_ERROR_CODES];

const IPC_ERROR_CODE_SET = new Set<string>(Object.values(IPC_ERROR_CODES));

export type IpcResult<T> =
    | { ok: true; data: T }
    | { ok: false; code: IpcErrorCode; message: string };

/** Wire format for IPC-level failures (distinct from domain `{ ok: false, error: string }`). */
export type IpcFailureEnvelope = Extract<IpcResult<never>, { ok: false }>;

export function isIpcFailureEnvelope(value: unknown): value is IpcFailureEnvelope {
    if (value === null || typeof value !== 'object') {
        return false;
    }
    const o = value as Record<string, unknown>;
    return (
        o.ok === false &&
        typeof o.code === 'string' &&
        IPC_ERROR_CODE_SET.has(o.code) &&
        typeof o.message === 'string'
    );
}

export function ipcFail(code: IpcErrorCode, message: string): IpcFailureEnvelope {
    return { ok: false, code, message };
}

/** Prefix for preload-side IPC invoke timeouts (renderer maps these to user-facing copy). */
export const IPC_INVOKE_TIMEOUT_ERROR_PREFIX = 'IPC_INVOKE_TIMEOUT:';

export function createIpcInvokeTimeoutError(channel: string): Error {
    return new Error(`${IPC_INVOKE_TIMEOUT_ERROR_PREFIX}${channel}`);
}

export function isIpcInvokeTimeoutError(cause: unknown): boolean {
    return cause instanceof Error && cause.message.startsWith(IPC_INVOKE_TIMEOUT_ERROR_PREFIX);
}
