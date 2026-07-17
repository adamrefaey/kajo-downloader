import clsx from 'clsx';
import type { TFunction } from 'i18next';
import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { useShallow } from 'zustand/react/shallow';
import { useDownloadStore } from '../../../store/downloadStore';
import { usePlatformStore } from '../../../store/platformStore';
import { ActionIcon } from './ActionIcon';
import styles from './DownloadQueueBatchGroup.module.css';

interface DownloadQueueBatchGroupProps {
    batchGroupId: string;
    title: string;
    itemIds: string[];
    onPauseBatch: (batchGroupId: string) => void | Promise<void>;
    onResumeBatch: (batchGroupId: string) => void | Promise<void>;
    onRemoveBatch: (batchGroupId: string) => void | Promise<void>;
    children: ReactNode;
}

function useBatchPauseFlags(batchGroupId: string): {
    canPauseBatch: boolean;
    canResumeBatch: boolean;
    hasActiveDownload: boolean;
} {
    const [canPauseBatch, canResumeBatch, hasActiveDownload] = useDownloadStore(
        useShallow((s) => {
            let canPause = false;
            let canResume = false;
            let activeDownload = false;
            for (const item of s.queue) {
                if (item.batchGroupId !== batchGroupId) {
                    continue;
                }
                if (
                    item.state === 'pending' ||
                    item.state === 'starting' ||
                    item.state === 'downloading'
                ) {
                    canPause = true;
                }
                if (item.state === 'starting' || item.state === 'downloading') {
                    activeDownload = true;
                }
                if (item.state === 'paused' && item.pauseReason === 'concurrency') {
                    canPause = true;
                }
                if (item.state === 'paused') {
                    canResume = true;
                }
            }
            return [canPause, canResume, activeDownload] as const;
        })
    );
    return { canPauseBatch, canResumeBatch, hasActiveDownload };
}

function useBatchSubtitle(batchGroupId: string, t: TFunction): string | undefined {
    return useDownloadStore((s) => {
        const first = s.queue.find((q) => q.batchGroupId === batchGroupId);
        if (!first) {
            return undefined;
        }
        const site = first.batchSiteLabel?.trim();
        const at = first.batchExtractedAt;
        if (!site && at == null) {
            return undefined;
        }
        const time =
            typeof at === 'number'
                ? new Date(at).toLocaleString(undefined, {
                      dateStyle: 'short',
                      timeStyle: 'short'
                  })
                : '';
        if (site && time) {
            return t('downloadQueue.batchExtractedMeta', { site, time });
        }
        const out = site || time || '';
        return out || undefined;
    });
}

function DownloadQueueBatchGroup({
    batchGroupId,
    title,
    itemIds,
    onPauseBatch,
    onResumeBatch,
    onRemoveBatch,
    children
}: DownloadQueueBatchGroupProps): React.JSX.Element {
    const { t } = useTranslation('components');
    const headingId = `queue-batch-${batchGroupId}`;
    const videoCount = itemIds.length;
    const countLabel = t('downloadQueue.batchVideoCount', { count: videoCount });
    const displayTitle = title.trim() ? title : t('downloadQueue.batchUntitled');
    const subtitle = useBatchSubtitle(batchGroupId, t);
    const { canPauseBatch, canResumeBatch, hasActiveDownload } = useBatchPauseFlags(batchGroupId);
    const platform = usePlatformStore((s) => s.platform);
    const pauseUnsupportedOnWindows = platform === 'windows' && hasActiveDownload;

    const pauseLabel = t('downloadQueue.batchPauseAll');
    const pauseTooltip = pauseUnsupportedOnWindows
        ? t('downloadQueue.batchPauseUnsupportedWindows')
        : pauseLabel;
    const resumeLabel = t('downloadQueue.batchResumeAll');
    const removeLabel = t('downloadQueue.batchRemoveAll');

    return (
        <details className={styles.root} open>
            <summary className={styles.summary}>
                <span className={styles.chevron} aria-hidden="true" />
                <span className={styles.summaryText}>
                    <span className={styles.titleBlock}>
                        <span id={headingId} className={styles.title} dir="auto">
                            {displayTitle}
                        </span>
                        {subtitle?.trim() ? (
                            <span className={styles.subtitle} dir="auto">
                                {subtitle.trim()}
                            </span>
                        ) : null}
                    </span>
                    <span className={styles.count}>{countLabel}</span>
                </span>
                <div className={styles.toolbar}>
                    <button
                        type="button"
                        className={clsx('ghost-button', 'icon-button', styles.toolbarBtn)}
                        disabled={!canPauseBatch || pauseUnsupportedOnWindows}
                        aria-label={pauseTooltip}
                        title={pauseTooltip}
                        onClick={(event) => {
                            event.stopPropagation();
                            void onPauseBatch(batchGroupId);
                        }}
                    >
                        <ActionIcon name="pause" />
                    </button>
                    <button
                        type="button"
                        className={clsx('ghost-button', 'icon-button', styles.toolbarBtn)}
                        disabled={!canResumeBatch}
                        aria-label={resumeLabel}
                        title={resumeLabel}
                        onClick={(event) => {
                            event.stopPropagation();
                            void onResumeBatch(batchGroupId);
                        }}
                    >
                        <ActionIcon name="resume" />
                    </button>
                    <button
                        type="button"
                        className={clsx('ghost-button', 'icon-button', styles.toolbarBtn)}
                        disabled={itemIds.length === 0}
                        aria-label={removeLabel}
                        title={removeLabel}
                        onClick={(event) => {
                            event.stopPropagation();
                            void onRemoveBatch(batchGroupId);
                        }}
                    >
                        <ActionIcon name="remove" />
                    </button>
                </div>
            </summary>
            <fieldset className={styles.items} aria-labelledby={headingId}>
                <legend className="sr-only">
                    {displayTitle} ({countLabel})
                </legend>
                {children}
            </fieldset>
        </details>
    );
}

export default DownloadQueueBatchGroup;
