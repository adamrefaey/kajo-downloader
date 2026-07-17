import { randomUUID } from 'node:crypto';
import type ElectronStore from 'electron-store';
import { z } from 'zod';
import type { DownloadHistoryEntry } from '../../src/types';
import { createKajoElectronStore } from '../lib/kajoElectronStore';
import { mainLog } from '../mainLogger';

const MAX_ENTRIES = 2500;

export const downloadHistoryEntrySchema: z.ZodType<DownloadHistoryEntry> = z.object({
    id: z.string().min(1),
    downloadId: z.string().min(1),
    url: z.string().min(1),
    title: z.union([z.string(), z.null()]),
    status: z.enum(['complete', 'error', 'cancelled']),
    filePath: z.union([z.string(), z.null()]),
    errorMessage: z.union([z.string(), z.null()]),
    queuedAtMs: z.number().finite(),
    completedAtMs: z.number().finite()
});

interface HistoryDisk {
    entries: DownloadHistoryEntry[];
}

function defaultDisk(): HistoryDisk {
    return { entries: [] };
}

let historyStore: ElectronStore<HistoryDisk> | null = null;

function store(): ElectronStore<HistoryDisk> {
    if (!historyStore) {
        historyStore = createKajoElectronStore<HistoryDisk>({
            name: 'download-history',
            defaults: defaultDisk()
        });
    }
    return historyStore;
}

function readValidatedEntries(): DownloadHistoryEntry[] {
    const raw = store().get('entries');
    if (!Array.isArray(raw)) {
        if (raw !== undefined) {
            mainLog.warn('[historyArchive] entries is not an array; treating as empty', {
                received: typeof raw
            });
            store().set('entries', []);
        }
        return [];
    }
    const valid: DownloadHistoryEntry[] = [];
    let dropped = 0;
    for (const row of raw) {
        const parsed = downloadHistoryEntrySchema.safeParse(row);
        if (parsed.success) {
            valid.push(parsed.data);
        } else {
            dropped += 1;
        }
    }
    if (dropped > 0) {
        mainLog.warn('[historyArchive] dropped invalid history rows', {
            dropped,
            total: raw.length
        });
        store().set('entries', valid);
    }
    return valid;
}

export function appendDownloadHistoryEvent(payload: {
    downloadId: string;
    url: string;
    title: string | null;
    status: DownloadHistoryEntry['status'];
    filePath: string | null;
    errorMessage: string | null;
    queuedAtMs: number;
}): DownloadHistoryEntry {
    const row: DownloadHistoryEntry = {
        id: randomUUID(),
        downloadId: payload.downloadId,
        url: payload.url,
        title: payload.title,
        status: payload.status,
        filePath: payload.filePath,
        errorMessage: payload.errorMessage,
        queuedAtMs: payload.queuedAtMs,
        completedAtMs: Date.now()
    };
    const prev = readValidatedEntries();
    const next = [row, ...prev].slice(0, MAX_ENTRIES);
    store().set('entries', next);
    return row;
}

export function listDownloadHistory(options: {
    limit: number;
    offset: number;
}): DownloadHistoryEntry[] {
    const { limit, offset } = options;
    const lim = Math.max(1, Math.min(500, Math.floor(limit)));
    const off = Math.max(0, Math.floor(offset));
    const all = readValidatedEntries();
    return all.slice(off, off + lim);
}

export function clearDownloadHistory(): void {
    store().set('entries', []);
}

export function getDownloadHistoryTotal(): number {
    return readValidatedEntries().length;
}
