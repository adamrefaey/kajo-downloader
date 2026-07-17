import { chmod, readdir, rm, stat } from 'node:fs/promises';
import { join } from 'node:path';

const SUPPORTED_PLATFORMS = new Set(['darwin', 'linux', 'win32']);

/** Matches `resources/bin/<platform>-<arch>/` layout from `fetch-binaries.mjs`. */
const PLATFORM_BUNDLE_DIR = /^(darwin|linux|win32)-/;

export default async function afterPack(context) {
    if (!SUPPORTED_PLATFORMS.has(context.electronPlatformName)) {
        return;
    }

    const binRoot = getBinRoot(context);
    if (!binRoot) {
        return;
    }

    const binaryBaseNames = getBinaryBaseNames(context.electronPlatformName);
    const preferredTargetDir = resolvePreferredTargetBinDirectory(
        binRoot,
        context.electronPlatformName,
        context.arch,
        context.appOutDir
    );

    let targetBinDirs;
    try {
        await pruneForeignPlatformBinaries(binRoot, preferredTargetDir);
        targetBinDirs = await resolveChmodTargetDirs(binRoot, preferredTargetDir);
    } catch (error) {
        if (error && typeof error === 'object' && 'code' in error && error.code === 'ENOENT') {
            console.warn(`[afterPack] Skipping chmod: bin directory not found at ${binRoot}`);
            return;
        }

        throw error;
    }

    const unpackedCacheDir = getUnpackedCacheDirectory(context);
    if (unpackedCacheDir) {
        await rm(unpackedCacheDir, { recursive: true, force: true });
    }

    for (const dir of targetBinDirs) {
        for (const binaryName of binaryBaseNames) {
            await chmodBundledBinary(dir, binaryName);
        }
    }
}

/**
 * Remove every `darwin-*` / `linux-*` / `win32-*` sibling under `bin/` except the one for this
 * build. Without this, `extraResources` copies the whole `resources/bin` tree and Mac DMGs ship
 * hundreds of MB of Linux/Windows binaries.
 */
async function pruneForeignPlatformBinaries(binRoot, preferredTargetDir) {
    const entries = await readdir(binRoot, { withFileTypes: true });
    for (const entry of entries) {
        if (!entry.isDirectory() || !PLATFORM_BUNDLE_DIR.test(entry.name)) {
            continue;
        }
        const dirPath = join(binRoot, entry.name);
        if (dirPath !== preferredTargetDir) {
            await rm(dirPath, { recursive: true, force: true });
        }
    }
}

/** Prefer nested `platform-arch/` when present; otherwise chmod loose binaries in `bin/`. */
async function resolveChmodTargetDirs(binRoot, preferredTargetDir) {
    try {
        const st = await stat(preferredTargetDir);
        if (st.isDirectory()) {
            return [preferredTargetDir];
        }
    } catch (error) {
        if (!error || typeof error !== 'object' || !('code' in error) || error.code !== 'ENOENT') {
            throw error;
        }
    }

    return [binRoot];
}

/**
 * The fetch script stores ffmpeg/ffprobe/deno as `.gz` only on every platform (see
 * `compressBundledBinaries` in `scripts/lib/bundledBinaryCompression.mjs`); the app extracts them at
 * runtime under userData. chmod only applies to loose executables — compressed blobs stay
 * non-executable and must not trigger false "Skipping chmod" warnings.
 */
async function chmodBundledBinary(dir, binaryName) {
    const binaryPath = join(dir, binaryName);
    try {
        await stat(binaryPath);
        await chmod(binaryPath, 0o755);
        return;
    } catch (error) {
        if (!error || typeof error !== 'object' || !('code' in error) || error.code !== 'ENOENT') {
            throw error;
        }
    }

    if (isCompressedBundledTool(binaryName)) {
        const gzPath = `${binaryPath}.gz`;
        try {
            await stat(gzPath);
            return;
        } catch (gzError) {
            if (
                !gzError ||
                typeof gzError !== 'object' ||
                !('code' in gzError) ||
                gzError.code !== 'ENOENT'
            ) {
                throw gzError;
            }
        }
    }

    console.warn(`[afterPack] Skipping chmod: not found at ${binaryPath}`);
}

/** ffmpeg/ffprobe/deno ship as `<exe>.gz` (incl. win32 `.exe` names); yt-dlp ships loose. */
export function isCompressedBundledTool(binaryName) {
    const base = binaryName.endsWith('.exe') ? binaryName.slice(0, -'.exe'.length) : binaryName;
    return base === 'ffmpeg' || base === 'ffprobe' || base === 'deno';
}

function getBinaryBaseNames(electronPlatformName) {
    if (electronPlatformName === 'win32') {
        return ['yt-dlp.exe', 'ffmpeg.exe', 'ffprobe.exe', 'deno.exe'];
    }
    return ['yt-dlp', 'ffmpeg', 'ffprobe', 'deno'];
}

function getBinRoot(context) {
    if (context.electronPlatformName === 'darwin') {
        const appBundleName = `${context.packager.appInfo.productFilename}.app`;
        return join(context.appOutDir, appBundleName, 'Contents', 'Resources', 'bin');
    }

    if (context.electronPlatformName === 'linux' || context.electronPlatformName === 'win32') {
        return join(context.appOutDir, 'resources', 'bin');
    }

    return null;
}

function getUnpackedCacheDirectory(context) {
    if (context.electronPlatformName === 'darwin') {
        const appBundleName = `${context.packager.appInfo.productFilename}.app`;
        return join(
            context.appOutDir,
            appBundleName,
            'Contents',
            'Resources',
            'app.asar.unpacked',
            'resources',
            '.cache'
        );
    }

    if (context.electronPlatformName === 'linux' || context.electronPlatformName === 'win32') {
        return join(context.appOutDir, 'resources', 'app.asar.unpacked', 'resources', '.cache');
    }

    return '';
}

function resolvePreferredTargetBinDirectory(binRoot, platformName, arch, appOutDir) {
    const archToken = resolveArchToken(arch, appOutDir);
    return join(binRoot, `${platformName}-${archToken}`);
}

function resolveArchToken(arch, appOutDir) {
    if (typeof arch === 'string') {
        return arch;
    }

    if (typeof arch === 'number') {
        if (arch === 3) {
            return 'arm64';
        }
        if (arch === 1) {
            return 'x64';
        }
    }

    if (appOutDir.includes('arm64')) {
        return 'arm64';
    }

    return 'x64';
}
