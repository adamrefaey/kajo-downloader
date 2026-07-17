import type { existsSync as nodeExistsSync, PathLike } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { hasEnvFiles, loadDotenvForProcess, loadFromDir } from '../src/main/load-env-core';

type ExistsSyncFn = typeof nodeExistsSync;

describe('load-env-core', () => {
    it('loadFromDir calls dotenv for existing files', () => {
        const dotenvConfig = vi.fn();
        const existsSync = vi.fn((p: PathLike) =>
            String(p).endsWith('.env')
        ) as unknown as ExistsSyncFn;
        loadFromDir('/tmp', dotenvConfig, existsSync);
        expect(dotenvConfig).toHaveBeenCalled();
    });

    it('hasEnvFiles', () => {
        const existsSync = vi.fn((p: PathLike) =>
            String(p).includes('.env.local')
        ) as unknown as ExistsSyncFn;
        expect(hasEnvFiles('/x', existsSync)).toBe(true);
        const never = vi.fn(() => false) as unknown as ExistsSyncFn;
        expect(hasEnvFiles('/x', never)).toBe(false);
    });

    it('loadDotenvForProcess dev loads project root then cwd fallback', () => {
        const dotenvConfig = vi.fn();
        const existsSync = vi.fn((path: PathLike) =>
            String(path).includes('/fallback/.env')
        ) as unknown as ExistsSyncFn;
        loadDotenvForProcess(
            '/app/out/main',
            {
                isPackaged: false,
                cwd: '/fallback',
                resourcesPath: '/res',
                platform: 'darwin',
                getExePath: () => '/exe'
            },
            existsSync as unknown as ExistsSyncFn,
            dotenvConfig
        );
        expect(dotenvConfig.mock.calls.length).toBeGreaterThanOrEqual(1);
    });

    it('loadDotenvForProcess dev skips cwd fallback when project root already has env files', () => {
        const dotenvConfig = vi.fn();
        const existsSync = vi.fn((path: PathLike) => {
            const s = String(path);
            return s === '/proj/.env' || s === '/proj/.env.local';
        }) as unknown as ExistsSyncFn;
        loadDotenvForProcess(
            '/proj/out/main',
            {
                isPackaged: false,
                cwd: '/other',
                resourcesPath: '/res',
                platform: 'linux',
                getExePath: () => '/exe'
            },
            existsSync,
            dotenvConfig
        );
        expect(dotenvConfig).toHaveBeenCalledWith(expect.objectContaining({ path: '/proj/.env' }));
        expect(dotenvConfig).not.toHaveBeenCalledWith(
            expect.objectContaining({ path: '/other/.env' })
        );
    });

    it('loadDotenvForProcess dev falls back to cwd when project root has no env files', () => {
        const dotenvConfig = vi.fn();
        const existsSync = vi.fn(
            (path: PathLike) => String(path) === '/proj/cwd/.env'
        ) as unknown as ExistsSyncFn;
        loadDotenvForProcess(
            '/proj/out/main',
            {
                isPackaged: false,
                cwd: '/proj/cwd',
                resourcesPath: '/res',
                platform: 'linux',
                getExePath: () => '/exe'
            },
            existsSync,
            dotenvConfig
        );
        expect(dotenvConfig).toHaveBeenCalledWith(
            expect.objectContaining({ path: '/proj/cwd/.env' })
        );
    });

    it('loadDotenvForProcess packaged scans candidates', () => {
        const dotenvConfig = vi.fn();
        const existsSync = vi.fn(
            (path: PathLike) => String(path) === '/hit/.env'
        ) as unknown as ExistsSyncFn;
        loadDotenvForProcess(
            '/app/out/main',
            {
                isPackaged: true,
                cwd: '/hit',
                resourcesPath: '/res',
                platform: 'linux',
                getExePath: () => '/exe/app'
            },
            existsSync as unknown as ExistsSyncFn,
            dotenvConfig
        );
        expect(dotenvConfig).toHaveBeenCalled();
    });

    it('loadDotenvForProcess packaged does nothing when no env files exist', () => {
        const dotenvConfig = vi.fn();
        const existsSync = vi.fn(() => false) as unknown as ExistsSyncFn;
        loadDotenvForProcess(
            '/out/main',
            {
                isPackaged: true,
                cwd: '/a',
                resourcesPath: '/b',
                platform: 'linux',
                getExePath: () => '/exe'
            },
            existsSync as unknown as ExistsSyncFn,
            dotenvConfig
        );
        expect(dotenvConfig).not.toHaveBeenCalled();
    });

    it('loadDotenvForProcess packaged darwin checks Resources path', () => {
        const dotenvConfig = vi.fn();
        const exePath = '/My.app/Contents/MacOS/App';
        const resourcesDir = resolve(dirname(exePath), '..', 'Resources');
        const envFile = resolve(resourcesDir, '.env');
        const existsSync = vi.fn((p: PathLike) => String(p) === envFile) as unknown as ExistsSyncFn;
        loadDotenvForProcess(
            '/out/main',
            {
                isPackaged: true,
                cwd: '/nowhere',
                resourcesPath: '/nowhere',
                platform: 'darwin',
                getExePath: () => exePath
            },
            existsSync,
            dotenvConfig
        );
        expect(dotenvConfig).toHaveBeenCalled();
    });
});
