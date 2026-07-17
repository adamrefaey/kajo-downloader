import type { DownloadItem } from '../../../types';

export type QueueSegment =
    | { kind: 'single'; item: DownloadItem }
    | { kind: 'batch'; batchGroupId: string; title: string; items: DownloadItem[] };

/** Stable row fingerprint: progress-only updates must not change this (keeps queue shell from re-rendering). */
export function queueRowStructureKey(item: DownloadItem): string {
    return [
        item.id,
        item.batchGroupId ?? '',
        item.playlistTitle ?? '',
        item.title ?? '',
        item.url,
        item.batchSiteLabel ?? '',
        String(item.batchExtractedAt ?? '')
    ].join('\x1e');
}

/** Segment list with ids only — resolve live rows via `useDownloadStore` per id. */
export type RenderableQueueSegment =
    | { kind: 'single'; id: string }
    | { kind: 'batch'; batchGroupId: string; title: string; itemIds: string[] };

export function toRenderableQueueSegments(queue: DownloadItem[]): RenderableQueueSegment[] {
    const raw = segmentDownloadQueue(queue);
    return raw.map((seg) =>
        seg.kind === 'single'
            ? { kind: 'single' as const, id: seg.item.id }
            : {
                  kind: 'batch' as const,
                  batchGroupId: seg.batchGroupId,
                  title: seg.title,
                  itemIds: seg.items.map((i) => i.id)
              }
    );
}

/**
 * Playlist/channel batches are prepended as a contiguous block sharing `batchGroupId`.
 */
export function segmentDownloadQueue(queue: DownloadItem[]): QueueSegment[] {
    const segments: QueueSegment[] = [];
    let i = 0;
    while (i < queue.length) {
        const item = queue[i];
        /* v8 ignore start — i is bounds-checked by the while condition */
        if (!item) break;
        /* v8 ignore stop */
        const batchGroupId = item.batchGroupId;
        if (batchGroupId) {
            const items: DownloadItem[] = [];
            while (i < queue.length && queue[i]?.batchGroupId === batchGroupId) {
                const batchItem = queue[i];
                /* v8 ignore start — queue[i] is defined since batchGroupId check above */
                if (batchItem) items.push(batchItem);
                /* v8 ignore stop */
                i += 1;
            }
            const title =
                items[0]?.playlistTitle?.trim() || items[0]?.title?.trim() || items[0]?.url || '';
            segments.push({ kind: 'batch', batchGroupId, title, items });
        } else {
            segments.push({ kind: 'single', item });
            i += 1;
        }
    }
    return segments;
}
