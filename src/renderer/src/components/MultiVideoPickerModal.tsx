import { useVirtualizer } from '@tanstack/react-virtual';
import clsx from 'clsx';
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
    normalizeSectionTrimTimestampDisplay,
    parseSectionTrimTimestampSeconds
} from '../../../shared/sectionTrim';
import { stripYoutubeChannelTabSuffixFromPlaylistTitle } from '../../../shared/youtubeChannelMerge';
import type { MediaCandidate, YoutubeChannelSectionTab } from '../../../types';
import { useModalFocusTrap } from '../hooks/useModalFocusTrap';
import { formatPlaylistIndex } from '../lib/youtubeAppHelpers';
import shell from './DialogOverlay.module.css';
import styles from './MultiVideoPickerModal.module.css';
import type {
    MultiVideoPickerModalProps,
    MultiVideoPickerSelection
} from './multiVideoPicker/MultiVideoPickerModal.types';
import { MultiVideoPickerVirtualListRow } from './multiVideoPicker/MultiVideoPickerVirtualListRow';
import {
    LIST_OVERSCAN,
    ROW_HEIGHT_COLLAPSED_ESTIMATE_PX,
    ROW_LIST_GAP_PX
} from './multiVideoPicker/multiVideoPickerModalConstants';
import { rowSelectionKey } from './multiVideoPicker/multiVideoPickerModalUtils';

export type {
    MultiVideoPickerChannelTabsConfig,
    MultiVideoPickerModalProps,
    MultiVideoPickerSelection
} from './multiVideoPicker/MultiVideoPickerModal.types';

