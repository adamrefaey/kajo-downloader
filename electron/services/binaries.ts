import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { constants, createReadStream, createWriteStream, existsSync } from 'node:fs';
import {
    access,
    chmod,
    copyFile,
    mkdir,
    readdir,
    readFile,
    rm,
    stat,
    writeFile
} from 'node:fs/promises';
import { delimiter, dirname, join } from 'node:path';
import { pipeline } from 'node:stream/promises';
import { createGunzip } from 'node:zlib';
import { app } from 'electron';
import { trackMainChildProcess } from '../lib/childProcessRegistry';
import { electronAppIsPackaged, electronUserDataPath } from '../lib/electronProcessContext';

type BinaryName = 'yt-dlp' | 'ffmpeg' | 'ffprobe' | 'deno';
const COMMAND_PROBE_TIMEOUT_MS = 2500;
const commandHealthCache = new Map<string, Promise<boolean>>();
const ytDlpRuntimeExtractionCache = new Map<string, Promise<string>>();
const compressedBinaryExtractionCache = new Map<string, Promise<string>>();
const GUI_APP_FALLBACK_BIN_DIRECTORIES = [
    '/opt/homebrew/bin',
    '/opt/homebrew/sbin',
    '/usr/local/bin',
    '/usr/local/sbin'
];

/** Tracks bundled archive identity so app updates ship new binaries into userData extraction. */
const RUNTIME_MANIFEST_NAME = '.kajo-bin-runtime.json';

type BundledArchiveFingerprint = {
    sha256: string;
    size: number;
    mtimeMs: number;
};

type BinRuntimeManifest = Record<string, BundledArchiveFingerprint>;

const RUNTIME_MANIFEST_KEYS = {
    ytDlpInternalTarGz: 'ytDlpInternalTarGz',
    ffmpegGz: 'ffmpegGz',
    ffprobeGz: 'ffprobeGz',
    denoGz: 'denoGz'
} as const;

async function sha256File(filePath: string): Promise<string> {
    const hash = createHash('sha256');
    const stream = createReadStream(filePath);
    for await (const chunk of stream) {
        hash.update(chunk);
    }
    return hash.digest('hex');
}

function mtimeCloseEnough(a: number, b: number): boolean {
    return Math.floor(a) === Math.floor(b);
}

/**
 * True when the bundled file still matches the fingerprint from the last successful extract.
 * Uses size + mtime first; hashes only when mtime drifts (same-size replacement).
 */
async function isBundledArchiveUnchanged(
    bundledPath: string,
    entry: BundledArchiveFingerprint | undefined
): Promise<boolean> {
    if (!entry) {
        return false;
    }
    let st: Awaited<ReturnType<typeof stat>>;
    try {
        st = await stat(bundledPath);
    } catch {
        return false;
    }
    if (st.size !== entry.size) {
        return false;
    }
    if (mtimeCloseEnough(st.mtimeMs, entry.mtimeMs)) {
        return true;
    }
    const h = await sha256File(bundledPath);
    return h === entry.sha256;
}

let runtimeManifestMutationChain: Promise<unknown> = Promise.resolve();

function runSerializedRuntimeManifestMutation<T>(task: () => Promise<T>): Promise<T> {
    const done = runtimeManifestMutationChain.then(task, task);
    runtimeManifestMutationChain = done.then(
        () => {},
        () => {}
    );
    return done;
}

async function readBinRuntimeManifest(runtimeDirectory: string): Promise<BinRuntimeManifest> {
    const manifestPath = join(runtimeDirectory, RUNTIME_MANIFEST_NAME);
    try {
        const raw = await readFile(manifestPath, 'utf8');
        const parsed = JSON.parse(raw) as unknown;
        if (!parsed || typeof parsed !== 'object') {
            return {};
        }
        return parsed as BinRuntimeManifest;
    } catch {
        return {};
    }
}

async function recordBundledArchiveFingerprint(
    runtimeDirectory: string,
    key: string,
    bundledPath: string
): Promise<void> {
    const st = await stat(bundledPath);
    const sha256 = await sha256File(bundledPath);
    const manifestPath = join(runtimeDirectory, RUNTIME_MANIFEST_NAME);
    await runSerializedRuntimeManifestMutation(async () => {
        const manifest = await readBinRuntimeManifest(runtimeDirectory);
        manifest[key] = { sha256, size: st.size, mtimeMs: st.mtimeMs };
        await mkdir(runtimeDirectory, { recursive: true });
        await writeFile(manifestPath, JSON.stringify(manifest), 'utf8');
    });
}

function getExecutableName(binaryName: BinaryName): string {
    if (process.platform === 'win32') {
        return `${binaryName}.exe`;
    }
    return binaryName;
}

