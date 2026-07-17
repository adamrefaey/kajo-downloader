#!/usr/bin/env node

/**
 * Downloads pinned yt-dlp + ffmpeg/ffprobe binaries (see `binary-pins.json`).
 * SHA-256 of each release asset is verified after download and on cache hits.
 * Minimum CalVer in pins must be >= `MIN_YTDLP_VERSION` in `src/shared/ytdlpVersionPolicy.ts`.
 *
 * ffmpeg/ffprobe/deno ship as gzip blobs on every platform (extracted at runtime under userData);
 * only yt-dlp ships loose. End-user installs never compile — binaries ship in the app.
 *
 * Update cadence: document in `binary-pins.json` — bump tags/checksums before release or for security fixes.
 * BtbN ffmpeg: prefer month-end autobuild tags + n{releaseLine} GPL assets (`pnpm run binaries:bump-ffmpeg`).
 */

import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { createReadStream, createWriteStream } from 'node:fs';
import {
    chmod,
    copyFile,
    cp,
    mkdir,
    readdir,
    readFile,
    rename,
    rm,
    stat,
    writeFile
} from 'node:fs/promises';
import { createRequire } from 'node:module';
import { dirname, extname, join, resolve } from 'node:path';
import { pipeline } from 'node:stream/promises';
import { createGunzip } from 'node:zlib';
import { validateBinaryPins } from './lib/binaryPins.mjs';
import { compressBundledBinaries } from './lib/bundledBinaryCompression.mjs';
import { getGitHubReleaseByTag } from './lib/githubRelease.mjs';

const VALID_PLATFORMS = new Set(['darwin', 'linux', 'win32']);
const VALID_ARCHES = new Set(['x64', 'arm64']);

const projectRoot = resolve(import.meta.dirname, '..');
const resourcesRoot = join(projectRoot, 'resources');
const binaryRoot = join(resourcesRoot, 'bin');
const cacheRoot = join(resourcesRoot, '.cache', 'binaries');
const DOWNLOAD_RETRY_LIMIT = 3;
const FETCH_BINARIES_USER_AGENT = 'kajo-downloader-fetch-binaries';

const require = createRequire(import.meta.url);
let path7za;
try {
    path7za = require('7zip-bin').path7za;
} catch {
    path7za = '7z';
}

const args = parseArgs(process.argv.slice(2));
if (args.help) {
    printHelp();
    process.exit(0);
}

if (!args.platform || !args.arch) {
    printHelp('Both --platform and --arch are required.');
    process.exit(1);
}

const normalizedPlatform = normalizePlatform(args.platform);
const normalizedArch = normalizeArch(args.arch);

if (!VALID_PLATFORMS.has(normalizedPlatform)) {
    throw new Error(
        `Unsupported platform: "${args.platform}". Allowed: ${[...VALID_PLATFORMS].join(', ')}`
    );
}

if (!VALID_ARCHES.has(normalizedArch)) {
    throw new Error(`Unsupported arch: "${args.arch}". Allowed: ${[...VALID_ARCHES].join(', ')}`);
}

const targetId = `${normalizedPlatform}-${normalizedArch}`;
const outputDir = join(binaryRoot, targetId);
const tempDir = join(resourcesRoot, '.tmp', 'binary-fetch', targetId);

const pinsPath = join(import.meta.dirname, 'binary-pins.json');
const pins = JSON.parse(await readFile(pinsPath, 'utf8'));
validateBinaryPins(pins);

await mkdir(cacheRoot, { recursive: true });
await rm(tempDir, { recursive: true, force: true });
await mkdir(tempDir, { recursive: true });
await rm(outputDir, { recursive: true, force: true });
await mkdir(outputDir, { recursive: true });

console.log(`[fetch-binaries] target: ${targetId}`);
console.log(`[fetch-binaries] output: ${outputDir}`);

await fetchYtDlp({
    pins,
    platform: normalizedPlatform,
    arch: normalizedArch,
    outputDir,
    tempDir
});

