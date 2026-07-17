import { Notification } from 'electron';
import type { NotificationSettings } from '../../src/types';

let batchTimer: ReturnType<typeof setTimeout> | null = null;
let batchCompleteCount = 0;

function showNotification(title: string, body: string): void {
    if (!Notification.isSupported()) {
        return;
    }
    try {
        new Notification({ title, body: body.slice(0, 512) }).show();
    } catch {
        // Ignore unsupported / permission issues.
    }
}

export function resetBatchNotificationState(): void {
    if (batchTimer) {
        clearTimeout(batchTimer);
        batchTimer = null;
    }
    batchCompleteCount = 0;
}

/**
 * Per-download completion notification + optional debounced batch summary.
 */
export function notifyDownloadComplete(
    settings: NotificationSettings,
    mediaTitle: string,
    _fileHint: string
): void {
    if (!settings.enabled) {
        return;
    }
    const label = mediaTitle.trim() || 'Download';
    if (settings.onDownloadComplete) {
        showNotification('Download complete', label);
    }
    if (settings.batchSummary) {
        batchCompleteCount += 1;
        if (batchTimer) {
            clearTimeout(batchTimer);
        }
        batchTimer = setTimeout(() => {
            batchTimer = null;
            const n = batchCompleteCount;
            batchCompleteCount = 0;
            if (n > 1) {
                showNotification('Downloads', `${n} downloads finished`);
            }
        }, 2200);
    }
}

export function notifyDownloadError(
    settings: NotificationSettings,
    mediaTitle: string,
    message: string
): void {
    if (!settings.enabled || !settings.onDownloadError) {
        return;
    }
    const label = mediaTitle.trim() || 'Download';
    showNotification(`Failed: ${label}`, message.trim().slice(0, 200) || 'Error');
}
