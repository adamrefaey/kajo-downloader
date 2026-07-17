#!/usr/bin/env node
/**
 * Ensures `resources/bin/<platform>-<arch>/` matches the packaged layout by running
 * `fetch-binaries.mjs` when yt-dlp/ffmpeg are missing.
 *
 * Used before `electron-vite dev` / `preview`. Set KAJO_SKIP_DEV_BINARIES=1 to skip (offline work).
 */

import { spawnSync } from 'node:child_process';
import { access, constants } from 'node:fs/promises';
import { join } from 'node:path';

const projectRoot = join(import.meta.dirname, '..');
const VALID_PLATFORMS = new Set(['darwin', 'linux', 'win32']);
const VALID_ARCHES = new Set(['x64', 'arm64']);

function normalizePlatform(platform) {
    const value = platform.toLowerCase().trim();
    if (value === 'mac' || value === 'macos') {
        return 'darwin';
    }
    if (value === 'windows' || value === 'win') {
        return 'win32';
    }
    return value;
}

function normalizeArch(arch) {
    const value = arch.toLowerCase().trim();
    if (value === 'amd64') {
        return 'x64';
    }
    if (value === 'aarch64') {
        return 'arm64';
    }
    return value;
}

function executableName(base) {
    return process.platform === 'win32' ? `${base}.exe` : base;
}

async function pathExists(filePath) {
    try {
        await access(filePath, constants.F_OK);
        return true;
    } catch {
        return false;
    }
}

async function isExecutable(filePath) {
    try {
        await access(filePath, constants.F_OK);
        if (process.platform === 'win32') {
            return true;
        }
        await access(filePath, constants.X_OK);
        return true;
    } catch {
        return false;
    }
}

async function devBinariesReady(binDir) {
    const ytdlp = join(binDir, executableName('yt-dlp'));
    if (!(await isExecutable(ytdlp))) {
        return false;
    }

    const ffmpeg = join(binDir, executableName('ffmpeg'));
    const ffmpegGz = `${ffmpeg}.gz`;
    const ffprobe = join(binDir, executableName('ffprobe'));
    const ffprobeGz = `${ffprobe}.gz`;

    const hasFfmpeg = (await pathExists(ffmpeg)) || (await pathExists(ffmpegGz));
    const hasFfprobe = (await pathExists(ffprobe)) || (await pathExists(ffprobeGz));
    if (!hasFfmpeg || !hasFfprobe) {
        return false;
    }

    const deno = join(binDir, executableName('deno'));
    const denoGz = `${deno}.gz`;
    const hasDeno = (await pathExists(deno)) || (await pathExists(denoGz));
    if (!hasDeno) {
        return false;
    }

    return true;
}

const platform = normalizePlatform(process.platform);
const arch = normalizeArch(process.arch);

if (!VALID_PLATFORMS.has(platform) || !VALID_ARCHES.has(arch)) {
    console.warn(
        `[ensure-dev-binaries] Unsupported host ${process.platform}-${process.arch}; skipping binary ensure.`
    );
    process.exit(0);
}

if (process.env.KAJO_SKIP_DEV_BINARIES === '1') {
    console.log('[ensure-dev-binaries] KAJO_SKIP_DEV_BINARIES=1 — skipping.');
    process.exit(0);
}

const targetId = `${platform}-${arch}`;
const binDir = join(projectRoot, 'resources', 'bin', targetId);

if (await devBinariesReady(binDir)) {
    console.log(`[ensure-dev-binaries] ${targetId} already present — skipping fetch.`);
    process.exit(0);
}

console.log(`[ensure-dev-binaries] Fetching pinned binaries for ${targetId} (same as release)…`);

const fetchScript = join(import.meta.dirname, 'fetch-binaries.mjs');
const result = spawnSync(process.execPath, [fetchScript, '--platform', platform, '--arch', arch], {
    cwd: projectRoot,
    stdio: 'inherit'
});

process.exit(result.status === null ? 1 : result.status);
