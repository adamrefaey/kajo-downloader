import { useEffect } from 'react';
import { useDownloadStore } from '../../../store/downloadStore';
import { useSetupStore } from '../../../store/setupStore';

export interface DownloadConcurrencyControllerProps {
    maxConcurrentDownloads: number;
    onPauseForConcurrency: (downloadId: string, reason: 'manual' | 'concurrency') => Promise<void>;
    onResumeFromConcurrency: (downloadId: string, manualOverride: boolean) => Promise<void>;
    onStartPending: (downloadId: string) => Promise<void>;
}

export function DownloadConcurrencyController({
    maxConcurrentDownloads,
    onPauseForConcurrency,
    onResumeFromConcurrency,
    onStartPending
}: DownloadConcurrencyControllerProps): null {
    const queue = useDownloadStore((state) => state.queue);
    const ytdlpReady = useSetupStore((s) => s.setupStatus?.ytdlpReady);

    useEffect(() => {
        const enabled = Boolean(window.api) && Boolean(ytdlpReady);
        if (!enabled) {
            return;
        }

        const maxConcurrent = Math.max(1, maxConcurrentDownloads || 1);
        const running = queue
            .filter((item) => item.state === 'downloading' || item.state === 'starting')
            .sort((a, b) => b.createdAt - a.createdAt);

        if (running.length > maxConcurrent) {
            const overflow = running.slice(maxConcurrent);
            overflow.forEach((item) => {
                void onPauseForConcurrency(item.id, 'concurrency');
            });
            return;
        }

        const availableSlots = maxConcurrent - running.length;
        if (availableSlots <= 0) {
            return;
        }

        const concurrencyPaused = queue
            .filter((item) => item.state === 'paused' && item.pauseReason === 'concurrency')
            .sort((a, b) => a.createdAt - b.createdAt)
            .slice(0, availableSlots);

        if (concurrencyPaused.length > 0) {
            concurrencyPaused.forEach((item) => {
                void onResumeFromConcurrency(item.id, false);
            });
            return;
        }

        const pending = queue
            .filter((item) => item.state === 'pending')
            .sort((a, b) => a.createdAt - b.createdAt)
            .slice(0, availableSlots);
        pending.forEach((item) => {
            void onStartPending(item.id);
        });
    }, [
        maxConcurrentDownloads,
        onPauseForConcurrency,
        onResumeFromConcurrency,
        onStartPending,
        queue,
        ytdlpReady
    ]);

    return null;
}
