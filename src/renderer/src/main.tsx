import '@fontsource/ibm-plex-sans/300.css';
import '@fontsource/ibm-plex-sans/400.css';
import '@fontsource/ibm-plex-sans/600.css';

import './assets/global.css';
import './configureZodJitless';

import appIconUrl from '@resources/icon.png?url';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { I18nextProvider } from 'react-i18next';
import { isRtlLocale } from '../../i18n/localeDirection';
import { bestLocaleFromNavigatorLanguages } from '../../i18n/normalizeLocale';
import i18n, { initRendererI18n } from '../../i18n/rendererI18n';
import App from './App';

// ── Global renderer error telemetry ──────────────────────────────────────────
// Forward uncaught JS errors to the main process for structured logging and
// optional external telemetry (e.g. Sentry). Failures here are silently ignored
// so the error reporters never cause additional crashes.
function reportRendererError(message: string, source: string, stack?: string): void {
    try {
        window.api?.reportRendererError?.({
            message,
            source,
            ...(stack !== undefined ? { stack } : {})
        });
    } catch {
        // Intentionally swallowed — telemetry must not cause additional errors
    }
}

if (typeof window !== 'undefined') {
    window.addEventListener('error', (event) => {
        const err = event.error;
        const message =
            err instanceof Error ? err.message : event.message || 'Unknown script error';
        const stack = err instanceof Error ? err.stack : undefined;
        reportRendererError(message, 'window.onerror', stack);
    });

    window.addEventListener('unhandledrejection', (event) => {
        const reason = event.reason;
        const message =
            reason instanceof Error
                ? reason.message
                : String(reason ?? 'Unhandled promise rejection');
        const stack = reason instanceof Error ? reason.stack : undefined;
        reportRendererError(message, 'unhandledrejection', stack);
    });
}
// ─────────────────────────────────────────────────────────────────────────────

const navigatorLangs =
    typeof navigator !== 'undefined'
        ? navigator.languages?.length
            ? [...navigator.languages]
            : [navigator.language]
        : ['en'];
const initialLng = bestLocaleFromNavigatorLanguages(navigatorLangs);

if (typeof document !== 'undefined') {
    const preloadIcon = document.createElement('link');
    preloadIcon.rel = 'preload';
    preloadIcon.as = 'image';
    preloadIcon.href = appIconUrl;
    document.head.appendChild(preloadIcon);
}

void initRendererI18n(initialLng)
    .then(() => {
        if (typeof document !== 'undefined') {
            document.documentElement.lang = i18n.language;
            document.documentElement.dir = isRtlLocale(i18n.language) ? 'rtl' : 'ltr';
        }

        const rootEl = document.getElementById('root');
        if (!rootEl) {
            return;
        }
        createRoot(rootEl).render(
            <StrictMode>
                <I18nextProvider i18n={i18n}>
                    <App />
                </I18nextProvider>
            </StrictMode>
        );
    })
    .catch((err: unknown) => {
        console.error('[kajo] renderer i18n init failed', err);
    });
