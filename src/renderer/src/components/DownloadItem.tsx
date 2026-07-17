import clsx from 'clsx';
import type { TFunction } from 'i18next';
import type React from 'react';
import { useTranslation } from 'react-i18next';
import { formatBytes } from '../../../shared/formatBytes';
import { useDownloadStore } from '../../../store/downloadStore';
import { usePlatformStore } from '../../../store/platformStore';
import type { DownloadItem as DownloadItemModel } from '../../../types';
import { ActionIcon } from './ActionIcon';
import styles from './DownloadItem.module.css';

function displayDownloadTotalSize(item: DownloadItemModel): string {
    const labeled = item.totalSize?.trim();
    if (labeled) {
        // HLS live-stream sizes come from yt-dlp's segment-based running estimate which
        // can be 30-50% off early in the download (converges as more segments complete).
        // Prefix ~ so users know it's approximate, consistent with metadata pre-estimates.
        const isLive =
            item.liveStatus === 'is_live' ||
            item.liveStatus === 'was_live' ||
            item.liveStatus === 'post_live';
        if (isLive && item.state === 'downloading' && !labeled.startsWith('~')) {
            return `~${labeled}`;
        }
        return labeled;
    }
    if (item.sizeEstimateFullBytes !== undefined && item.sizeEstimateFullBytes > 0) {
        return formatBytes(item.sizeEstimateFullBytes);
    }
    return '--';
}

interface DownloadItemProps {
    item: DownloadItemModel;
    /** Compact row layout for items nested under a playlist/channel batch. */
    density?: 'default' | 'compact' | undefined;
    onSectionTrimPatch?:
        | ((downloadId: string, patch: Partial<{ start: string; end: string }>) => void)
        | undefined;
    onPause: (downloadId: string) => void | Promise<void>;
    onResume: (downloadId: string) => void | Promise<void>;
    onRetry: (downloadId: string) => void | Promise<void>;
    onRemove: (downloadId: string) => void | Promise<void>;
    onOpenFile: (filePath: string) => void | Promise<void>;
    onRevealFile: (filePath: string) => void | Promise<void>;
}

