/** One row in the persistent download history log (main → renderer). */
export interface DownloadHistoryEntry {
    id: string;
    downloadId: string;
    url: string;
    title: string | null;
    status: 'complete' | 'error' | 'cancelled';
    filePath: string | null;
    errorMessage: string | null;
    queuedAtMs: number;
    completedAtMs: number;
}
