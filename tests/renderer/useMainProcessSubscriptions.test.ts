/** @vitest-environment jsdom */

import { renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useMainProcessSubscriptions } from '../../src/renderer/src/app/useMainProcessSubscriptions';
import { useDownloadStore } from '../../src/store/downloadStore';

describe('useMainProcessSubscriptions download errors', () => {
    let errorCallback:
        | ((payload: { downloadId: string; message: string; cancelled?: boolean }) => void)
        | undefined;

    beforeEach(() => {
        errorCallback = undefined;
        useDownloadStore.persist.clearStorage();
        useDownloadStore.setState({ queue: [] });

        window.api = {
            onDownloadProgress: vi.fn(() => () => {}),
            onDownloadComplete: vi.fn(() => () => {}),
            onDownloadError: vi.fn((cb) => {
                errorCallback = cb;
                return () => {};
            }),
            onDownloadStateChange: vi.fn(() => () => {}),
            onVideoInfoThumbnail: vi.fn(() => () => {}),
            onClipboardUrlDetected: vi.fn(() => () => {}),
            onSetupLog: vi.fn(() => () => {}),
            onSetupComplete: vi.fn(() => () => {}),
            checkDownloadFilePaths: vi.fn().mockResolvedValue([])
        } as unknown as typeof window.api;
    });

    it('marks rows cancelled only when the explicit cancelled flag is set', () => {
        const id = useDownloadStore.getState().addDownload({
            url: 'https://example.com/v',
            formatId: 'best',
            outputDir: '/downloads'
        });
        useDownloadStore.getState().updateDownload(id, { state: 'downloading' });

        renderHook(() =>
            useMainProcessSubscriptions({
                updateDownloadProgress: useDownloadStore.getState().updateDownloadProgress,
                completeDownload: useDownloadStore.getState().completeDownload,
                cancelDownloadState: useDownloadStore.getState().cancelDownload,
                updateDownload: useDownloadStore.getState().updateDownload,
                removeDownload: useDownloadStore.getState().removeDownload,
                setVideoInfo: vi.fn(),
                setUrl: vi.fn(),
                setClipboardHint: vi.fn(),
                setError: vi.fn()
            })
        );

        errorCallback?.({
            downloadId: id,
            message: 'Download cancelled',
            cancelled: true
        });

        const item = useDownloadStore.getState().queue.find((row) => row.id === id);
        expect(item?.state).toBe('cancelled');
    });

    it('does not treat messages containing "cancel" as cancellation without the flag', () => {
        const id = useDownloadStore.getState().addDownload({
            url: 'https://example.com/v',
            formatId: 'best',
            outputDir: '/downloads'
        });
        useDownloadStore.getState().updateDownload(id, { state: 'downloading' });

        renderHook(() =>
            useMainProcessSubscriptions({
                updateDownloadProgress: useDownloadStore.getState().updateDownloadProgress,
                completeDownload: useDownloadStore.getState().completeDownload,
                cancelDownloadState: useDownloadStore.getState().cancelDownload,
                updateDownload: useDownloadStore.getState().updateDownload,
                removeDownload: useDownloadStore.getState().removeDownload,
                setVideoInfo: vi.fn(),
                setUrl: vi.fn(),
                setClipboardHint: vi.fn(),
                setError: vi.fn()
            })
        );

        errorCallback?.({
            downloadId: id,
            message: 'User cancelled subscription renewal failed'
        });

        const item = useDownloadStore.getState().queue.find((row) => row.id === id);
        expect(item?.state).toBe('error');
        expect(item?.errorMessage).toBe('User cancelled subscription renewal failed');
    });

    it('ignores error pushes for paused rows', () => {
        const id = useDownloadStore.getState().addDownload({
            url: 'https://example.com/v',
            formatId: 'best',
            outputDir: '/downloads'
        });
        useDownloadStore.getState().updateDownload(id, {
            state: 'paused',
            pauseReason: 'manual',
            progressPercent: 33
        });

        renderHook(() =>
            useMainProcessSubscriptions({
                updateDownloadProgress: useDownloadStore.getState().updateDownloadProgress,
                completeDownload: useDownloadStore.getState().completeDownload,
                cancelDownloadState: useDownloadStore.getState().cancelDownload,
                updateDownload: useDownloadStore.getState().updateDownload,
                removeDownload: useDownloadStore.getState().removeDownload,
                setVideoInfo: vi.fn(),
                setUrl: vi.fn(),
                setClipboardHint: vi.fn(),
                setError: vi.fn()
            })
        );

        errorCallback?.({
            downloadId: id,
            message: 'Network error'
        });

        const item = useDownloadStore.getState().queue.find((row) => row.id === id);
        expect(item?.state).toBe('paused');
        expect(item?.pauseReason).toBe('manual');
        expect(item?.progressPercent).toBe(33);
    });
});