function buildExternalToolEnv(preferredDirectories: string[] = []): NodeJS.ProcessEnv {
    const env: NodeJS.ProcessEnv = { ...process.env };
    const pathEntries = new Set([
        ...preferredDirectories.filter(Boolean),
        ...(env.PATH ?? '').split(delimiter).filter(Boolean)
    ]);
    for (const directory of GUI_APP_FALLBACK_BIN_DIRECTORIES) {
        pathEntries.add(directory);
    }
    env.PATH = Array.from(pathEntries).join(delimiter);
    return env;
}

/**
 * In electron-vite dev, `app.getAppPath()` is the compiled main dir (`out/main`), not the package root.
 * Pinned binaries from `fetch-binaries.mjs` live at `<package>/resources/bin/<platform>-<arch>/`.
 */
function getDevResourcesBinRoot(): string {
    const targetId = `${process.platform}-${process.arch}`;
    const ytDlpProbe = join(targetId, getExecutableName('yt-dlp'));
    const candidates = [join(process.cwd(), 'resources', 'bin')];
    if (app != null && typeof app.getAppPath === 'function') {
        try {
            const appPath = app.getAppPath();
            candidates.push(
                join(dirname(appPath), '..', 'resources', 'bin'),
                join(appPath, 'resources', 'bin')
            );
        } catch {
            // UtilityProcess / early boot: no app path
        }
    }
    if (typeof process.resourcesPath === 'string' && process.resourcesPath.length > 0) {
        candidates.push(join(process.resourcesPath, 'bin'));
    }
    for (const root of candidates) {
        if (existsSync(join(root, ytDlpProbe))) {
            return root;
        }
    }
    return join(process.cwd(), 'resources', 'bin');
}

function packagedResourcesBinRoot(): string {
    const rp = process.resourcesPath;
    if (typeof rp === 'string' && rp.length > 0) {
        return join(rp, 'bin');
    }
    return getDevResourcesBinRoot();
}

function getBundledBinDirectory(): string {
    const binRoot = electronAppIsPackaged() ? packagedResourcesBinRoot() : getDevResourcesBinRoot();

    return join(binRoot, `${process.platform}-${process.arch}`);
}

function getBundledBinDirectoryFallback(): string {
    return electronAppIsPackaged() ? packagedResourcesBinRoot() : getDevResourcesBinRoot();
}

async function getBundledBinDirectories(): Promise<string[]> {
    const preferredDirectory = getBundledBinDirectory();
    const fallbackDirectory = getBundledBinDirectoryFallback();
    const directories = new Set<string>([preferredDirectory, fallbackDirectory]);

    try {
        const entries = await readdir(fallbackDirectory, { withFileTypes: true });
        for (const entry of entries) {
            if (!entry.isDirectory() || !entry.name.startsWith(`${process.platform}-`)) {
                continue;
            }

            directories.add(join(fallbackDirectory, entry.name));
        }
    } catch {
        // Ignore missing resource directories and fall back to the default lookup paths.
    }

    return Array.from(directories);
}

async function isExecutable(filePath: string): Promise<boolean> {
    try {
        await access(filePath, constants.X_OK);
        return true;
    } catch {
        return false;
    }
}

function getProbeArgs(binaryName: BinaryName): string[] {
    if (binaryName === 'ffmpeg' || binaryName === 'ffprobe') {
        return ['-version'];
    }
    return ['--version'];
}

async function isRunnableCommand(command: string, binaryName: BinaryName): Promise<boolean> {
    const cacheKey = `${binaryName}:${command}`;
    const cached = commandHealthCache.get(cacheKey);
    if (cached) {
        return cached;
    }

    const { promise: probe, resolve } = Promise.withResolvers<boolean>();
    const child = trackMainChildProcess(
        spawn(command, getProbeArgs(binaryName), {
            stdio: 'ignore',
            env: buildExternalToolEnv()
        })
    );
    let settled = false;

    const settle = (result: boolean): void => {
        if (settled) {
            return;
        }
        settled = true;
        resolve(result);
    };

    const timeout = setTimeout(() => {
        try {
            child.kill('SIGKILL');
        } catch {
            // Ignore kill failures for already-exited probe processes.
        }
        settle(false);
    }, COMMAND_PROBE_TIMEOUT_MS);

    child.on('error', () => {
        clearTimeout(timeout);
        settle(false);
    });
    child.on('close', (code) => {
        clearTimeout(timeout);
        settle(code === 0);
    });

    commandHealthCache.set(cacheKey, probe);
    return probe;
}

export function getBundledBinaryPath(binaryName: BinaryName): string {
    return join(getBundledBinDirectory(), getExecutableName(binaryName));
}