await fetchFfmpegBundle({
    pins,
    platform: normalizedPlatform,
    arch: normalizedArch,
    outputDir,
    tempDir,
    targetId
});

await fetchDeno({
    pins,
    platform: normalizedPlatform,
    outputDir,
    tempDir,
    targetId
});

await ensureExecutableBits({
    platform: normalizedPlatform,
    outputDir
});

await compressBundledBinaries({ outputDir, platform: normalizedPlatform });

await rm(tempDir, { recursive: true, force: true });
console.log('[fetch-binaries] completed successfully.');

function parseArgs(argv) {
    const parsed = {
        platform: '',
        arch: '',
        help: false
    };

    for (let index = 0; index < argv.length; index += 1) {
        const token = argv[index];
        if (token === '--help' || token === '-h') {
            parsed.help = true;
            continue;
        }
        if (token === '--platform') {
            parsed.platform = argv[index + 1] ?? '';
            index += 1;
            continue;
        }
        if (token.startsWith('--platform=')) {
            parsed.platform = token.split('=')[1] ?? '';
            continue;
        }
        if (token === '--arch') {
            parsed.arch = argv[index + 1] ?? '';
            index += 1;
            continue;
        }
        if (token.startsWith('--arch=')) {
            parsed.arch = token.split('=')[1] ?? '';
        }
    }

    return parsed;
}

function printHelp(errorMessage) {
    if (errorMessage) {
        console.error(`[fetch-binaries] ${errorMessage}`);
        console.error('');
    }
    console.log(
        'Usage: node scripts/fetch-binaries.mjs --platform <darwin|linux|win32> --arch <x64|arm64>'
    );
}

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

async function fileSha256Hex(filePath) {
    return new Promise((resolvePromise, rejectPromise) => {
        const hash = createHash('sha256');
        const stream = createReadStream(filePath);
        stream.on('error', rejectPromise);
        stream.on('data', (chunk) => hash.update(chunk));
        stream.on('end', () => resolvePromise(hash.digest('hex')));
    });
}

async function assertFileSha256(filePath, expectedHex) {
    const want = String(expectedHex).trim().toLowerCase();
    const got = await fileSha256Hex(filePath);
    if (got !== want) {
        throw new Error(
            `SHA-256 mismatch for ${filePath} (expected ${want.slice(0, 12)}…, got ${got.slice(0, 12)}…)`
        );
    }
}

