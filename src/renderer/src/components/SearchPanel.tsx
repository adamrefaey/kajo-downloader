import type React from 'react';
import { useEffect, useId, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { SEARCH_GENERIC_ERROR_KEY, useSearchStore } from '../../../store/searchStore';
import type { SearchResultRow } from '../../../types';
import styles from './SearchPanel.module.css';

function formatDuration(seconds: number): string {
    if (seconds <= 0) return '';
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = seconds % 60;
    if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
    return `${m}:${String(s).padStart(2, '0')}`;
}

function SkeletonRows(): React.JSX.Element {
    return (
        <>
            {Array.from({ length: 4 }, (_, i) => (
                <div key={i} className={styles.skeletonRow}>
                    <div className={styles.skeletonThumb} />
                    <div className={styles.skeletonText}>
                        <div className={styles.skeletonLine} />
                        <div className={`${styles.skeletonLine} ${styles.skeletonLineShort}`} />
                    </div>
                </div>
            ))}
        </>
    );
}

interface SearchResultItemProps {
    row: SearchResultRow;
    onDownload: (url: string) => void;
    addedUrls: Set<string>;
}

function SearchResultItem({
    row,
    onDownload,
    addedUrls
}: SearchResultItemProps): React.JSX.Element {
    const { t } = useTranslation('search');
    const isAdded = addedUrls.has(row.url);
    const dur = formatDuration(row.durationSeconds);

    return (
        <div className={styles.resultRow}>
            {row.thumbnailUrl ? (
                <img className={styles.thumb} src={row.thumbnailUrl} alt="" loading="lazy" />
            ) : (
                <div className={styles.thumbPlaceholder} />
            )}
            <div className={styles.resultInfo}>
                <div className={styles.resultTitle} title={row.title}>
                    {row.title}
                </div>
                <div className={styles.resultMeta}>
                    {row.channel && <>{row.channel}</>}
                    {row.channel && dur && ' \u00b7 '}
                    {dur}
                </div>
            </div>
            <button
                type="button"
                className={styles.downloadBtn}
                disabled={isAdded}
                onClick={() => onDownload(row.url)}
            >
                {isAdded ? t('search.added') : t('search.addToQueue')}
            </button>
        </div>
    );
}

interface SearchPanelProps {
    onQueueUrl?: (url: string) => void;
}

export default function SearchPanel({ onQueueUrl }: SearchPanelProps): React.JSX.Element {
    const { t } = useTranslation('search');
    const searchInputId = useId();
    const inputRef = useRef<HTMLInputElement>(null);
    const [addedUrls, setAddedUrls] = useState<Set<string>>(() => new Set<string>());

    const {
        query,
        results,
        visibleCount,
        isSearching,
        hasSearched,
        usage,
        error,
        setQuery,
        search,
        loadMore,
        loadUsage
    } = useSearchStore();

    useEffect(() => {
        loadUsage();
    }, [loadUsage]);

    const handleSearch = (): void => {
        if (query.trim().length >= 2 && !isSearching) {
            search();
        }
    };

    const handleKeyDown = (e: React.KeyboardEvent): void => {
        if (e.key === 'Enter') {
            handleSearch();
        }
    };

    const handleDownload = (url: string): void => {
        setAddedUrls((prev) => new Set([...prev, url]));
        onQueueUrl?.(url);
    };

    const visibleResults = results.slice(0, visibleCount);
    const hasMore = visibleCount < results.length;
    const displayError = error === SEARCH_GENERIC_ERROR_KEY ? t('search.failed') : error;

    return (
        <div className={styles.panel}>
            <div className={styles.searchRow}>
                <label htmlFor={searchInputId} className="sr-only">
                    {t('search.inputLabel')}
                </label>
                <input
                    ref={inputRef}
                    id={searchInputId}
                    className={styles.searchInput}
                    type="text"
                    placeholder={t('search.placeholder')}
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    onKeyDown={handleKeyDown}
                    disabled={isSearching}
                />
                <button
                    type="button"
                    className={styles.searchBtn}
                    disabled={isSearching || query.trim().length < 2}
                    onClick={handleSearch}
                >
                    {isSearching ? t('search.searching') : t('search.title')}
                </button>
            </div>

            <div className={styles.results} aria-busy={isSearching}>
                {isSearching && <SkeletonRows />}
                {!isSearching && displayError && (
                    <div className={styles.errorState} role="alert">
                        {displayError}
                    </div>
                )}
                {!isSearching && hasSearched && results.length === 0 && !error && (
                    <div className={styles.emptyState}>{t('search.noResults')}</div>
                )}
                {!isSearching &&
                    visibleResults.map((row) => (
                        <SearchResultItem
                            key={row.id}
                            row={row}
                            onDownload={handleDownload}
                            addedUrls={addedUrls}
                        />
                    ))}
                {!isSearching && hasMore && (
                    <button type="button" className={styles.loadMoreBtn} onClick={loadMore}>
                        {t('search.loadMore')}
                    </button>
                )}
            </div>

            {usage ? <div className={styles.usageFooter}>{t('search.usageUnlimited')}</div> : null}
        </div>
    );
}
