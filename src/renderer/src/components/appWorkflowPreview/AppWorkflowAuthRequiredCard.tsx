import clsx from 'clsx';
import { useTranslation } from 'react-i18next';
import workflowStyles from '../AppWorkflowPreview.module.css';
import downloadItemStyles from '../DownloadItem.module.css';

export type AppWorkflowAuthRequiredCardProps = {
    /** Profile/site display name, when the host maps to a known site. */
    siteDisplayName?: string | undefined;
    /** Site domain fallback for the sign-in CTA label. */
    siteDomain?: string | undefined;
    onOpenSiteAuthFromPreview: () => void;
};

/** Sign-in gate: shown when metadata resolve reports `auth-required`. */
export function AppWorkflowAuthRequiredCard({
    siteDisplayName,
    siteDomain,
    onOpenSiteAuthFromPreview
}: AppWorkflowAuthRequiredCardProps): React.JSX.Element {
    const { t } = useTranslation(['components']);

    return (
        <article
            className={clsx(
                downloadItemStyles.root,
                downloadItemStyles.previewItem,
                workflowStyles.authRequiredPreview
            )}
            aria-labelledby="auth-gate-heading"
        >
            <div className={workflowStyles.authRequiredPreviewInner}>
                <div className={workflowStyles.authRequiredPreviewGlow} aria-hidden="true" />
                <div className={workflowStyles.authRequiredPreviewIconWrap} aria-hidden="true">
                    <svg
                        className={workflowStyles.authRequiredPreviewIcon}
                        viewBox="0 0 24 24"
                        width={28}
                        height={28}
                        aria-hidden="true"
                        focusable="false"
                    >
                        <path
                            fill="currentColor"
                            d="M18 8h-1V6c0-2.76-2.24-5-5-5S7 3.24 7 6v2H6c-1.1 0-2 .9-2 2v10c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V10c0-1.1-.9-2-2-2zm-6 9c-1.1 0-2-.9-2-2s.9-2 2-2 2 .9 2 2-.9 2-2 2zm3.1-9H8.9V6c0-1.71 1.39-3.1 3.1-3.1 1.71 0 3.1 1.39 3.1 3.1v2z"
                        />
                    </svg>
                </div>
                <h2 id="auth-gate-heading" className={workflowStyles.authRequiredPreviewTitle}>
                    {t('components:authRequiredCard.title')}
                </h2>
                <p className={workflowStyles.authRequiredPreviewSubtitle}>
                    {t('components:authRequiredCard.subtitle')}
                </p>
                <div
                    className={clsx(
                        workflowStyles.workflowActionRow,
                        workflowStyles.authRequiredPreviewActions
                    )}
                >
                    <button
                        type="button"
                        className={clsx(
                            'primary-button',
                            workflowStyles.startDownloadButton,
                            workflowStyles.authRequiredPreviewCta
                        )}
                        onClick={onOpenSiteAuthFromPreview}
                    >
                        {t('components:authRequiredCard.signInCta', {
                            site:
                                siteDisplayName?.trim() ||
                                siteDomain?.trim() ||
                                t('components:siteAuthBrowser.genericSite')
                        })}
                    </button>
                </div>
            </div>
        </article>
    );
}
