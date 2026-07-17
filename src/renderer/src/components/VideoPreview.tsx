import clsx from 'clsx';
import { useTranslation } from 'react-i18next';
import type { VideoInfo } from '../../../types';
import styles from './VideoPreview.module.css';

interface VideoPreviewProps {
    videoInfo: VideoInfo;
}

function VideoPreview({ videoInfo }: VideoPreviewProps): React.JSX.Element {
    const { t } = useTranslation('components');
    const durationLabel = formatDuration(videoInfo.durationSeconds);

    return (
        <article className={styles.card} aria-label={t('videoPreview.selectionAria')}>
            <div className={styles.thumbnailWrap}>
                {videoInfo.thumbnailUrl ? (
                    <img
                        className={styles.thumbnail}
                        src={videoInfo.thumbnailUrl}
                        alt={t('videoPreview.thumbnailAlt', { title: videoInfo.title })}
                    />
                ) : (
                    <div className={clsx(styles.thumbnail, styles.thumbnailEmpty)} />
                )}
                <span className={styles.durationChip}>{durationLabel}</span>
            </div>
            <div className={styles.content}>
                <h3 dir="auto">{videoInfo.title}</h3>
                <p className={styles.channel} dir="auto">
                    {videoInfo.channel}
                </p>
            </div>
        </article>
    );
}

function formatDuration(totalSeconds: number): string {
    const safeSeconds = Math.max(0, totalSeconds);
    const hours = Math.floor(safeSeconds / 3600);
    const minutes = Math.floor((safeSeconds % 3600) / 60);
    const seconds = safeSeconds % 60;

    if (hours > 0) {
        return `${hours}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
    }

    return `${minutes}:${String(seconds).padStart(2, '0')}`;
}

export default VideoPreview;
