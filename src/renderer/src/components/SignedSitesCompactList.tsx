import clsx from 'clsx';
import { type FormEvent, type JSX, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useShallow } from 'zustand/react/shallow';
import { getSignInHomeUrlForProfile, getSiteProfileBySiteId } from '../../../shared/siteProfiles';
import {
    buildSignedSiteListRows,
    type SignedSiteListRow,
    useSignedSitesStore
} from '../../../store/signedSitesStore';
import type { SiteCookieHealth } from '../../../types';
import styles from './SignedSitesCompactList.module.css';
import type { SiteAuthManualOpenContext } from './SiteAuthBrowserModal';
import SiteSessionsQuickSignIn from './SiteSessionsQuickSignIn';

/** Queue Liked / Watch Later when a YouTube site session exists (see Site sessions modal). */
export type YoutubeLibraryQueueProps = {
    hasOutputDir: boolean;
    busy: boolean;
    disabledForMainWorkflow: boolean;
    onQueueLikedVideos: () => void | Promise<void>;
    onQueueWatchLater: () => void | Promise<void>;
};

function normalizeSignInSeedUrl(raw: string): string | null {
    const trimmed = raw.trim();
    if (!trimmed) {
        return null;
    }
    const href = trimmed.includes('://') ? trimmed : `https://${trimmed}`;
    try {
        const u = new URL(href);
        if (u.protocol !== 'http:' && u.protocol !== 'https:') {
            return null;
        }
        return u.href;
    } catch {
        return null;
    }
}

export interface SignedSitesCompactListProps {
    onOpenSiteAuth: (ctx: SiteAuthManualOpenContext) => void;
    /** When false (e.g. setup gate), hide actions that need a ready app. */
    setupReady?: boolean | undefined;
    /** Inline workflow card vs. chromeless body inside the site sessions dialog. */
    surface?: 'panel' | 'dialogBody' | undefined;
    /** Shown on the YouTube session row only when set. */
    youtubeLibraryQueue?: YoutubeLibraryQueueProps | undefined;
}

function healthChipModifier(health: SiteCookieHealth): string {
    switch (health) {
        case 'healthy':
            return styles.chipHealthy ?? '';
        case 'expiring_soon':
            return styles.chipWarn ?? '';
        case 'expired':
        case 'missing':
            return styles.chipBad ?? '';
        default:
            return styles.chipUnknown ?? '';
    }
}

function avatarLetter(domainLabel: string): string {
    const c = domainLabel.trim().charAt(0);
    return c ? c.toUpperCase() : '?';
}

