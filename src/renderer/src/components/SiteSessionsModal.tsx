import clsx from 'clsx';
import { type JSX, useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { useSetupStore } from '../../../store/setupStore';
import { useModalFocusTrap } from '../hooks/useModalFocusTrap';
import shell from './DialogOverlay.module.css';
import SignedSitesCompactList, { type YoutubeLibraryQueueProps } from './SignedSitesCompactList';
import type { SiteAuthManualOpenContext } from './SiteAuthBrowserModal';
import styles from './SiteSessionsModal.module.css';

export interface SiteSessionsModalProps {
    open: boolean;
    onClose: () => void;
    onOpenSiteAuth: (ctx: SiteAuthManualOpenContext) => void;
    youtubeLibraryQueue?: YoutubeLibraryQueueProps;
}

export default function SiteSessionsModal({
    open,
    onClose,
    onOpenSiteAuth,
    youtubeLibraryQueue
}: SiteSessionsModalProps): JSX.Element | null {
    const { t } = useTranslation('components');
    const { t: tCommon } = useTranslation('common');
    const setupReady = Boolean(useSetupStore((s) => s.setupStatus?.ytdlpReady));
    const dialogRef = useRef<HTMLDivElement>(null);
    useModalFocusTrap(dialogRef, open);
    useEffect(() => {
        if (!open) return;
        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.key === 'Escape') onClose();
        };
        document.addEventListener('keydown', handleKeyDown);
        return () => document.removeEventListener('keydown', handleKeyDown);
    }, [open, onClose]);

    if (!open || !window.api?.siteAuth?.listSignedSites) {
        return null;
    }

    return (
        <div
            ref={dialogRef}
            className={clsx(shell.overlay, shell.overlayGrid, shell.overlaySettingsZ)}
            role="dialog"
            aria-modal="true"
            aria-labelledby="site-sessions-modal-title"
        >
            <button
                type="button"
                className={shell.backdropHit}
                aria-label={tCommon('close')}
                onClick={onClose}
            />
            <div className={clsx('panel', shell.modalInGrid, styles.modal)}>
                <div className={styles.modalHead}>
                    <h2 id="site-sessions-modal-title">{t('signedSites.title')}</h2>
                    <button
                        type="button"
                        className="ghost-button"
                        aria-label={tCommon('close')}
                        onClick={onClose}
                    >
                        {tCommon('close')}
                    </button>
                </div>
                <div className={styles.modalBody}>
                    <SignedSitesCompactList
                        surface="dialogBody"
                        setupReady={setupReady}
                        onOpenSiteAuth={onOpenSiteAuth}
                        youtubeLibraryQueue={youtubeLibraryQueue}
                    />
                </div>
            </div>
        </div>
    );
}
