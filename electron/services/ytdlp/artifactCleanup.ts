import { readdir, unlink } from 'node:fs/promises';
import { basename, dirname, extname, join } from 'node:path';
import type { DownloadEngineCapabilities } from '../../../src/types';
import type { RunningDownload } from './types';

/** Single-segment suffix after `stem.` (e.g. `title.webm` → rest `webm`). */
const YTDLP_STEM_SIBLING_SINGLE_EXT = new Set([
    'webm',
    'mkv',
    'mp4',
    'm4a',
    'opus',
    'ogg',
    'mp3',
    'wav',
    'flac',
    'aac',
    'jpg',
    'jpeg',
    'png',
    'webp',
    'avif',
    'gif',
    'bmp',
    'tif',
    'tiff',
    'ts',
    '3gp',
    'flv'
]);

/**
 * Suffix after `stem.` for files in the output directory that yt-dlp creates alongside the merged
 * output (separate video/audio streams, thumbnails, metadata). Must not match unrelated `stem.*`
 * files (e.g. `stem.notes.txt`) — only typical media/sidecar extensions.
 */
function isYtDlpStemSiblingRestArtifact(rest: string): boolean {
    const lower = rest.toLowerCase();
    if (lower === 'info.json') {
        return true;
    }
    if (lower.endsWith('.info.json')) {
        return true;
    }
    if (lower.endsWith('.description')) {
        return true;
    }
    if (!rest.includes('.') && YTDLP_STEM_SIBLING_SINGLE_EXT.has(lower)) {
        return true;
    }
    if (
        /\.(webm|mkv|mp4|m4a|opus|ogg|mp3|wav|flac|aac|jpg|jpeg|png|webp|avif|gif|bmp|tif|tiff|srt|vtt|ass|ts|3gp|flv|part|ytdl)$/i.test(
            lower
        )
    ) {
        return true;
    }
    return false;
}

export function isYtDlpCancelledArtifact(baseName: string, stem: string, name: string): boolean {
    if (name === baseName || name === `${baseName}.part` || name === `${baseName}.ytdl`) {
        return true;
    }
    if (!stem || !name.startsWith(`${stem}.`)) {
        return false;
    }
    const lower = name.toLowerCase();
    const rest = name.slice(stem.length + 1);
    return (
        name.startsWith(`${stem}.f`) ||
        name.startsWith(`${stem}.temp`) ||
        name.startsWith(`${stem}.frag`) ||
        lower.endsWith('.part') ||
        lower.endsWith('.ytdl') ||
        lower.includes('.frag') ||
        lower.includes('.temp') ||
        /\.f\d+\./.test(name) ||
        isYtDlpStemSiblingRestArtifact(rest)
    );
}

export function runningDownloadArtifactSeeds(download: RunningDownload): string[] {
    const seeds: string[] = [];
    if (download.reservedOutputPath) {
        seeds.push(download.reservedOutputPath);
    }
    if (download.outputFilePath) {
        seeds.push(download.outputFilePath);
    }
    return seeds;
}

export async function cleanupIncompleteDownloadArtifactsFromSeeds(
    initialPaths: Iterable<string>
): Promise<void> {
    const candidates = new Set<string>();
    for (const p of initialPaths) {
        if (typeof p === 'string' && p.trim().length > 0) {
            candidates.add(p);
        }
    }
    if (candidates.size === 0) {
        return;
    }

    let grew = true;
    while (grew) {
        grew = false;
        const snapshot = Array.from(candidates);
        for (const targetPath of snapshot) {
            candidates.add(`${targetPath}.part`);
            candidates.add(`${targetPath}.ytdl`);
            const bName = basename(targetPath);
            const stem = extname(bName) ? bName.slice(0, -extname(bName).length) : bName;
            if (!stem) {
                continue;
            }
            try {
                const dir = dirname(targetPath);
                const entries = await readdir(dir, { withFileTypes: true });
                for (const entry of entries) {
                    if (!entry.isFile()) {
                        continue;
                    }
                    const name = entry.name;
                    if (isYtDlpCancelledArtifact(bName, stem, name)) {
                        const full = join(dir, name);
                        if (!candidates.has(full)) {
                            candidates.add(full);
                            grew = true;
                        }
                    }
                }
            } catch {
                // Directory may not exist yet; ignore.
            }
        }
    }

    await Promise.all(Array.from(candidates, (path) => tryDeleteFile(path)));
}

export async function cleanupCancelledDownloadFiles(download: RunningDownload): Promise<void> {
    await cleanupIncompleteDownloadArtifactsFromSeeds(runningDownloadArtifactSeeds(download));
}

const AUDIO_INFLIGHT_EXT: Record<string, string> = {
    mp3: '.mp3',
    m4a: '.m4a',
    flac: '.flac',
    wav: '.wav',
    aac: '.m4a',
    ogg: '.ogg'
};

const VIDEO_INFLIGHT_EXT: Record<string, string> = {
    mp4: '.mp4',
    mkv: '.mkv',
    webm: '.webm'
};

export function buildFallbackInflightOutputPath(
    outputDir: string,
    downloadId: string,
    audioOnly: boolean,
    capabilities?: DownloadEngineCapabilities
): string {
    const safeId = downloadId.replace(/[^a-zA-Z0-9-]/g, '');
    let ext: string;
    if (audioOnly) {
        const af = capabilities?.output?.audioFormat ?? 'mp3';
        ext = AUDIO_INFLIGHT_EXT[af] ?? '.mp3';
    } else {
        const vc = capabilities?.output?.videoContainer ?? 'mp4';
        ext = VIDEO_INFLIGHT_EXT[vc] ?? '.mp4';
    }
    return join(outputDir, `kajo-inflight-${safeId || 'dl'}${ext}`);
}

export async function tryDeleteFile(path: string): Promise<void> {
    try {
        await unlink(path);
    } catch {
        // Ignore missing/locked files from partial cleanup.
    }
}
