/**
 * Shared gzip helper for the non-yt-dlp bundled tools (ffmpeg/ffprobe/deno).
 *
 * These ship as `<exe>.gz` blobs on every platform and are extracted at runtime under
 * userData (see `extractCompressedBinary` in `electron/services/binaries.ts`). Compressing
 * cross-platform keeps the loose ~120MB Deno (and the static ffmpeg/ffprobe) out of the
 * linux/win installers; on darwin it also avoids shipping many individually-signed Mach-O
 * blobs. The runtime consumer expects `${getExecutableName(name)}.gz`, so win32 archives
 * MUST keep the `.exe` in the name (`deno.exe.gz`, not `deno.gz`).
 */

import { createReadStream, createWriteStream } from 'node:fs';
import { rm, stat } from 'node:fs/promises';
import { join } from 'node:path';
import { pipeline } from 'node:stream/promises';
import { createGzip } from 'node:zlib';

/** Bundled tools (excluding yt-dlp, which ships its own onedir layout) compressed at fetch time. */
export const COMPRESSED_BUNDLED_BINARY_BASE_NAMES = ['ffmpeg', 'ffprobe', 'deno'];

/** Executable filename for a base name on the given platform (win32 appends `.exe`). */
export function bundledExecutableFileName(baseName, platform) {
    return platform === 'win32' ? `${baseName}.exe` : baseName;
}

/**
 * Source executable + `.gz` archive path pairs to compress in a packaged target dir.
 * Mirrors the runtime's `${executable}.gz` lookup so producer and consumer can't drift.
 */
export function compressionTargets(outputDir, platform) {
    return COMPRESSED_BUNDLED_BINARY_BASE_NAMES.map((baseName) => {
        const source = join(outputDir, bundledExecutableFileName(baseName, platform));
        return { source, archive: `${source}.gz` };
    });
}

async function fileExists(pathname) {
    try {
        const info = await stat(pathname);
        return info.isFile();
    } catch {
        return false;
    }
}

/** Gzip each present bundled tool to `<exe>.gz` and remove the loose copy. Absent tools are skipped. */
export async function compressBundledBinaries({ outputDir, platform }) {
    for (const { source, archive } of compressionTargets(outputDir, platform)) {
        if (!(await fileExists(source))) {
            continue;
        }

        await pipeline(
            createReadStream(source),
            createGzip({ level: 9 }),
            createWriteStream(archive)
        );
        await rm(source, { force: true });
    }
}