function DownloadItem({
    item,
    density = 'default',
    onSectionTrimPatch: _onSectionTrimPatch,
    onPause,
    onResume,
    onRetry,
    onRemove,
    onOpenFile,
    onRevealFile
}: DownloadItemProps): React.JSX.Element {
    const { t } = useTranslation('components');
    const platform = usePlatformStore((s) => s.platform);

    const isCompact = density === 'compact';
    const progress = Math.min(100, Math.max(0, Math.floor(item.progressPercent ?? 0)));
    const isIndeterminateProgress =
        (item.state === 'pending' || item.state === 'starting') && progress === 0;
    const canPause =
        item.state === 'pending' || item.state === 'starting' || item.state === 'downloading';
    const pauseUnsupportedOnWindows =
        platform === 'windows' && (item.state === 'starting' || item.state === 'downloading');
    const canResume = item.state === 'paused';
    const canRetry = item.state === 'error';
    const canOpen = item.state === 'complete' && Boolean(item.filePath);
    const canRemove = true;
    const isActiveOrQueuedForStart =
        item.state === 'pending' ||
        item.state === 'starting' ||
        item.state === 'downloading' ||
        item.state === 'paused';
    const removeActionLabel = isActiveOrQueuedForStart
        ? t('downloadItem.cancelRemove')
        : t('downloadItem.removeFromQueue');
    const stateDetail = getStateDetail(item, t);
    const primaryAction = getPrimaryAction({
        item,
        canPause,
        canResume,
        canRetry,
        onPause,
        onResume,
        onRetry,
        t,
        pauseUnsupportedOnWindows
    });
    const progressLabel = t('downloadItem.progressFor', { title: item.title ?? item.url });
    const statusTextId = `download-status-${item.id}`;
    const progressCircleRadius = isCompact ? 24 : 30;
    const progressCircleCircumference = 2 * Math.PI * progressCircleRadius;
    const progressCircleOffset =
        progressCircleCircumference - (progress / 100) * progressCircleCircumference;

    const openFileAction =
        canOpen && item.filePath ? (
            <button
                type="button"
                className={clsx('ghost-button', 'icon-button', styles.iconAction)}
                aria-label={t('downloadItem.openInDefaultApp')}
                title={t('downloadItem.openInDefaultApp')}
                onClick={() => {
                    void onOpenFile(item.filePath as string);
                }}
            >
                <ActionIcon name="open" />
            </button>
        ) : null;

    const revealFileAction =
        canOpen && item.filePath ? (
            <button
                type="button"
                className={clsx('ghost-button', 'icon-button', styles.iconAction)}
                aria-label={t('downloadItem.revealInFolder')}
                title={t('downloadItem.revealInFolder')}
                onClick={() => {
                    void onRevealFile(item.filePath as string);
                }}
            >
                <ActionIcon name="reveal" />
            </button>
        ) : null;

    const copyBlock = (
        <div className={styles.copy}>
            <h3 className={styles.title} dir="auto">
                {item.title ?? item.url}
            </h3>
            <p className={styles.channel} dir="auto">
                {item.channel ?? ''}
            </p>
        </div>
    );

    const statsBlock = (
        <div className={styles.stats}>
            {item.state === 'error' && item.errorMessage ? (
                <p className={styles.errorDetail} dir="auto">
                    {item.errorMessage}
                </p>
            ) : null}
            <p>{t('downloadItem.speed', { value: item.speed ?? '--' })}</p>
            <p>{t('downloadItem.size', { value: displayDownloadTotalSize(item) })}</p>
            <p>{t('downloadItem.eta', { value: item.eta ?? '--' })}</p>
        </div>
    );

    const progressBlock = (
        <div className={styles.progressShell}>
            <div className={styles.progressRing} aria-hidden="true">
                <svg viewBox="0 0 72 72" focusable="false" aria-hidden="true">
                    <circle className={styles.ringTrack} cx="36" cy="36" r={progressCircleRadius} />
                    <circle
                        className={styles.ringFill}
                        cx="36"
                        cy="36"
                        r={progressCircleRadius}
                        strokeDasharray={progressCircleCircumference}
                        strokeDashoffset={progressCircleOffset}
                    />
                </svg>
                <span>{progress}%</span>
            </div>
            <p
                className="sr-only"
                role="progressbar"
                aria-label={progressLabel}
                aria-valuemin={0}
                aria-valuemax={100}
                aria-valuenow={isIndeterminateProgress ? undefined : progress}
                aria-valuetext={stateDetail}
            >
                {isIndeterminateProgress ? t('downloadItem.inProgress') : `${progress}%`}
            </p>
        </div>
    );

    return (
        <article
            className={clsx(styles.root, isCompact && styles.compact, `state-card-${item.state}`)}
            aria-label={item.title ?? item.url}
            aria-describedby={statusTextId}
        >
            <div className={styles.artworkWrap}>
                {item.thumbnailUrl ? (
                    <img className={styles.artwork} src={item.thumbnailUrl} alt="" loading="lazy" />
                ) : (
                    <div
                        className={clsx(styles.artwork, styles.artworkPlaceholder)}
                        aria-hidden="true"
                    />
                )}
            </div>
            {isCompact ? (
                <div className={styles.compactText}>
                    {copyBlock}
                    {statsBlock}
                </div>
            ) : (
                copyBlock
            )}

            {progressBlock}
            {!isCompact ? statsBlock : null}

            <p id={statusTextId} className="sr-only" aria-live="polite">
                {item.errorMessage ? `${stateDetail}. ${item.errorMessage}` : stateDetail}
            </p>

            <div className={styles.actions}>
                {primaryAction}
                {openFileAction}
                {revealFileAction}
                <button
                    type="button"
                    className={clsx('ghost-button', 'icon-button', styles.iconAction)}
                    disabled={!canRemove}
                    aria-label={removeActionLabel}
                    title={removeActionLabel}
                    onClick={() => void onRemove(item.id)}
                >
                    <ActionIcon name="remove" />
                </button>
            </div>
        </article>
    );
}

