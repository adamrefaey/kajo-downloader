import { getYoutubeExtractorArgs, isYoutubeUrl } from '../youtubeYtdlpDefaults';
import type {
    BuiltArgsResult,
    FetchMetadataOptions,
    MetadataArgsBuilder,
    YoutubeDownloadPreambleParams
} from './types';
import { runYtDlpWithAuthCookieStrategies } from './ytdlpProcess';

export async function appendCookiesYoutubeExtractorAndExtraArgs(
    args: string[],
    url: string,
    options: FetchMetadataOptions
): Promise<boolean> {
    let usedCookies = false;
    let sitePath: string | null = null;
    if (options.getSiteCookiesFilePath) {
        sitePath = await options.getSiteCookiesFilePath(url);
    }
    const cookiesPath = sitePath;
    if (cookiesPath) {
        args.push('--cookies', cookiesPath);
        usedCookies = true;
    }
    if (isYoutubeUrl(url)) {
        if (options.youtubeExtractorArgsOverride !== undefined) {
            args.push(...options.youtubeExtractorArgsOverride);
        } else {
            args.push(...getYoutubeExtractorArgs(usedCookies));
        }
    }
    if (options.extraArgs?.length) {
        args.push(...options.extraArgs);
    }
    return usedCookies;
}

export async function buildMetadataArgs(
    url: string,
    options: FetchMetadataOptions
): Promise<BuiltArgsResult> {
    const args = ['--dump-json', '--no-playlist', '--no-warnings'];
    const usedCookies = await appendCookiesYoutubeExtractorAndExtraArgs(args, url, options);
    args.push(url);
    return { args, usedCookies };
}

export async function buildPlaylistMetadataArgs(
    url: string,
    options: FetchMetadataOptions
): Promise<BuiltArgsResult> {
    const args = ['--dump-single-json', '--flat-playlist', '--no-warnings'];
    const usedCookies = await appendCookiesYoutubeExtractorAndExtraArgs(args, url, options);
    args.push(url);
    return { args, usedCookies };
}

/**
 * YouTube channel (UU...) and playlist/watch+list URLs: a full flat probe lists every item and is slow or can appear hung.
 * Two items are enough to classify as batch/multi; the picker streams or loads the full list afterward.
 */
export async function buildYoutubeChannelFastPlaylistMetadataArgs(
    url: string,
    options: FetchMetadataOptions
): Promise<BuiltArgsResult> {
    const args = [
        '--dump-single-json',
        '--flat-playlist',
        '--no-warnings',
        '--playlist-items',
        '1:2'
    ];
    const usedCookies = await appendCookiesYoutubeExtractorAndExtraArgs(args, url, options);
    args.push(url);
    return { args, usedCookies };
}

export async function buildThumbnailOnlyArgs(
    url: string,
    options: FetchMetadataOptions,
    outputTemplate: string
): Promise<BuiltArgsResult> {
    const args = ['--skip-download', '--write-thumbnail', '--no-playlist', '--no-warnings'];
    const usedCookies = await appendCookiesYoutubeExtractorAndExtraArgs(args, url, options);
    args.push('-o', outputTemplate);
    args.push(url);
    return { args, usedCookies };
}

export async function buildYtDlpDirectImageDownloadArgs(
    imageUrl: string,
    options: FetchMetadataOptions,
    outputTemplate: string
): Promise<BuiltArgsResult> {
    const args = ['--no-playlist', '--no-warnings', '-o', outputTemplate];
    const usedCookies = await appendCookiesYoutubeExtractorAndExtraArgs(args, imageUrl, options);
    args.push(imageUrl);
    return { args, usedCookies };
}

export const YT_DLP_SIMULATE_PROBE_PREFIX = [
    '--simulate',
    '--no-playlist',
    '--no-warnings'
] as const;

export async function buildSimulateProbeArgs(
    url: string,
    options: FetchMetadataOptions
): Promise<BuiltArgsResult> {
    const args: string[] = [...YT_DLP_SIMULATE_PROBE_PREFIX];
    const usedCookies = await appendCookiesYoutubeExtractorAndExtraArgs(args, url, options);
    args.push(url);
    return { args, usedCookies };
}