export default function SignedSitesCompactList({
    onOpenSiteAuth,
    setupReady = true,
    surface = 'panel',
    youtubeLibraryQueue
}: SignedSitesCompactListProps): JSX.Element | null {
    const { t, i18n } = useTranslation('components');
    const { t: te } = useTranslation('errors');
    const { entries, validatedAtBySiteKey } = useSignedSitesStore(
        useShallow((s) => ({ entries: s.entries, validatedAtBySiteKey: s.validatedAtBySiteKey }))
    );
    const rows = buildSignedSiteListRows(entries, validatedAtBySiteKey);
    const validateSite = useSignedSitesStore((s) => s.validateSite);
    const clearSite = useSignedSitesStore((s) => s.clearSite);
    const [busyKey, setBusyKey] = useState<string | null>(null);
    const [addUrlDraft, setAddUrlDraft] = useState('');
    const [addUrlError, setAddUrlError] = useState<string | null>(null);

    const handleValidate = async (siteKey: string) => {
        setBusyKey(siteKey);
        try {
            await validateSite(siteKey);
        } finally {
            setBusyKey(null);
        }
    };

    const handleClear = async (siteKey: string) => {
        setBusyKey(siteKey);
        try {
            await clearSite(siteKey);
        } finally {
            setBusyKey(null);
        }
    };

    const openReauth = (row: SignedSiteListRow) => {
        const profile = getSiteProfileBySiteId(row.siteId);
        const initialUrl = profile
            ? getSignInHomeUrlForProfile(profile)
            : row.domainLabel.includes('.')
              ? `https://${row.domainLabel}`
              : 'https://www.youtube.com';
        onOpenSiteAuth({
            initialUrl,
            siteId: row.siteId,
            siteDomain: row.domainLabel
        });
    };

    const handleAddSignInSubmit = (event: FormEvent): void => {
        event.preventDefault();
        const normalized = normalizeSignInSeedUrl(addUrlDraft);
        if (!normalized) {
            setAddUrlError(t('signedSites.addUrlInvalid'));
            return;
        }
        setAddUrlError(null);
        onOpenSiteAuth({ initialUrl: normalized });
    };

    if (!window.api?.siteAuth?.listSignedSites) {
        return null;
    }

    const inputId =
        surface === 'dialogBody' ? 'signed-sites-add-url-dialog' : 'signed-sites-add-url';

    return (
        <section
            className={clsx(styles.panel, surface === 'dialogBody' && styles.panelDialogBody)}
            aria-label={t('signedSites.sectionAria')}
        >
            {surface === 'panel' ? (
                <div className={styles.panelHead}>
                    <h3 className={styles.panelTitle}>{t('signedSites.title')}</h3>
                </div>
            ) : null}
            {surface === 'dialogBody' ? (
                <SiteSessionsQuickSignIn setupReady={setupReady} onOpenSiteAuth={onOpenSiteAuth} />
            ) : null}
            <form className={styles.addForm} onSubmit={handleAddSignInSubmit}>
                <label className="sr-only" htmlFor={inputId}>
                    {t('signedSites.addUrlLabel')}
                </label>
                <input
                    id={inputId}
                    type="text"
                    className={clsx('input', styles.addInput)}
                    value={addUrlDraft}
                    onChange={(e) => {
                        setAddUrlDraft(e.target.value);
                        if (addUrlError) {
                            setAddUrlError(null);
                        }
                    }}
                    placeholder={t('signedSites.addUrlPlaceholder')}
                    spellCheck={false}
                    autoCapitalize="off"
                    autoCorrect="off"
                    disabled={!setupReady}
                />
                <button
                    type="submit"
                    className={clsx('ghost-button', styles.addSubmit)}
                    disabled={!setupReady}
                >
                    {t('signedSites.openSignIn')}
                </button>
            </form>
            {addUrlError ? <p className={styles.addError}>{addUrlError}</p> : null}
            {rows.length > 0 ? (
                <ul className={styles.list}>
                    {rows.map((row) => {
                        const busy = busyKey === row.siteKey;
                        const validated =
                            row.lastValidatedAt != null
                                ? new Date(row.lastValidatedAt).toLocaleString(i18n.language)
                                : null;
                        const expires =
                            row.expiresAt != null
                                ? new Date(row.expiresAt).toLocaleDateString(i18n.language)
                                : null;
                        const isYoutubeRow = row.siteId === 'youtube';
                        const ytQ = youtubeLibraryQueue;
                        const ytDisabled =
                            ytQ != null &&
                            isYoutubeRow &&
                            (!setupReady ||
                                ytQ.busy ||
                                ytQ.disabledForMainWorkflow ||
                                !ytQ.hasOutputDir);
                        const ytDisabledTitle =
                            ytQ != null && isYoutubeRow
                                ? !ytQ.hasOutputDir
                                    ? te('selectOutputFirst')
                                    : !setupReady
                                      ? t('settings.setupRequiredTitle')
                                      : undefined
                                : undefined;
                        return (
                            <li key={row.siteKey} className={styles.row}>
                                <div className={styles.rowMain}>
                                    <div className={styles.avatar} aria-hidden="true">
                                        {avatarLetter(row.domainLabel)}
                                    </div>
                                    <div className={styles.rowText}>
                                        <div className={styles.rowTitleLine}>
                                            <span className={styles.displayName}>
                                                {row.displayName}
                                            </span>
                                            <span
                                                className={clsx(
                                                    styles.chip,
                                                    healthChipModifier(row.cookieHealth)
                                                )}
                                            >
                                                {t(`signedSites.health.${row.cookieHealth}`)}
                                            </span>
                                        </div>
                                        <div className={styles.meta}>
                                            <span className={styles.domain}>{row.domainLabel}</span>
                                            {row.signedInAs ? (
                                                <span className={styles.as}>
                                                    {t('signedSites.signedInAs', {
                                                        hint: row.signedInAs
                                                    })}
                                                </span>
                                            ) : null}
                                        </div>
                                        <div className={styles.dates}>
                                            {validated ? (
                                                <span className={styles.datePill}>
                                                    {t('signedSites.lastValidated', {
                                                        date: validated
                                                    })}
                                                </span>
                                            ) : null}
                                            {expires ? (
                                                <span className={styles.datePill}>
                                                    {t('signedSites.expires', { date: expires })}
                                                </span>
                                            ) : row.cookieHealth === 'healthy' ||
                                              row.cookieHealth === 'unknown' ? (
                                                <span
                                                    className={clsx(
                                                        styles.datePill,
                                                        styles.datePillMuted
                                                    )}
                                                >
                                                    {t('signedSites.sessionCookies')}
                                                </span>
                                            ) : null}
                                        </div>
                                        {isYoutubeRow && ytQ ? (
                                            <fieldset className={styles.youtubeQueue}>
                                                <legend className="sr-only">
                                                    {t('signedSites.youtubeQueueAria')}
                                                </legend>
                                                <button
                                                    type="button"
                                                    className={clsx(
                                                        'ghost-button',
                                                        styles.action,
                                                        styles.ytQueueBtn
                                                    )}
                                                    disabled={ytDisabled}
                                                    title={ytDisabled ? ytDisabledTitle : undefined}
                                                    aria-label={t('settings.queueLiked')}
                                                    onClick={() => void ytQ.onQueueLikedVideos()}
                                                >
                                                    {ytQ.busy
                                                        ? t('settings.queueing')
                                                        : t('signedSites.youtubeQueueLiked')}
                                                </button>
                                                <button
                                                    type="button"
                                                    className={clsx(
                                                        'ghost-button',
                                                        styles.action,
                                                        styles.ytQueueBtn
                                                    )}
                                                    disabled={ytDisabled}
                                                    title={ytDisabled ? ytDisabledTitle : undefined}
                                                    aria-label={t('settings.queueWatchLater')}
                                                    onClick={() => void ytQ.onQueueWatchLater()}
                                                >
                                                    {ytQ.busy
                                                        ? t('settings.queueing')
                                                        : t('signedSites.youtubeQueueWatchLater')}
                                                </button>
                                            </fieldset>
                                        ) : null}
                                    </div>
                                </div>
                                <fieldset className={styles.actions}>
                                    <legend className="sr-only">
                                        {t('signedSites.actionsAria')}
                                    </legend>
                                    <button
                                        type="button"
                                        className={clsx('ghost-button', styles.action)}
                                        disabled={!setupReady || busy}
                                        onClick={() => void handleValidate(row.siteKey)}
                                    >
                                        {t('signedSites.validate')}
                                    </button>
                                    <button
                                        type="button"
                                        className={clsx('ghost-button', styles.action)}
                                        disabled={!setupReady || busy}
                                        onClick={() => openReauth(row)}
                                    >
                                        {t('signedSites.reauth')}
                                    </button>
                                    <button
                                        type="button"
                                        className={clsx(
                                            'ghost-button',
                                            styles.action,
                                            styles.actionDanger
                                        )}
                                        disabled={!setupReady || busy}
                                        onClick={() => void handleClear(row.siteKey)}
                                    >
                                        {t('signedSites.clear')}
                                    </button>
                                </fieldset>
                            </li>
                        );
                    })}
                </ul>
            ) : null}
        </section>
    );
}
