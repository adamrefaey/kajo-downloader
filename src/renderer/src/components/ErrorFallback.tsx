import type { FallbackProps } from 'react-error-boundary';
import { useTranslation } from 'react-i18next';

export function ErrorFallback({ error, resetErrorBoundary }: FallbackProps): React.JSX.Element {
    const { t } = useTranslation('errors');
    return (
        <div role="alert" style={{ padding: '1rem', textAlign: 'center' }}>
            <p>{t('sectionCrash', 'Something went wrong in this section.')}</p>
            <pre
                style={{
                    fontSize: '0.75rem',
                    color: 'var(--text-2)',
                    whiteSpace: 'pre-wrap',
                    marginTop: '0.5rem'
                }}
            >
                {error instanceof Error ? error.message : String(error)}
            </pre>
            <button
                type="button"
                onClick={resetErrorBoundary}
                style={{
                    marginTop: '0.75rem',
                    padding: '0.375rem 0.75rem',
                    borderRadius: '6px',
                    border: '1px solid var(--border)',
                    background: 'var(--bg-2)',
                    color: 'var(--text-1)',
                    cursor: 'pointer'
                }}
            >
                {t('retry', 'Retry')}
            </button>
        </div>
    );
}