async function fetchYtDlp({ pins, platform, arch, outputDir, tempDir }) {
    const y = pins.ytdlp;
    const targetFileName = platform === 'win32' ? 'yt-dlp.exe' : 'yt-dlp';
    const targetPath = join(outputDir, targetFileName);

    if (platform === 'darwin') {
        const assetName = 'yt-dlp_macos.zip';
        const expectedSha256 = y.sha256[assetName];
        if (!expectedSha256) {
            throw new Error(`binary-pins: missing sha256 for ${assetName}`);
        }
        const release = await getGitHubReleaseByTag(
            y.owner,
            y.repo,
            y.tag,
            FETCH_BINARIES_USER_AGENT
        );
        const asset = release.assets.find((entry) => entry.name === assetName);
        if (!asset) {
            throw new Error(
                `Could not find yt-dlp asset "${assetName}" in release "${release.tag_name}".`
            );
        }
        const archivePath = await downloadWithCache({
            owner: y.owner,
            repo: y.repo,
            releaseTag: release.tag_name,
            assetName,
            assetUrl: asset.browser_download_url,
            expectedSha256
        });

        const extractDir = join(tempDir, 'ytdlp-extracted');
        await rm(extractDir, { recursive: true, force: true });
        await mkdir(extractDir, { recursive: true });
        await extractArchive(archivePath, extractDir);

        const sourcePath =
            (await findFileRecursive(extractDir, 'yt-dlp_macos')) ??
            (await findFileRecursive(extractDir, 'yt-dlp'));
        if (!sourcePath) {
            throw new Error(
                `Could not locate yt-dlp executable in extracted asset "${assetName}".`
            );
        }

        await cp(extractDir, outputDir, { recursive: true, force: true });
        const bundledMacExecutable = join(outputDir, 'yt-dlp_macos');
        if (await fileExists(bundledMacExecutable)) {
            await rename(bundledMacExecutable, targetPath);
        }
        // Keep only the portable runtime layout that yt-dlp executes with.
        // The duplicated Python.framework tree causes electron-builder mac signing
        // to fail ("bundle format is ambiguous"), while _internal/Python remains sufficient.
        await rm(join(outputDir, '_internal', 'Python.framework'), {
            recursive: true,
            force: true
        });
        const ytDlpInternalPath = join(outputDir, '_internal');
        const ytDlpInternalArchivePath = join(outputDir, '_internal.tar.gz');
        await runCommand('tar', ['-czf', ytDlpInternalArchivePath, '-C', outputDir, '_internal']);
        await rm(ytDlpInternalPath, { recursive: true, force: true });
        console.log(`[fetch-binaries] yt-dlp (onedir) -> ${targetFileName}`);
        return;
    }

    const assetName = pickYtDlpAssetName(platform, arch);
    const expectedSha256 = y.sha256[assetName];
    if (!expectedSha256) {
        throw new Error(`binary-pins: missing sha256 for ${assetName}`);
    }
    const release = await getGitHubReleaseByTag(y.owner, y.repo, y.tag, FETCH_BINARIES_USER_AGENT);
    const asset = release.assets.find((entry) => entry.name === assetName);
    if (!asset) {
        throw new Error(
            `Could not find yt-dlp asset "${assetName}" in release "${release.tag_name}".`
        );
    }

    const downloadedPath = await downloadWithCache({
        owner: y.owner,
        repo: y.repo,
        releaseTag: release.tag_name,
        assetName: asset.name,
        assetUrl: asset.browser_download_url,
        expectedSha256
    });

    await copyFile(downloadedPath, targetPath);
    console.log(`[fetch-binaries] yt-dlp -> ${targetFileName}`);
}

function pickYtDlpAssetName(platform, arch) {
    if (platform === 'win32') {
        return 'yt-dlp.exe';
    }
    if (platform === 'darwin') {
        throw new Error('Darwin yt-dlp asset is resolved via macOS onedir zip in fetchYtDlp().');
    }
    if (platform === 'linux' && arch === 'x64') {
        return 'yt-dlp_linux';
    }
    if (platform === 'linux' && arch === 'arm64') {
        return 'yt-dlp_linux_aarch64';
    }
    throw new Error(`No yt-dlp asset mapping for ${platform}-${arch}`);
}

function pickDenoAssetName(pins, targetId) {
    const name = pins?.deno?.assets?.[targetId];
    if (!name) {
        throw new Error(`binary-pins: no deno asset mapping for ${targetId}`);
    }
    return name;
}

