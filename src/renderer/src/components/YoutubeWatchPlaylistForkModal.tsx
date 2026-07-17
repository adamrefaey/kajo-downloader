import clsx from 'clsx';
import { useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { useModalFocusTrap } from '../hooks/useModalFocusTrap';
import shell from './DialogOverlay.module.css';
import styles from './YoutubeWatchPlaylistForkModal.module.css';

export type YoutubeWatchPlaylistForkModalProps = {
    open: boolean;
    onClose: () => void;
    onChooseVideo: () => void;
    onChoosePlaylist: () => void;
};

export default function YoutubeWatchPlaylistForkModal({
    open,
    onClose,
    onChooseVideo,
    onChoosePlaylist
}: YoutubeWatchPlaylistForkModalProps): React.JSX.Element | null {
    const { t } = useTranslation('components');
    const { t: tCommon } = useTranslation('common');
    const dialogRef = useRef<HTMLDivElement>(null);
    useModalFocusTrap(dialogRef, open);

    useEffect(() => {
        if (!open) {
            return;
        }
        const handleKeyDown = (event: KeyboardEvent) => {
            if (event.key === 'Escape') {
                onClose();
            }
        };
        document.addEventListener('keydown', handleKeyDown);
        return () => document.removeEventListener('keydown', handleKeyDown);
    }, [open, onClose]);

    if (!open) {
        return null;
    }

    return (
        <div
            ref={dialogRef}
            className={clsx(shell.overlay, shell.overlayGrid, shell.overlayPickerZ)}
            role="dialog"
            aria-modal="true"
            aria-labelledby="yt-watch-pl-fork-title"
        >
            <button
                type="button"
                className={shell.backdropHit}
                aria-label={t('youtubeWatchPlaylistFork.closeAria')}
                onClick={onClose}
            />
            <div className={clsx('panel', shell.modal, shell.modalInGrid, styles.narrow)}>
                <div className={shell.modalHead}>
                    <div>
                        <h2 id="yt-watch-pl-fork-title">{t('youtubeWatchPlaylistFork.title')}</h2>
                        <p className={styles.subtitle} dir="auto">
                            {t('youtubeWatchPlaylistFork.body')}
                        </p>
                    </div>
                    <button type="button" className="ghost-button" onClick={onClose}>
                        {tCommon('close')}
                    </button>
                </div>
                <div className={styles.actions}>
                    <button type="button" className="ghost-button" onClick={onClose}>
                        {t('youtubeWatchPlaylistFork.cancel')}
                    </button>
                    <button type="button" className="primary-button" onClick={onChooseVideo}>
                        {t('youtubeWatchPlaylistFork.video')}
                    </button>
                    <button type="button" className="primary-button" onClick={onChoosePlaylist}>
                        {t('youtubeWatchPlaylistFork.playlist')}
                    </button>
                </div>
            </div>
        </div>
    );
}
