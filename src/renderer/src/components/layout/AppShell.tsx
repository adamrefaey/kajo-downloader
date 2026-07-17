import appIconUrl from '@resources/icon.png?url';
import clsx from 'clsx';
import type { MouseEvent, ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import styles from './AppShell.module.css';

const AUTHOR_LINKEDIN_URL = 'https://www.linkedin.com/in/adamrefaey';

function handleAuthorLinkedInClick(event: MouseEvent<HTMLAnchorElement>): void {
    if (window.api?.openExternal) {
        event.preventDefault();
        void window.api.openExternal(AUTHOR_LINKEDIN_URL);
    }
}

type AppShellProps = {
    platformClassName: string;
    children: ReactNode;
    /** When false, hides footer disclaimer (e.g. minimal boot screen). */
    showFooter?: boolean;
};

type AppShellTitlebarProps = {
    toolbarClassName?: string;
    title: string;
    subtitle: string;
    badge?: string;
    controls?: ReactNode;
    meta?: ReactNode;
    notice?: ReactNode;
};

type AppShellWorkspaceProps = {
    primary: ReactNode;
    secondary?: ReactNode;
};

export function AppShell({
    platformClassName,
    children,
    showFooter = true
}: AppShellProps): React.JSX.Element {
    const { t } = useTranslation('shell');
    return (
        <main className={clsx(styles.shell, styles.desktopAppShell, platformClassName)}>
            <div className={styles.windowDragRegion} aria-hidden="true" />
            <div className={styles.frame}>
                {children}
                {showFooter ? (
                    <footer className={styles.shellFooter}>
                        <p className={styles.shellFooterDisclaimer} role="note">
                            {t('footerDisclaimer')}
                        </p>
                        <p className={styles.shellFooterAttribution}>
                            {t('madeWith')}{' '}
                            <span role="img" aria-label={t('loveAria')}>
                                ❤️
                            </span>{' '}
                            {t('by')}{' '}
                            <a
                                className={styles.shellFooterLink}
                                href={AUTHOR_LINKEDIN_URL}
                                onClick={handleAuthorLinkedInClick}
                            >
                                {t('authorName')}
                            </a>
                        </p>
                    </footer>
                ) : null}
            </div>
        </main>
    );
}

export function AppShellTitlebar({
    toolbarClassName,
    title,
    subtitle,
    badge,
    controls,
    meta,
    notice
}: AppShellTitlebarProps): React.JSX.Element {
    return (
        <header className={clsx(styles.titlebar, 'drag-region')}>
            <div className={styles.titlebarDragStrip} aria-hidden="true" />
            <div className={clsx(styles.titlebarContent, 'no-drag-region')}>
                <div className={clsx(styles.titlebarShell, toolbarClassName ?? undefined)}>
                    <div className={styles.titlebarMain}>
                        <span className={styles.titlebarLogo} aria-hidden="true">
                            <img src={appIconUrl} alt="" width={24} height={24} decoding="async" />
                        </span>
                        <div className={styles.titlebarBrand}>
                            <h1>{title}</h1>
                            {subtitle ? <p>{subtitle}</p> : null}
                        </div>
                        {badge ? <span className="badge">{badge}</span> : null}
                    </div>
                    {meta ? <div className={styles.titlebarMeta}>{meta}</div> : null}
                    {controls ? <div className={styles.titlebarControls}>{controls}</div> : null}
                    {notice}
                </div>
            </div>
        </header>
    );
}

export function AppShellWorkspace({
    primary,
    secondary
}: AppShellWorkspaceProps): React.JSX.Element {
    const { t } = useTranslation('shell');
    return (
        <div className={styles.workspace}>
            {/* Layout column only — the meaningful landmark is the inner `#workflow-region`
                section (with its own heading); a second region here is redundant/non-unique. */}
            <div className={styles.primaryColumn}>{primary}</div>
            {secondary ? (
                <aside className={styles.queueColumn} aria-label={t('queuePanelAria')}>
                    {secondary}
                </aside>
            ) : null}
        </div>
    );
}

export function AppShellQueueAnchor({ children }: { children: ReactNode }): React.JSX.Element {
    return <div className={styles.queueAnchored}>{children}</div>;
}