async function fetchFfmpegBundle({ pins, platform, arch, outputDir, tempDir, targetId }) {
    if (platform === 'darwin') {
        await fetchDarwinFfmpegBundle({ pins, arch, outputDir });
        return;
    }

    const b = pins.ffmpegBtbn;
    const spec = b.targets[targetId];
    if (!spec) {
        throw new Error(`binary-pins: no ffmpeg BtbN target for ${targetId}`);
    }

    const release = await getGitHubReleaseByTag(b.owner, b.repo, b.tag, FETCH_BINARIES_USER_AGENT);
    const asset = release.assets.find((entry) => entry.name === spec.assetName);

    if (!asset) {
        throw new Error(
            `Could not find FFmpeg bundle "${spec.assetName}" for ${targetId} in release "${release.tag_name}".`
        );
    }

    const archivePath = await downloadWithCache({
        owner: b.owner,
        repo: b.repo,
        releaseTag: release.tag_name,
        assetName: asset.name,
        assetUrl: asset.browser_download_url,
        expectedSha256: spec.sha256
    });

    const extractDir = join(tempDir, 'ffmpeg-extracted');
    await rm(extractDir, { recursive: true, force: true });
    await mkdir(extractDir, { recursive: true });
    await extractArchive(archivePath, extractDir);

    const ffmpegSource = await findFileRecursive(
        extractDir,
        platform === 'win32' ? 'ffmpeg.exe' : 'ffmpeg'
    );
    const ffprobeSource = await findFileRecursive(
        extractDir,
        platform === 'win32' ? 'ffprobe.exe' : 'ffprobe'
    );

    if (!ffmpegSource || !ffprobeSource) {
        throw new Error(
            `Failed to locate ffmpeg/ffprobe binaries in extracted bundle "${asset.name}".`
        );
    }

    const ffmpegTarget = join(outputDir, platform === 'win32' ? 'ffmpeg.exe' : 'ffmpeg');
    const ffprobeTarget = join(outputDir, platform === 'win32' ? 'ffprobe.exe' : 'ffprobe');
    await copyFile(ffmpegSource, ffmpegTarget);
    await copyFile(ffprobeSource, ffprobeTarget);

    console.log(`[fetch-binaries] ffmpeg -> ${platform === 'win32' ? 'ffmpeg.exe' : 'ffmpeg'}`);
    console.log(`[fetch-binaries] ffprobe -> ${platform === 'win32' ? 'ffprobe.exe' : 'ffprobe'}`);
}

async function fetchDarwinFfmpegBundle({ pins, arch, outputDir }) {
    const d = pins.ffmpegDarwinStatic;
    const archToken = arch === 'arm64' ? 'arm64' : 'x64';
    const ffmpegBase = `ffmpeg-darwin-${archToken}.gz`;
    const ffprobeBase = `ffprobe-darwin-${archToken}.gz`;
    const ffmpegSha = d.sha256[ffmpegBase];
    const ffprobeSha = d.sha256[ffprobeBase];
    if (!ffmpegSha || !ffprobeSha) {
        throw new Error(`binary-pins: missing darwin ffmpeg sha256 for ${archToken}`);
    }

    const release = await getGitHubReleaseByTag(d.owner, d.repo, d.tag, FETCH_BINARIES_USER_AGENT);
    const ffmpegAsset = pickDarwinStaticAsset(release.assets, `ffmpeg-darwin-${archToken}`);
    const ffprobeAsset = pickDarwinStaticAsset(release.assets, `ffprobe-darwin-${archToken}`);

    if (!ffmpegAsset || !ffprobeAsset) {
        throw new Error(
            `Could not find darwin ffmpeg/ffprobe binaries for arch ${arch} in release "${release.tag_name}".`
        );
    }

    const ffmpegDownloadedPath = await downloadWithCache({
        owner: d.owner,
        repo: d.repo,
        releaseTag: release.tag_name,
        assetName: ffmpegAsset.name,
        assetUrl: ffmpegAsset.browser_download_url,
        expectedSha256: ffmpegSha
    });
    const ffprobeDownloadedPath = await downloadWithCache({
        owner: d.owner,
        repo: d.repo,
        releaseTag: release.tag_name,
        assetName: ffprobeAsset.name,
        assetUrl: ffprobeAsset.browser_download_url,
        expectedSha256: ffprobeSha
    });

    const ffmpegTarget = join(outputDir, 'ffmpeg');
    const ffprobeTarget = join(outputDir, 'ffprobe');

    await copyOrExtractGzip({
        sourcePath: ffmpegDownloadedPath,
        sourceName: ffmpegAsset.name,
        targetPath: ffmpegTarget
    });
    await copyOrExtractGzip({
        sourcePath: ffprobeDownloadedPath,
        sourceName: ffprobeAsset.name,
        targetPath: ffprobeTarget
    });

    console.log('[fetch-binaries] ffmpeg -> ffmpeg');
    console.log('[fetch-binaries] ffprobe -> ffprobe');
}

