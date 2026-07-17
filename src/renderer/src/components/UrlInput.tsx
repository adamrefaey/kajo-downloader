import clsx from 'clsx';
import { useTranslation } from 'react-i18next';
import styles from './UrlInput.module.css';

interface UrlInputProps {
    value: string;
    isLoading?: boolean;
    clipboardHint?: string | null;
    errorText?: string | null;
    isSubmitDisabled?: boolean;
    onSubmit?: () => void | Promise<void>;
    onChange: (value: string) => void;
    inputRef?: React.RefObject<HTMLTextAreaElement | null>;
    /** Tighter outer spacing when nested (e.g. a tab panel). */
    embedded?: boolean;
}

function UrlInput({
    value,
    isLoading = false,
    clipboardHint,
    errorText,
    isSubmitDisabled = true,
    onSubmit,
    onChange,
    inputRef,
    embedded = false
}: UrlInputProps): React.JSX.Element {
    const { t } = useTranslation('components');
    const showError = Boolean(errorText);
    const loadingId = 'download-url-loading';
    const errorId = 'download-url-error';
    const describedBy = showError ? errorId : isLoading ? loadingId : undefined;

    return (
        <section
            className={clsx(styles.section, embedded && styles.sectionEmbedded)}
            aria-label={t('urlInput.sectionAria')}
        >
            {clipboardHint ? (
                <span className="sr-only">{t('urlInput.clipboardDetected')}</span>
            ) : null}

            <div className={clsx(styles.combo, showError && styles.hasError)}>
                <textarea
                    ref={inputRef}
                    id="download-url-input"
                    value={value}
                    className="input"
                    placeholder={t('urlInput.placeholder')}
                    onChange={(event) => onChange(event.target.value)}
                    aria-busy={isLoading}
                    aria-invalid={showError}
                    aria-errormessage={showError ? errorId : undefined}
                    aria-describedby={describedBy}
                    autoComplete="off"
                    spellCheck={false}
                    rows={2}
                />
                <button
                    type="button"
                    className={clsx('primary-button', styles.submit)}
                    onClick={() => {
                        if (onSubmit && !isSubmitDisabled) {
                            void onSubmit();
                        }
                    }}
                    disabled={isSubmitDisabled}
                >
                    {t('urlInput.download')}
                </button>
            </div>

            {showError ? (
                <p id={errorId} className="inline-error" role="alert">
                    {errorText}
                </p>
            ) : null}
            {!showError && isLoading ? (
                <p id={loadingId} className="sr-only" aria-live="polite">
                    {t('urlInput.fetchingDetails')}
                </p>
            ) : null}
        </section>
    );
}

export default UrlInput;
