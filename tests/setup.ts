import * as matchers from '@testing-library/jest-dom/matchers';
import { cleanup } from '@testing-library/react';
import { afterEach, beforeAll, expect, vi } from 'vitest';
import { initRendererI18n } from '../src/i18n/rendererI18n';

/** jsdom does not implement Element scroll APIs that virtualized lists (TanStack Virtual) call. */
if (typeof Element !== 'undefined') {
    Element.prototype.scrollTo = vi.fn();
    Element.prototype.scrollIntoView = vi.fn();
}

/** jsdom emits `jsdomError` via the virtual console to stderr; Vitest does not route it through `onConsoleLog`. */
const stderrWrite = process.stderr.write.bind(process.stderr);
process.stderr.write = (
    chunk: string | Uint8Array,
    encodingOrCb?: BufferEncoding | ((err?: Error | null) => void),
    cb?: (err?: Error | null) => void
): boolean => {
    const text = typeof chunk === 'string' ? chunk : Buffer.from(chunk).toString();
    if (text.includes('Not implemented: navigation to another Document')) {
        if (typeof encodingOrCb === 'function') {
            encodingOrCb();
        } else if (typeof cb === 'function') {
            cb();
        }
        return true;
    }
    if (typeof encodingOrCb === 'function') {
        return stderrWrite(chunk, encodingOrCb);
    }
    if (encodingOrCb !== undefined && cb !== undefined) {
        return stderrWrite(chunk, encodingOrCb, cb);
    }
    if (encodingOrCb !== undefined) {
        return stderrWrite(chunk, encodingOrCb);
    }
    return stderrWrite(chunk);
};

/** Module namespace objects from `import *` must not be passed directly to `expect.extend` (Vitest 4 / Chai: `callCount` getter error). */
expect.extend({ ...matchers });

beforeAll(async () => {
    await initRendererI18n('en');
});

afterEach(() => {
    if (typeof document !== 'undefined') {
        cleanup();
    }
});