async function fetchDeno({ pins, platform, outputDir, tempDir, targetId }) {
    const d = pins.deno;
    if (!d) {
        throw new Error('binary-pins: missing deno block');
    }
    const assetName = pickDenoAssetName(pins, targetId);
    const expectedSha256 = d.sha256[assetName];
    if (!expectedSha256) {
        throw new Error(`binary-pins: missing sha256 for ${assetName}`);
    }

    const release = await getGitHubReleaseByTag(d.owner, d.repo, d.tag, FETCH_BINARIES_USER_AGENT);
    const asset = release.assets.find((entry) => entry.name === assetName);
    if (!asset) {
        throw new Error(
            `Could not find deno asset "${assetName}" in release "${release.tag_name}".`
        );
    }

    const archivePath = await downloadWithCache({
        owner: d.owner,
        repo: d.repo,
        releaseTag: release.tag_name,
        assetName: asset.name,
        assetUrl: asset.browser_download_url,
        expectedSha256
    });

    const extractDir = join(tempDir, 'deno-extracted');
    await rm(extractDir, { recursive: true, force: true });
    await mkdir(extractDir, { recursive: true });
    await extractArchive(archivePath, extractDir);

    const executableName = platform === 'win32' ? 'deno.exe' : 'deno';
    const source = await findFileRecursive(extractDir, executableName);
    if (!source) {
        throw new Error(`Could not locate ${executableName} in extracted asset "${asset.name}".`);
    }

    const target = join(outputDir, executableName);
    await copyFile(source, target);
    console.log(`[fetch-binaries] deno -> ${executableName}`);
}

function pickDarwinStaticAsset(assets, baseName) {
    const byName = new Map(assets.map((asset) => [asset.name, asset]));
    // Prefer `.gz` (matches `binary-pins.json` sha256 keys). Uncompressed assets hash differently.
    return byName.get(`${baseName}.gz`) ?? byName.get(baseName) ?? null;
}

async function ensureExecutableBits({ platform, outputDir }) {
    if (platform === 'win32') {
        return;
    }

    const fileNames = ['yt-dlp', 'ffmpeg', 'ffprobe', 'deno'];
    for (const fileName of fileNames) {
        const filePath = join(outputDir, fileName);
        try {
            await chmod(filePath, 0o755);
        } catch (error) {
            if (error && typeof error === 'object' && 'code' in error && error.code === 'ENOENT') {
                continue;
            }
            throw error;
        }
    }
}

async function extract7zArchive(archivePath, destinationDirectory) {
    await mkdir(destinationDirectory, { recursive: true });
    await runCommand(path7za, ['x', archivePath, `-o${destinationDirectory}`, '-y', '-aos']);
}

async function downloadWithCache({ owner, repo, releaseTag, assetName, assetUrl, expectedSha256 }) {
    const destination = join(cacheRoot, owner, repo, releaseTag, assetName);
    const metaPath = `${destination}.meta.json`;
    await mkdir(dirname(destination), { recursive: true });

    if (await fileExists(destination)) {
        console.log(`[fetch-binaries] cache hit: ${assetName}`);
        try {
            await assertFileSha256(destination, expectedSha256);
            return destination;
        } catch (error) {
            if (!isSha256MismatchError(error)) {
                throw error;
            }
            console.warn(
                `[fetch-binaries] dropping corrupt cache for ${assetName}: ${getErrorMessage(error)}`
            );
            await rm(destination, { force: true });
            await rm(metaPath, { force: true });
        }
    }

    const tempDownloadPath = `${destination}.download`;
    let lastError = null;

    for (let attempt = 1; attempt <= DOWNLOAD_RETRY_LIMIT; attempt += 1) {
        try {
            console.log(
                `[fetch-binaries] downloading: ${assetName}${attempt > 1 ? ` (attempt ${attempt}/${DOWNLOAD_RETRY_LIMIT})` : ''}`
            );
            const response = await fetch(assetUrl, {
                headers: {
                    'User-Agent': FETCH_BINARIES_USER_AGENT
                }
            });

            if (!response.ok || !response.body) {
                const body = await safeReadText(response);
                throw new Error(
                    `Download failed for ${assetName}: ${response.status} ${response.statusText}\n${body}`
                );
            }

            await rm(tempDownloadPath, { force: true });
            const stream = createWriteStream(tempDownloadPath);
            await pipeline(response.body, stream);
            await writeFile(
                metaPath,
                JSON.stringify({ assetUrl, downloadedAt: new Date().toISOString() }, null, 2)
            );
            await assertFileSha256(tempDownloadPath, expectedSha256);
            await copyFile(tempDownloadPath, destination);
            await rm(tempDownloadPath, { force: true });
            return destination;
        } catch (error) {
            lastError = error;
            await rm(tempDownloadPath, { force: true });
            if (attempt >= DOWNLOAD_RETRY_LIMIT || !isRetryableDownloadError(error)) {
                throw error;
            }
            console.warn(
                `[fetch-binaries] transient download failure for ${assetName}: ${getErrorMessage(error)}`
            );
        }
    }

    throw lastError ?? new Error(`Download failed for ${assetName}`);
}

