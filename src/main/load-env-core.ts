import { existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import type { DotenvConfigOptions } from 'dotenv';
import { config } from 'dotenv';

export function loadFromDir(
    dir: string,
    dotenvConfig: (options?: DotenvConfigOptions) => unknown = config,
    existsSyncFn: typeof existsSync = existsSync
): void {
    const envPath = resolve(dir, '.env');
    const localPath = resolve(dir, '.env.local');
    if (existsSyncFn(envPath)) {
        dotenvConfig({ path: envPath });
    }
    if (existsSyncFn(localPath)) {
        dotenvConfig({ path: localPath, override: true });
    }
}

export function hasEnvFiles(dir: string, existsSyncFn: typeof existsSync = existsSync): boolean {
    return existsSyncFn(resolve(dir, '.env')) || existsSyncFn(resolve(dir, '.env.local'));
}

export interface DotenvRuntime {
    isPackaged: boolean;
    cwd: string;
    resourcesPath: string;
    platform: NodeJS.Platform;
    getExePath: () => string;
}

/**
 * Loads `.env` then `.env.local` (override); mirrors package.json `dotenv-cli` for any launch path.
 * `mainDir` is the directory containing the compiled `load-env` module (`out/main`).
 */
export function loadDotenvForProcess(
    mainDir: string,
    runtime: DotenvRuntime,
    existsSyncFn: typeof existsSync = existsSync,
    dotenvConfig: (options?: DotenvConfigOptions) => unknown = config
): void {
    const projectRootFromOutput = resolve(mainDir, '../..');

    if (!runtime.isPackaged) {
        loadFromDir(projectRootFromOutput, dotenvConfig, existsSyncFn);
        if (!hasEnvFiles(projectRootFromOutput, existsSyncFn)) {
            loadFromDir(runtime.cwd, dotenvConfig, existsSyncFn);
        }
        return;
    }

    const exeDir = dirname(runtime.getExePath());
    const rawCandidates = [
        runtime.cwd,
        runtime.resourcesPath,
        ...(runtime.platform === 'darwin'
            ? [resolve(exeDir, '../../..'), resolve(exeDir, '..', 'Resources')]
            : []),
        exeDir
    ];
    const seen = new Set<string>();
    const candidates = rawCandidates.filter((dir) => {
        if (seen.has(dir)) {
            return false;
        }
        seen.add(dir);
        return true;
    });

    for (const dir of candidates) {
        if (hasEnvFiles(dir, existsSyncFn)) {
            loadFromDir(dir, dotenvConfig, existsSyncFn);
            return;
        }
    }
}
