import type { Dispatch, SetStateAction } from 'react';
import { useEffect } from 'react';
import { isRtlLocale } from '../../../../i18n/localeDirection';
import {
    bestLocaleFromNavigatorLanguages,
    normalizeLocale
} from '../../../../i18n/normalizeLocale';
import i18n from '../../../../i18n/rendererI18n';
import { useSignedSitesStore } from '../../../../store/signedSitesStore';
import type { AppSettings, VideoInfo } from '../../../../types';

export function useAppLocaleAndSiteEffects(options: {
    uiLocale: AppSettings['uiLocale'];
    videoInfo: VideoInfo | null;
    multilineBatchActive: boolean;
    trimmedUrl: string;
    setPreviewTrimStart: Dispatch<SetStateAction<string>>;
    setPreviewTrimEnd: Dispatch<SetStateAction<string>>;
    setPreviewTrimExpanded: Dispatch<SetStateAction<boolean>>;
}): void {
    const {
        uiLocale,
        videoInfo,
        multilineBatchActive,
        trimmedUrl,
        setPreviewTrimStart,
        setPreviewTrimEnd,
        setPreviewTrimExpanded
    } = options;

    useEffect(() => {
        let cancelled = false;
        const run = async (): Promise<void> => {
            const saved = uiLocale?.trim();
            const langs = navigator.languages?.length
                ? [...navigator.languages]
                : [navigator.language];
            let next: ReturnType<typeof normalizeLocale>;
            if (saved) {
                next = normalizeLocale(saved);
            } else {
                let osRaw = '';
                try {
                    const tag = await window.api?.getSystemLocale?.();
                    if (typeof tag === 'string' && tag.trim()) {
                        osRaw = tag.trim();
                    }
                } catch {
                    /* ignore */
                }
                next = osRaw ? normalizeLocale(osRaw) : bestLocaleFromNavigatorLanguages(langs);
            }
            if (cancelled) {
                return;
            }
            void i18n.changeLanguage(next);
            document.documentElement.lang = next;
            document.documentElement.dir = isRtlLocale(next) ? 'rtl' : 'ltr';
        };
        void run();
        return () => {
            cancelled = true;
        };
    }, [uiLocale]);

    const previewTrimResetKey = multilineBatchActive
        ? trimmedUrl
        : `${videoInfo?.id ?? ''}:${videoInfo?.url ?? ''}`;

    useEffect(() => {
        setPreviewTrimStart('');
        setPreviewTrimEnd('');
        setPreviewTrimExpanded(false);
    }, [previewTrimResetKey, setPreviewTrimEnd, setPreviewTrimExpanded, setPreviewTrimStart]);

    useEffect(() => {
        void useSignedSitesStore.getState().refreshFromMain();
    }, []);

    useEffect(() => {
        const unsub = window.api?.siteAuth?.onCookieRefresh?.(() => {
            void useSignedSitesStore.getState().refreshFromMain();
        });
        return () => {
            unsub?.();
        };
    }, []);
}
