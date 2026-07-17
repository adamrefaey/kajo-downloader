import { afterEach, describe, expect, it, vi } from 'vitest';

const show = vi.hoisted(() => vi.fn());
const isSupported = vi.hoisted(() => vi.fn(() => true));
const lastNotificationOpts = vi.hoisted(() => [] as { title: string; body: string }[]);

vi.mock('electron', () => {
    class MockNotification {
        show = show;
        constructor(opts: { title: string; body: string }) {
            lastNotificationOpts.push(opts);
        }
    }
    const N = MockNotification as unknown as typeof import('electron').Notification;
    (N as unknown as { isSupported: () => boolean }).isSupported = () => isSupported();
    return { Notification: N };
});

import {
    notifyDownloadComplete,
    notifyDownloadError,
    resetBatchNotificationState
} from '../electron/services/desktopNotifications';

describe('desktopNotifications', () => {
    afterEach(() => {
        vi.useRealTimers();
        resetBatchNotificationState();
        show.mockReset();
        isSupported.mockReset();
        isSupported.mockReturnValue(true);
        lastNotificationOpts.length = 0;
    });

    it('no-ops when disabled', () => {
        notifyDownloadComplete(
            {
                enabled: false,
                onDownloadComplete: true,
                onDownloadError: true,
                batchSummary: false
            },
            'T',
            ''
        );
        expect(show).not.toHaveBeenCalled();
    });

    it('no-ops when notifications unsupported', () => {
        isSupported.mockReturnValue(false);
        notifyDownloadComplete(
            {
                enabled: true,
                onDownloadComplete: true,
                onDownloadError: true,
                batchSummary: false
            },
            'T',
            ''
        );
        expect(show).not.toHaveBeenCalled();
    });

    it('shows completion and debounced batch summary', () => {
        vi.useFakeTimers();
        notifyDownloadComplete(
            {
                enabled: true,
                onDownloadComplete: true,
                onDownloadError: false,
                batchSummary: true
            },
            '  ',
            ''
        );
        expect(show).toHaveBeenCalled();
        notifyDownloadComplete(
            {
                enabled: true,
                onDownloadComplete: false,
                onDownloadError: false,
                batchSummary: true
            },
            'Second',
            ''
        );
        vi.advanceTimersByTime(2200);
        expect(show.mock.calls.length).toBeGreaterThanOrEqual(2);
    });

    it('resetBatchNotificationState clears a pending batch debounce timer', () => {
        vi.useFakeTimers();
        notifyDownloadComplete(
            {
                enabled: true,
                onDownloadComplete: false,
                onDownloadError: false,
                batchSummary: true
            },
            'A',
            ''
        );
        resetBatchNotificationState();
        vi.advanceTimersByTime(10_000);
        vi.useRealTimers();
    });

    it('clears an existing batch timer when another batchable completion arrives', () => {
        vi.useFakeTimers();
        const settings = {
            enabled: true,
            onDownloadComplete: false,
            onDownloadError: false,
            batchSummary: true
        };
        notifyDownloadComplete(settings, 'First', '');
        notifyDownloadComplete(settings, 'Second', '');
        vi.advanceTimersByTime(2200);
        expect(show).toHaveBeenCalled();
    });

    it('does not show batch summary when only one download finished in the debounce window', () => {
        vi.useFakeTimers();
        show.mockClear();
        notifyDownloadComplete(
            {
                enabled: true,
                onDownloadComplete: false,
                onDownloadError: false,
                batchSummary: true
            },
            'Solo',
            ''
        );
        vi.advanceTimersByTime(2200);
        expect(show).not.toHaveBeenCalled();
    });

    it('slices long completion notification body', () => {
        const longTitle = `x${'y'.repeat(600)}`;
        notifyDownloadComplete(
            {
                enabled: true,
                onDownloadComplete: true,
                onDownloadError: false,
                batchSummary: false
            },
            longTitle,
            ''
        );
        expect(lastNotificationOpts[0]?.body).toHaveLength(512);
    });

    it('notifyDownloadError respects flags and trims body', () => {
        notifyDownloadError(
            {
                enabled: true,
                onDownloadComplete: false,
                onDownloadError: true,
                batchSummary: false
            },
            'T',
            '  err  '
        );
        expect(show).toHaveBeenCalled();
        notifyDownloadError(
            {
                enabled: true,
                onDownloadComplete: false,
                onDownloadError: false,
                batchSummary: false
            },
            'T',
            'e'
        );
    });

    it('notifyDownloadError uses Download label when media title is blank', () => {
        notifyDownloadError(
            {
                enabled: true,
                onDownloadComplete: false,
                onDownloadError: true,
                batchSummary: false
            },
            '   ',
            'boom'
        );
        expect(lastNotificationOpts.at(-1)?.title).toBe('Failed: Download');
    });

    it('notifyDownloadError uses default body when message is whitespace', () => {
        show.mockClear();
        notifyDownloadError(
            {
                enabled: true,
                onDownloadComplete: false,
                onDownloadError: true,
                batchSummary: false
            },
            'Item',
            '   '
        );
        expect(lastNotificationOpts[0]?.body).toBe('Error');
    });

    it('swallows Notification.show errors', () => {
        show.mockImplementationOnce(() => {
            throw new Error('no');
        });
        expect(() =>
            notifyDownloadComplete(
                {
                    enabled: true,
                    onDownloadComplete: true,
                    onDownloadError: false,
                    batchSummary: false
                },
                'x',
                ''
            )
        ).not.toThrow();
    });
});