function isSha256MismatchError(error) {
    return getErrorMessage(error).toLowerCase().includes('sha-256 mismatch');
}

function isRetryableDownloadError(error) {
    const message = getErrorMessage(error).toLowerCase();
    return (
        isSha256MismatchError(error) ||
        message.includes('econnreset') ||
        message.includes('terminated') ||
        message.includes('socket') ||
        message.includes('timed out') ||
        message.includes('timeout') ||
        message.includes('fetch failed') ||
        message.includes('network')
    );
}

function getErrorMessage(error) {
    if (error instanceof Error) {
        return error.message;
    }
    return String(error);
}

async function extractArchive(archivePath, destinationDirectory) {
    const lower = archivePath.toLowerCase();
    if (lower.endsWith('.7z')) {
        await extract7zArchive(archivePath, destinationDirectory);
        return;
    }

    if (lower.endsWith('.zip')) {
        await runCommand('unzip', ['-oq', archivePath, '-d', destinationDirectory]);
        return;
    }

    if (
        lower.endsWith('.tar.xz') ||
        lower.endsWith('.tar.gz') ||
        lower.endsWith('.tgz') ||
        extname(lower) === '.tar'
    ) {
        await runCommand('tar', ['-xf', archivePath, '-C', destinationDirectory]);
        return;
    }

    throw new Error(`Unsupported archive format: ${archivePath}`);
}

async function findFileRecursive(directory, fileName) {
    const entries = await readdir(directory, { withFileTypes: true });
    for (const entry of entries) {
        const fullPath = join(directory, entry.name);
        if (entry.isDirectory()) {
            const found = await findFileRecursive(fullPath, fileName);
            if (found) {
                return found;
            }
            continue;
        }
        if (entry.isFile() && entry.name === fileName) {
            return fullPath;
        }
    }
    return null;
}

async function fileExists(pathname) {
    try {
        const info = await stat(pathname);
        return info.isFile();
    } catch {
        return false;
    }
}

async function copyOrExtractGzip({ sourcePath, sourceName, targetPath }) {
    if (sourceName.toLowerCase().endsWith('.gz')) {
        await pipeline(createReadStream(sourcePath), createGunzip(), createWriteStream(targetPath));
        return;
    }

    await copyFile(sourcePath, targetPath);
}

async function safeReadText(response) {
    try {
        return await response.text();
    } catch {
        return '';
    }
}

async function runCommand(command, args) {
    await new Promise((resolvePromise, rejectPromise) => {
        const child = spawn(command, args, { stdio: 'inherit' });
        child.on('error', rejectPromise);
        child.on('exit', (code) => {
            if (code === 0) {
                resolvePromise();
                return;
            }
            rejectPromise(
                new Error(`Command failed (${command} ${args.join(' ')}), exit code ${code}`)
            );
        });
    });
}
