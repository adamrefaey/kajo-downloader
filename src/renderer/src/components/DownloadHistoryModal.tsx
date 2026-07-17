import clsx from 'clsx';
import { type JSX, useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { AddDownloadPayload } from '../../../store/downloadStore';
import type { DownloadHistoryEntry } from '../../../types';
import { useModalFocusTrap } from '../hooks/useModalFocusTrap';
import { queueSiteFieldsFromMediaUrl } from '../lib/queueSiteHelpers';
import { formatIdForYoutubeQualityCaps } from '../utils/playlistBatchPayloads';
import { ActionIcon } from './ActionIcon';
import shell from './DialogOverlay.module.css';
import styles from './DownloadHistoryModal.module.css';

const PAGE_SIZE = 20;

export type DownloadHistoryModalProps = {
    open: boolean;
    onClose: () => void;
    outputDir: string;
    preferredQuality: number | null;
    prependDownloads: (payloads: AddDownloadPayload[]) => void;
    onOpenFile: (filePath: string) => void | Promise<void>;
    onRevealFile: (filePath: string) => void | Promise<void>;
};

function formatHistoryWhen(ms: number): string {
    return new Date(ms).toLocaleString(undefined, {
        dateStyle: 'short',
        timeStyle: 'short'
    });
}

function statusLabelKey(status: DownloadHistoryEntry['status']): string {
    switch (status) {
        case 'complete':
            return 'downloadHistory.statusComplete';
        case 'error':
            return 'downloadHistory.statusError';
        case 'cancelled':
            return 'downloadHistory.statusCancelled';
        default:
            return 'downloadHistory.statusCancelled';
    }
}

export default function DownloadHistoryModal({
    open,
    onClose,
    outputDir,
    preferredQuality,
    prependDownloads,
    onOpenFile,
    onRevealFile
}: DownloadHistoryModalProps): JSX.Element | null {
    const { t } = useTranslation('components');
    const { t: tCommon } = useTranslation('common');
    const dialogRef = useRef<HTMLDivElement>(null);
    useModalFocusTrap(dialogRef, open);

    const [pageIndex, setPageIndex] = useState(0);
    const [entries, setEntries] = useState<DownloadHistoryEntry[]>([]);
    const [total, setTotal] = useState(0);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState(false);
    const [clearing, setClearing] = useState(false);
    const [copyHint, setCopyHint] = useState<string | null>(null);

    const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
    const maxPageIndex = Math.max(0, totalPages - 1);
    const safePageIndex = Math.min(pageIndex, maxPageIndex);

    const applyPageResult = useCallback(
        (page: number, list: DownloadHistoryEntry[], count: number) => {
            setEntries(list);
            setTotal(count);
            setError(false);
            if (page > 0 && count > 0 && page * PAGE_SIZE >= count) {
                setPageIndex(Math.max(0, Math.ceil(count / PAGE_SIZE) - 1));
            }
        },
        []
    );

    const handleClose = useCallback((): void => {
        setPageIndex(0);
        setEntries([]);
        setTotal(0);
        setError(false);
        setCopyHint(null);
        onClose();
    }, [onClose]);

    useEffect(() => {
        if (!open) {
            return;
        }
        let cancelled = false;
        const offset = pageIndex * PAGE_SIZE;
        // Start the async read without syncing React state in this tick (compiler rule).
        void (async () => {
            await Promise.resolve();
            if (cancelled) {
                return;
            }
            const historyApi = window.api?.downloadHistory;
            if (!historyApi) {
                setError(true);
                setLoading(false);
                return;
            }
            setLoading(true);
            try {
                const [list, count] = await Promise.all([
                    historyApi.list({ limit: PAGE_SIZE, offset }),
                    historyApi.total()
                ]);
                if (cancelled) {
                    return;
                }
                if (list === null || count === null) {
                    setError(true);
                    return;
                }
                applyPageResult(pageIndex, list, count);
            } catch {
                if (!cancelled) {
                    setError(true);
                }
            } finally {
                if (!cancelled) {
                    setLoading(false);
                }
            }
        })();
        return () => {
            cancelled = true;
        };
    }, [open, pageIndex, applyPageResult]);

    useEffect(() => {
        if (!open) return;
        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.key === 'Escape') handleClose();
        };
        document.addEventListener('keydown', handleKeyDown);
        return () => document.removeEventListener('keydown', handleKeyDown);
    }, [open, handleClose]);

    useEffect(() => {
        if (!copyHint) return;
        const timer = window.setTimeout(() => setCopyHint(null), 2000);
        return () => window.clearTimeout(timer);
    }, [copyHint]);

    const handleClear = async (): Promise<void> => {
        if (!window.api?.downloadHistory || clearing) {
            return;
        }
        if (!window.confirm(t('downloadHistory.clearConfirm'))) {
            return;
        }
        setClearing(true);
        try {
            const ok = await window.api.downloadHistory.clear();
            if (!ok) {
                setError(true);
                return;
            }
            setEntries([]);
            setTotal(0);
            setPageIndex(0);
        } catch {
            setError(true);
        } finally {
            setClearing(false);
        }
    };

    const handleCopyUrl = async (url: string): Promise<void> => {
        try {
            if (!navigator.clipboard?.writeText) {
                throw new Error('clipboard unavailable');
            }
            await navigator.clipboard.writeText(url);
            setCopyHint(t('downloadHistory.copyUrlSuccess'));
        } catch {
            setCopyHint(t('downloadHistory.copyUrlFailed'));
        }
    };

    const handleRetry = (entry: DownloadHistoryEntry): void => {
        const dir = outputDir.trim();
        if (!dir) {
            setCopyHint(t('downloadHistory.retryNoOutputDir'));
            return;
        }
        const formatId = formatIdForYoutubeQualityCaps(preferredQuality, null);
        prependDownloads([
            {
                ...queueSiteFieldsFromMediaUrl(entry.url),
                url: entry.url,
                title: entry.title ?? undefined,
                formatId,
                audioOnly: false,
                videoHeight:
                    preferredQuality !== null && preferredQuality > 0
                        ? preferredQuality
                        : undefined,
                outputDir: dir
            }
        ]);
        onClose();
    };

    if (!open || !window.api?.downloadHistory) {
        return null;
    }

    const showPagination = total > PAGE_SIZE;
    const hasOutputDir = Boolean(outputDir.trim());

    return (
        <div
            ref={dialogRef}
            className={clsx(shell.overlay, shell.overlayGrid, shell.overlaySettingsZ)}
            role="dialog"
            aria-modal="true"
            aria-labelledby="download-history-modal-title"
        >
            <button
                type="button"
                className={shell.backdropHit}
                aria-label={tCommon('close')}
                onClick={handleClose}
            />
            <div className={clsx('panel', shell.modalInGrid, styles.modal)}>
                <div className={styles.modalHead}>
                    <h2 id="download-history-modal-title">{t('downloadHistory.title')}</h2>
                    <button
                        type="button"
                        className="ghost-button"
                        aria-label={t('downloadHistory.closeAria')}
                        onClick={handleClose}
                    >
                        {tCommon('close')}
                    </button>
                </div>

                <div className="settings-history-section">
                    <div className="settings-history-toolbar">
                        <span className="settings-history-count" aria-live="polite">
                            {t('downloadHistory.count', { count: total })}
                        </span>
                        <button
                            type="button"
                            className={clsx('ghost-button', 'settings-history-clear')}
                            disabled={total === 0 || clearing || loading}
                            onClick={() => {
                                void handleClear();
                            }}
                        >
                            {clearing ? t('downloadHistory.clearing') : t('downloadHistory.clear')}
                        </button>
                    </div>

                    {copyHint ? (
                        <p className={styles.copyHint} role="status" aria-live="polite">
                            {copyHint}
                        </p>
                    ) : null}

                    <div className="settings-history-panel">
                        {loading && entries.length === 0 ? (
                            <p className="settings-history-empty">{t('downloadHistory.loading')}</p>
                        ) : error ? (
                            <p className="settings-history-empty">{t('downloadHistory.error')}</p>
                        ) : entries.length === 0 ? (
                            <p className="settings-history-empty">{t('downloadHistory.empty')}</p>
                        ) : (
                            <ul className="settings-history-list">
                                {entries.map((entry) => {
                                    const canOpenFile =
                                        entry.status === 'complete' && Boolean(entry.filePath);
                                    const displayTitle =
                                        entry.title?.trim() || t('downloadHistory.untitled');
                                    return (
                                        <li key={entry.id} className="settings-history-row">
                                            <div className="settings-history-row-main">
                                                <span
                                                    className="settings-history-status"
                                                    data-status={entry.status}
                                                >
                                                    {t(statusLabelKey(entry.status))}
                                                </span>
                                                <div className="settings-history-copy">
                                                    <span
                                                        className="settings-history-title"
                                                        dir="auto"
                                                    >
                                                        {displayTitle}
                                                    </span>
                                                    {entry.status === 'error' &&
                                                    entry.errorMessage?.trim() ? (
                                                        <span
                                                            className="settings-history-meta"
                                                            data-variant="error"
                                                            dir="auto"
                                                        >
                                                            {entry.errorMessage}
                                                        </span>
                                                    ) : (
                                                        <span
                                                            className="settings-history-meta"
                                                            dir="auto"
                                                        >
                                                            {entry.url}
                                                        </span>
                                                    )}
                                                </div>
                                            </div>
                                            <span className="settings-history-when">
                                                {formatHistoryWhen(entry.completedAtMs)}
                                            </span>
                                            <div className={styles.rowActions}>
                                                <button
                                                    type="button"
                                                    className={clsx(
                                                        'ghost-button',
                                                        'icon-button',
                                                        styles.iconAction
                                                    )}
                                                    aria-label={t('downloadHistory.copyUrl')}
                                                    title={t('downloadHistory.copyUrl')}
                                                    onClick={() => {
                                                        void handleCopyUrl(entry.url);
                                                    }}
                                                >
                                                    <CopyUrlIcon />
                                                </button>
                                                {canOpenFile && entry.filePath ? (
                                                    <>
                                                        <button
                                                            type="button"
                                                            className={clsx(
                                                                'ghost-button',
                                                                'icon-button',
                                                                styles.iconAction
                                                            )}
                                                            aria-label={t(
                                                                'downloadItem.openInDefaultApp'
                                                            )}
                                                            title={t(
                                                                'downloadItem.openInDefaultApp'
                                                            )}
                                                            onClick={() => {
                                                                void onOpenFile(
                                                                    entry.filePath as string
                                                                );
                                                            }}
                                                        >
                                                            <ActionIcon name="open" />
                                                        </button>
                                                        <button
                                                            type="button"
                                                            className={clsx(
                                                                'ghost-button',
                                                                'icon-button',
                                                                styles.iconAction
                                                            )}
                                                            aria-label={t(
                                                                'downloadItem.revealInFolder'
                                                            )}
                                                            title={t('downloadItem.revealInFolder')}
                                                            onClick={() => {
                                                                void onRevealFile(
                                                                    entry.filePath as string
                                                                );
                                                            }}
                                                        >
                                                            <ActionIcon name="reveal" />
                                                        </button>
                                                    </>
                                                ) : null}
                                                <button
                                                    type="button"
                                                    className={clsx(
                                                        'ghost-button',
                                                        'icon-button',
                                                        styles.iconAction
                                                    )}
                                                    aria-label={t('downloadHistory.retry')}
                                                    title={
                                                        hasOutputDir
                                                            ? t('downloadHistory.retry')
                                                            : t('downloadHistory.retryNoOutputDir')
                                                    }
                                                    disabled={!hasOutputDir}
                                                    onClick={() => handleRetry(entry)}
                                                >
                                                    <ActionIcon name="retry" />
                                                </button>
                                            </div>
                                        </li>
                                    );
                                })}
                            </ul>
                        )}
                    </div>

                    {showPagination ? (
                        <nav
                            className={styles.pagination}
                            aria-label={t('downloadHistory.paginationAria')}
                        >
                            <span className={styles.paginationStatus} aria-live="polite">
                                {t('downloadHistory.pageStatus', {
                                    current: safePageIndex + 1,
                                    total: totalPages
                                })}
                            </span>
                            <div className={styles.paginationActions}>
                                <button
                                    type="button"
                                    className="ghost-button"
                                    disabled={safePageIndex <= 0 || loading}
                                    aria-label={t('downloadHistory.prevPageAria')}
                                    onClick={() => setPageIndex(Math.max(0, safePageIndex - 1))}
                                >
                                    {t('downloadHistory.prevPage')}
                                </button>
                                <button
                                    type="button"
                                    className="ghost-button"
                                    disabled={safePageIndex >= maxPageIndex || loading}
                                    aria-label={t('downloadHistory.nextPageAria')}
                                    onClick={() =>
                                        setPageIndex(Math.min(maxPageIndex, safePageIndex + 1))
                                    }
                                >
                                    {t('downloadHistory.nextPage')}
                                </button>
                            </div>
                        </nav>
                    ) : null}
                </div>
            </div>
        </div>
    );
}

function CopyUrlIcon(): JSX.Element {
    return (
        <svg className="action-icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
            <path
                d="M8 8.5A2.5 2.5 0 0 1 10.5 6H17A2.5 2.5 0 0 1 19.5 8.5V15A2.5 2.5 0 0 1 17 17.5H10.5A2.5 2.5 0 0 1 8 15V8.5Z"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.65"
            />
            <path
                d="M6 10.5A2.5 2.5 0 0 1 8.5 8H8.75"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.65"
                strokeLinecap="round"
            />
        </svg>
    );
}
