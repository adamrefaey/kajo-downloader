import { describe, expect, it } from 'vitest';
import {
    queueRowStructureKey,
    segmentDownloadQueue,
    toRenderableQueueSegments
} from '../../src/renderer/src/utils/queueSegments';
import type { DownloadItem } from '../../src/types';

function item(partial: Partial<DownloadItem> & Pick<DownloadItem, 'id'>): DownloadItem {
    return {
        url: 'https://example.com',
        formatId: 'best',
        outputDir: '/out',
        state: 'pending',
        createdAt: 1,
        ...partial
    };
}

describe('segmentDownloadQueue', () => {
    it('returns single segments for items without batchGroupId', () => {
        const queue = [item({ id: 'a' }), item({ id: 'b' })];
        expect(segmentDownloadQueue(queue)).toEqual([
            { kind: 'single', item: queue[0] },
            { kind: 'single', item: queue[1] }
        ]);
    });

    it('merges contiguous items with the same batchGroupId', () => {
        const queue = [
            item({ id: 'x', batchGroupId: 'g1', playlistTitle: 'My list' }),
            item({ id: 'y', batchGroupId: 'g1', playlistTitle: 'My list' }),
            item({ id: 'z', batchGroupId: 'g1', playlistTitle: 'My list' })
        ];
        expect(segmentDownloadQueue(queue)).toEqual([
            {
                kind: 'batch',
                batchGroupId: 'g1',
                title: 'My list',
                items: queue
            }
        ]);
    });

    it('splits when batchGroupId changes', () => {
        const queue = [
            item({ id: 'a', batchGroupId: 'g1', playlistTitle: 'A' }),
            item({ id: 'b', batchGroupId: 'g2', playlistTitle: 'B' })
        ];
        const segs = segmentDownloadQueue(queue);
        expect(segs).toHaveLength(2);
        expect(segs[0]).toMatchObject({ kind: 'batch', batchGroupId: 'g1' });
        expect(segs[1]).toMatchObject({ kind: 'batch', batchGroupId: 'g2' });
    });

    it('interleaves singles and batches', () => {
        const queue = [
            item({ id: 'solo', title: 'One' }),
            item({ id: 'b1', batchGroupId: 'g', playlistTitle: 'P' }),
            item({ id: 'b2', batchGroupId: 'g', playlistTitle: 'P' })
        ];
        const segs = segmentDownloadQueue(queue);
        expect(segs).toHaveLength(2);
        expect(segs[0]).toEqual({ kind: 'single', item: queue[0] });
        expect(segs[1]).toMatchObject({ kind: 'batch', items: [queue[1], queue[2]] });
    });

    it('batch title uses entry title when playlistTitle absent', () => {
        const queue = [
            item({
                id: 't1',
                batchGroupId: 'g',
                url: 'https://list.example/p',
                title: '  Named batch  '
            }),
            item({ id: 't2', batchGroupId: 'g', url: 'https://list.example/p' })
        ];
        const segs = segmentDownloadQueue(queue);
        expect(segs[0]).toMatchObject({ kind: 'batch', title: 'Named batch' });
    });

    it('batch title falls back to url when playlistTitle and title missing', () => {
        const queue = [
            item({
                id: 'u1',
                batchGroupId: 'g',
                url: 'https://list.example/p',
                playlistTitle: '   ',
                title: ''
            }),
            item({ id: 'u2', batchGroupId: 'g', url: 'https://list.example/p' })
        ];
        const segs = segmentDownloadQueue(queue);
        expect(segs[0]).toMatchObject({
            kind: 'batch',
            title: 'https://list.example/p'
        });
    });

    it('batch title is empty string when playlistTitle, title, and url are blank', () => {
        const queue = [
            item({
                id: 'blank',
                batchGroupId: 'g',
                url: '',
                playlistTitle: '   ',
                title: '  '
            }),
            item({ id: 'blank2', batchGroupId: 'g', url: '' })
        ];
        const segs = segmentDownloadQueue(queue);
        expect(segs[0]).toMatchObject({ kind: 'batch', title: '' });
    });
});

describe('toRenderableQueueSegments', () => {
    it('maps batch items to ids only', () => {
        const queue = [
            item({ id: 'x', batchGroupId: 'g', playlistTitle: 'P' }),
            item({ id: 'y', batchGroupId: 'g', playlistTitle: 'P' })
        ];
        expect(toRenderableQueueSegments(queue)).toEqual([
            { kind: 'batch', batchGroupId: 'g', title: 'P', itemIds: ['x', 'y'] }
        ]);
    });
});

describe('queueRowStructureKey', () => {
    it('is unchanged when only progress-related fields change', () => {
        const a = item({ id: 'a', title: 'T', progressPercent: 0 });
        const b = { ...a, progressPercent: 50, state: 'downloading' as const };
        expect(queueRowStructureKey(a)).toBe(queueRowStructureKey(b));
    });

    it('treats omitted title like empty string in the fingerprint', () => {
        const row = { ...item({ id: 'z', url: 'https://u' }) };
        delete (row as { title?: string }).title;
        expect(queueRowStructureKey(row)).toBe(['z', '', '', '', 'https://u', '', ''].join('\x1e'));
    });
});
