/** @vitest-environment jsdom */

import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ActionIcon, type ActionIconName } from '../../src/renderer/src/components/ActionIcon';
import DownloadItem from '../../src/renderer/src/components/DownloadItem';
import downloadItemStyles from '../../src/renderer/src/components/DownloadItem.module.css';
import { usePlatformStore } from '../../src/store/platformStore';
import type { DownloadItem as DownloadItemModel } from '../../src/types';

const base = {
    id: '1',
    url: 'https://youtu.be/x',
    formatId: 'best',
    outputDir: '/o',
    createdAt: 1
};

describe('DownloadItem', () => {
    afterEach(() => {
        usePlatformStore.setState({ platform: 'unknown' });
    });

    it('shows retry when failed', async () => {
        const onRetry = vi.fn();
        const user = userEvent.setup();
        render(
            <DownloadItem
                item={{ ...base, state: 'error', title: 'Bad', errorMessage: 'Network error' }}
                onPause={vi.fn()}
                onResume={vi.fn()}
                onRetry={onRetry}
                onRemove={vi.fn()}
                onOpenFile={vi.fn()}
                onRevealFile={vi.fn()}
            />
        );
        await user.click(screen.getByRole('button', { name: /Retry download/i }));
        expect(onRetry).toHaveBeenCalledWith('1');
    });

    it('shows pause when downloading', async () => {
        const onPause = vi.fn();
        const user = userEvent.setup();
        render(
            <DownloadItem
                item={{ ...base, state: 'downloading', title: 'T', progressPercent: 40 }}
                onPause={onPause}
                onResume={vi.fn()}
                onRetry={vi.fn()}
                onRemove={vi.fn()}
                onOpenFile={vi.fn()}
                onRevealFile={vi.fn()}
            />
        );
        await user.click(screen.getByRole('button', { name: /Pause download/i }));
        expect(onPause).toHaveBeenCalledWith('1');
    });

    it('disables pause on Windows for active downloads', () => {
        usePlatformStore.setState({ platform: 'windows' });
        render(
            <DownloadItem
                item={{ ...base, state: 'downloading', title: 'T', progressPercent: 40 }}
                onPause={vi.fn()}
                onResume={vi.fn()}
                onRetry={vi.fn()}
                onRemove={vi.fn()}
                onOpenFile={vi.fn()}
                onRevealFile={vi.fn()}
            />
        );
        const pauseButton = screen.getByRole('button', {
            name: /Pause is not supported for active downloads on Windows/i
        });
        expect(pauseButton).toBeDisabled();
    });

    it('shows resume when paused', async () => {
        const onResume = vi.fn();
        const user = userEvent.setup();
        render(
            <DownloadItem
                item={{ ...base, state: 'paused', title: 'T' }}
                onPause={vi.fn()}
                onResume={onResume}
                onRetry={vi.fn()}
                onRemove={vi.fn()}
                onOpenFile={vi.fn()}
                onRevealFile={vi.fn()}
            />
        );
        await user.click(screen.getByRole('button', { name: /Resume download/i }));
        expect(onResume).toHaveBeenCalled();
    });

    it('hides primary action when complete without file path', () => {
        render(
            <DownloadItem
                item={{ ...base, state: 'complete', title: 'X' }}
                onPause={vi.fn()}
                onResume={vi.fn()}
                onRetry={vi.fn()}
                onRemove={vi.fn()}
                onOpenFile={vi.fn()}
                onRevealFile={vi.fn()}
            />
        );
        expect(screen.queryByRole('button', { name: /Open in default app/i })).toBeNull();
    });

    it('formats unknown state in detail', () => {
        const item = {
            ...base,
            state: 'pending' as DownloadItemModel['state']
        };
        (item as { state: string }).state = 'unknown_state';
        render(
            <DownloadItem
                item={item as DownloadItemModel}
                onPause={vi.fn()}
                onResume={vi.fn()}
                onRetry={vi.fn()}
                onRemove={vi.fn()}
                onOpenFile={vi.fn()}
                onRevealFile={vi.fn()}
            />
        );
        expect(screen.getByText(/Current state:/i)).toBeInTheDocument();
    });

    it('shows open when complete with file path', async () => {
        const onOpenFile = vi.fn();
        const onRevealFile = vi.fn();
        const user = userEvent.setup();
        render(
            <DownloadItem
                item={{
                    ...base,
                    state: 'complete',
                    title: 'Done',
                    filePath: '/f.mp4'
                }}
                onPause={vi.fn()}
                onResume={vi.fn()}
                onRetry={vi.fn()}
                onRemove={vi.fn()}
                onOpenFile={onOpenFile}
                onRevealFile={onRevealFile}
            />
        );
        await user.click(screen.getByRole('button', { name: /Open in default app/i }));
        expect(onOpenFile).toHaveBeenCalledWith('/f.mp4');
    });

    it('shows reveal when complete with file path', async () => {
        const onRevealFile = vi.fn();
        const user = userEvent.setup();
        render(
            <DownloadItem
                item={{
                    ...base,
                    state: 'complete',
                    title: 'Done',
                    filePath: '/f.mp4'
                }}
                onPause={vi.fn()}
                onResume={vi.fn()}
                onRetry={vi.fn()}
                onRemove={vi.fn()}
                onOpenFile={vi.fn()}
                onRevealFile={onRevealFile}
            />
        );
        await user.click(screen.getByRole('button', { name: /Reveal in folder/i }));
        expect(onRevealFile).toHaveBeenCalledWith('/f.mp4');
    });

    it('shows open when complete with non-media extension', () => {
        render(
            <DownloadItem
                item={{
                    ...base,
                    state: 'complete',
                    title: 'Doc',
                    filePath: '/f.txt'
                }}
                onPause={vi.fn()}
                onResume={vi.fn()}
                onRetry={vi.fn()}
                onRemove={vi.fn()}
                onOpenFile={vi.fn()}
                onRevealFile={vi.fn()}
            />
        );
        expect(screen.getByRole('button', { name: /Open in default app/i })).toBeInTheDocument();
    });

    it('hides section trim when queued (pending) even with patch handler', () => {
        render(
            <DownloadItem
                item={{
                    ...base,
                    state: 'pending',
                    title: 'Q',
                    progressPercent: 0,
                    sectionTrim: { start: '00:00:00', end: '00:10:00' }
                }}
                onSectionTrimPatch={vi.fn()}
                onPause={vi.fn()}
                onResume={vi.fn()}
                onRetry={vi.fn()}
                onRemove={vi.fn()}
                onOpenFile={vi.fn()}
                onRevealFile={vi.fn()}
            />
        );
        expect(screen.queryByText('Video trim')).toBeNull();
    });

    it('uses indeterminate progress for pending or starting at 0%', () => {
        const { rerender } = render(
            <DownloadItem
                item={{ ...base, state: 'pending', title: 'Q', progressPercent: 0 }}
                onPause={vi.fn()}
                onResume={vi.fn()}
                onRetry={vi.fn()}
                onRemove={vi.fn()}
                onOpenFile={vi.fn()}
                onRevealFile={vi.fn()}
            />
        );
        const bar = screen.getByRole('progressbar', { name: /Progress for Q/i });
        expect(bar).not.toHaveAttribute('aria-valuenow');
        expect(bar).toHaveTextContent('In progress');

        rerender(
            <DownloadItem
                item={{ ...base, state: 'starting', title: 'S', progressPercent: 0 }}
                onPause={vi.fn()}
                onResume={vi.fn()}
                onRetry={vi.fn()}
                onRemove={vi.fn()}
                onOpenFile={vi.fn()}
                onRevealFile={vi.fn()}
            />
        );
        const bar2 = screen.getByRole('progressbar', { name: /Progress for S/i });
        expect(bar2).not.toHaveAttribute('aria-valuenow');
    });

    it('shows downloading detail with ETA when set', () => {
        render(
            <DownloadItem
                item={{
                    ...base,
                    state: 'downloading',
                    title: 'T',
                    progressPercent: 10,
                    eta: '00:42'
                }}
                onPause={vi.fn()}
                onResume={vi.fn()}
                onRetry={vi.fn()}
                onRemove={vi.fn()}
                onOpenFile={vi.fn()}
                onRevealFile={vi.fn()}
            />
        );
        expect(screen.getByText(/Downloading \(00:42 left\)/)).toBeInTheDocument();
    });

    it('shows plain downloading when ETA missing', () => {
        render(
            <DownloadItem
                item={{ ...base, state: 'downloading', title: 'T', progressPercent: 20 }}
                onPause={vi.fn()}
                onResume={vi.fn()}
                onRetry={vi.fn()}
                onRemove={vi.fn()}
                onOpenFile={vi.fn()}
                onRevealFile={vi.fn()}
            />
        );
        const live = document.getElementById('download-status-1');
        expect(live?.textContent).toBe('Downloading');
    });

    it('distinguishes paused auto vs manual', () => {
        const { rerender } = render(
            <DownloadItem
                item={{
                    ...base,
                    state: 'paused',
                    title: 'T',
                    pauseReason: 'concurrency'
                }}
                onPause={vi.fn()}
                onResume={vi.fn()}
                onRetry={vi.fn()}
                onRemove={vi.fn()}
                onOpenFile={vi.fn()}
                onRevealFile={vi.fn()}
            />
        );
        expect(screen.getByText(/Paused \(auto\)/)).toBeInTheDocument();

        rerender(
            <DownloadItem
                item={{ ...base, state: 'paused', title: 'T', pauseReason: 'manual' }}
                onPause={vi.fn()}
                onResume={vi.fn()}
                onRetry={vi.fn()}
                onRemove={vi.fn()}
                onOpenFile={vi.fn()}
                onRevealFile={vi.fn()}
            />
        );
        expect(screen.getByText(/^Paused$/)).toBeInTheDocument();
    });

    it('shows error and cancelled state copy', () => {
        const { rerender } = render(
            <DownloadItem
                item={{
                    ...base,
                    state: 'error',
                    title: 'Bad',
                    errorMessage: 'Disk full'
                }}
                onPause={vi.fn()}
                onResume={vi.fn()}
                onRetry={vi.fn()}
                onRemove={vi.fn()}
                onOpenFile={vi.fn()}
                onRevealFile={vi.fn()}
            />
        );
        const live = document.getElementById('download-status-1');
        expect(live?.textContent).toContain('Failed');
        expect(live?.textContent).toContain('Disk full');
        expect(screen.getByText('Disk full')).toBeInTheDocument();

        rerender(
            <DownloadItem
                item={{ ...base, state: 'cancelled', title: 'X' }}
                onPause={vi.fn()}
                onResume={vi.fn()}
                onRetry={vi.fn()}
                onRemove={vi.fn()}
                onOpenFile={vi.fn()}
                onRevealFile={vi.fn()}
            />
        );
        expect(document.getElementById('download-status-1')?.textContent).toBe('Cancelled');
    });

    it('renders artwork placeholder when no thumbnail', () => {
        const { container } = render(
            <DownloadItem
                item={{ ...base, state: 'pending', title: 'T', progressPercent: 0 }}
                onPause={vi.fn()}
                onResume={vi.fn()}
                onRetry={vi.fn()}
                onRemove={vi.fn()}
                onOpenFile={vi.fn()}
                onRevealFile={vi.fn()}
            />
        );
        expect(container.querySelector(`.${downloadItemStyles.artworkPlaceholder}`)).toBeTruthy();
        expect(container.querySelector(`img.${downloadItemStyles.artwork}`)).toBeNull();
    });

    it('renders thumbnail image when URL present and shows channel', () => {
        const { container } = render(
            <DownloadItem
                item={{
                    ...base,
                    state: 'complete',
                    title: 'Vid',
                    channel: 'My Channel',
                    thumbnailUrl: 'https://example.com/t.jpg',
                    filePath: '/v.mp4'
                }}
                onPause={vi.fn()}
                onResume={vi.fn()}
                onRetry={vi.fn()}
                onRemove={vi.fn()}
                onOpenFile={vi.fn()}
                onRevealFile={vi.fn()}
            />
        );
        const img = container.querySelector(`img.${downloadItemStyles.artwork}`);
        expect(img).toHaveAttribute('src', 'https://example.com/t.jpg');
        expect(screen.getByText('My Channel')).toBeInTheDocument();
    });

    it('falls back to URL for title when title missing', () => {
        render(
            <DownloadItem
                item={{ ...base, state: 'complete', filePath: '/f.mp4' }}
                onPause={vi.fn()}
                onResume={vi.fn()}
                onRetry={vi.fn()}
                onRemove={vi.fn()}
                onOpenFile={vi.fn()}
                onRevealFile={vi.fn()}
            />
        );
        expect(screen.getByRole('article', { name: base.url })).toBeInTheDocument();
        expect(screen.getByRole('heading', { level: 3 })).toHaveTextContent(base.url);
    });

    it('shows stats fallbacks and clamps progress display', () => {
        const { container } = render(
            <DownloadItem
                item={{
                    ...base,
                    state: 'downloading',
                    title: 'T',
                    progressPercent: 999,
                    speed: undefined,
                    totalSize: undefined,
                    eta: undefined
                }}
                onPause={vi.fn()}
                onResume={vi.fn()}
                onRetry={vi.fn()}
                onRemove={vi.fn()}
                onOpenFile={vi.fn()}
                onRevealFile={vi.fn()}
            />
        );
        expect(screen.getByText('Speed: --')).toBeInTheDocument();
        expect(screen.getByText('Size: --')).toBeInTheDocument();
        expect(screen.getByText('ETA: --')).toBeInTheDocument();
        expect(
            container.querySelector(`.${downloadItemStyles.progressRing} span`)?.textContent
        ).toBe('100%');
    });

    it('uses cancel vs remove label on remove button by state', () => {
        const { rerender } = render(
            <DownloadItem
                item={{ ...base, state: 'downloading', title: 'T', progressPercent: 50 }}
                onPause={vi.fn()}
                onResume={vi.fn()}
                onRetry={vi.fn()}
                onRemove={vi.fn()}
                onOpenFile={vi.fn()}
                onRevealFile={vi.fn()}
            />
        );
        expect(
            screen.getByRole('button', { name: /Cancel and remove download/i })
        ).toBeInTheDocument();

        rerender(
            <DownloadItem
                item={{ ...base, state: 'complete', title: 'T', filePath: '/f.mp4' }}
                onPause={vi.fn()}
                onResume={vi.fn()}
                onRetry={vi.fn()}
                onRemove={vi.fn()}
                onOpenFile={vi.fn()}
                onRevealFile={vi.fn()}
            />
        );
        expect(screen.getByRole('button', { name: /Remove from queue/i })).toBeInTheDocument();
    });

    it('calls onRemove with id', async () => {
        const onRemove = vi.fn();
        const user = userEvent.setup();
        render(
            <DownloadItem
                item={{ ...base, state: 'error', title: 'E' }}
                onPause={vi.fn()}
                onResume={vi.fn()}
                onRetry={vi.fn()}
                onRemove={onRemove}
                onOpenFile={vi.fn()}
                onRevealFile={vi.fn()}
            />
        );
        await user.click(screen.getByRole('button', { name: /Remove from queue/i }));
        expect(onRemove).toHaveBeenCalledWith('1');
    });

    it('re-renders with updated progress when item reference changes', () => {
        const onPause = vi.fn();
        const onResume = vi.fn();
        const onRemove = vi.fn();
        const onOpenFile = vi.fn();
        const item: DownloadItemModel = {
            ...base,
            state: 'downloading',
            title: 'T',
            progressPercent: 1
        };
        const { container, rerender } = render(
            <DownloadItem
                item={item}
                onPause={onPause}
                onResume={onResume}
                onRetry={vi.fn()}
                onRemove={onRemove}
                onOpenFile={onOpenFile}
                onRevealFile={vi.fn()}
            />
        );
        const ringLabel = () => container.querySelector(`.${downloadItemStyles.progressRing} span`);
        expect(ringLabel()?.textContent).toBe('1%');
        rerender(
            <DownloadItem
                item={{ ...item, progressPercent: 99 }}
                onPause={onPause}
                onResume={onResume}
                onRetry={vi.fn()}
                onRemove={onRemove}
                onOpenFile={onOpenFile}
                onRevealFile={vi.fn()}
            />
        );
        expect(ringLabel()?.textContent).toBe('99%');
    });

    it('clamps negative progress and floors decimals for display', () => {
        const { container, rerender } = render(
            <DownloadItem
                item={{ ...base, state: 'downloading', title: 'T', progressPercent: -5 }}
                onPause={vi.fn()}
                onResume={vi.fn()}
                onRetry={vi.fn()}
                onRemove={vi.fn()}
                onOpenFile={vi.fn()}
                onRevealFile={vi.fn()}
            />
        );
        const ring = () => container.querySelector(`.${downloadItemStyles.progressRing} span`);
        expect(ring()?.textContent).toBe('0%');
        rerender(
            <DownloadItem
                item={{ ...base, state: 'downloading', title: 'T', progressPercent: 12.7 }}
                onPause={vi.fn()}
                onResume={vi.fn()}
                onRetry={vi.fn()}
                onRemove={vi.fn()}
                onOpenFile={vi.fn()}
                onRevealFile={vi.fn()}
            />
        );
        expect(ring()?.textContent).toBe('12%');
    });

    it('ActionIcon default renders placeholder for unexpected name', () => {
        render(<ActionIcon name={'bogus' as ActionIconName} />);
        expect(screen.getByText('?')).toBeInTheDocument();
    });
});
