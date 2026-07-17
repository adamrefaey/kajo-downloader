import { useVirtualizer } from '@tanstack/react-virtual';
import type { ReactNode } from 'react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { ErrorBoundary } from 'react-error-boundary';
import { useTranslation } from 'react-i18next';
import { useDownloadStore } from '../../../store/downloadStore';
import { useDownloadQueueForDisplay } from '../app/context/AppControllerContext';
import {
    queueRowStructureKey,
    type RenderableQueueSegment,
    toRenderableQueueSegments
} from '../utils/queueSegments';
import { DownloadItemById } from './DownloadItem';
import styles from './DownloadQueue.module.css';
import DownloadQueueBatchGroup from './DownloadQueueBatchGroup';
import { ErrorFallback } from './ErrorFallback';
import VirtualizedBatchDownloadList from './VirtualizedBatchDownloadList';

interface DownloadQueueProps {
    previewItem?: ReactNode | undefined;
    onSectionTrimPatch?:
        | ((downloadId: string, patch: Partial<{ start: string; end: string }>) => void)
        | undefined;
    onPause: (downloadId: string) => void | Promise<void>;
    onResume: (downloadId: string) => void | Promise<void>;
    onRetry: (downloadId: string) => void | Promise<void>;
    onRemove: (downloadId: string) => void | Promise<void>;
    onPauseBatch: (batchGroupId: string) => void | Promise<void>;
    onResumeBatch: (batchGroupId: string) => void | Promise<void>;
    onRemoveBatch: (batchGroupId: string) => void | Promise<void>;
    onOpenFile: (filePath: string) => void | Promise<void>;
    onRevealFile: (filePath: string) => void | Promise<void>;
}

const CARDS_PER_PAGE = 4;
/** Above this many top-level segments, use a scrollable virtual list instead of pagination. */
const VIRTUAL_QUEUE_THRESHOLD = 24;

type SegmentHandlerProps = Pick<
    DownloadQueueProps,
    | 'onSectionTrimPatch'
    | 'onPause'
    | 'onResume'
    | 'onRetry'
    | 'onRemove'
    | 'onPauseBatch'
    | 'onResumeBatch'
    | 'onRemoveBatch'
    | 'onOpenFile'
    | 'onRevealFile'
>;

function renderQueueSegment(
    segment: RenderableQueueSegment,
    props: SegmentHandlerProps
): React.JSX.Element {
    const {
        onSectionTrimPatch,
        onPause,
        onResume,
        onRetry,
        onRemove,
        onPauseBatch,
        onResumeBatch,
        onRemoveBatch,
        onOpenFile,
        onRevealFile
    } = props;
    return segment.kind === 'single' ? (
        <DownloadItemById
            key={segment.id}
            downloadId={segment.id}
            onSectionTrimPatch={onSectionTrimPatch}
            onPause={onPause}
            onResume={onResume}
            onRetry={onRetry}
            onRemove={onRemove}
            onOpenFile={onOpenFile}
            onRevealFile={onRevealFile}
        />
    ) : (
        <DownloadQueueBatchGroup
            key={segment.batchGroupId}
            batchGroupId={segment.batchGroupId}
            title={segment.title}
            itemIds={segment.itemIds}
            onPauseBatch={onPauseBatch}
            onResumeBatch={onResumeBatch}
            onRemoveBatch={onRemoveBatch}
        >
            <VirtualizedBatchDownloadList
                batchHeadingId={`queue-batch-${segment.batchGroupId}`}
                itemIds={segment.itemIds}
                onSectionTrimPatch={onSectionTrimPatch}
                onPause={onPause}
                onResume={onResume}
                onRetry={onRetry}
                onRemove={onRemove}
                onOpenFile={onOpenFile}
                onRevealFile={onRevealFile}
            />
        </DownloadQueueBatchGroup>
    );
}

function DownloadQueueSegmentVirtualList({
    segments,
    segmentHandlerProps
}: {
    segments: RenderableQueueSegment[];
    segmentHandlerProps: SegmentHandlerProps;
}): React.JSX.Element {
    'use no memo'; // TanStack Virtual's useVirtualizer returns functions that break memoization — opt out of React Compiler entirely
    const parentRef = useRef<HTMLDivElement>(null);
    // eslint-disable-next-line react-hooks/incompatible-library -- deliberate opt-out via 'use no memo' above
    const virtualizer = useVirtualizer({
        count: segments.length,
        getScrollElement: () => parentRef.current,
        // Provide segment-type-aware initial estimates to reduce layout thrashing on first paint.
        // Actual heights are measured via `ref={virtualizer.measureElement}` after DOM render.
        estimateSize: (index) => {
            const seg = segments[index];
            if (!seg) return 160;
            if (seg.kind === 'batch') {
                // Batch group: header (~56px) + per-item rows (~120px each)
                return 56 + seg.itemIds.length * 120;
            }
            return 160; // single item
        },
        overscan: 4
    });
    return (
        <div ref={parentRef} className={styles.virtualScroll}>
            <div
                className={styles.virtualScrollInner}
                style={{ height: virtualizer.getTotalSize(), position: 'relative', width: '100%' }}
            >
                {virtualizer.getVirtualItems().map((vi) => {
                    const segment = segments[vi.index];
                    if (!segment) {
                        return null;
                    }
                    return (
                        <div
                            key={vi.key}
                            data-index={vi.index}
                            ref={virtualizer.measureElement}
                            style={{
                                position: 'absolute',
                                top: 0,
                                left: 0,
                                width: '100%',
                                transform: `translateY(${vi.start}px)`
                            }}
                        >
                            {renderQueueSegment(segment, segmentHandlerProps)}
                        </div>
                    );
                })}
            </div>
        </div>
    );
}

