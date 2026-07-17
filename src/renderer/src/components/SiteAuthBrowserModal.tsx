/// <reference path="../env.d.ts" />
import clsx from 'clsx';
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { SiteAuthOpenPayload } from '../../../shared/ipcPayloadSchemas';
import { getSiteProfileByHostOrUrl, getSiteProfileBySiteId } from '../../../shared/siteProfiles';
import type { MetadataResolveResult } from '../../../types';
import { useModalFocusTrap } from '../hooks/useModalFocusTrap';
import styles from './SiteAuthBrowserModal.module.css';

export interface SiteAuthManualOpenContext {
    initialUrl: string;
    siteId?: string | undefined;
    siteDomain?: string | undefined;
}

export interface SiteAuthBrowserModalProps {
    open: boolean;
    resolve: Extract<MetadataResolveResult, { kind: 'auth-required' }> | null;
    /** When set (e.g. re-auth from signed-sites list), takes precedence over `resolve` for URL / open payload. */
    manualOpen?: SiteAuthManualOpenContext | null | undefined;
    onClose: () => void;
    /** After cookies saved successfully (main also closes the WebContentsView). */
    onSaved: () => void;
}

function SiteAuthFeedbackCallout({
    tone,
    message
}: {
    tone: 'error' | 'warn';
    message: string;
}): React.JSX.Element {
    const isError = tone === 'error';
    return (
        <div
            className={clsx(
                styles.feedback,
                tone === 'error' ? styles.feedbackError : styles.feedbackWarn
            )}
            role="alert"
            aria-live="polite"
        >
            <span className={styles.feedbackIconWrap} aria-hidden="true">
                {isError ? (
                    <svg
                        className={styles.feedbackIcon}
                        viewBox="0 0 24 24"
                        width={20}
                        height={20}
                        aria-hidden="true"
                        focusable="false"
                    >
                        <path
                            fill="currentColor"
                            d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 14c-.55 0-1-.45-1-1s.45-1 1-1 1 .45 1 1-.45 1-1 1zm1-4h-2V7h2v5z"
                        />
                    </svg>
                ) : (
                    <svg
                        className={styles.feedbackIcon}
                        viewBox="0 0 24 24"
                        width={20}
                        height={20}
                        aria-hidden="true"
                        focusable="false"
                    >
                        <path
                            fill="currentColor"
                            d="M1 21h22L12 2 1 21zm12-3h-2v-2h2v2zm0-3.5h-2v-4h2v4z"
                        />
                    </svg>
                )}
            </span>
            <p className={styles.feedbackText}>{message}</p>
        </div>
    );
}

function siteLabelFromManual(
    manual: SiteAuthManualOpenContext,
    translate: (k: string) => string
): string {
    if (manual.siteId) {
        const p = getSiteProfileBySiteId(manual.siteId);
        if (p) {
            return p.displayName;
        }
    }
    const p = getSiteProfileByHostOrUrl(manual.initialUrl);
    if (p) {
        return p.displayName;
    }
    try {
        const href = manual.initialUrl.trim().includes('://')
            ? manual.initialUrl.trim()
            : `https://${manual.initialUrl.trim()}`;
        return new URL(href).hostname;
    } catch {
        return translate('siteAuthBrowser.genericSite');
    }
}

