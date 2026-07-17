import { defaultRangeExtractor, useVirtualizer } from '@tanstack/react-virtual';
import { useRef } from 'react';
import { DownloadItemById } from './DownloadItem';
import batchStyles from './DownloadQueueBatchGroup.module.css';

/** Hard cap on mounted batch rows (visible + overscan window). */
const MAX_BATCH_DOM_ITEMS = 100;
const BATCH_ITEM_GAP_PX = 8;
const COMPACT_ROW_ESTIMATE_PX = 112;

type RangeArg = Parameters<typeof defaultRangeExtractor>[0];

function cappedBatchRangeExtractor(range: RangeArg): number[] {
    const full = defaultRangeExtractor(range);
    if (full.length <= MAX_BATCH_DOM_ITEMS) {
        return full;
    }
    const { startIndex, endIndex, count } = range;
    const out: number[] = [];
    for (let i = startIndex; i <= endIndex; i += 1) {
        out.push(i);
        if (out.length >= MAX_BATCH_DOM_ITEMS) {
            return out;
        }
    }
    let lo = startIndex - 1;
    let hi = endIndex + 1;
    while (out.length < MAX_BATCH_DOM_ITEMS && (lo >= 0 || hi < count)) {
        if (lo >= 0) {
            out.unshift(lo);
            lo -= 1;
            if (out.length >= MAX_BATCH_DOM_ITEMS) {
                return out;
            }
        }
        if (hi < count) {
            out.push(hi);
            hi += 1;
        }
    }
    return out;
}

export type VirtualizedBatchDownloadListProps = {
    itemIds: string[];
    /** Matches `queue-batch-${batchGroupId}` on the batch summary title for a11y. */
    batchHeadingId: string;
    onSectionTrimPatch?:
        | ((downloadId: string, patch: Partial<{ start: string; end: string }>) => void)
        | undefined;
    onPause: (downloadId: string) => void | Promise<void>;
    onResume: (downloadId: string) => void | Promise<void>;
    onRetry: (downloadId: string) => void | Promise<void>;
    onRemove: (downloadId: string) => void | Promise<void>;
    onOpenFile: (filePath: string) => void | Promise<void>;
    onRevealFile: (filePath: string) => void | Promise<void>;
};

function VirtualizedBatchDownloadList({
    itemIds,
    batchHeadingId,
    onSectionTrimPatch,
    onPause,
    onResume,
    onRetry,
    onRemove,
    onOpenFile,
    onRevealFile
}: VirtualizedBatchDownloadListProps): React.JSX.Element {
    'use no memo'; // Uses TanStack useVirtualizer which returns unstable functions — incompatible with React Compiler memoization
    const parentRef = useRef<HTMLElement | null>(null);

    // eslint-disable-next-line react-hooks/incompatible-library -- component opts out of compilation via "use no memo"
    const virtualizer = useVirtualizer({
        count: itemIds.length,
        getScrollElement: () => parentRef.current,
        estimateSize: () => COMPACT_ROW_ESTIMATE_PX,
        gap: BATCH_ITEM_GAP_PX,
        overscan: 12,
        rangeExtractor: cappedBatchRangeExtractor,
        getItemKey: (index) => itemIds[index] ?? index
    });

    return (
        <section
            ref={parentRef}
            className={batchStyles.itemsScroll}
            aria-labelledby={batchHeadingId}
        >
            <div
                className={batchStyles.virtualInner}
                style={{ height: virtualizer.getTotalSize(), position: 'relative', width: '100%' }}
            >
                {virtualizer.getVirtualItems().map((virtualRow) => {
                    const downloadId = itemIds[virtualRow.index];
                    if (!downloadId) {
                        return null;
                    }
                    return (
                        <div
                            key={virtualRow.key}
                            data-index={virtualRow.index}
                            ref={virtualizer.measureElement}
                            className={batchStyles.virtualRow}
                            style={{
                                position: 'absolute',
                                top: 0,
                                left: 0,
                                width: '100%',
                                transform: `translateY(${virtualRow.start}px)`
                            }}
                        >
                            <DownloadItemById
                                downloadId={downloadId}
                                density="compact"
                                onSectionTrimPatch={onSectionTrimPatch}
                                onPause={onPause}
                                onResume={onResume}
                                onRetry={onRetry}
                                onRemove={onRemove}
                                onOpenFile={onOpenFile}
                                onRevealFile={onRevealFile}
                            />
                        </div>
                    );
                })}
            </div>
        </section>
    );
}

export default VirtualizedBatchDownloadList;
