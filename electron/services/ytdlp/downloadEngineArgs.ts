import { join } from 'node:path';
import { YT_DLP_FORMAT_SELECTOR_RE } from '../../../src/shared/ytDlpFormatSelector';
import {
    applyStructuredDownloadCapabilities,
    buildApplyCapabilitiesContext
} from '../downloadCapabilities';
import { getProxyUrlForProfile } from '../proxyProfileStore';
import { getYoutubeExtractorDownloadArgs, isYoutubeUrl } from '../youtubeYtdlpDefaults';
import { YTDLP_PROGRESS_MARKER } from './progressParser';
import type { StartDownloadOptions, VideoOutputMode } from './types';

/** Resolved `--cookies …` argv from probe or, when allowed, the live cookie file path. */
export async function resolveDownloadCookieArgv(
    options: StartDownloadOptions,
    cookieArgv: string[]
): Promise<string[]> {
    if (cookieArgv.length > 0) {
        return cookieArgv;
    }
    const sitePath =
        options.getSiteCookiesFilePath != null
            ? await options.getSiteCookiesFilePath(options.url)
            : null;
    if (sitePath) {
        return ['--cookies', sitePath];
    }
    return [];
}

export async function buildStructuredCapabilityArgsTail(
    options: StartDownloadOptions,
    resolvedCookies: string[],
    videoOutput: VideoOutputMode
): Promise<string[]> {
    const mid: string[] = [];
    const mergeFmt = options.capabilities?.output?.videoContainer ?? 'mp4';
    const audioFmt = options.capabilities?.output?.audioFormat ?? 'mp3';

    if (options.audioOnly) {
        mid.push('-x', '--audio-format', audioFmt);
    } else {
        mid.push('--merge-output-format', mergeFmt);
        if (videoOutput === 'recode') {
            mid.push('--recode-video', mergeFmt);
        }
    }

    if (resolvedCookies.length > 0) {
        mid.push(...resolvedCookies);
    }

    if (options.extraArgs?.length) {
        mid.push(...options.extraArgs);
    }

    const capCtx = buildApplyCapabilitiesContext(
        options.capabilities,
        getProxyUrlForProfile,
        options.resolvedDownloadArchivePath ?? null
    );
    applyStructuredDownloadCapabilities(mid, options.capabilities, capCtx);
    return mid;
}

export async function buildYtDlpArgs(
    options: StartDownloadOptions,
    outputPath: string,
    cookieArgv: string[],
    videoOutput: VideoOutputMode = 'remux',
    youtubeExtractorOverride?: readonly string[],
    resumePartial = true
): Promise<string[]> {
    if (!YT_DLP_FORMAT_SELECTOR_RE.test(options.formatId)) {
        throw new Error(`Invalid format ID: ${options.formatId}`);
    }
    const args = [
        '--newline',
        '--progress-template',
        `download:${YTDLP_PROGRESS_MARKER}|%(progress.downloaded_bytes|0)s|%(progress.total_bytes|0)s|%(progress.total_bytes_estimate|0)s|%(progress.speed|0)s|%(progress.eta|0)s`,
        '--no-playlist',
        '--concurrent-fragments',
        '4',
        // Network resilience: ride out transient drops in-process (resuming the connection from
        // the current byte offset) instead of exiting. yt-dlp's defaults retry with NO sleep, so
        // they exhaust in seconds on a real outage — the linear backoff buys ~2 min per stall.
        '--retries',
        '15',
        '--fragment-retries',
        '15',
        '--file-access-retries',
        '15',
        '--retry-sleep',
        'linear=1::30',
        '--retry-sleep',
        'fragment:linear=1::30',
        '--socket-timeout',
        '30',
        resumePartial ? '--continue' : '--no-continue',
        '-f',
        options.formatId
    ];
    const resolvedCookies = await resolveDownloadCookieArgv(options, cookieArgv);
    const hasCookies = resolvedCookies.length > 0;
    if (isYoutubeUrl(options.url)) {
        if (youtubeExtractorOverride !== undefined) {
            args.push(...youtubeExtractorOverride);
        } else {
            args.push(...getYoutubeExtractorDownloadArgs(hasCookies));
        }
    }

    args.push(...(await buildStructuredCapabilityArgsTail(options, resolvedCookies, videoOutput)));

    args.push('-o', outputPath, '--', options.url);
    return args;
}

export function getOutputTemplatePath(options: StartDownloadOptions): string {
    return join(options.outputDir, options.outputTemplate || '%(title)s.%(ext)s');
}
