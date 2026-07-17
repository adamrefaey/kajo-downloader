import type { TFunction } from 'i18next';
import type { Dispatch, SetStateAction } from 'react';
import { useSetupStore } from '../../../../store/setupStore';
import type { SiteAuthManualOpenContext } from '../../components/SiteAuthBrowserModal';
import { getErrorMessage } from '../../lib/youtubeAppHelpers';

export type UseSiteAuthSetupHandlersOptions = {
    t: TFunction;
    setError: Dispatch<SetStateAction<string | null>>;
    setSiteSessionsModalOpen: Dispatch<SetStateAction<boolean>>;
    setSiteAuthManualOpen: Dispatch<SetStateAction<SiteAuthManualOpenContext | null>>;
    setSiteAuthModalOpen: Dispatch<SetStateAction<boolean>>;
};

export function useSiteAuthSetupHandlers({
    t,
    setError,
    setSiteSessionsModalOpen,
    setSiteAuthManualOpen,
    setSiteAuthModalOpen
}: UseSiteAuthSetupHandlersOptions): {
    handleOpenSiteAuthFromSessions: (ctx: SiteAuthManualOpenContext) => void;
    handleInstallYtdlp: () => Promise<void>;
} {
    const handleOpenSiteAuthFromSessions = (ctx: SiteAuthManualOpenContext) => {
        setSiteSessionsModalOpen(false);
        // `setSiteAuthModalOpen(true)` resets `manual` to null in the modal reducer; apply manual
        // context after so SiteAuthBrowserModal receives `manualOpen` and can call `siteAuth.open`.
        setSiteAuthModalOpen(true);
        setSiteAuthManualOpen(ctx);
    };

    const handleInstallYtdlp = async (): Promise<void> => {
        useSetupStore.getState().setIsInstallingYtdlp(true);
        useSetupStore.getState().clearSetupLogs();
        setError(null);

        try {
            const nextSetupStatus = await window.api.installYtdlp();
            if (nextSetupStatus) {
                useSetupStore.getState().setSetupStatus(nextSetupStatus);
            }
        } catch (cause) {
            setError(getErrorMessage(cause, t('errors:failedInstallYtdlp')));
        } finally {
            useSetupStore.getState().setIsInstallingYtdlp(false);
        }
    };

    return {
        handleOpenSiteAuthFromSessions,
        handleInstallYtdlp
    };
}
