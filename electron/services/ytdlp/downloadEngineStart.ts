import { randomUUID } from 'node:crypto';
import { parseHttpMediaUrl } from '../../../src/shared/mediaUrlResolver';
import { buildYtDlpInvocation } from '../binaries';
import {
    resolveYoutubeCookieArgvForDownload,
    resolveYoutubeDownloadPreamble
} from '../metadata/argsBuilders';
import { isYoutubeUrl } from '../youtubeYtdlpDefaults';
import {
    buildYtDlpArgs,
    getOutputTemplatePath,
    resolveDownloadCookieArgv
} from './downloadEngineArgs';
import { resolveUniqueOutputPath } from './downloadEngineOutputPath';
import { attachProcessHandlers } from './downloadEngineProcessBinding';
import {
    reservedOutputPaths,
    runningDownloads,
    scheduleOrphanCleanup
} from './downloadEngineState';
import { resolveMergeProgressMode } from './mergeProgress';
import type {
    DownloadLaunchContext,
    RunningDownload,
    StartDownloadOptions,
    StartDownloadResult
} from './types';
import { spawnYtdlpProcess } from './ytdlpUtilityProcess';

export async function startDownload(options: StartDownloadOptions): Promise<StartDownloadResult> {
    if (!parseHttpMediaUrl(options.url)) {
        throw new Error('URL must be http or https');
    }
    const downloadId = options.downloadId ?? randomUUID();
    if (runningDownloads.has(downloadId)) {
        throw new Error(`Download with id "${downloadId}" is already running`);
    }

    let cookieArgv: string[] = [];
    let plannedOutputPathHint: string | null | undefined;

    const cookieMetadataOptions = {
        ...(options.getSiteCookiesFilePath !== undefined
            ? { getSiteCookiesFilePath: options.getSiteCookiesFilePath }
            : {})
    };

    const youtubeHasCookieSource = options.getSiteCookiesFilePath != null;

    if (isYoutubeUrl(options.url) && youtubeHasCookieSource) {
        const mergeFmt = options.capabilities?.output?.videoContainer ?? 'mp4';
        const audioFmt = options.capabilities?.output?.audioFormat ?? 'mp3';
        const preamble = await resolveYoutubeDownloadPreamble(options.url, cookieMetadataOptions, {
            outputTemplateFullPath: getOutputTemplatePath(options),
            formatId: options.formatId,
            audioOnly: Boolean(options.audioOnly),
            mergeOutputFormat: mergeFmt,
            audioFormat: audioFmt
        });
        if (preamble.exitCode === 0) {
            cookieArgv = preamble.cookieArgv;
            plannedOutputPathHint = preamble.plannedOutputPath ?? undefined;
        } else {
            cookieArgv = await resolveYoutubeCookieArgvForDownload(
                options.url,
                cookieMetadataOptions
            );
            plannedOutputPathHint = undefined;
        }
    }

    const uniqueOutputPath = await resolveUniqueOutputPath(
        options,
        cookieArgv,
        plannedOutputPathHint ?? options.reservedOutputPathHint ?? undefined
    );
    const resolvedCookiesForLaunch = await resolveDownloadCookieArgv(options, cookieArgv);
    const launchContext: DownloadLaunchContext = {
        options,
        cookieArgv,
        uniqueOutputPath,
        resolvedCookiesPresent: resolvedCookiesForLaunch.length > 0
    };
    const args = await buildYtDlpArgs(
        options,
        uniqueOutputPath,
        cookieArgv,
        'remux',
        launchContext.youtubeExtractorOverride
    );
    const invocation = await buildYtDlpInvocation(args);
    const child = spawnYtdlpProcess(
        downloadId,
        invocation.command,
        invocation.args,
        invocation.env
    );

    const mergeProgressMode = resolveMergeProgressMode(options);
    const download: RunningDownload = {
        process: child,
        wasCancelled: false,
        isPaused: false,
        stderrBuffer: [],
        reservedOutputPath: uniqueOutputPath,
        mergeProgressMode,
        ...(options.progressVideoBytes !== undefined
            ? { progressVideoBytes: options.progressVideoBytes }
            : {}),
        ...(options.progressAudioBytes !== undefined
            ? { progressAudioBytes: options.progressAudioBytes }
            : {}),
        mergeStreamIndex: 0,
        launchContext,
        recodeRetryAttempted: false,
        youtubeConsentFallbackAttempted: false,
        lastActivityAt: Date.now(),
        attemptProgressHighWaterMark: 0
    };

    reservedOutputPaths.add(uniqueOutputPath);

    runningDownloads.set(downloadId, download);
    scheduleOrphanCleanup(downloadId);
    attachProcessHandlers(downloadId, download);

    return { downloadId, reservedOutputPath: uniqueOutputPath };
}
