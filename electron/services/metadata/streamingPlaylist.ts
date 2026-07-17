import {
    isProhibitedAdultMediaUrl,
    PROHIBITED_ADULT_CONTENT_REASON
} from '../../../src/shared/prohibitedAdultContentHosts';
import { resolveYoutubeFlatPlaylistLookupUrl } from '../../../src/shared/youtubeFlatPlaylistUrl';
import type { MediaCandidate, PlaylistInfoStreamIpcEvent } from '../../../src/types';
import { buildFlatPlaylistLineDumpArgs } from './argsBuilders';
import { getErrorMessage } from './errorClassification';
import { normalizeOnePlaylistEntry } from './playlistEntries';
import { fetchPlaylistInfo } from './resolve';
import type { FetchMetadataOptions, YtDlpPlaylistEntry, YtDlpPlaylistMetadata } from './types';
import { runYtDlpStreamingLines } from './ytdlpProcess';

export function derivePlaylistTitleFromRollingMeta(
    meta: Partial<YtDlpPlaylistMetadata>
): string | undefined {
    // Flat `--dump-json` lines use `title` for each *video*; using it here made the header flicker per row.
    let title = meta.playlist_title?.trim() || meta.channel?.trim() || meta.uploader?.trim() || '';
    if (title && /^uploads from /i.test(title) && meta.channel?.trim()) {
        title = meta.channel.trim();
    }
    return title || undefined;
}

export function ingestFlatPlaylistDumpJsonLine(
    raw: unknown,
    lookupUrl: string,
    state: { flatIndex: number; rollingMeta: Partial<YtDlpPlaylistMetadata> }
): MediaCandidate | null {
    if (!raw || typeof raw !== 'object') {
        return null;
    }
    const o = raw as Record<string, unknown>;
    if (Array.isArray(o.entries)) {
        const patch: Partial<YtDlpPlaylistMetadata> = { ...state.rollingMeta };
        const mergeStr = (key: keyof YtDlpPlaylistMetadata, from: string | undefined) => {
            const v = from?.trim();
            if (v && !(patch as Record<string, string | undefined>)[key as string]) {
                (patch as Record<string, string>)[key as string] = v;
            }
        };
        mergeStr('id', typeof o.id === 'string' ? o.id : undefined);
        mergeStr(
            'playlist_title',
            typeof o.playlist_title === 'string' ? o.playlist_title : undefined
        );
        mergeStr('title', typeof o.title === 'string' ? o.title : undefined);
        const ch = typeof o.channel === 'string' ? o.channel.trim() : '';
        const up = typeof o.uploader === 'string' ? o.uploader.trim() : '';
        if (ch) {
            patch.channel = ch;
        }
        if (up) {
            patch.uploader = up;
        } else if (ch) {
            patch.uploader = ch;
        }
        state.rollingMeta = patch;
        return null;
    }

    const entry = raw as YtDlpPlaylistEntry;
    const metaPatch: Partial<YtDlpPlaylistMetadata> = { ...state.rollingMeta };
    const pick = (k: string): string | undefined =>
        typeof o[k] === 'string' ? (o[k] as string).trim() : undefined;
    const plId = pick('playlist_id');
    if (plId) {
        metaPatch.id = plId;
    }
    const plTitle = pick('playlist_title');
    if (plTitle) {
        metaPatch.playlist_title = plTitle;
    }
    const ch = pick('channel');
    if (ch) {
        metaPatch.channel = ch;
    }
    const up = pick('uploader');
    if (up) {
        metaPatch.uploader = up;
    }
    state.rollingMeta = metaPatch;

    const cand = normalizeOnePlaylistEntry(entry, lookupUrl, state.flatIndex);
    if (cand) {
        state.flatIndex += 1;
    }
    return cand;
}

