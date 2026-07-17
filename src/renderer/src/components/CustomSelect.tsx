import clsx from 'clsx';
import type React from 'react';
import { useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import styles from './CustomSelect.module.css';

export type SelectOption = { value: string; label: string };

type ListPosition = { top: number; left: number; width: number };

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

type CustomSelectProps = {
    id?: string;
    value: string;
    onChange: (value: string) => void;
    options: SelectOption[];
    disabled?: boolean;
    className?: string | undefined;
    placeholder?: string;
    'aria-label'?: string;
};

export default function CustomSelect({
    id,
    value,
    onChange,
    options,
    disabled,
    className,
    placeholder,
    'aria-label': ariaLabel
}: CustomSelectProps): React.JSX.Element {
    const [open, setOpen] = useState(false);
    const [highlightIndex, setHighlightIndex] = useState(0);
    const [listPosition, setListPosition] = useState<ListPosition>({ top: 0, left: 0, width: 0 });
    const rootRef = useRef<HTMLDivElement>(null);
    const listRef = useRef<HTMLDivElement>(null);
    const optionRefs = useRef<Array<HTMLButtonElement | null>>([]);
    const openRef = useRef(false);
    const highlightIndexRef = useRef(0);
    const listId = useId();

    const selectedIndex = options.findIndex((option) => option.value === value);

    useEffect(() => {
        openRef.current = open;
        highlightIndexRef.current = highlightIndex;
    }, [open, highlightIndex]);

    const openList = (initialHighlight?: number): void => {
        if (rootRef.current) {
            setListPosition(readListPosition(rootRef.current));
        }
        const nextHighlight = initialHighlight ?? (selectedIndex >= 0 ? selectedIndex : 0);
        highlightIndexRef.current = nextHighlight;
        openRef.current = true;
        setHighlightIndex(nextHighlight);
        setOpen(true);
    };

    const closeList = (): void => {
        openRef.current = false;
        setOpen(false);
    };

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
        const highlighted = optionRefs.current[highlightIndex];
        highlighted?.scrollIntoView({ block: 'nearest' });
    }, [open, highlightIndex]);

    useEffect(() => {
        if (!open) {
            return;
        }
        const onDoc = (event: MouseEvent): void => {
            const target = event.target as Node;
            if (rootRef.current?.contains(target) || listRef.current?.contains(target)) {
                return;
            }
            closeList();
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
                event.preventDefault();
                closeList();
            }
        };
        document.addEventListener('keydown', onKey);
        return () => document.removeEventListener('keydown', onKey);
    }, [open]);

    const selectedOption = options.find((o) => o.value === value);
    const displayLabel = selectedOption?.label ?? placeholder ?? '';

    const handlePick = (v: string): void => {
        closeList();
        onChange(v);
    };

    const handleKeyDown = (event: React.KeyboardEvent): void => {
        if (disabled || options.length === 0) {
            return;
        }

        const { key } = event;
        const isOpen = openRef.current;

        if (key === 'Escape') {
            if (isOpen) {
                event.preventDefault();
                closeList();
            }
            return;
        }

        if (!isOpen) {
            if (key === 'ArrowDown' || key === 'ArrowUp') {
                event.preventDefault();
                const start = selectedIndex >= 0 ? selectedIndex : 0;
                const next =
                    key === 'ArrowDown'
                        ? Math.min(start + 1, options.length - 1)
                        : Math.max(start - 1, 0);
                openList(next);
                return;
            }
            if (key === 'Enter' || key === ' ') {
                event.preventDefault();
                openList();
            }
            return;
        }

        switch (key) {
            case 'ArrowDown':
                event.preventDefault();
                setHighlightIndex((index) => {
                    const next = Math.min(index + 1, options.length - 1);
                    highlightIndexRef.current = next;
                    return next;
                });
                break;
            case 'ArrowUp':
                event.preventDefault();
                setHighlightIndex((index) => {
                    const next = Math.max(index - 1, 0);
                    highlightIndexRef.current = next;
                    return next;
                });
                break;
            case 'Home':
                event.preventDefault();
                highlightIndexRef.current = 0;
                setHighlightIndex(0);
                break;
            case 'End':
                event.preventDefault();
                highlightIndexRef.current = options.length - 1;
                setHighlightIndex(options.length - 1);
                break;
            case 'Enter':
            case ' ':
                event.preventDefault();
                {
                    const option = options[highlightIndexRef.current];
                    if (option) {
                        handlePick(option.value);
                    }
                }
                break;
            default:
                break;
        }
    };

    const list =
        open && typeof document !== 'undefined'
            ? createPortal(
                  <div
                      ref={listRef}
                      id={listId}
                      className={styles.list}
                      role="listbox"
                      tabIndex={-1}
                      aria-activedescendant={`${listId}-option-${highlightIndex}`}
                      style={{
                          top: listPosition.top,
                          left: listPosition.left,
                          width: listPosition.width
                      }}
                      onKeyDown={handleKeyDown}
                  >
                      {options.map((option, index) => (
                          <button
                              key={option.value}
                              ref={(element) => {
                                  optionRefs.current[index] = element;
                              }}
                              id={`${listId}-option-${index}`}
                              type="button"
                              role="option"
                              aria-selected={value === option.value}
                              className={clsx(
                                  styles.option,
                                  value === option.value && styles.selected,
                                  highlightIndex === index && styles.highlighted
                              )}
                              onMouseEnter={() => {
                                  highlightIndexRef.current = index;
                                  setHighlightIndex(index);
                              }}
                              onClick={() => handlePick(option.value)}
                          >
                              {option.label}
                          </button>
                      ))}
                  </div>,
                  document.body
              )
            : null;

    return (
        <div className={clsx(styles.root, className)} ref={rootRef}>
            <button
                type="button"
                id={id}
                className={clsx('input', styles.trigger, className)}
                aria-haspopup="listbox"
                aria-expanded={open}
                aria-controls={open ? listId : undefined}
                aria-label={ariaLabel}
                disabled={disabled}
                onKeyDown={handleKeyDown}
                onClick={() => {
                    if (openRef.current) {
                        closeList();
                        return;
                    }
                    openList();
                }}
            >
                <span className={styles.label}>{displayLabel}</span>
                <span className={styles.chevron} aria-hidden="true">
                    ▾
                </span>
            </button>
            {list}
        </div>
    );
}
