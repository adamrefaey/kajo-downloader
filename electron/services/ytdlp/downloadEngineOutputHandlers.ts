import type { WebContents } from 'electron';
import { noteDownloadActivity } from './downloadEngineState';
import {
    clampProgressPercentValue,
    computeMergedProgress,
    onDownloadDestinationPath,
    shouldSuppressMergeProgressBeforeFirstFormat
} from './mergeProgress';
import {
    DOWNLOAD_DESTINATION_REGEX,
    emitProgressNow,
    emitProgressThrottled,
    formatEta,
    formatSpeed,
    MERGED_FILE_REGEX,
    POSTPROCESSOR_DESTINATION_REGEX,
    parseStructuredProgress
} from './progressParser';
import type { ProgressPayload, RunningDownload } from './types';

function markMergeOrPostProcessPhase(download: RunningDownload): void {
    download.inMergeOrPostProcess = true;
}

function markDownloadActivity(downloadId: string, download: RunningDownload): void {
    noteDownloadActivity(downloadId, download);
}

export function handleDownloadOutputLine(
    downloadId: string,
    webContents: WebContents,
    download: RunningDownload,
    line: string
): void {
    markDownloadActivity(downloadId, download);
    const destination = line.match(DOWNLOAD_DESTINATION_REGEX);
    if (destination) {
        const destPath = destination[1] ?? '';
        download.outputFilePath = destPath;
        const seqBeforeFormat = download.mergeFormatDestinationSeq ?? 0;
        onDownloadDestinationPath(download, destPath);
        if ((download.mergeFormatDestinationSeq ?? 0) > 0) {
            markMergeOrPostProcessPhase(download);
        }
        const openedFirstMergeStream =
            download.mergeProgressMode !== 'none' &&
            seqBeforeFormat === 0 &&
            (download.mergeFormatDestinationSeq ?? 0) === 1;
        if (openedFirstMergeStream) {
            emitProgressNow(webContents, downloadId, {
                percent: 0,
                size: '--',
                speed: '--',
                eta: '--'
            });
        }
        return;
    }

    const prog = parseStructuredProgress(line);
    if (prog) {
        if (shouldSuppressMergeProgressBeforeFirstFormat(download)) {
            return;
        }
        const result = computeMergedProgress(
            download,
            prog.downloadedBytes,
            prog.totalBytes,
            prog.totalEstimateBytes,
            prog.speedBytesPerSec,
            prog.etaSeconds
        );
        const prevHigh = download.progressPercentHighWaterMark ?? 0;
        const nextPercent = clampProgressPercentValue(Math.max(prevHigh, result.percent));
        download.progressPercentHighWaterMark = nextPercent;

        const payload: Omit<ProgressPayload, 'downloadId'> = {
            percent: nextPercent,
            size: result.currentStreamLabel ?? '--',
            speed: formatSpeed(prog.speedBytesPerSec),
            eta: formatEta(prog.etaSeconds),
            ...(result.totalSizeLabel !== undefined && result.totalSizeBytes !== undefined
                ? { totalSize: result.totalSizeLabel, totalSizeBytes: result.totalSizeBytes }
                : {})
        };
        emitProgressThrottled(webContents, downloadId, payload);
        return;
    }

    const mergedFile = line.match(MERGED_FILE_REGEX);
    if (mergedFile) {
        download.outputFilePath = mergedFile[1] ?? '';
        markMergeOrPostProcessPhase(download);
        return;
    }

    const postprocessorDestination = line.match(POSTPROCESSOR_DESTINATION_REGEX);
    if (postprocessorDestination) {
        download.outputFilePath = postprocessorDestination[1] ?? '';
        markMergeOrPostProcessPhase(download);
    }
}

export function handleStderrLine(
    downloadId: string,
    webContents: WebContents,
    download: RunningDownload,
    line: string
): void {
    if (!line.trim()) {
        return;
    }

    handleDownloadOutputLine(downloadId, webContents, download, line);
    download.stderrBuffer.push(line);
}
