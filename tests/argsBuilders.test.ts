import { beforeEach, describe, expect, it, vi } from 'vitest';
import type {
    FetchMetadataOptions,
    MetadataArgsBuilder
} from '../electron/services/metadata/types';

const runYtDlpWithAuthCookieStrategies = vi.hoisted(() => vi.fn());

vi.mock('../electron/services/metadata/ytdlpProcess', () => ({
    runYtDlpWithAuthCookieStrategies
}));

import {
    appendCookiesYoutubeExtractorAndExtraArgs,
    buildFlatPlaylistLineDumpArgs,
    buildMetadataArgs,
    buildPlaylistMetadataArgs,
    buildSimulateProbeArgs,
    buildThumbnailOnlyArgs,
    buildYoutubeChannelFastPlaylistMetadataArgs,
    buildYoutubeDownloadPreambleArgs,
    buildYtDlpDirectImageDownloadArgs,
    parsePlannedFilenameFromPrintStdout,
    resolveYoutubeCookieArgvForDownload,
    resolveYoutubeDownloadPreamble,
    YT_DLP_SIMULATE_PROBE_PREFIX,
    youtubeDownloadPreambleCookieSegmentStart
} from '../electron/services/metadata/argsBuilders';

const yt = 'https://www.youtube.com/watch?v=dQw4w9WgXcQ';
const notYt = 'https://example.com/video';

