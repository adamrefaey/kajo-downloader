import type { WebContents } from 'electron';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
    emitProgressNow,
    emitProgressThrottled,
    lastProgressEmitAt,
    progressFlushTimers,
    queuedProgressPayloads,
    shouldSkipProgressEmit
} from '../electron/services/ytdlp/progressParser';

vi.mock('../electron/mainHelpers', () => ({
    safeSend: vi.fn()
}));

import { safeSend } from '../electron/mainHelpers';

describe('progressParser emit helpers', () => {
    const webContents = {} as WebContents;
    const payload = {
        percent: 10,
        size: '1 MB',
        speed: '100 KB/s',
        eta: '0:30',
        totalSize: '10 MB',
        totalSizeBytes: 10_000_000
    };

    beforeEach(() => {
        vi.useFakeTimers();
        lastProgressEmitAt.clear();
        progressFlushTimers.clear();
        queuedProgressPayloads.clear();
        vi.mocked(safeSend).mockClear();
    });

    afterEach(() => {
        vi.useRealTimers();
    });

    it('shouldSkipProgressEmit compares tenths of percent and display fields', () => {
        queuedProgressPayloads.set('d1', payload);
        expect(shouldSkipProgressEmit('d1', payload)).toBe(true);
        expect(shouldSkipProgressEmit('d1', { ...payload, percent: 10.04 })).toBe(true);
        expect(shouldSkipProgressEmit('d1', { ...payload, percent: 11 })).toBe(false);
        expect(shouldSkipProgressEmit('d2', payload)).toBe(false);
    });

    it('emitProgressNow sends IPC and records timestamps', () => {
        emitProgressNow(webContents, 'd1', payload);
        expect(safeSend).toHaveBeenCalledTimes(1);
        expect(lastProgressEmitAt.get('d1')).toBeTypeOf('number');
    });

    it('emitProgressThrottled emits immediately when interval elapsed', () => {
        lastProgressEmitAt.delete('d1');
        emitProgressThrottled(webContents, 'd1', payload);
        expect(safeSend).toHaveBeenCalledTimes(1);
    });

    it('emitProgressThrottled queues and flushes after delay', () => {
        lastProgressEmitAt.set('d1', Date.now());
        emitProgressThrottled(webContents, 'd1', payload);
        expect(safeSend).not.toHaveBeenCalled();
        vi.advanceTimersByTime(250);
        expect(safeSend).toHaveBeenCalledTimes(1);
    });

    it('emitProgressThrottled skips duplicate payloads', () => {
        queuedProgressPayloads.set('d1', payload);
        lastProgressEmitAt.set('d1', Date.now());
        emitProgressThrottled(webContents, 'd1', payload);
        expect(progressFlushTimers.has('d1')).toBe(false);
    });

    it('emitProgressThrottled no-ops when a flush timer is already scheduled', () => {
        lastProgressEmitAt.set('d1', Date.now());
        progressFlushTimers.set(
            'd1',
            setTimeout(() => {}, 60_000)
        );
        emitProgressThrottled(webContents, 'd1', { ...payload, percent: 20 });
        expect(safeSend).not.toHaveBeenCalled();
    });

    it('scheduled flush exits when queued payload was cleared', () => {
        lastProgressEmitAt.set('d1', Date.now());
        emitProgressThrottled(webContents, 'd1', payload);
        queuedProgressPayloads.delete('d1');
        vi.advanceTimersByTime(250);
        expect(safeSend).not.toHaveBeenCalled();
    });
});
