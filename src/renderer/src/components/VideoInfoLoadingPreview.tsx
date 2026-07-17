import clsx from 'clsx';
import { useTranslation } from 'react-i18next';
import styles from './VideoInfoLoadingPreview.module.css';

export type VideoInfoLoadingPreviewKind = 'video' | 'channel' | 'playlist';

type VideoInfoLoadingPreviewProps = {
    kind?: VideoInfoLoadingPreviewKind;
};

function VideoInfoLoadingPreview({
    kind = 'video'
}: VideoInfoLoadingPreviewProps): React.JSX.Element {
    const { t } = useTranslation('components');
    const headlineKey =
        kind === 'channel'
            ? 'videoLoading.channelHeadline'
            : kind === 'playlist'
              ? 'videoLoading.playlistHeadline'
              : 'videoLoading.headline';
    const subKey =
        kind === 'channel'
            ? 'videoLoading.channelSub'
            : kind === 'playlist'
              ? 'videoLoading.playlistSub'
              : 'videoLoading.sub';
    const ariaKey =
        kind === 'channel'
            ? 'videoLoading.channelAria'
            : kind === 'playlist'
              ? 'videoLoading.playlistAria'
              : 'videoLoading.aria';
    return (
        <article
            className={styles.root}
            aria-busy="true"
            aria-live="polite"
            aria-label={t(ariaKey)}
        >
            <div className={styles.thumbnailWrap}>
                <div
                    className={clsx(styles.thumbnail, styles.thumbnailEmpty, styles.plate)}
                    aria-hidden="true"
                >
                    <span className={styles.spinner} />
                </div>
            </div>
            <div className={styles.content}>
                <h3 className={styles.headline}>{t(headlineKey)}</h3>
                <p className={clsx(styles.channel, styles.sub)}>{t(subKey)}</p>
            </div>
        </article>
    );
}

export default VideoInfoLoadingPreview;