interface PrimaryActionArgs {
    item: DownloadItemModel;
    canPause: boolean;
    canResume: boolean;
    canRetry: boolean;
    onPause: (downloadId: string) => void | Promise<void>;
    onResume: (downloadId: string) => void | Promise<void>;
    onRetry: (downloadId: string) => void | Promise<void>;
    t: (key: string) => string;
    pauseUnsupportedOnWindows: boolean;
}

function getPrimaryAction({
    item,
    canPause,
    canResume,
    canRetry,
    onPause,
    onResume,
    onRetry,
    t,
    pauseUnsupportedOnWindows
}: PrimaryActionArgs): React.JSX.Element | null {
    if (canRetry) {
        const actionLabel = t('downloadItem.retry');
        return (
            <button
                type="button"
                className={clsx('ghost-button', 'icon-button', styles.iconAction)}
                aria-label={actionLabel}
                title={actionLabel}
                onClick={() => void onRetry(item.id)}
            >
                <ActionIcon name="retry" />
            </button>
        );
    }

    if (canResume) {
        const actionLabel = t('downloadItem.resume');
        return (
            <button
                type="button"
                className={clsx('ghost-button', 'icon-button', styles.iconAction)}
                aria-label={actionLabel}
                title={actionLabel}
                onClick={() => void onResume(item.id)}
            >
                <ActionIcon name="resume" />
            </button>
        );
    }

    if (canPause) {
        const actionLabel = pauseUnsupportedOnWindows
            ? t('downloadItem.pauseUnsupportedWindows')
            : t('downloadItem.pause');
        return (
            <button
                type="button"
                className={clsx('ghost-button', 'icon-button', styles.iconAction)}
                disabled={pauseUnsupportedOnWindows}
                aria-label={actionLabel}
                title={actionLabel}
                onClick={() => void onPause(item.id)}
            >
                <ActionIcon name="pause" />
            </button>
        );
    }

    return null;
}

function getStateDetail(item: DownloadItemModel, t: TFunction<'components'>): string {
    switch (item.state) {
        case 'downloading':
            return item.eta
                ? t('downloadItem.stateDownloadingEta', { eta: item.eta })
                : t('downloadItem.stateDownloading');
        case 'starting':
            return t('downloadItem.stateStarting');
        case 'pending':
            return t('downloadItem.stateQueued');
        case 'paused':
            return item.pauseReason === 'concurrency'
                ? t('downloadItem.statePausedAuto')
                : t('downloadItem.statePaused');
        case 'complete':
            return t('downloadItem.stateComplete');
        case 'error':
            return t('downloadItem.stateFailed');
        case 'cancelled':
            return t('downloadItem.stateCancelled');
        default:
            return t('downloadItem.stateUnknown', { state: formatState(item.state) });
    }
}

function formatState(state: DownloadItemModel['state']): string {
    return state.replace(/_/g, ' ').replace(/\b\w/g, (value) => value.toUpperCase());
}

/** Subscribes to a single queue row so progress updates do not re-render the whole queue. */
export function DownloadItemById(
    props: Omit<DownloadItemProps, 'item'> & { downloadId: string }
): React.JSX.Element | null {
    const { downloadId, ...rest } = props;
    const item = useDownloadStore((s) => {
        for (const q of s.queue) {
            if (q.id === downloadId) {
                return q;
            }
        }
        return undefined;
    });
    if (!item) {
        return null;
    }
    return <DownloadItem {...rest} item={item} />;
}

export default DownloadItem;
