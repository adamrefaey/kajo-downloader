import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as resolveMod from '../electron/services/metadata/resolve';
import { PROHIBITED_ADULT_CONTENT_REASON } from '../src/shared/prohibitedAdultContentHosts';

const runYtDlpStreamingLines = vi.hoisted(() => vi.fn());

vi.mock('../electron/services/metadata/ytdlpProcess', () => ({
    runYtDlpStreamingLines,
    runYtDlpWithAuthCookieStrategies: vi.fn(),
    killPlaylistInfoStream: vi.fn()
}));

import {
    derivePlaylistTitleFromRollingMeta,
    ingestFlatPlaylistDumpJsonLine,
    streamFetchPlaylistInfo
} from '../electron/services/metadata/streamingPlaylist';
import type { YtDlpPlaylistMetadata } from '../electron/services/metadata/types';

const ytLookup = 'https://www.youtube.com/playlist?list=PLtest';

type IngestState = { flatIndex: number; rollingMeta: Partial<YtDlpPlaylistMetadata> };

function ytEntry(overrides: Record<string, unknown> = {}) {
    return {
        id: 'dQw4w9WgXcQ',
        title: 'Never Gonna Give You Up',
        url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
        ...overrides
    };
}

describe('streamingPlaylist', () => {
    describe('derivePlaylistTitleFromRollingMeta', () => {
        it('prefers trimmed playlist_title', () => {
            expect(derivePlaylistTitleFromRollingMeta({ playlist_title: '  My playlist  ' })).toBe(
                'My playlist'
            );
        });

        it('falls back to channel then uploader', () => {
            expect(derivePlaylistTitleFromRollingMeta({ channel: '  Chan  ' })).toBe('Chan');
            expect(derivePlaylistTitleFromRollingMeta({ uploader: '  Up  ' })).toBe('Up');
        });

        it('replaces "uploads from …" with channel when channel is present', () => {
            expect(
                derivePlaylistTitleFromRollingMeta({
                    playlist_title: 'Uploads from Someone',
                    channel: '  Real channel  '
                })
            ).toBe('Real channel');
        });

        it('keeps uploads-style title when channel is missing', () => {
            expect(derivePlaylistTitleFromRollingMeta({ playlist_title: 'Uploads from X' })).toBe(
                'Uploads from X'
            );
        });

        it('returns undefined when no usable title', () => {
            expect(derivePlaylistTitleFromRollingMeta({})).toBeUndefined();
        });
    });

    describe('ingestFlatPlaylistDumpJsonLine', () => {
        it('returns null for non-objects', () => {
            const state: IngestState = { flatIndex: 0, rollingMeta: {} };
            expect(ingestFlatPlaylistDumpJsonLine(null, ytLookup, state)).toBeNull();
            expect(ingestFlatPlaylistDumpJsonLine(undefined, ytLookup, state)).toBeNull();
            expect(ingestFlatPlaylistDumpJsonLine('x', ytLookup, state)).toBeNull();
        });

        it('merges playlist-shaped payloads with entries array and updates rolling meta', () => {
            const state: IngestState = { flatIndex: 0, rollingMeta: {} };
            const patchLine = {
                entries: [],
                id: '  pl-id  ',
                playlist_title: '  PL  ',
                title: '  ignored as playlist root  ',
                channel: '  Ch  ',
                uploader: ''
            };
            expect(ingestFlatPlaylistDumpJsonLine(patchLine, ytLookup, state)).toBeNull();
            expect(state.rollingMeta).toMatchObject({
                id: 'pl-id',
                playlist_title: 'PL',
                title: 'ignored as playlist root',
                channel: 'Ch',
                uploader: 'Ch'
            });

            const second = {
                entries: [],
                id: '  newer  ',
                playlist_title: '  first wins  ',
                channel: '  Ch2  '
            };
            ingestFlatPlaylistDumpJsonLine(second, ytLookup, state);
            expect((state.rollingMeta as { id?: string }).id).toBe('pl-id');
            expect((state.rollingMeta as { playlist_title?: string }).playlist_title).toBe('PL');
            expect((state.rollingMeta as { channel?: string }).channel).toBe('Ch2');
        });

        it('sets uploader from uploader field when both channel and uploader exist', () => {
            const state: IngestState = { flatIndex: 0, rollingMeta: {} };
            ingestFlatPlaylistDumpJsonLine(
                { entries: [], channel: '  A  ', uploader: '  B  ' },
                ytLookup,
                state
            );
            expect(state.rollingMeta.uploader).toBe('B');
        });

        it('normalizes a video line and increments flatIndex when candidate is produced', () => {
            const state: IngestState = { flatIndex: 0, rollingMeta: { playlist_title: 'PL' } };
            const cand = ingestFlatPlaylistDumpJsonLine(ytEntry(), ytLookup, state);
            expect(cand).not.toBeNull();
            if (cand === null) {
                throw new Error('expected candidate');
            }
            expect(cand.flatIndex).toBe(0);
            expect(state.flatIndex).toBe(1);
            expect(state.rollingMeta.playlist_title).toBe('PL');
        });

        it('does not increment flatIndex when entry is invalid', () => {
            const state: IngestState = { flatIndex: 0, rollingMeta: {} };
            expect(
                ingestFlatPlaylistDumpJsonLine(
                    { id: '', title: 'x', url: 'https://x' },
                    ytLookup,
                    state
                )
            ).toBeNull();
            expect(state.flatIndex).toBe(0);
        });

        it('applies playlist_id and string fields from video-shaped objects', () => {
            const state: IngestState = { flatIndex: 0, rollingMeta: {} };
            const line = {
                ...ytEntry(),
                playlist_id: '  pid  ',
                playlist_title: '  PTitle  ',
                channel: '  C  ',
                uploader: '  U  '
            };
            ingestFlatPlaylistDumpJsonLine(line, ytLookup, state);
            expect(state.rollingMeta.id).toBe('pid');
            expect(state.rollingMeta.playlist_title).toBe('PTitle');
            expect(state.rollingMeta.channel).toBe('C');
            expect(state.rollingMeta.uploader).toBe('U');
        });
    });

    describe('streamFetchPlaylistInfo', () => {
        let fetchSpy: ReturnType<typeof vi.spyOn>;

        beforeEach(() => {
            fetchSpy = vi.spyOn(resolveMod, 'fetchPlaylistInfo');
        });

        afterEach(() => {
            fetchSpy.mockRestore();
            runYtDlpStreamingLines.mockClear();
        });

        it('emits error for prohibited URLs', async () => {
            const emit = vi.fn();
            await streamFetchPlaylistInfo(
                'https://www.pornhub.com/view_video.php?viewkey=x',
                {},
                'k1',
                emit
            );
            expect(emit).toHaveBeenCalledWith({
                kind: 'error',
                message: PROHIBITED_ADULT_CONTENT_REASON
            });
            expect(runYtDlpStreamingLines).not.toHaveBeenCalled();
        });

        it('skips invalid JSON lines, streams rows, flushes via setImmediate, and emits done', async () => {
            const emit = vi.fn();
            const row = ytEntry();
            runYtDlpStreamingLines.mockImplementation(async (_args, opts) => {
                await opts.onLine('not-json{');
                await opts.onLine(JSON.stringify({ entries: [], playlist_title: '  Stream PL  ' }));
                await opts.onLine(JSON.stringify(row));
                return { stderr: '', exitCode: 0 };
            });

            await streamFetchPlaylistInfo(
                'https://www.youtube.com/playlist?list=PLabc',
                {},
                'sid',
                emit
            );

            expect(runYtDlpStreamingLines).toHaveBeenCalled();
            const metaCalls = emit.mock.calls.filter((c) => c[0]?.kind === 'meta');
            expect(metaCalls.length).toBeGreaterThanOrEqual(1);
            const firstMeta = metaCalls[0];
            if (!firstMeta) {
                throw new Error('expected meta event');
            }
            expect(firstMeta[0]).toMatchObject({ kind: 'meta', title: 'Stream PL' });

            await new Promise<void>((r) => {
                setImmediate(r);
            });

            const entriesEvt = emit.mock.calls.find((c) => c[0]?.kind === 'entries');
            expect(entriesEvt?.[0]).toMatchObject({
                kind: 'entries',
                entries: expect.arrayContaining([expect.objectContaining({ id: 'dQw4w9WgXcQ' })])
            });
            expect(emit.mock.calls.at(-1)?.[0]).toEqual({ kind: 'done' });
            expect(fetchSpy).not.toHaveBeenCalled();
        });

        it('flushes immediately when buffer reaches chunk size', async () => {
            const emit = vi.fn();
            runYtDlpStreamingLines.mockImplementation(async (_args, opts) => {
                for (let i = 0; i < 100; i += 1) {
                    const id = String(i).padStart(11, '0');
                    await opts.onLine(
                        JSON.stringify({
                            id,
                            title: `T${i}`,
                            url: `https://www.youtube.com/watch?v=${id}`
                        })
                    );
                }
                return { stderr: '', exitCode: 0 };
            });

            await streamFetchPlaylistInfo(
                'https://www.youtube.com/playlist?list=PLbig',
                {},
                's2',
                emit
            );

            const entryEvents = emit.mock.calls.filter((c) => c[0]?.kind === 'entries');
            expect(
                entryEvents.some((c) => (c[0] as { entries: unknown[] }).entries.length === 100)
            ).toBe(true);
            expect(emit.mock.calls.at(-1)?.[0]).toEqual({ kind: 'done' });
        });

        it('emits streaming error when runYtDlpStreamingLines rejects', async () => {
            const emit = vi.fn();
            runYtDlpStreamingLines.mockRejectedValue(new Error('spawn failed'));
            await streamFetchPlaylistInfo(
                'https://www.youtube.com/playlist?list=PLx',
                {},
                's3',
                emit
            );
            expect(emit).toHaveBeenCalledWith({ kind: 'error', message: 'spawn failed' });
        });

        it('emits generic error when stream rejects with non-Error', async () => {
            const emit = vi.fn();
            runYtDlpStreamingLines.mockRejectedValue('boom');
            await streamFetchPlaylistInfo(
                'https://www.youtube.com/playlist?list=PLy',
                {},
                's4',
                emit
            );
            expect(emit).toHaveBeenCalledWith({ kind: 'error', message: 'yt-dlp stream failed' });
        });

        it('emits error when exit code is non-zero', async () => {
            const emit = vi.fn();
            runYtDlpStreamingLines.mockResolvedValue({ stderr: 'nope', exitCode: 1 });
            await streamFetchPlaylistInfo(
                'https://www.youtube.com/playlist?list=PLz',
                {},
                's5',
                emit
            );
            expect(emit.mock.calls.some((c) => c[0]?.kind === 'error')).toBe(true);
            expect(emit.mock.calls.some((c) => String(c[0]?.message ?? '').includes('nope'))).toBe(
                true
            );
        });

        it('falls back to fetchPlaylistInfo when stream yields no rows', async () => {
            const emit = vi.fn();
            runYtDlpStreamingLines.mockResolvedValue({ stderr: '', exitCode: 0 });
            fetchSpy.mockResolvedValue({
                title: 'Full title',
                channel: 'Full ch',
                id: 'full-id',
                entries: [ytEntry()],
                sourceUrl: 'https://www.youtube.com/playlist?list=PLfb',
                collectionKind: 'playlist'
            });

            await streamFetchPlaylistInfo(
                'https://www.youtube.com/playlist?list=PLfb',
                {},
                's6',
                emit
            );

            expect(fetchSpy).toHaveBeenCalled();
            expect(emit.mock.calls.some((c) => c[0]?.kind === 'meta')).toBe(true);
            const metaCall = emit.mock.calls.find((c) => c[0]?.kind === 'meta');
            if (!metaCall) {
                throw new Error('expected meta event');
            }
            const meta = metaCall[0] as {
                title: string;
            };
            expect(meta.title).toBe('Full title');
            expect(emit.mock.calls.some((c) => c[0]?.kind === 'entries')).toBe(true);
            expect(emit.mock.calls.at(-1)?.[0]).toEqual({ kind: 'done' });
        });

        it('does not emit meta from fallback when stream already published a title', async () => {
            const emit = vi.fn();
            runYtDlpStreamingLines.mockImplementation(async (_args, opts) => {
                await opts.onLine(JSON.stringify({ entries: [], playlist_title: 'From stream' }));
                return { stderr: '', exitCode: 0 };
            });
            fetchSpy.mockResolvedValue({
                title: 'Ignored',
                entries: [],
                sourceUrl: 'https://www.youtube.com/playlist?list=PLig',
                collectionKind: 'playlist'
            });

            await streamFetchPlaylistInfo(
                'https://www.youtube.com/playlist?list=PLig',
                {},
                's7',
                emit
            );

            const metaTitles = emit.mock.calls
                .filter((c) => c[0]?.kind === 'meta')
                .map((c) => (c[0] as { title?: string }).title);
            expect(metaTitles).not.toContain('Ignored');
        });

        it('emits fallback error when fetchPlaylistInfo throws', async () => {
            const emit = vi.fn();
            runYtDlpStreamingLines.mockResolvedValue({ stderr: '', exitCode: 0 });
            fetchSpy.mockRejectedValue(new Error('offline'));
            await streamFetchPlaylistInfo(
                'https://www.youtube.com/playlist?list=PLerr',
                {},
                's8',
                emit
            );
            expect(emit).toHaveBeenCalledWith({ kind: 'error', message: 'offline' });
        });

        it('emits generic message when fallback throws non-Error', async () => {
            const emit = vi.fn();
            runYtDlpStreamingLines.mockResolvedValue({ stderr: '', exitCode: 0 });
            fetchSpy.mockRejectedValue(404);
            await streamFetchPlaylistInfo(
                'https://www.youtube.com/playlist?list=PLne',
                {},
                's9',
                emit
            );
            expect(emit).toHaveBeenCalledWith({
                kind: 'error',
                message: 'Failed to load playlist'
            });
        });

        it('calls maybeEmitMeta after stream when rows were produced', async () => {
            const emit = vi.fn();
            runYtDlpStreamingLines.mockImplementation(async (_args, opts) => {
                await opts.onLine(JSON.stringify({ entries: [], playlist_title: '  Only meta  ' }));
                await opts.onLine(JSON.stringify(ytEntry()));
                return { stderr: '', exitCode: 0 };
            });

            await streamFetchPlaylistInfo(
                'https://www.youtube.com/playlist?list=PLrows',
                {},
                's10',
                emit
            );

            await new Promise<void>((r) => {
                setImmediate(r);
            });

            expect(emit.mock.calls.at(-1)?.[0]).toEqual({ kind: 'done' });
        });
    });
});
