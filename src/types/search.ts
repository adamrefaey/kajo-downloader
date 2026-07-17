export type SearchPlatform = 'youtube';

export interface YoutubeSearchResultRow {
    id: string;
    url: string;
    title: string;
    channel: string;
    durationSeconds: number;
    thumbnailUrl: string;
}

export interface SearchResultRow extends YoutubeSearchResultRow {
    platform: SearchPlatform;
}