/**
 * Enumerates a flat playlist via yt-dlp `--dump-json` line streaming so the UI can show rows incrementally.
 * Falls back to {@link fetchPlaylistInfo} when no entries are produced from streamed lines (extractor quirks).
 */
export async function streamFetchPlaylistInfo(
    sourceUrl: string,
    options: FetchMetadataOptions,
    streamKillId: string,
    emit: (evt: PlaylistInfoStreamIpcEvent) => void
): Promise<void> {
    if (isProhibitedAdultMediaUrl(sourceUrl)) {
        emit({ kind: 'error', message: PROHIBITED_ADULT_CONTENT_REASON });
        return;
    }
    const lookupUrl = resolveYoutubeFlatPlaylistLookupUrl(sourceUrl);
    const built = await buildFlatPlaylistLineDumpArgs(lookupUrl, options);
    const state = {
        flatIndex: 0,
        rollingMeta: {} as Partial<YtDlpPlaylistMetadata>
    };
    /** Rows parsed from yt-dlp this tick; flushed in chunks of 100 (one YouTube API page) to the renderer. */
    const STREAM_EMIT_CHUNK = 100;
    const rowBuffer: MediaCandidate[] = [];
    let rowEmitScheduled = false;
    let lastMetaTitle: string | undefined;

    const flushRowBufferToRenderer = (): void => {
        if (rowBuffer.length === 0) {
            return;
        }
        const batch = rowBuffer.splice(0, rowBuffer.length);
        emit({ kind: 'entries', entries: batch });
    };

    const scheduleRowBufferFlush = (): void => {
        if (rowBuffer.length >= STREAM_EMIT_CHUNK) {
            rowEmitScheduled = false;
            flushRowBufferToRenderer();
            return;
        }
        if (rowEmitScheduled) {
            return;
        }
        rowEmitScheduled = true;
        setImmediate(() => {
            rowEmitScheduled = false;
            flushRowBufferToRenderer();
        });
    };

    const maybeEmitMeta = () => {
        const title = derivePlaylistTitleFromRollingMeta(state.rollingMeta);
        if (title && title !== lastMetaTitle) {
            lastMetaTitle = title;
            emit({
                kind: 'meta',
                title,
                channel: state.rollingMeta.channel?.trim() || state.rollingMeta.uploader?.trim(),
                id: state.rollingMeta.id?.trim()
            });
        }
    };

    let streamResult: { stderr: string; exitCode: number | null };
    try {
        streamResult = await runYtDlpStreamingLines(built.args, {
            streamKillId,
            async onLine(line) {
                let parsed: unknown;
                try {
                    parsed = JSON.parse(line) as unknown;
                } catch {
                    return;
                }
                const cand = ingestFlatPlaylistDumpJsonLine(parsed, lookupUrl, state);
                maybeEmitMeta();
                if (cand) {
                    rowBuffer.push(cand);
                    scheduleRowBufferFlush();
                }
            }
        });
    } catch (cause) {
        emit({
            kind: 'error',
            message: cause instanceof Error ? cause.message : 'yt-dlp stream failed'
        });
        return;
    }

    rowEmitScheduled = false;
    flushRowBufferToRenderer();

    if (streamResult.exitCode !== 0) {
        emit({
            kind: 'error',
            message: getErrorMessage(streamResult.stderr, streamResult.exitCode)
        });
        return;
    }

    if (state.flatIndex === 0) {
        try {
            const full = await fetchPlaylistInfo(sourceUrl, options);
            if (!lastMetaTitle?.trim()) {
                emit({
                    kind: 'meta',
                    title: full.title,
                    channel: full.channel,
                    id: full.id
                });
            }
            if (full.entries.length) {
                emit({ kind: 'entries', entries: full.entries });
            }
        } catch (cause) {
            emit({
                kind: 'error',
                message: cause instanceof Error ? cause.message : 'Failed to load playlist'
            });
            return;
        }
    } else {
        maybeEmitMeta();
    }

    emit({ kind: 'done' });
}