function MultiVideoPickerModal({
    open,
    onClose,
    collectionTitle,
    entries,
    numberPlaylistItems,
    onNumberPlaylistItemsChange,
    onConfirm,
    channelTabs = null,
    plainPlaylistStreaming = false,
    plainPlaylistError = null
}: MultiVideoPickerModalProps): React.JSX.Element | null {
    'use no memo'; // Uses TanStack useVirtualizer which returns unstable functions — incompatible with React Compiler memoization
    const { t } = useTranslation('components');
    const { t: tCommon } = useTranslation('common');
    const { t: tApp } = useTranslation('app');
    const [query, setQuery] = useState('');
    const [selectedKeys, setSelectedKeys] = useState<Set<string>>(() => new Set());
    const [trimByKey, setTrimByKey] = useState<Record<string, { start: string; end: string }>>({});
    const [expandedTrimKeys, setExpandedTrimKeys] = useState<Set<string>>(() => new Set());
    const dialogRef = useRef<HTMLDivElement>(null);
    const scrollRef = useRef<HTMLDivElement>(null);
    const openChannelRef = useRef(false);
    useModalFocusTrap(dialogRef, open);
    const openPlainRef = useRef(false);
    /** Plain playlist streaming: avoid O(n²) re-selecting the full list on every batch. */
    const prevStreamedPlainLenRef = useRef(0);
    /** Channel tab streaming: same, per tab. */
    const prevStreamedChannelLenByTabRef = useRef<
        Partial<Record<YoutubeChannelSectionTab, number>>
    >({});

    const activeChannelTab = channelTabs?.activeTab ?? null;
    const listEntries = channelTabs
        ? (channelTabs.tabEntries[channelTabs.activeTab] ?? [])
        : entries;

    const qNorm = query.trim().toLowerCase();
    const filtered = !qNorm
        ? listEntries
        : listEntries.filter((e) => {
              const hay = `${e.title} ${e.author} ${e.url}`.toLowerCase();
              return hay.includes(qNorm);
          });

    const listForVirtual = open ? filtered : [];

    // eslint-disable-next-line react-hooks/incompatible-library -- component opts out of compilation via "use no memo"
    const virtualizer = useVirtualizer({
        count: listForVirtual.length,
        getScrollElement: () => scrollRef.current,
        estimateSize: () => ROW_HEIGHT_COLLAPSED_ESTIMATE_PX,
        gap: ROW_LIST_GAP_PX,
        overscan: LIST_OVERSCAN,
        getItemKey: (index) => {
            const row = listForVirtual[index];
            if (row === undefined) {
                return `missing:${index}`;
            }
            return rowSelectionKey(row, activeChannelTab);
        }
    });

    useEffect(() => {
        if (!open) {
            openChannelRef.current = false;
            openPlainRef.current = false;
            prevStreamedPlainLenRef.current = 0;
            prevStreamedChannelLenByTabRef.current = {};
            return;
        }
        if (channelTabs) {
            const becameOpen = !openChannelRef.current;
            openChannelRef.current = true;
            openPlainRef.current = false;
            prevStreamedPlainLenRef.current = 0;
            if (becameOpen) {
                prevStreamedChannelLenByTabRef.current = {};
                setSelectedKeys(new Set());
                setQuery('');
                setTrimByKey({});
                setExpandedTrimKeys(new Set());
                requestAnimationFrame(() => {
                    scrollRef.current?.scrollTo({ top: 0 });
                });
            }
            return;
        }
        openChannelRef.current = false;
        const becamePlainOpen = !openPlainRef.current;
        openPlainRef.current = true;
        prevStreamedChannelLenByTabRef.current = {};
        if (becamePlainOpen) {
            prevStreamedPlainLenRef.current = 0;
            setSelectedKeys(new Set());
            setQuery('');
            setTrimByKey({});
            setExpandedTrimKeys(new Set());
            requestAnimationFrame(() => {
                scrollRef.current?.scrollTo({ top: 0 });
            });
        }
        const list = entries;
        if (list.length < prevStreamedPlainLenRef.current) {
            prevStreamedPlainLenRef.current = 0;
        }
        if (list.length > prevStreamedPlainLenRef.current) {
            const start = prevStreamedPlainLenRef.current;
            const newSlice = list.slice(start);
            prevStreamedPlainLenRef.current = list.length;
            setSelectedKeys((prev) => {
                const next = new Set(prev);
                for (const e of newSlice) {
                    next.add(rowSelectionKey(e, null));
                }
                return next;
            });
            setTrimByKey((prev) => {
                const out = { ...prev };
                for (const e of newSlice) {
                    const k = rowSelectionKey(e, null);
                    if (!out[k]) {
                        out[k] = { start: '', end: '' };
                    }
                }
                return out;
            });
        }
    }, [open, entries, channelTabs]);

    useEffect(() => {
        if (!open || !channelTabs) {
            return;
        }
        const tab = channelTabs.activeTab;
        const list = channelTabs.tabEntries[tab] ?? [];
        if (list.length === 0) {
            return;
        }
        let start = prevStreamedChannelLenByTabRef.current[tab] ?? 0;
        if (list.length < start) {
            start = 0;
            prevStreamedChannelLenByTabRef.current[tab] = 0;
        }
        if (list.length <= start) {
            return;
        }
        const newSlice = list.slice(start);
        prevStreamedChannelLenByTabRef.current[tab] = list.length;
        setSelectedKeys((prev) => {
            const next = new Set(prev);
            for (const e of newSlice) {
                next.add(rowSelectionKey(e, tab));
            }
            return next;
        });
        setTrimByKey((prev) => {
            const out = { ...prev };
            for (const e of newSlice) {
                const k = rowSelectionKey(e, tab);
                if (!out[k]) {
                    out[k] = { start: '', end: '' };
                }
            }
            return out;
        });
    }, [open, channelTabs]);

    /** Only reset scroll when the channel tab changes — not when `channelTabs` is a new object with more streamed entries. */
    const channelScrollResetKey = channelTabs?.activeTab;
    useEffect(() => {
        if (!open || channelScrollResetKey == null) {
            return;
        }
        requestAnimationFrame(() => {
            scrollRef.current?.scrollTo({ top: 0 });
            virtualizer.scrollToOffset(0);
        });
    }, [open, channelScrollResetKey, virtualizer]);

    // Remeasure row heights after trim panels open/close, filter, or list size changes (virtualizer overlap fix).
    useLayoutEffect(() => {
        void expandedTrimKeys;
        void listForVirtual.length;
        void query;
        if (!open) {
            return;
        }
        virtualizer.measure();
    }, [open, expandedTrimKeys, listForVirtual.length, query, virtualizer]);

    const selectedCount = (() => {
        let c = 0;
        if (!channelTabs) {
            for (const e of entries) {
                if (selectedKeys.has(rowSelectionKey(e, null))) {
                    c += 1;
                }
            }
        } else {
            for (const tab of channelTabs.tabs) {
                for (const e of channelTabs.tabEntries[tab] ?? []) {
                    if (selectedKeys.has(rowSelectionKey(e, tab))) {
                        c += 1;
                    }
                }
            }
        }
        return c;
    })();

    const indexPadWidth = Math.max(2, String(listEntries.length).length);

    const ordinalByEntryKey = (() => {
        const m = new Map<string, number>();
        for (let i = 0; i < listEntries.length; i += 1) {
            const row = listEntries[i];
            if (row) {
                m.set(rowSelectionKey(row, activeChannelTab), i + 1);
            }
        }
        return m;
    })();

    let channelTabsSummary: string | null = null;
    if (!channelTabs) {
        const order: YoutubeChannelSectionTab[] = ['videos', 'shorts', 'live'];
        const present = new Set<YoutubeChannelSectionTab>();
        for (const e of entries) {
            if (e.channelSection) {
                present.add(e.channelSection);
            }
        }
        if (present.size > 0) {
            channelTabsSummary = order
                .filter((k) => present.has(k))
                .map((k) => t(`multiVideoPicker.channelTab.${k}`))
                .join(' · ');
        }
    }

    const toggleKey = (key: string, checked: boolean) => {
        setSelectedKeys((prev) => {
            const next = new Set(prev);
            if (checked) {
                next.add(key);
            } else {
                next.delete(key);
            }
            return next;
        });
    };

    const handleSelectAll = () => {
        if (!channelTabs) {
            setSelectedKeys(new Set(entries.map((e) => rowSelectionKey(e, null))));
            return;
        }
        const tab = channelTabs.activeTab;
        setSelectedKeys((prev) => {
            const next = new Set(prev);
            for (const e of channelTabs.tabEntries[tab] ?? []) {
                next.add(rowSelectionKey(e, tab));
            }
            return next;
        });
    };

    const handleUnselectAll = () => {
        if (!channelTabs) {
            setSelectedKeys(new Set());
            return;
        }
        const tab = channelTabs.activeTab;
        setSelectedKeys((prev) => {
            const next = new Set(prev);
            for (const e of channelTabs.tabEntries[tab] ?? []) {
                next.delete(rowSelectionKey(e, tab));
            }
            return next;
        });
    };

    const handleInvert = () => {
        if (!channelTabs) {
            setSelectedKeys((prev) => {
                const next = new Set<string>();
                for (const e of entries) {
                    const k = rowSelectionKey(e, null);
                    if (!prev.has(k)) {
                        next.add(k);
                    }
                }
                return next;
            });
            return;
        }
        const tab = channelTabs.activeTab;
        setSelectedKeys((prev) => {
            const next = new Set(prev);
            for (const e of channelTabs.tabEntries[tab] ?? []) {
                const k = rowSelectionKey(e, tab);
                if (next.has(k)) {
                    next.delete(k);
                } else {
                    next.add(k);
                }
            }
            return next;
        });
    };

    const toggleTrimExpanded = (entryKey: string) => {
        setExpandedTrimKeys((prev) => {
            const next = new Set(prev);
            if (next.has(entryKey)) {
                next.delete(entryKey);
            } else {
                next.add(entryKey);
            }
            return next;
        });
    };

    const patchTrim = (key: string, patch: Partial<{ start: string; end: string }>) => {
        setTrimByKey((prev) => {
            const cur = prev[key] ?? { start: '', end: '' };
            return {
                ...prev,
                [key]: {
                    start: patch.start !== undefined ? patch.start : cur.start,
                    end: patch.end !== undefined ? patch.end : cur.end
                }
            };
        });
    };

    const handleConfirm = () => {
        let selected: MediaCandidate[] = [];
        if (!channelTabs) {
            selected = entries.filter((e) => selectedKeys.has(rowSelectionKey(e, null)));
        } else {
            for (const tab of channelTabs.tabs) {
                for (const e of channelTabs.tabEntries[tab] ?? []) {
                    if (selectedKeys.has(rowSelectionKey(e, tab))) {
                        selected.push(e);
                    }
                }
            }
        }
        if (selected.length === 0) {
            return;
        }
        // Build a map of entry → 1-based ordinal within its full list so that
        // the queue/filename uses the original playlist position, not a re-sequenced index.
        const entryOrdinalMap = new Map<MediaCandidate, number>();
        if (!channelTabs) {
            for (let i = 0; i < entries.length; i += 1) {
                const e = entries[i];
                if (e) entryOrdinalMap.set(e, i + 1);
            }
        } else {
            for (const tab of channelTabs.tabs) {
                const tabEntries = channelTabs.tabEntries[tab] ?? [];
                for (let i = 0; i < tabEntries.length; i += 1) {
                    const e = tabEntries[i];
                    if (e) entryOrdinalMap.set(e, i + 1);
                }
            }
        }
        const selections: MultiVideoPickerSelection[] = selected.map((entry) => {
            const tabForKey: YoutubeChannelSectionTab | null = channelTabs
                ? (entry.channelSection ?? activeChannelTab)
                : null;
            const key = rowSelectionKey(entry, tabForKey);
            const tr = trimByKey[key];
            const ps = tr?.start?.trim() ?? '';
            const pe = tr?.end?.trim() ?? '';
            const sectionTrim =
                ps &&
                pe &&
                parseSectionTrimTimestampSeconds(ps) !== null &&
                parseSectionTrimTimestampSeconds(pe) !== null
                    ? {
                          start: normalizeSectionTrimTimestampDisplay(ps).slice(0, 24),
                          end: normalizeSectionTrimTimestampDisplay(pe).slice(0, 24)
                      }
                    : undefined;
            return { entry, sectionTrim, originalOrdinal: entryOrdinalMap.get(entry) };
        });
        onConfirm(selections);
    };

    useEffect(() => {
        if (!open) {
            return;
        }
        const handleKeyDown = (event: KeyboardEvent) => {
            if (event.key === 'Escape') {
                onClose();
            }
        };
        document.addEventListener('keydown', handleKeyDown);
        return () => document.removeEventListener('keydown', handleKeyDown);
    }, [open, onClose]);

    if (!open) {
        return null;
    }

    const trimmedCollectionTitle = collectionTitle.trim();
    const displayTitle: string | null =
        trimmedCollectionTitle === ''
            ? null
            : channelTabs
              ? stripYoutubeChannelTabSuffixFromPlaylistTitle(trimmedCollectionTitle)
              : trimmedCollectionTitle;
    const virtualItems = virtualizer.getVirtualItems();
    const totalSize = virtualizer.getTotalSize();
    const activeChannelEntriesLen = channelTabs
        ? (channelTabs.tabEntries[channelTabs.activeTab]?.length ?? 0)
        : 0;
    const tabLoadingNow =
        channelTabs != null &&
        Boolean(channelTabs.tabLoading[channelTabs.activeTab]) &&
        activeChannelEntriesLen === 0;
    const tabLoadingMore =
        channelTabs != null &&
        Boolean(channelTabs.tabLoading[channelTabs.activeTab]) &&
        activeChannelEntriesLen > 0;
    const tabErrorNow = channelTabs ? channelTabs.tabError[channelTabs.activeTab] : undefined;

    return (
        <div
            ref={dialogRef}
            className={clsx(shell.overlay, shell.overlayGrid, shell.overlayPickerZ)}
            role="dialog"
            aria-modal="true"
            aria-labelledby="multi-video-picker-title"
        >
            <button
                type="button"
                className={shell.backdropHit}
                aria-label={t('multiVideoPicker.closeAria')}
                onClick={onClose}
            />
            <div className={clsx('panel', shell.modal, shell.modalInGrid, styles.dialog)}>
                <div className={clsx(shell.modalHead, styles.head)}>
                    <div className={styles.headText}>
                        <h2 id="multi-video-picker-title">{t('multiVideoPicker.title')}</h2>
                        {displayTitle ? (
                            <p className={styles.subtitle} dir="auto">
                                {displayTitle}
                            </p>
                        ) : null}
                        {channelTabsSummary ? (
                            <p className={styles.channelSummary} dir="auto">
                                {channelTabsSummary}
                            </p>
                        ) : null}
                    </div>
                    <button type="button" className="ghost-button" onClick={onClose}>
                        {tCommon('close')}
                    </button>
                </div>

                {channelTabs ? (
                    <div
                        className={styles.tabStrip}
                        role="tablist"
                        aria-label={t('multiVideoPicker.tabsAria')}
                    >
                        {channelTabs.tabs.map((tab) => {
                            const isActive = tab === channelTabs.activeTab;
                            const loading = Boolean(channelTabs.tabLoading[tab]);
                            const hasErr = Boolean(channelTabs.tabError[tab]?.trim());
                            return (
                                <button
                                    key={tab}
                                    type="button"
                                    role="tab"
                                    aria-selected={isActive}
                                    className={clsx(styles.tabBtn, isActive && styles.tabBtnActive)}
                                    onClick={() => channelTabs.onTabChange(tab)}
                                >
                                    {t(`multiVideoPicker.channelTab.${tab}`)}
                                    {loading ? (
                                        <span className={styles.tabStatus} aria-hidden="true">
                                            {' '}
                                            …
                                        </span>
                                    ) : null}
                                    {hasErr && !loading ? (
                                        <span className={styles.tabStatusError} aria-hidden="true">
                                            {' '}
                                            !
                                        </span>
                                    ) : null}
                                </button>
                            );
                        })}
                    </div>
                ) : null}

                <div className={styles.toolbar}>
                    <label className="sr-only" htmlFor="multi-video-picker-q">
                        {t('multiVideoPicker.searchLabel')}
                    </label>
                    <input
                        id="multi-video-picker-q"
                        type="search"
                        className={styles.search}
                        placeholder={t('multiVideoPicker.searchPlaceholder')}
                        value={query}
                        onChange={(e) => {
                            const next = e.target.value;
                            setQuery(next);
                            scrollRef.current?.scrollTo({ top: 0 });
                            virtualizer.scrollToOffset(0);
                        }}
                        autoComplete="off"
                    />
                    <fieldset className={styles.bulk}>
                        <legend className="sr-only">{t('multiVideoPicker.bulkAria')}</legend>
                        <button
                            type="button"
                            className={clsx('ghost-button', styles.bulkBtn)}
                            onClick={handleSelectAll}
                        >
                            {t('multiVideoPicker.selectAll')}
                        </button>
                        <button
                            type="button"
                            className={clsx('ghost-button', styles.bulkBtn)}
                            onClick={handleUnselectAll}
                        >
                            {t('multiVideoPicker.unselectAll')}
                        </button>
                        <button
                            type="button"
                            className={clsx('ghost-button', styles.bulkBtn)}
                            onClick={handleInvert}
                        >
                            {t('multiVideoPicker.invert')}
                        </button>
                        <label className={clsx(styles.numberToggle, 'toggle')}>
                            <input
                                type="checkbox"
                                checked={numberPlaylistItems}
                                onChange={(e) => onNumberPlaylistItemsChange(e.target.checked)}
                            />
                            <span
                                className={styles.numberToggleText}
                                title={t('multiVideoPicker.numberListToggleHint')}
                            >
                                {tApp('numberFiles')}
                            </span>
                        </label>
                    </fieldset>
                </div>

                {query.trim() ? (
                    <p className={styles.count} aria-live="polite">
                        {t('multiVideoPicker.matching', { count: filtered.length })}
                    </p>
                ) : null}

                {plainPlaylistError?.trim() ? (
                    <p className={styles.empty} role="alert">
                        {plainPlaylistError.trim()}
                    </p>
                ) : null}

                {/* biome-ignore lint/a11y/useSemanticElements: virtualized rows use absolute positioning; ul/li nesting is invalid */}
                <div
                    ref={scrollRef}
                    role="list"
                    className={styles.scroll}
                    aria-label={t('multiVideoPicker.listAria')}
                >
                    {tabLoadingNow ? (
                        <div className={styles.empty} role="status">
                            {t('multiVideoPicker.tabLoading')}
                        </div>
                    ) : tabErrorNow?.trim() ? (
                        <div className={styles.empty} role="alert">
                            {tabErrorNow}
                        </div>
                    ) : listForVirtual.length === 0 ? (
                        <div className={styles.empty} role="status">
                            {t('multiVideoPicker.noMatches')}
                        </div>
                    ) : (
                        <div
                            className={styles.virtualInner}
                            style={{
                                height: totalSize,
                                position: 'relative',
                                width: '100%'
                            }}
                        >
                            {virtualItems.map((virtualRow) => {
                                const entry = listForVirtual[virtualRow.index];
                                if (!entry) {
                                    return null;
                                }
                                const key = rowSelectionKey(entry, activeChannelTab);
                                const checked = selectedKeys.has(key);
                                const trim = trimByKey[key] ?? { start: '', end: '' };
                                const ordinal = ordinalByEntryKey.get(key);
                                const indexLabel =
                                    numberPlaylistItems && ordinal !== undefined
                                        ? formatPlaylistIndex(ordinal, indexPadWidth)
                                        : null;
                                const trimExpanded = expandedTrimKeys.has(key);
                                return (
                                    <MultiVideoPickerVirtualListRow
                                        key={virtualRow.key}
                                        virtualRow={virtualRow}
                                        entry={entry}
                                        selectionKey={key}
                                        checked={checked}
                                        trim={trim}
                                        indexLabel={indexLabel}
                                        trimExpanded={trimExpanded}
                                        measureElement={virtualizer.measureElement}
                                        onToggleChecked={(nextChecked) =>
                                            toggleKey(key, nextChecked)
                                        }
                                        onToggleTrimExpanded={() => toggleTrimExpanded(key)}
                                        onPatchTrim={(patch) => patchTrim(key, patch)}
                                    />
                                );
                            })}
                        </div>
                    )}
                </div>

                {plainPlaylistStreaming || tabLoadingMore ? (
                    <p className={styles.streamingFooter} role="status" aria-live="polite">
                        {t('multiVideoPicker.loadingMoreFooter')}
                    </p>
                ) : null}

                <div className={styles.actions}>
                    <button type="button" className="ghost-button" onClick={onClose}>
                        {t('multiVideoPicker.cancel')}
                    </button>
                    <button
                        type="button"
                        className="primary-button"
                        disabled={
                            selectedCount === 0 ||
                            plainPlaylistStreaming ||
                            Boolean(plainPlaylistError?.trim())
                        }
                        onClick={handleConfirm}
                    >
                        {t('multiVideoPicker.addSelected', { count: selectedCount })}
                    </button>
                </div>
            </div>
        </div>
    );
}

export default MultiVideoPickerModal;
