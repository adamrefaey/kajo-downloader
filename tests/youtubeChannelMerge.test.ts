import { describe, expect, it } from 'vitest';
import {
    mergeYoutubeChannelSectionsForPlaylistInfo,
    stripYoutubeChannelTabSuffixFromPlaylistTitle,
    youtubeChannelTabFromLookupUrl
} from '../src/shared/youtubeChannelMerge';
import type { MediaCandidate, PlaylistInfo } from '../src/types';

function entry(
    partial: Partial<MediaCandidate> & Pick<MediaCandidate, 'id' | 'url' | 'title'>
): MediaCandidate {
    return {
        author: 'Ch',
        durationSeconds: 60,
        thumbnailUrl: '',
        flatIndex: 0,
        ...partial
    };
}

describe('youtubeChannelMerge', () => {
    it('stripYoutubeChannelTabSuffixFromPlaylistTitle removes nested tab suffixes', () => {
        expect(stripYoutubeChannelTabSuffixFromPlaylistTitle('Big Think - Shorts')).toBe(
            'Big Think'
        );
        expect(stripYoutubeChannelTabSuffixFromPlaylistTitle('Ch - Videos')).toBe('Ch');
        expect(stripYoutubeChannelTabSuffixFromPlaylistTitle('Ch - Live streams')).toBe('Ch');
        expect(stripYoutubeChannelTabSuffixFromPlaylistTitle('Plain playlist title')).toBe(
            'Plain playlist title'
        );
    });

    it('youtubeChannelTabFromLookupUrl classifies uploads playlist and tabs', () => {
        expect(
            youtubeChannelTabFromLookupUrl('https://www.youtube.com/playlist?list=UUxxxxxxxxxxx')
        ).toBe('videos');
        expect(youtubeChannelTabFromLookupUrl('https://www.youtube.com/channel/UCxxx/shorts')).toBe(
            'shorts'
        );
        expect(
            youtubeChannelTabFromLookupUrl('https://www.youtube.com/channel/UCxxx/streams')
        ).toBe('live');
        expect(youtubeChannelTabFromLookupUrl('https://www.youtube.com/@handle/videos')).toBe(
            'videos'
        );
    });

    it('mergeYoutubeChannelSectionsForPlaylistInfo dedupes by url and preserves tab order', () => {
        const v1 = entry({
            id: '1',
            url: 'https://www.youtube.com/watch?v=a',
            title: 'A',
            flatIndex: 0
        });
        const v2 = entry({
            id: '2',
            url: 'https://www.youtube.com/watch?v=b',
            title: 'B',
            flatIndex: 1
        });
        const dup = entry({
            id: '1b',
            url: 'https://www.youtube.com/watch?v=a',
            title: 'A2',
            flatIndex: 0
        });
        const s1 = entry({
            id: '3',
            url: 'https://www.youtube.com/watch?v=c',
            title: 'C',
            flatIndex: 0
        });
        const sections = [
            {
                lookupUrl: 'https://www.youtube.com/playlist?list=UUabc',
                info: {
                    title: 'uploads',
                    id: 'UUabc',
                    entries: [v1, v2]
                } satisfies PlaylistInfo
            },
            {
                lookupUrl: 'https://www.youtube.com/channel/UCx/shorts',
                info: {
                    title: 'shorts',
                    entries: [dup, s1]
                } satisfies PlaylistInfo
            }
        ];
        const merged = mergeYoutubeChannelSectionsForPlaylistInfo(sections, {
            channelPageUrl: 'https://www.youtube.com/channel/UCx',
            title: 'Channel Name'
        });
        expect(merged.collectionKind).toBe('channel');
        expect(merged.title).toBe('Channel Name');
        expect(merged.entries).toHaveLength(3);
        expect(merged.entries[0]?.url).toBe(v1.url);
        expect(merged.entries[0]?.channelSection).toBe('videos');
        expect(merged.entries[0]?.flatIndex).toBe(0);
        expect(merged.entries[0]?.sourcePlaylistId).toBe('UUabc');
        expect(merged.entries[1]?.url).toBe(v2.url);
        expect(merged.entries[1]?.channelSection).toBe('videos');
        expect(merged.entries[2]?.url).toBe(s1.url);
        expect(merged.entries[2]?.channelSection).toBe('shorts');
        expect(merged.entries[2]?.flatIndex).toBe(2);
    });
});
