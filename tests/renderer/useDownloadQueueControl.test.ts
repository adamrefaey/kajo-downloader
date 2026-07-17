/** @vitest-environment jsdom */

import { act, renderHook } from '@testing-library/react';
import type { TFunction } from 'i18next';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useDownloadQueueControl } from '../../src/renderer/src/app/controller/useDownloadQueueControl';
import { useDownloadStore } from '../../src/store/downloadStore';

describe('useDownloadQueueControl', () => {
    beforeEach(() => {
        useDownloadStore.persist.clearStorage();
        useDownloadStore.setState({ queue: [] });
        window.api = {
            pauseDownload: vi.fn().mockResolvedValue(true),
            resumeDownload: vi.fn().mockResolvedValue(false),
            startDownload: vi.fn()
        } as unknown as typeof window.api;
    });

    it('pauses pending downloads in the renderer store without IPC', async () => {
        const downloadId = useDownloadStore.getState().addDownload({
            url: 'https://youtu.be/x',
            formatId: 'best',
            outputDir: '/downloads',
            outputTemplate: '%(title)s.%(ext)s'
        });

        const { result } = renderHook(() =>
            useDownloadQueueControl({
                t: ((key: string) => key) as unknown as TFunction,
                updateDownload: useDownloadStore.getState().updateDownload
            })
        );

        await act(async () => {
            await result.current.pauseDownloadWithReason(downloadId, 'manual');
        });

        const item = useDownloadStore.getState().queue.find((row) => row.id === downloadId);
        expect(item?.state).toBe('paused');
        expect(item?.pauseReason).toBe('manual');
        expect(window.api.pauseDownload).not.toHaveBeenCalled();
    });
});
