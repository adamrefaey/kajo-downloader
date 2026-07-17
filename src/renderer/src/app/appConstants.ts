export const MAX_CONCURRENT_DOWNLOADS_UI = 8;

export const CONCURRENT_DOWNLOAD_OPTIONS: { value: number; label: string }[] = Array.from(
    { length: MAX_CONCURRENT_DOWNLOADS_UI },
    (_, i) => {
        const n = i + 1;
        return { value: n, label: String(n) };
    }
);

export const PLAYLIST_SOFT_CAP = 200;