function DownloadQueue({
    previewItem,
    onSectionTrimPatch,
    onPause,
    onResume,
    onRetry,
    onRemove,
    onPauseBatch,
    onResumeBatch,
    onRemoveBatch,
    onOpenFile,
    onRevealFile
}: DownloadQueueProps): React.JSX.Element {
    'use no memo'; // Intentional structureSig-based useMemo (progress-only updates bypass) cannot be preserved by React Compiler
    const { t } = useTranslation('components');
    const displayQueue = useDownloadQueueForDisplay();
    /** Primitive fingerprint so progress-only updates skip re-renders (Zustand `Object.is` on the string). */
    const structureSig = displayQueue.map(queueRowStructureKey).join('\x1f');
    const queueLength = displayQueue.length;

    /**
     * Intentional `useMemo`: parent re-renders (new handler identities) must not rebuild segment arrays
     * / virtualizer inputs when `structureSig` is unchanged. React Compiler does not tie `getState().queue`
     * to that fingerprint automatically.
     */
    const segments = useMemo(() => {
        return toRenderableQueueSegments(displayQueue);
        // `structureSig` tracks structural queue changes only (not per-row progress).
        // eslint-disable-next-line react-hooks/exhaustive-deps -- structureSig is the custom invalidation key, not displayQueue
    }, [structureSig]);

    const entryCount = segments.length;
    const totalPages = Math.max(1, Math.ceil(entryCount / CARDS_PER_PAGE));
    const [pageIndex, setPageIndex] = useState(0);
    const maxPageIndex = totalPages - 1;
    // Clamp during render instead of in an effect: when the page count shrinks
    // (entries removed), the stored pageIndex can exceed the last page. Deriving
    // the safe value avoids a cascading setState-in-effect re-render.
    const safePageIndex = Math.min(pageIndex, maxPageIndex);
    const prevQueueLenRef = useRef(queueLength);
    const useVirtualList = entryCount > VIRTUAL_QUEUE_THRESHOLD;

    // On mount (download tab becomes visible), prune completed entries whose files no longer exist.
    useEffect(() => {
        if (!window.api?.checkDownloadFilePaths) return;
        const completeEntries = useDownloadStore
            .getState()
            .queue.filter((item) => item.state === 'complete' && typeof item.filePath === 'string')
            .map((item) => ({ id: item.id, filePath: item.filePath as string }));
        if (completeEntries.length === 0) return;
        void window.api.checkDownloadFilePaths(completeEntries).then((staleIds) => {
            const { removeDownload } = useDownloadStore.getState();
            for (const id of staleIds) {
                removeDownload(id);
            }
        });
    }, []);

    useEffect(() => {
        if (queueLength > prevQueueLenRef.current) {
            setPageIndex(0);
        }
        prevQueueLenRef.current = queueLength;
    }, [queueLength]);

    const start = safePageIndex * CARDS_PER_PAGE;
    const end = Math.min(start + CARDS_PER_PAGE, entryCount);

    const segmentHandlerProps: SegmentHandlerProps = {
        onSectionTrimPatch,
        onPause,
        onResume,
        onRetry,
        onRemove,
        onPauseBatch,
        onResumeBatch,
        onRemoveBatch,
        onOpenFile,
        onRevealFile
    };

    const pageItems: React.JSX.Element[] = [];
    if (!useVirtualList) {
        for (let segIdx = start; segIdx < end; segIdx += 1) {
            const segment = segments[segIdx];
            if (segment) {
                pageItems.push(renderQueueSegment(segment, segmentHandlerProps));
            }
        }
    }

    return (
        <section
            id="download-queue-region"
            className={styles.root}
            aria-labelledby="download-queue-heading"
        >
            <h2 id="download-queue-heading" className="sr-only">
                {t('downloadQueue.heading')}
            </h2>

            {previewItem ? (
                <ErrorBoundary FallbackComponent={ErrorFallback}>
                    <div className={styles.previewSlot}>{previewItem}</div>
                </ErrorBoundary>
            ) : null}

            <ErrorBoundary FallbackComponent={ErrorFallback}>
                <div className={useVirtualList ? styles.gridVirtual : styles.grid}>
                    {queueLength === 0 ? (
                        <p className={styles.emptyState} role="status">
                            {t('downloadQueue.empty')}
                        </p>
                    ) : useVirtualList ? (
                        <DownloadQueueSegmentVirtualList
                            segments={segments}
                            segmentHandlerProps={segmentHandlerProps}
                        />
                    ) : (
                        pageItems
                    )}
                </div>
            </ErrorBoundary>
            {!useVirtualList && totalPages > 1 ? (
                <nav className={styles.pagination} aria-label={t('downloadQueue.paginationAria')}>
                    <span className={styles.paginationStatus} aria-live="polite">
                        {t('downloadQueue.pageStatus', {
                            current: safePageIndex + 1,
                            total: totalPages
                        })}
                    </span>
                    <div className={styles.paginationActions}>
                        <button
                            type="button"
                            className="ghost-button"
                            disabled={safePageIndex <= 0}
                            aria-label={t('downloadQueue.prevPageAria')}
                            onClick={() => setPageIndex(Math.max(0, safePageIndex - 1))}
                        >
                            {t('downloadQueue.prevPage')}
                        </button>
                        <button
                            type="button"
                            className="ghost-button"
                            disabled={safePageIndex >= maxPageIndex}
                            aria-label={t('downloadQueue.nextPageAria')}
                            onClick={() => setPageIndex(Math.min(maxPageIndex, safePageIndex + 1))}
                        >
                            {t('downloadQueue.nextPage')}
                        </button>
                    </div>
                </nav>
            ) : null}
        </section>
    );
}

export default DownloadQueue;
