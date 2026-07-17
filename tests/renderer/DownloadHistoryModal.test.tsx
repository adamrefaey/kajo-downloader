/** @vitest-environment jsdom */

import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import DownloadHistoryModal from '../../src/renderer/src/components/DownloadHistoryModal';
import type { DownloadHistoryEntry } from '../../src/types';

const SAMPLE_ENTRY: DownloadHistoryEntry = {
    id: 'hist-1',
    downloadId: 'dl-1',
    url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
    title: 'Never Gonna Give You Up',
    status: 'complete',
    filePath: '/downloads/rick.mp4',
    errorMessage: null,
    queuedAtMs: 1_700_000_000_000,
    completedAtMs: 1_700_000_100_000
};

function buildHistoryApi(entries: DownloadHistoryEntry[] = [SAMPLE_ENTRY]) {
    return {
        list: vi.fn().mockResolvedValue(entries),
        total: vi.fn().mockResolvedValue(entries.length),
        clear: vi.fn().mockResolvedValue(true)
    };
}

describe('DownloadHistoryModal', () => {
    const onClose = vi.fn();
    const prependDownloads = vi.fn();
    const onOpenFile = vi.fn();
    const onRevealFile = vi.fn();

    beforeEach(() => {
        onClose.mockReset();
        prependDownloads.mockReset();
        onOpenFile.mockReset();
        onRevealFile.mockReset();
        vi.stubGlobal(
            'confirm',
            vi.fn(() => true)
        );
    });

    afterEach(() => {
        Reflect.deleteProperty(window, 'api');
        vi.unstubAllGlobals();
    });

    it('lists history entries when open', async () => {
        window.api = {
            downloadHistory: buildHistoryApi()
        } as unknown as Window['api'];

        render(
            <DownloadHistoryModal
                open
                onClose={onClose}
                outputDir="/downloads"
                preferredQuality={1080}
                prependDownloads={prependDownloads}
                onOpenFile={onOpenFile}
                onRevealFile={onRevealFile}
            />
        );

        expect(await screen.findByText('Never Gonna Give You Up')).toBeInTheDocument();
        expect(window.api.downloadHistory.list).toHaveBeenCalledWith({ limit: 20, offset: 0 });
        expect(window.api.downloadHistory.total).toHaveBeenCalled();
        expect(screen.getByText(/1 entry/i)).toBeInTheDocument();
    });

    it('clears history after confirm', async () => {
        window.api = {
            downloadHistory: buildHistoryApi()
        } as unknown as Window['api'];
        const user = userEvent.setup();

        render(
            <DownloadHistoryModal
                open
                onClose={onClose}
                outputDir="/downloads"
                preferredQuality={1080}
                prependDownloads={prependDownloads}
                onOpenFile={onOpenFile}
                onRevealFile={onRevealFile}
            />
        );

        await screen.findByText('Never Gonna Give You Up');
        await user.click(screen.getByRole('button', { name: /Clear history/i }));

        await waitFor(() => {
            expect(window.api.downloadHistory.clear).toHaveBeenCalled();
        });
        expect(screen.getByText(/No completed downloads yet/i)).toBeInTheDocument();
    });

    it('opens completed file from row action', async () => {
        window.api = {
            downloadHistory: buildHistoryApi()
        } as unknown as Window['api'];
        const user = userEvent.setup();

        render(
            <DownloadHistoryModal
                open
                onClose={onClose}
                outputDir="/downloads"
                preferredQuality={1080}
                prependDownloads={prependDownloads}
                onOpenFile={onOpenFile}
                onRevealFile={onRevealFile}
            />
        );

        await screen.findByText('Never Gonna Give You Up');
        await user.click(screen.getByRole('button', { name: /Open in default app/i }));

        expect(onOpenFile).toHaveBeenCalledWith('/downloads/rick.mp4');
    });

    it('shows empty state when there are no entries', async () => {
        window.api = {
            downloadHistory: buildHistoryApi([])
        } as unknown as Window['api'];

        render(
            <DownloadHistoryModal
                open
                onClose={onClose}
                outputDir="/downloads"
                preferredQuality={1080}
                prependDownloads={prependDownloads}
                onOpenFile={onOpenFile}
                onRevealFile={onRevealFile}
            />
        );

        expect(await screen.findByText(/No completed downloads yet/i)).toBeInTheDocument();
    });
});