/** yt-dlp argv fragment (`--cookies ...` from the embedded site session) that succeeds for this URL, or []. */
export async function resolveYoutubeCookieArgvForDownload(
    url: string,
    options: FetchMetadataOptions = {}
): Promise<string[]> {
    if (!isYoutubeUrl(url)) {
        return [];
    }
    const { exitCode, finalArgs } = await runYtDlpWithAuthCookieStrategies(
        url,
        options,
        buildSimulateProbeArgs,
        { retainCookieFiles: true }
    );
    if (exitCode !== 0) {
        return [];
    }

    const urlIdx = finalArgs.lastIndexOf(url);
    if (urlIdx < YT_DLP_SIMULATE_PROBE_PREFIX.length) {
        return [];
    }
    return finalArgs.slice(YT_DLP_SIMULATE_PROBE_PREFIX.length, urlIdx);
}

export function youtubeDownloadPreambleCookieSegmentStart(
    params: YoutubeDownloadPreambleParams
): number {
    // [--simulate ... -f <id>] then either [--merge-output-format, mp4] or [-x, --audio-format, mp3]
    const throughFormatId = 9;
    return params.audioOnly ? throughFormatId + 3 : throughFormatId + 2;
}

export async function buildYoutubeDownloadPreambleArgs(
    params: YoutubeDownloadPreambleParams,
    url: string,
    options: FetchMetadataOptions
): Promise<BuiltArgsResult> {
    const args: string[] = [
        '--simulate',
        '--no-playlist',
        '--no-warnings',
        '--print',
        'filename',
        '-o',
        params.outputTemplateFullPath,
        '-f',
        params.formatId
    ];
    if (params.audioOnly) {
        args.push('-x', '--audio-format', params.audioFormat ?? 'mp3');
    } else {
        args.push('--merge-output-format', params.mergeOutputFormat ?? 'mp4');
    }
    const usedCookies = await appendCookiesYoutubeExtractorAndExtraArgs(args, url, options);
    args.push(url);
    return { args, usedCookies };
}

export function parsePlannedFilenameFromPrintStdout(stdout: string): string | null {
    const lines = stdout
        .split(/\r?\n/)
        .map((line) => line.trim())
        .filter(Boolean);
    return lines.at(-1) ?? null;
}

/**
 * One yt-dlp run: cookie/auth probe (simulate) plus `--print filename` for the same format/template.
 * Used instead of separate `resolveYoutubeCookieArgvForDownload` + `getPlannedOutputPath` for YouTube when a cookie file resolver exists.
 */
export async function resolveYoutubeDownloadPreamble(
    url: string,
    options: FetchMetadataOptions,
    params: YoutubeDownloadPreambleParams
): Promise<{
    cookieArgv: string[];
    plannedOutputPath: string | null;
    exitCode: number | null;
}> {
    const builder: MetadataArgsBuilder = (u, o) => buildYoutubeDownloadPreambleArgs(params, u, o);

    const { stdout, exitCode, finalArgs } = await runYtDlpWithAuthCookieStrategies(
        url,
        options,
        builder,
        { retainCookieFiles: true }
    );

    const urlIdx = finalArgs.lastIndexOf(url);
    const segStart = youtubeDownloadPreambleCookieSegmentStart(params);
    let cookieArgv: string[] = [];
    if (urlIdx > segStart) {
        cookieArgv = finalArgs.slice(segStart, urlIdx);
    }

    if (exitCode !== 0) {
        return { cookieArgv: [], plannedOutputPath: null, exitCode };
    }

    return {
        cookieArgv,
        plannedOutputPath: parsePlannedFilenameFromPrintStdout(stdout),
        exitCode
    };
}

export async function buildFlatPlaylistLineDumpArgs(
    url: string,
    options: FetchMetadataOptions
): Promise<BuiltArgsResult> {
    const args = ['--dump-json', '--flat-playlist', '--lazy-playlist', '--no-warnings'];
    const usedCookies = await appendCookiesYoutubeExtractorAndExtraArgs(args, url, options);
    args.push(url);
    return { args, usedCookies };
}