export async function findBundledBinaryPath(binaryName: BinaryName): Promise<string | null> {
    const executableName = getExecutableName(binaryName);
    const bundledDirectories = await getBundledBinDirectories();

    for (const directory of bundledDirectories) {
        const bundledPath = join(directory, executableName);
        const candidatePath = await resolveBinaryCandidatePath(binaryName, directory, bundledPath);
        const candidateExists = await access(candidatePath)
            .then(() => true)
            .catch(() => false);
        const executable = candidateExists ? await isExecutable(candidatePath) : false;
        if (executable && electronAppIsPackaged()) {
            return candidatePath;
        }
        const runnable = executable ? await isRunnableCommand(candidatePath, binaryName) : false;
        if (executable && runnable) {
            return candidatePath;
        }
    }

    return null;
}

async function resolveBinaryCandidatePath(
    binaryName: BinaryName,
    directory: string,
    bundledExecutablePath: string
): Promise<string> {
    if (binaryName === 'yt-dlp') {
        return resolveYtDlpCandidatePath(directory, bundledExecutablePath);
    }

    return resolveCompressedBundledBinaryCandidatePath(
        binaryName,
        directory,
        bundledExecutablePath
    );
}

async function resolveYtDlpCandidatePath(
    directory: string,
    bundledExecutablePath: string
): Promise<string> {
    if (!electronAppIsPackaged()) {
        return bundledExecutablePath;
    }

    const bundledInternalPath = join(directory, '_internal');
    const bundledInternalExists = await pathExists(bundledInternalPath);
    if (bundledInternalExists) {
        return bundledExecutablePath;
    }

    const bundledInternalArchivePath = join(directory, '_internal.tar.gz');
    const bundledInternalArchiveExists = await pathExists(bundledInternalArchivePath);
    if (!bundledInternalArchiveExists) {
        return bundledExecutablePath;
    }

    const extractionKey = `${process.platform}-${process.arch}:${directory}`;
    const cached = ytDlpRuntimeExtractionCache.get(extractionKey);
    if (cached) {
        return cached;
    }

    const extraction = extractYtDlpRuntime(
        directory,
        bundledExecutablePath,
        bundledInternalArchivePath
    );
    ytDlpRuntimeExtractionCache.set(extractionKey, extraction);
    return extraction;
}

async function extractYtDlpRuntime(
    _directory: string,
    bundledExecutablePath: string,
    bundledInternalArchivePath: string
): Promise<string> {
    const runtimeDirectory = join(
        electronUserDataPath(),
        'bin-runtime',
        `${process.platform}-${process.arch}`
    );
    const runtimeExecutablePath = join(runtimeDirectory, getExecutableName('yt-dlp'));
    const runtimeInternalPath = join(runtimeDirectory, '_internal');
    const manifest = await readBinRuntimeManifest(runtimeDirectory);
    const fingerprintOk = await isBundledArchiveUnchanged(
        bundledInternalArchivePath,
        manifest[RUNTIME_MANIFEST_KEYS.ytDlpInternalTarGz]
    );
    const runtimeReady =
        fingerprintOk &&
        (await pathExists(runtimeExecutablePath)) &&
        (await pathExists(runtimeInternalPath));

    if (!runtimeReady) {
        await rm(runtimeInternalPath, { recursive: true, force: true });
        await rm(runtimeExecutablePath, { force: true });
        await mkdir(runtimeDirectory, { recursive: true });
        await copyFile(bundledExecutablePath, runtimeExecutablePath);
        await chmod(runtimeExecutablePath, 0o755);
        await runCommand('tar', ['-xzf', bundledInternalArchivePath, '-C', runtimeDirectory]);
        await recordBundledArchiveFingerprint(
            runtimeDirectory,
            RUNTIME_MANIFEST_KEYS.ytDlpInternalTarGz,
            bundledInternalArchivePath
        );
    }

    return runtimeExecutablePath;
}

async function resolveCompressedBundledBinaryCandidatePath(
    binaryName: Exclude<BinaryName, 'yt-dlp'>,
    directory: string,
    bundledExecutablePath: string
): Promise<string> {
    const bundledExists = await pathExists(bundledExecutablePath);
    if (bundledExists || !electronAppIsPackaged()) {
        return bundledExecutablePath;
    }

    const bundledArchivePath = `${bundledExecutablePath}.gz`;
    const bundledArchiveExists = await pathExists(bundledArchivePath);
    if (!bundledArchiveExists) {
        return bundledExecutablePath;
    }

    const extractionKey = `${binaryName}:${process.platform}-${process.arch}:${directory}`;
    const cached = compressedBinaryExtractionCache.get(extractionKey);
    if (cached) {
        return cached;
    }

    const extraction = extractCompressedBinary(binaryName, bundledArchivePath);
    compressedBinaryExtractionCache.set(extractionKey, extraction);
    return extraction;
}

