import clsx from 'clsx';
import { useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';
import {
    isSupportedLocale,
    LOCALE_FLAGS,
    LOCALE_LABELS,
    SUPPORTED_LOCALES
} from '../../../i18n/supportedLocales';
import styles from './LanguageSelectControl.module.css';

type ListPosition = { top: number; left: number; width: number };

type LanguageSelectControlProps = {
    uiLocale: string;
    onChange: (value: string) => void | Promise<void>;
    controlId?: string;
};

function readListPosition(triggerEl: HTMLElement): ListPosition {
    const r = triggerEl.getBoundingClientRect();
    const margin = 4;
    const maxListHeight = Math.min(window.innerHeight * 0.5, 280);
    let top = r.bottom + margin;
    const spaceBelow = window.innerHeight - r.bottom - margin;
    const spaceAbove = r.top - margin;
    if (spaceBelow < 120 && spaceAbove > spaceBelow) {
        top = Math.max(margin, r.top - margin - maxListHeight);
    }
    return { top, left: r.left, width: r.width };
}

export default function LanguageSelectControl({
    uiLocale,
    onChange,
    controlId
}: LanguageSelectControlProps): React.JSX.Element {
    const { t } = useTranslation('common');
    const [open, setOpen] = useState(false);
    const [listPosition, setListPosition] = useState<ListPosition>({ top: 0, left: 0, width: 0 });
    const rootRef = useRef<HTMLDivElement>(null);
    const listRef = useRef<HTMLDivElement>(null);
    const listId = useId();

    useLayoutEffect(() => {
        if (!open) {
            return;
        }
        const updateListPosition = (): void => {
            const el = rootRef.current;
            if (!el) {
                return;
            }
            setListPosition(readListPosition(el));
        };
        updateListPosition();
        window.addEventListener('resize', updateListPosition);
        window.addEventListener('scroll', updateListPosition, true);
        return () => {
            window.removeEventListener('resize', updateListPosition);
            window.removeEventListener('scroll', updateListPosition, true);
        };
    }, [open]);

    useEffect(() => {
        if (!open) {
            return;
        }
        const onDoc = (event: MouseEvent): void => {
            const t = event.target as Node;
            if (rootRef.current?.contains(t) || listRef.current?.contains(t)) {
                return;
            }
            setOpen(false);
        };
        document.addEventListener('mousedown', onDoc);
        return () => document.removeEventListener('mousedown', onDoc);
    }, [open]);

    useEffect(() => {
        if (!open) {
            return;
        }
        const onKey = (event: KeyboardEvent): void => {
            if (event.key === 'Escape') {
                setOpen(false);
            }
        };
        document.addEventListener('keydown', onKey);
        return () => document.removeEventListener('keydown', onKey);
    }, [open]);

    const saved = uiLocale.trim();
    const resolvedSaved = isSupportedLocale(saved) ? saved : '';
    const triggerFlag = resolvedSaved ? LOCALE_FLAGS[resolvedSaved] : '🌐';
    const triggerLabel = resolvedSaved ? LOCALE_LABELS[resolvedSaved] : t('systemDefault');

    const handlePick = async (value: string): Promise<void> => {
        setOpen(false);
        await onChange(value);
    };

    const list =
        open && typeof document !== 'undefined'
            ? createPortal(
                  <div
                      ref={listRef}
                      id={listId}
                      className={styles.list}
                      role="listbox"
                      style={{
                          top: listPosition.top,
                          left: listPosition.left,
                          width: listPosition.width
                      }}
                  >
                      <button
                          type="button"
                          role="option"
                          aria-selected={!resolvedSaved}
                          className={styles.option}
                          onClick={() => void handlePick('')}
                      >
                          <span className={styles.optionInner} dir="ltr">
                              <span className={styles.flag} aria-hidden="true">
                                  🌐
                              </span>
                              {t('systemDefault')}
                          </span>
                      </button>
                      {SUPPORTED_LOCALES.map((code) => (
                          <button
                              key={code}
                              type="button"
                              role="option"
                              aria-selected={resolvedSaved === code}
                              className={styles.option}
                              onClick={() => void handlePick(code)}
                          >
                              <span className={styles.optionInner} dir="ltr">
                                  <span className={styles.flag} aria-hidden="true">
                                      {LOCALE_FLAGS[code]}
                                  </span>
                                  {LOCALE_LABELS[code]}
                              </span>
                          </button>
                      ))}
                  </div>,
                  document.body
              )
            : null;

    return (
        <div className={styles.root} ref={rootRef}>
            <button
                type="button"
                id={controlId}
                className={clsx('input', styles.trigger)}
                aria-haspopup="listbox"
                aria-expanded={open}
                aria-controls={open ? listId : undefined}
                onClick={() => {
                    setOpen((wasOpen) => {
                        const next = !wasOpen;
                        if (next && rootRef.current) {
                            setListPosition(readListPosition(rootRef.current));
                        }
                        return next;
                    });
                }}
            >
                <span className={styles.triggerInner}>
                    <span className={styles.flag} aria-hidden="true">
                        {triggerFlag}
                    </span>
                    <span className={styles.label}>{triggerLabel}</span>
                </span>
                <span className={styles.chevron} aria-hidden="true">
                    ▾
                </span>
            </button>
            {list}
        </div>
    );
}
