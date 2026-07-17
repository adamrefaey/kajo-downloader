import { randomUUID } from 'node:crypto';
import { access, readdir } from 'node:fs/promises';
import { basename, dirname, extname } from 'node:path';
import { YT_DLP_FORMAT_SELECTOR_RE } from '../../../src/shared/ytDlpFormatSelector';
import {
    getYoutubeExtractorArgs,
    isYoutubeUrl,
    shouldRetryYoutubeWithAlternatePlayerClient,
    YOUTUBE_CONSENT_FALLBACK_EXTRACTOR_ARGS
} from '../youtubeYtdlpDefaults';
import { buildFallbackInflightOutputPath } from './artifactCleanup';
import {
    buildStructuredCapabilityArgsTail,
    getOutputTemplatePath,
    resolveDownloadCookieArgv
} from './downloadEngineArgs';
import { runYtDlpCommand } from './downloadEngineCommands';
import { reservedOutputPaths } from './downloadEngineState';
import type { StartDownloadOptions } from './types';

function fallbackPlannedOutputPath(options: StartDownloadOptions): string {
    return buildFallbackInflightOutputPath(
        options.outputDir,
        options.downloadId ?? randomUUID(),
        Boolean(options.audioOnly),
        options.capabilities
    );
}

async function fileExists(path: string): Promise<boolean> {
    try {
        await access(path);
        return true;
    } catch {
        return false;
    }
}

async function getPlannedOutputPath(
    options: StartDownloadOptions,
    cookieArgv: string[]
): Promise<string | null> {
    if (!YT_DLP_FORMAT_SELECTOR_RE.test(options.formatId)) {
        return null;
    }
    const resolvedCookies = await resolveDownloadCookieArgv(options, cookieArgv);
    const hasCookies = resolvedCookies.length > 0;

    const runPrintProbe = async (youtubeExtractorOverride?: readonly string[]) => {
        const printArgs = [
            '--no-playlist',
            '--print',
            'filename',
            '-o',
            getOutputTemplatePath(options)
        ];
        if (isYoutubeUrl(options.url)) {
            if (youtubeExtractorOverride !== undefined) {
                printArgs.push(...youtubeExtractorOverride);
            } else {
                printArgs.push(...getYoutubeExtractorArgs(hasCookies));
            }
        }
        printArgs.push(
            ...(await buildStructuredCapabilityArgsTail(options, resolvedCookies, 'remux'))
        );
        printArgs.push('-f', options.formatId, '--', options.url);
        return runYtDlpCommand(printArgs);
    };

    let { stdout, stderr, exitCode } = await runPrintProbe();
    if (
        exitCode !== 0 &&
        isYoutubeUrl(options.url) &&
        !hasCookies &&
        shouldRetryYoutubeWithAlternatePlayerClient(stderr)
    ) {
        ({ stdout, exitCode } = await runPrintProbe([...YOUTUBE_CONSENT_FALLBACK_EXTRACTOR_ARGS]));
    }

    if (exitCode !== 0) {
        return null;
    }

    const lines = stdout
        .split(/\r?\n/)
        .map((line) => line.trim())
        .filter(Boolean);
    return lines.at(-1) ?? null;
}

export async function resolveUniqueOutputPath(
    options: StartDownloadOptions,
    cookieArgv: string[],
    plannedOutputPathHint?: string | null
): Promise<string> {
    let plannedOutputPath =
        plannedOutputPathHint ?? (await getPlannedOutputPath(options, cookieArgv));
    if (!plannedOutputPath) {
        plannedOutputPath = fallbackPlannedOutputPath(options);
    }

    // Resume path: when the renderer supplies a prior reserved path and the final file is not
    // complete yet, keep the same target so yt-dlp continues the existing `.part`.
    if (
        plannedOutputPathHint &&
        !(await fileExists(plannedOutputPathHint)) &&
        !reservedOutputPaths.has(plannedOutputPathHint)
    ) {
        return plannedOutputPathHint;
    }

    if (!(await fileExists(plannedOutputPath)) && !reservedOutputPaths.has(plannedOutputPath)) {
        return plannedOutputPath;
    }

    const extension = extname(plannedOutputPath);
    const basePath = extension ? plannedOutputPath.slice(0, -extension.length) : plannedOutputPath;
    const dir = dirname(plannedOutputPath);
    const baseNameNoExt = basename(basePath);

    // Compile the suffix regex once and reuse it for both the directory scan and the
    // reserved-paths scan — avoids redundant compilation with many concurrent downloads.
    // Safety: both inputs are fully escaped (all regex metacharacters replaced with \\$&)
    // and the pattern is fully anchored (^…$) with no ambiguous quantifiers, so ReDoS
    // is not possible regardless of input length.
    const escapedBase = baseNameNoExt.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const escapedExt = extension.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    // nosemgrep: javascript.lang.security.audit.detect-non-literal-regexp.detect-non-literal-regexp
    const suffixRe = new RegExp(`^${escapedBase} \\((\\d+)\\)${escapedExt}$`);

    // Read directory once and find max existing suffix instead of probing up to 10K files individually.
    let maxSuffix = 0;
    try {
        const entries = await readdir(dir);
        for (const entry of entries) {
            const m = suffixRe.exec(entry);
            if (m) {
                maxSuffix = Math.max(maxSuffix, Number(m[1]));
            }
        }
    } catch {
        // Directory might not exist yet; fall through to suffix 1.
    }

    // Also check reserved paths that haven't been written to disk yet.
    for (const reserved of reservedOutputPaths) {
        const rBase = basename(reserved);
        const m = suffixRe.exec(rBase);
        if (m) {
            maxSuffix = Math.max(maxSuffix, Number(m[1]));
        }
    }

    return `${basePath} (${maxSuffix + 1})${extension}`;
}