async function extractCompressedBinary(
    binaryName: Exclude<BinaryName, 'yt-dlp'>,
    bundledArchivePath: string
): Promise<string> {
    const runtimeDirectory = join(
        electronUserDataPath(),
        'bin-runtime',
        `${process.platform}-${process.arch}`
    );
    const runtimeExecutablePath = join(runtimeDirectory, getExecutableName(binaryName));
    const manifestKey =
        binaryName === 'ffmpeg'
            ? RUNTIME_MANIFEST_KEYS.ffmpegGz
            : binaryName === 'ffprobe'
              ? RUNTIME_MANIFEST_KEYS.ffprobeGz
              : RUNTIME_MANIFEST_KEYS.denoGz;
    const manifest = await readBinRuntimeManifest(runtimeDirectory);
    const fingerprintOk = await isBundledArchiveUnchanged(
        bundledArchivePath,
        manifest[manifestKey]
    );
    const runtimeReady = fingerprintOk && (await pathExists(runtimeExecutablePath));
    if (!runtimeReady) {
        await rm(runtimeExecutablePath, { force: true });
        await mkdir(runtimeDirectory, { recursive: true });
        await pipeline(
            createReadStream(bundledArchivePath),
            createGunzip(),
            createWriteStream(runtimeExecutablePath)
        );
        await chmod(runtimeExecutablePath, 0o755);
        await recordBundledArchiveFingerprint(runtimeDirectory, manifestKey, bundledArchivePath);
    }

    return runtimeExecutablePath;
}

async function runCommand(command: string, args: string[]): Promise<void> {
    const { promise, resolve, reject } = Promise.withResolvers<void>();
    const child = trackMainChildProcess(spawn(command, args, { stdio: 'ignore' }));
    child.on('error', reject);
    child.on('exit', (code) => {
        if (code === 0) {
            resolve();
            return;
        }
        reject(new Error(`Command failed (${command} ${args.join(' ')}), exit code ${code}`));
    });
    await promise;
}

async function pathExists(pathname: string): Promise<boolean> {
    try {
        await stat(pathname);
        return true;
    } catch {
        return false;
    }
}

export async function hasBundledBinary(binaryName: BinaryName): Promise<boolean> {
    if (app?.isReady && !app.isReady()) {
        return false;
    }
    return (await findBundledBinaryPath(binaryName)) !== null;
}

export async function resolveBinaryCommand(binaryName: BinaryName): Promise<string> {
    const bundledBinaryPath = await findBundledBinaryPath(binaryName);
    if (bundledBinaryPath) {
        return bundledBinaryPath;
    }

    const fallbackCommand = getExecutableName(binaryName);
    const fallbackRunnable = await isRunnableCommand(fallbackCommand, binaryName);
    if (fallbackRunnable) {
        return fallbackCommand;
    }

    return fallbackCommand;
}

export async function buildYtDlpInvocation(
    args: string[]
): Promise<{ command: string; args: string[]; env: NodeJS.ProcessEnv }> {
    const command = await resolveBinaryCommand('yt-dlp');
    const finalArgs = [...args];
    const preferredDirectories = new Set<string>();
    if (command.includes('/')) {
        preferredDirectories.add(dirname(command));
    }

    if (!finalArgs.includes('--js-runtimes')) {
        // yt-dlp needs an external JS runtime to solve YouTube nsig/sig challenges. Use the
        // bundled, sandboxed Deno (yt-dlp's recommended runtime). We do NOT reuse the Electron
        // binary as Node: the runAsNode fuse is disabled for hardening, so an ELECTRON_RUN_AS_NODE
        // shim would boot a second app instance instead of running JS. If Deno is somehow absent,
        // omit the flag and let yt-dlp fall back to its own runtime discovery.
        const denoPath = await findBundledBinaryPath('deno');
        if (denoPath) {
            finalArgs.unshift('--js-runtimes', `deno:${denoPath}`);
            preferredDirectories.add(dirname(denoPath));
        }
    }

    const ffmpegPath = await findBundledBinaryPath('ffmpeg');
    if (ffmpegPath) {
        finalArgs.unshift('--ffmpeg-location', dirname(ffmpegPath));
        preferredDirectories.add(dirname(ffmpegPath));
    }

    const env = buildExternalToolEnv(Array.from(preferredDirectories));
    // yt-dlp is Python; line-buffered stdout when piped avoids long stalls before first --dump-json line.
    env.PYTHONUNBUFFERED = '1';

    return { command, args: finalArgs, env };
}
