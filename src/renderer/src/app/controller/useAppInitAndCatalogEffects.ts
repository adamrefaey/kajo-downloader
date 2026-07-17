import type { TFunction } from 'i18next';
import type { Dispatch, SetStateAction } from 'react';
import { useEffect } from 'react';
import { useSetupStore } from '../../../../store/setupStore';
import type { AppSettings } from '../../../../types';
import { getErrorMessage } from '../../lib/youtubeAppHelpers';
import type { RendererPlatform } from './rendererPlatform';

/** Maximum time to wait for a single IPC call during app initialisation (ms). */
const IPC_INIT_TIMEOUT_MS = 10_000;

/**
 * Wraps a promise in a timeout. If the promise does not resolve within `ms` milliseconds,
 * rejects with a timeout error. On timeout the original promise is still running but its
 * result is ignored — this prevents a stale IPC call from blocking the UI forever.
 */
function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
    const { promise: timeoutPromise, reject } = Promise.withResolvers<never>();
    const timer = setTimeout(
        () => reject(new Error(`IPC call '${label}' timed out after ${ms} ms`)),
        ms
    );
    return Promise.race([promise.finally(() => clearTimeout(timer)), timeoutPromise]);
}

export function useAppInitAndCatalogEffects(options: {
    platform: RendererPlatform;
    hydrateSettings: (settings: AppSettings | null) => void;
    t: TFunction;
    setError: Dispatch<SetStateAction<string | null>>;
}): void {
    const { platform, hydrateSettings, t, setError } = options;

    useEffect(() => {
        document.body.setAttribute('data-platform', platform);
        return () => {
            document.body.removeAttribute('data-platform');
        };
    }, [platform]);

    useEffect(() => {
        if (!window.api) {
            setError(t('errors:rendererApiUnavailable'));
            useSetupStore.getState().setIsCheckingSetup(false);
            return;
        }

        const controller = new AbortController();

        const initialize = async (): Promise<void> => {
            if (controller.signal.aborted) return;
            try {
                const [appSettings, initialSetup] = await Promise.all([
                    withTimeout(window.api.getSettings(), IPC_INIT_TIMEOUT_MS, 'getSettings'),
                    withTimeout(window.api.checkSetup(), IPC_INIT_TIMEOUT_MS, 'checkSetup')
                ]);
                if (controller.signal.aborted) {
                    return;
                }
                hydrateSettings(appSettings);
                useSetupStore.getState().setSetupStatus(initialSetup);
            } catch (cause) {
                if (!controller.signal.aborted) {
                    setError(getErrorMessage(cause, t('errors:failedLoadSettings')));
                }
            } finally {
                if (!controller.signal.aborted) {
                    useSetupStore.getState().setIsCheckingSetup(false);
                }
            }
        };

        void initialize();

        return () => {
            controller.abort();
        };
    }, [hydrateSettings, setError, t]);
}
