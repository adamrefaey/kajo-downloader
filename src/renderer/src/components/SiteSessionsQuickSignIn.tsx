import { type JSX, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
    getSignInHomeUrlForProfile,
    listSiteProfilesInRolloutOrder,
    type SiteProfile
} from '../../../shared/siteProfiles';
import type { SiteAuthManualOpenContext } from './SiteAuthBrowserModal';
import styles from './SiteSessionsQuickSignIn.module.css';
import { SITE_QUICK_PICK_SIMPLE_ICON } from './siteSessionQuickPickIcons';

const SITE_PROFILES_QUICK_SIGN_IN = listSiteProfilesInRolloutOrder();

function brandSvgFill(siteId: string, hex: string): string {
    if (siteId === 'twitter') {
        return '#e8eaed';
    }
    const clean = hex.replace(/^#/, '');
    const n = Number.parseInt(clean, 16);
    if (Number.isNaN(n) || clean.length !== 6) {
        return `#${clean}`;
    }
    const r = (n >> 16) & 255;
    const g = (n >> 8) & 255;
    const b = n & 255;
    const y = (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
    if (y < 0.2) {
        return '#e8eaed';
    }
    return `#${clean}`;
}

function QuickSiteIcon({
    siteId,
    primaryDomain,
    letter
}: {
    siteId: string;
    primaryDomain: string;
    letter: string;
}): JSX.Element {
    const brand = SITE_QUICK_PICK_SIMPLE_ICON[siteId];
    const [failed, setFailed] = useState(false);

    if (brand) {
        return (
            <span className={styles.iconShell} aria-hidden="true">
                <svg
                    className={styles.brandSvg}
                    viewBox="0 0 24 24"
                    aria-hidden="true"
                    focusable="false"
                >
                    <path d={brand.path} fill={brandSvgFill(siteId, brand.hex)} />
                </svg>
            </span>
        );
    }

    const src = `https://www.google.com/s2/favicons?domain=${encodeURIComponent(primaryDomain)}&sz=128`;

    return (
        <span className={styles.iconShell} aria-hidden="true">
            <span className={styles.fallbackLetter}>{letter}</span>
            {!failed ? (
                <img
                    src={src}
                    alt=""
                    className={styles.faviconFallback}
                    width={36}
                    height={36}
                    loading="eager"
                    decoding="async"
                    onError={() => setFailed(true)}
                />
            ) : null}
        </span>
    );
}

export interface SiteSessionsQuickSignInProps {
    setupReady: boolean;
    onOpenSiteAuth: (ctx: SiteAuthManualOpenContext) => void;
}

export default function SiteSessionsQuickSignIn({
    setupReady,
    onOpenSiteAuth
}: SiteSessionsQuickSignInProps): JSX.Element {
    const { t } = useTranslation('components');

    return (
        <div className={styles.wrap}>
            <p className={styles.lead}>{t('signedSites.quickSitesLead')}</p>
            <ul className={styles.grid}>
                {SITE_PROFILES_QUICK_SIGN_IN.map((profile: SiteProfile) => {
                    const domain = profile.domains[0]?.trim() ?? '';
                    const letter = domain ? domain.charAt(0).toUpperCase() : '?';
                    return (
                        <li key={profile.siteId} className={styles.gridItem}>
                            <button
                                type="button"
                                className={styles.siteBtn}
                                disabled={!setupReady}
                                aria-label={t('signedSites.quickSignInAria', {
                                    site: profile.displayName
                                })}
                                onClick={() => {
                                    const primaryDomain = profile.domains[0]?.trim() ?? '';
                                    onOpenSiteAuth({
                                        initialUrl: getSignInHomeUrlForProfile(profile),
                                        siteId: profile.siteId,
                                        siteDomain: primaryDomain || undefined
                                    });
                                }}
                            >
                                <QuickSiteIcon
                                    siteId={profile.siteId}
                                    primaryDomain={domain || profile.siteId}
                                    letter={letter}
                                />
                                <span className={styles.label}>{profile.displayName}</span>
                            </button>
                        </li>
                    );
                })}
            </ul>
        </div>
    );
}
