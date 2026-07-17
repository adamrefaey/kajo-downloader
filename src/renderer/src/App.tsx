import { ErrorBoundary } from 'react-error-boundary';
import { useTranslation } from 'react-i18next';
import { useSetupStore } from '../../store/setupStore';
import { AppBootSplashLayout } from './app/AppBootSplashLayout';
import { AppPreparedLayout } from './app/AppPreparedLayout';
import { WorkflowProvider } from './app/context/WorkflowProvider';
import type { RendererPlatform } from './app/controller/rendererPlatform';
import { ErrorFallback } from './components/ErrorFallback';

const platform: RendererPlatform = window.api?.getPlatform?.() ?? 'unknown';

function handleBoundaryError(error: unknown, info: { componentStack?: string | null }): void {
    try {
        const message = error instanceof Error ? error.message : String(error);
        const stack = info.componentStack ?? (error instanceof Error ? error.stack : undefined);
        window.api?.reportRendererError?.({
            message,
            source: 'react-error-boundary',
            ...(stack !== undefined ? { stack } : {})
        });
    } catch {
        // Intentionally swallowed
    }
}

function App(): React.JSX.Element {
    const { t } = useTranslation(['app', 'errors', 'common', 'components']);
    const isCheckingSetup = useSetupStore((s) => s.isCheckingSetup);
    return (
        <ErrorBoundary FallbackComponent={ErrorFallback} onError={handleBoundaryError}>
            <WorkflowProvider>
                {isCheckingSetup ? (
                    <AppBootSplashLayout platform={platform} t={t} />
                ) : (
                    <ErrorBoundary FallbackComponent={ErrorFallback} onError={handleBoundaryError}>
                        <AppPreparedLayout />
                    </ErrorBoundary>
                )}
            </WorkflowProvider>
        </ErrorBoundary>
    );
}

export default App;
