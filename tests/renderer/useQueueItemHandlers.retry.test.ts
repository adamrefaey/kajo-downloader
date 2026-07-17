/** @vitest-environment jsdom */

import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useQueueItemHandlers } from '../../src/renderer/src/app/controller/useQueueItemHandlers';
import { useDownloadStore } from '../../src/store/downloadStore';

describe('useQueueItemHandlers retry', () => {
    beforeEach(() => {
        useDownloadStore.persist.clearStorage();
        useDownloadStore.setState({ queue: [] });
    });

    it('handleRetryDownload resets error rows to pending for auto-resume', async () => {
        const id = useDownloadStore.getState().addDownload({
            url: 'https://example.com/v',
            formatId: 'best',
            outputDir: '/downloads'
        });
        useDownloadStore.getState().updateDownload(id, {
            state: 'error',
            errorMessage: 'Network error',
            progressPercent: 42,
            speed: '1MiB/s',
            eta: '00:10',
            reservedOutputPath: '/downloads/v.mp4'
        });

        const { result } = renderHook(() =>
            useQueueItemHandlers({
                updateDownload: useDownloadStore.getState().updateDownload,
                startInFlightRef: { current: new Set() },
                pauseInFlightRef: { current: new Set() },
                resumeInFlightRef: { current: new Set() },
                removeDuringStartRef: { current: new Set() },
                removeDownloadState: useDownloadStore.getState().removeDownload,
                pauseDownloadWithReason: vi.fn(),
                resumeDownloadFromPause: vi.fn()
            })
        );

        await act(async () => {
            await result.current.handleRetryDownload(id);
        });

        const item = useDownloadStore.getState().queue.find((row) => row.id === id);
        expect(item?.state).toBe('pending');
        expect(item?.errorMessage).toBeUndefined();
        expect(item?.progressPercent).toBe(42);
        expect(item?.reservedOutputPath).toBe('/downloads/v.mp4');
    });
});