export default function SiteAuthBrowserModal({
    open,
    resolve,
    manualOpen,
    onClose,
    onSaved
}: SiteAuthBrowserModalProps): React.JSX.Element | null {
    const { t } = useTranslation('components');
    const dialogRef = useRef<HTMLDivElement | null>(null);
    const embedRef = useRef<HTMLDivElement | null>(null);
    useModalFocusTrap(dialogRef, open);
    const syncEmbedBounds = useCallback((): void => {
        const el = embedRef.current;
        if (!el || !window.api?.siteAuth) {
            return;
        }
        const r = el.getBoundingClientRect();
        void window.api.siteAuth.setEmbedBounds({
            x: Math.round(r.left),
            y: Math.round(r.top),
            width: Math.round(r.width),
            height: Math.round(r.height)
        });
    }, []);
    const [saveError, setSaveError] = useState<string | null>(null);
    const [saving, setSaving] = useState(false);
    const [pageLoading, setPageLoading] = useState(false);
    const [pageUrl, setPageUrl] = useState('');
    const [canGoBack, setCanGoBack] = useState(false);
    const [canGoForward, setCanGoForward] = useState(false);
    const [blockedHint, setBlockedHint] = useState<string | null>(null);
    const [prevOpen, setPrevOpen] = useState(open);
    if (open !== prevOpen) {
        setPrevOpen(open);
        if (!open) {
            setSaveError(null);
            setBlockedHint(null);
            setPageLoading(false);
            setPageUrl('');
            setCanGoBack(false);
            setCanGoForward(false);
        }
    }

    const siteLabel: string = manualOpen
        ? siteLabelFromManual(manualOpen, (k) => t(k))
        : resolve
          ? resolve.siteDisplayName?.trim() ||
            resolve.siteDomain?.trim() ||
            t('siteAuthBrowser.genericSite')
          : t('siteAuthBrowser.genericSite');

    // Depend on auth payload fields, not `resolve` reference identity — parent may pass a new
    // object each render with the same values. The React Compiler tracks property-level access
    // and only recomputes when the individual fields change.
    const siteAuthSession = ((): { payload: SiteAuthOpenPayload } | null => {
        const manualUrl = manualOpen?.initialUrl?.trim();
        if (manualUrl) {
            const href = manualUrl.includes('://') ? manualUrl : `https://${manualUrl}`;
            const payload: SiteAuthOpenPayload = { initialUrl: href };
            if (manualOpen?.siteId !== undefined) {
                payload.siteId = manualOpen.siteId;
            }
            if (manualOpen?.siteDomain !== undefined) {
                payload.siteDomain = manualOpen.siteDomain;
            }
            return { payload };
        }
        if (!resolve) {
            return null;
        }
        const targetUrl =
            resolve.signInTargetUrl?.trim() ||
            (resolve.url?.trim()
                ? resolve.url.trim().includes('://')
                    ? resolve.url.trim()
                    : `https://${resolve.url.trim()}`
                : '');
        if (!targetUrl) {
            return null;
        }
        const payload: SiteAuthOpenPayload = { initialUrl: targetUrl };
        if (resolve.siteId !== undefined) {
            payload.siteId = resolve.siteId;
        }
        if (resolve.siteDomain !== undefined) {
            payload.siteDomain = resolve.siteDomain;
        }
        return { payload };
    })();

    useEffect(() => {
        if (!open || !window.api?.siteAuth || !siteAuthSession) {
            return;
        }
        let cancelled = false;
        void (async () => {
            const r = await window.api.siteAuth.open(siteAuthSession.payload);
            if (cancelled) {
                return;
            }
            if (!r.ok) {
                setSaveError(r.error);
                return;
            }
            // `useLayoutEffect` runs before this effect; `setEmbedBounds` was a no-op until `open()`
            // created the WebContentsView. Sync now and on the next frame so flex layout is settled.
            syncEmbedBounds();
            requestAnimationFrame(() => {
                if (!cancelled) {
                    syncEmbedBounds();
                }
            });
        })();

        return () => {
            cancelled = true;
            void window.api?.siteAuth?.close();
        };
    }, [open, siteAuthSession, syncEmbedBounds]);

    useEffect(() => {
        if (!open || !window.api?.siteAuth) {
            return;
        }
        const offBlock = window.api.siteAuth.onNavBlocked(() => {
            setBlockedHint(t('siteAuthBrowser.navBlocked', { site: siteLabel }));
        });
        const offLoading = window.api.siteAuth.onLoading((payload) => {
            setPageLoading(Boolean(payload?.loading));
        });
        const offUrl = window.api.siteAuth.onUrlState((payload) => {
            setPageUrl(typeof payload?.url === 'string' ? payload.url : '');
            setCanGoBack(Boolean(payload?.canGoBack));
            setCanGoForward(Boolean(payload?.canGoForward));
        });
        return () => {
            offBlock();
            offLoading();
            offUrl();
        };
    }, [open, siteLabel, t]);

    useEffect(() => {
        if (!blockedHint) {
            return;
        }
        const timer = setTimeout(() => setBlockedHint(null), 8000);
        return () => clearTimeout(timer);
    }, [blockedHint]);

    useLayoutEffect(() => {
        if (!open || !embedRef.current || !window.api?.siteAuth) {
            return;
        }
        const el = embedRef.current;
        syncEmbedBounds();
        const ro = new ResizeObserver(() => syncEmbedBounds());
        ro.observe(el);
        window.addEventListener('resize', syncEmbedBounds);
        return () => {
            ro.disconnect();
            window.removeEventListener('resize', syncEmbedBounds);
        };
    }, [open, syncEmbedBounds]);

    const handleClose = (): void => {
        void window.api?.siteAuth?.close();
        setSaveError(null);
        setBlockedHint(null);
        onClose();
    };

    const handleSave = async (): Promise<void> => {
        setSaveError(null);
        setSaving(true);
        let finishedWhileMounted = false;
        try {
            const r = await window.api?.siteAuth?.saveAndClose();
            if (!r?.ok) {
                const msg =
                    r?.error === 'site_auth_no_session'
                        ? t('siteAuthBrowser.saveRejectedNoSignIn')
                        : (r?.error ?? t('siteAuthBrowser.saveFailed'));
                setSaveError(msg);
                return;
            }
            setSaveError(null);
            setBlockedHint(null);
            setSaving(false);
            finishedWhileMounted = true;
            onSaved();
            onClose();
        } catch {
            setSaveError(t('siteAuthBrowser.saveFailed'));
        } finally {
            if (!finishedWhileMounted) {
                setSaving(false);
            }
        }
    };

    if (!open || (!resolve && !manualOpen)) {
        return null;
    }

    const leadText = manualOpen
        ? t('siteAuthBrowser.leadManual')
        : t('siteAuthBrowser.leadFallback');

    return (
        <div
            ref={dialogRef}
            className={styles.root}
            role="dialog"
            aria-modal="true"
            aria-labelledby="site-auth-modal-title"
        >
            <button
                type="button"
                className={styles.backdrop}
                aria-label={t('siteAuthBrowser.closeAria')}
                disabled={saving}
                onClick={handleClose}
            />
            <div className={styles.panel}>
                <header className={styles.header}>
                    <h2 id="site-auth-modal-title" className={styles.title}>
                        {t('siteAuthBrowser.title', { site: siteLabel })}
                    </h2>
                    <button
                        type="button"
                        className={clsx('ghost-button', styles.close)}
                        disabled={saving}
                        onClick={handleClose}
                    >
                        {t('siteAuthBrowser.close')}
                    </button>
                </header>

                <p className={styles.lead}>{leadText}</p>

                {blockedHint ? <SiteAuthFeedbackCallout tone="warn" message={blockedHint} /> : null}

                <div
                    className={styles.navBar}
                    role="toolbar"
                    aria-label={t('siteAuthBrowser.navAria')}
                >
                    <button
                        type="button"
                        className="ghost-button"
                        disabled={saving || !canGoBack}
                        aria-label={t('siteAuthBrowser.backAria')}
                        title={t('siteAuthBrowser.back')}
                        onClick={() => void window.api?.siteAuth?.goBack()}
                    >
                        {t('siteAuthBrowser.back')}
                    </button>
                    <button
                        type="button"
                        className="ghost-button"
                        disabled={saving || !canGoForward}
                        aria-label={t('siteAuthBrowser.forwardAria')}
                        title={t('siteAuthBrowser.forward')}
                        onClick={() => void window.api?.siteAuth?.goForward()}
                    >
                        {t('siteAuthBrowser.forward')}
                    </button>
                    <button
                        type="button"
                        className="ghost-button"
                        disabled={saving}
                        aria-label={t('siteAuthBrowser.reloadAria')}
                        title={t('siteAuthBrowser.reload')}
                        onClick={() => void window.api?.siteAuth?.reload()}
                    >
                        {t('siteAuthBrowser.reload')}
                    </button>
                    {pageUrl ? (
                        <span className={styles.navUrl} title={pageUrl}>
                            {pageUrl}
                        </span>
                    ) : null}
                    {pageLoading ? (
                        <span className={styles.navLoading} aria-live="polite">
                            {t('siteAuthBrowser.loading')}
                        </span>
                    ) : null}
                </div>

                <div ref={embedRef} className={styles.embedSlot} />

                {saveError ? <SiteAuthFeedbackCallout tone="error" message={saveError} /> : null}

                <footer className={styles.footer}>
                    <button
                        type="button"
                        className="ghost-button"
                        disabled={saving}
                        onClick={handleClose}
                    >
                        {t('siteAuthBrowser.cancel')}
                    </button>
                    <button
                        type="button"
                        className="primary-button"
                        disabled={saving}
                        onClick={() => void handleSave()}
                    >
                        {saving ? t('siteAuthBrowser.saving') : t('siteAuthBrowser.done')}
                    </button>
                </footer>
            </div>
        </div>
    );
}
