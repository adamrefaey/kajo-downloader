import type { IpcFailureEnvelope } from '../src/shared/ipcErrors';
import { isIpcFailureEnvelope } from '../src/shared/ipcErrors';

/** If `value` is an IPC failure envelope, narrows the type (no side effects). */
export function recordIfIpcFailureEnvelope(value: unknown): value is IpcFailureEnvelope {
    return isIpcFailureEnvelope(value);
}

export type InvokeFailureMap = 'passthrough' | 'null' | 'false' | 'void' | 'empty-array';

export function mapInvokeResult<T>(raw: unknown, onFailure: InvokeFailureMap): T {
    if (recordIfIpcFailureEnvelope(raw)) {
        if (onFailure === 'passthrough') {
            return raw as T;
        }
        if (onFailure === 'null') {
            return null as T;
        }
        if (onFailure === 'false') {
            return false as T;
        }
        if (onFailure === 'void') {
            return undefined as T;
        }
        if (onFailure === 'empty-array') {
            return [] as T;
        }
    }
    return raw as T;
}
