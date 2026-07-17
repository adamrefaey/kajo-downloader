import { mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { gunzipSync } from 'node:zlib';
import { afterEach, describe, expect, it } from 'vitest';
import {
    bundledExecutableFileName,
    compressBundledBinaries,
    compressionTargets
} from '../scripts/lib/bundledBinaryCompression.mjs';

const tempDirs: string[] = [];

async function makeTempOutputDir(): Promise<string> {
    const dir = await mkdtemp(join(tmpdir(), 'kajo-compress-'));
    tempDirs.push(dir);
    return dir;
}

afterEach(async () => {
    while (tempDirs.length > 0) {
        const dir = tempDirs.pop();
        if (dir) {
            await rm(dir, { recursive: true, force: true });
        }
    }
});

describe('bundled binary compression targets', () => {
    it('keeps loose names on darwin/linux and appends .exe on win32', () => {
        expect(bundledExecutableFileName('deno', 'darwin')).toBe('deno');
        expect(bundledExecutableFileName('deno', 'linux')).toBe('deno');
        expect(bundledExecutableFileName('deno', 'win32')).toBe('deno.exe');
    });

    it('derives <exe>.gz archive paths so win32 ships deno.exe.gz (never deno.gz)', () => {
        expect(compressionTargets('/out', 'win32')).toEqual([
            { source: join('/out', 'ffmpeg.exe'), archive: join('/out', 'ffmpeg.exe.gz') },
            { source: join('/out', 'ffprobe.exe'), archive: join('/out', 'ffprobe.exe.gz') },
            { source: join('/out', 'deno.exe'), archive: join('/out', 'deno.exe.gz') }
        ]);

        expect(compressionTargets('/out', 'linux')).toEqual([
            { source: join('/out', 'ffmpeg'), archive: join('/out', 'ffmpeg.gz') },
            { source: join('/out', 'ffprobe'), archive: join('/out', 'ffprobe.gz') },
            { source: join('/out', 'deno'), archive: join('/out', 'deno.gz') }
        ]);
    });
});

describe('compressBundledBinaries', () => {
    it('gzips present binaries to <exe>.gz, removes the loose copy, and skips absent ones', async () => {
        const dir = await makeTempOutputDir();
        await writeFile(join(dir, 'deno.exe'), 'DENO-BINARY-BYTES');
        await writeFile(join(dir, 'ffmpeg.exe'), 'FFMPEG-BINARY-BYTES');
        // ffprobe.exe intentionally absent — compression must tolerate a missing target.

        await compressBundledBinaries({ outputDir: dir, platform: 'win32' });

        // Loose executables are removed once compressed.
        await expect(stat(join(dir, 'deno.exe'))).rejects.toThrow();
        await expect(stat(join(dir, 'ffmpeg.exe'))).rejects.toThrow();

        // The compressed copy round-trips back to the original bytes.
        expect(gunzipSync(await readFile(join(dir, 'deno.exe.gz'))).toString()).toBe(
            'DENO-BINARY-BYTES'
        );
        expect(gunzipSync(await readFile(join(dir, 'ffmpeg.exe.gz'))).toString()).toBe(
            'FFMPEG-BINARY-BYTES'
        );

        // An absent source produces no archive (no empty/garbage .gz).
        await expect(stat(join(dir, 'ffprobe.exe.gz'))).rejects.toThrow();
    });
});