describe('argsBuilders', () => {
    beforeEach(() => {
        runYtDlpWithAuthCookieStrategies.mockReset();
        runYtDlpWithAuthCookieStrategies.mockImplementation(
            async (url: string, options: FetchMetadataOptions, buildArgs: MetadataArgsBuilder) => {
                const built = await buildArgs(url, options);
                return {
                    stdout: '',
                    stderr: '',
                    exitCode: 0,
                    finalArgs: built.args
                };
            }
        );
    });

    it('buildMetadataArgs uses dump-json and appends url', async () => {
        const { args, usedCookies } = await buildMetadataArgs(notYt, {});
        expect(usedCookies).toBe(false);
        expect(args[0]).toBe('--dump-json');
        expect(args.at(-1)).toBe(notYt);
    });

    it('buildMetadataArgs adds cookies when resolver returns a path', async () => {
        const { args, usedCookies } = await buildMetadataArgs(yt, {
            getSiteCookiesFilePath: async () => '/tmp/cookies.txt'
        });
        expect(usedCookies).toBe(true);
        expect(args).toContain('--cookies');
        expect(args).toContain('/tmp/cookies.txt');
    });

    it('buildMetadataArgs uses youtube extractor override when set', async () => {
        const { args } = await buildMetadataArgs(yt, {
            youtubeExtractorArgsOverride: ['--extractor-args', 'youtube:foo=bar']
        });
        expect(args).toContain('--extractor-args');
        expect(args).toContain('youtube:foo=bar');
    });

    it('buildMetadataArgs appends extraArgs', async () => {
        const { args } = await buildMetadataArgs(notYt, {
            extraArgs: ['--socket-timeout', '5']
        });
        expect(args).toContain('--socket-timeout');
        expect(args).toContain('5');
    });

    it('buildPlaylistMetadataArgs uses flat single-json', async () => {
        const { args } = await buildPlaylistMetadataArgs(notYt, {});
        expect(args[0]).toBe('--dump-single-json');
        expect(args).toContain('--flat-playlist');
        expect(args.at(-1)).toBe(notYt);
    });

    it('buildYoutubeChannelFastPlaylistMetadataArgs limits playlist items', async () => {
        const { args } = await buildYoutubeChannelFastPlaylistMetadataArgs(yt, {});
        expect(args).toContain('--playlist-items');
        expect(args).toContain('1:2');
    });

    it('buildThumbnailOnlyArgs writes thumbnail and output template', async () => {
        const { args } = await buildThumbnailOnlyArgs(notYt, {}, '/out/%(id)s.%(ext)s');
        expect(args).toContain('--write-thumbnail');
        expect(args).toContain('-o');
        expect(args).toContain('/out/%(id)s.%(ext)s');
    });

    it('buildYtDlpDirectImageDownloadArgs passes image url and template', async () => {
        const image = 'https://i.ytimg.com/vi/x/maxresdefault.jpg';
        const { args } = await buildYtDlpDirectImageDownloadArgs(image, {}, '/tmp/%(title)s');
        expect(args.at(-1)).toBe(image);
        expect(args).toContain('-o');
        expect(args).toContain('/tmp/%(title)s');
    });

    it('buildSimulateProbeArgs starts with simulate prefix', async () => {
        const { args } = await buildSimulateProbeArgs(notYt, {});
        expect(args.slice(0, YT_DLP_SIMULATE_PROBE_PREFIX.length)).toEqual([
            ...YT_DLP_SIMULATE_PROBE_PREFIX
        ]);
    });

    it('buildFlatPlaylistLineDumpArgs uses lazy flat playlist', async () => {
        const { args } = await buildFlatPlaylistLineDumpArgs(notYt, {});
        expect(args).toContain('--lazy-playlist');
        expect(args).toContain('--flat-playlist');
    });

    it('parsePlannedFilenameFromPrintStdout takes last non-empty trimmed line', () => {
        expect(parsePlannedFilenameFromPrintStdout('')).toBeNull();
        expect(parsePlannedFilenameFromPrintStdout('\n  \n')).toBeNull();
        expect(parsePlannedFilenameFromPrintStdout('first\nsecond')).toBe('second');
        expect(parsePlannedFilenameFromPrintStdout('  only  ')).toBe('only');
    });

    it('youtubeDownloadPreambleCookieSegmentStart matches audio vs muxed argv layout', () => {
        expect(
            youtubeDownloadPreambleCookieSegmentStart({
                outputTemplateFullPath: '/o',
                formatId: 'best',
                audioOnly: false
            })
        ).toBe(11);
        expect(
            youtubeDownloadPreambleCookieSegmentStart({
                outputTemplateFullPath: '/o',
                formatId: 'best',
                audioOnly: true
            })
        ).toBe(12);
    });

    it('buildYoutubeDownloadPreambleArgs uses merge format or audio extraction', async () => {
        const base = {
            outputTemplateFullPath: '/tmp/out',
            formatId: '22'
        };
        const mux = await buildYoutubeDownloadPreambleArgs(
            { ...base, audioOnly: false, mergeOutputFormat: 'mkv' },
            yt,
            {}
        );
        expect(mux.args).toContain('--merge-output-format');
        expect(mux.args).toContain('mkv');

        const ao = await buildYoutubeDownloadPreambleArgs(
            { ...base, audioOnly: true, audioFormat: 'm4a' },
            yt,
            {}
        );
        expect(ao.args).toContain('-x');
        expect(ao.args).toContain('--audio-format');
        expect(ao.args).toContain('m4a');

        const defaults = await buildYoutubeDownloadPreambleArgs(
            { ...base, audioOnly: true },
            yt,
            {}
        );
        expect(defaults.args).toContain('mp3');

        const muxDef = await buildYoutubeDownloadPreambleArgs(
            { ...base, audioOnly: false },
            yt,
            {}
        );
        expect(muxDef.args).toContain('mp4');
    });

    it('appendCookiesYoutubeExtractorAndExtraArgs returns false when no cookie path', async () => {
        const args: string[] = ['--x'];
        const used = await appendCookiesYoutubeExtractorAndExtraArgs(args, yt, {});
        expect(used).toBe(false);
        expect(args[0]).toBe('--x');
    });

    it('resolveYoutubeCookieArgvForDownload returns empty for non-YouTube', async () => {
        await expect(resolveYoutubeCookieArgvForDownload(notYt, {})).resolves.toEqual([]);
        expect(runYtDlpWithAuthCookieStrategies).not.toHaveBeenCalled();
    });

    it('resolveYoutubeCookieArgvForDownload returns empty on non-zero exit', async () => {
        runYtDlpWithAuthCookieStrategies.mockImplementation(async (url, options, buildArgs) => {
            const built = await buildArgs(url, options);
            return {
                stdout: '',
                stderr: 'err',
                exitCode: 1,
                finalArgs: built.args
            };
        });
        await expect(resolveYoutubeCookieArgvForDownload(yt, {})).resolves.toEqual([]);
    });

    it('resolveYoutubeCookieArgvForDownload returns empty when url index is too early', async () => {
        runYtDlpWithAuthCookieStrategies.mockImplementation(async () => ({
            stdout: '',
            stderr: '',
            exitCode: 0,
            finalArgs: ['--simulate', yt, '--no-playlist']
        }));
        await expect(resolveYoutubeCookieArgvForDownload(yt, {})).resolves.toEqual([]);
    });

    it('resolveYoutubeCookieArgvForDownload slices argv between prefix and url', async () => {
        runYtDlpWithAuthCookieStrategies.mockImplementation(async (url, options, buildArgs) => {
            const built = await buildArgs(url, options);
            const args = [...built.args];
            const tail = args.pop();
            if (tail == null) {
                throw new Error('expected trailing url arg');
            }
            args.push('--cookies', '/tmp/c.txt', tail);
            return {
                stdout: '',
                stderr: '',
                exitCode: 0,
                finalArgs: args
            };
        });
        await expect(resolveYoutubeCookieArgvForDownload(yt, {})).resolves.toEqual([
            '--cookies',
            '/tmp/c.txt'
        ]);
    });

    it('resolveYoutubeDownloadPreamble returns empty cookie argv on failure', async () => {
        runYtDlpWithAuthCookieStrategies.mockImplementation(async (url, options, buildArgs) => {
            const built = await buildArgs(url, options);
            return {
                stdout: 'ignored',
                stderr: '',
                exitCode: 2,
                finalArgs: built.args
            };
        });
        const r = await resolveYoutubeDownloadPreamble(
            yt,
            {},
            {
                outputTemplateFullPath: '/o',
                formatId: 'best',
                audioOnly: false
            }
        );
        expect(r.exitCode).toBe(2);
        expect(r.plannedOutputPath).toBeNull();
        expect(r.cookieArgv).toEqual([]);
    });

    it('resolveYoutubeDownloadPreamble parses planned path and optional cookie argv', async () => {
        const params = {
            outputTemplateFullPath: '/tmp/%(title)s',
            formatId: 'best',
            audioOnly: false
        };
        const opts = { getSiteCookiesFilePath: async () => '/cookies/netscape.txt' };
        runYtDlpWithAuthCookieStrategies.mockImplementation(async (url, options, buildArgs) => {
            const built = await buildArgs(url, options);
            return {
                stdout: 'noise\n  /tmp/My Video.mp4  \n',
                stderr: '',
                exitCode: 0,
                finalArgs: built.args
            };
        });
        const r = await resolveYoutubeDownloadPreamble(yt, opts, params);
        expect(r.exitCode).toBe(0);
        expect(r.plannedOutputPath).toBe('/tmp/My Video.mp4');
        expect(r.cookieArgv.length).toBeGreaterThan(0);
    });

    it('resolveYoutubeDownloadPreamble leaves cookie argv empty when url precedes cookie segment', async () => {
        const params = {
            outputTemplateFullPath: '/o',
            formatId: 'best',
            audioOnly: false
        };
        runYtDlpWithAuthCookieStrategies.mockImplementation(async (url, options, buildArgs) => {
            const built = await buildArgs(url, options);
            const urlIdx = built.args.lastIndexOf(url);
            const short = built.args.slice(0, urlIdx + 1);
            return {
                stdout: 'out',
                stderr: '',
                exitCode: 0,
                finalArgs: short
            };
        });
        const r = await resolveYoutubeDownloadPreamble(yt, {}, params);
        expect(r.cookieArgv).toEqual([]);
        expect(r.plannedOutputPath).toBe('out');
    });
});
