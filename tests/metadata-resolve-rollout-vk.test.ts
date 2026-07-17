/**
 * QA: Top-20 rollout site #16 (VK) — metadata resolve paths.
 */
import { EventEmitter } from 'node:events';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
    listSiteProfilesInRolloutOrder,
    ROLLOUT_TOP_20_SITE_IDS
} from '../src/shared/siteProfiles';
import { buildStaticMetadataResolveContext } from '../src/shared/urlSiteResolveContext';

interface SpawnPlan {
    stdout?: string;
    stderr?: string;
    exitCode: number | null;
}

const spawnPlans: SpawnPlan[] = [];

vi.mock('electron', () => ({
    app: {
        getPath: () => '/tmp',
        isPackaged: false,
        getAppPath: () => '/app',
        isReady: () => true
    }
}));

vi.mock('../electron/services/ytdlp/ytdlpUtilityProcess', () => ({
    spawnYtdlpProcess: vi.fn((_id: string, _command: string, _args: string[]) => {
        const plan = spawnPlans.shift() ?? { exitCode: 0 };
        const child = new EventEmitter() as EventEmitter & {
            stdout: EventEmitter;
            stderr: EventEmitter;
        };
        child.stdout = new EventEmitter();
        child.stderr = new EventEmitter();

        queueMicrotask(() => {
            if (plan.stdout) {
                child.stdout.emit('data', Buffer.from(plan.stdout));
            }
            if (plan.stderr) {
                child.stderr.emit('data', Buffer.from(plan.stderr));
            }
            child.emit('close', plan.exitCode);
        });

        return child;
    })
}));

vi.mock('../electron/services/binaries', () => ({
    buildYtDlpInvocation: vi.fn(async (args: string[]) => ({ command: 'yt-dlp', args }))
}));

describe('rollout #16 VK — resolveMediaUrlMetadata', () => {
    beforeEach(() => {
        spawnPlans.length = 0;
        vi.resetModules();
    });

    it('locks vk as rollout rank 16', () => {
        expect(ROLLOUT_TOP_20_SITE_IDS[15]).toBe('vk');
        expect(listSiteProfilesInRolloutOrder()[15]?.siteId).toBe('vk');
    });

    it('builds static context for vk.com, vk.ru, vkvideo.ru', () => {
        const com = buildStaticMetadataResolveContext('https://vk.com/video-123_456');
        expect(com.siteId).toBe('vk');
        expect(com.candidateMode).toBe('single');
        expect(com.authCookiesRecommended).toBe(true);

        const ru = buildStaticMetadataResolveContext('https://vk.ru/video-1_2');
        expect(ru.siteId).toBe('vk');
        expect(ru.candidateMode).toBe('single');

        const vkvideo = buildStaticMetadataResolveContext('https://vkvideo.ru/video-9_8');
        expect(vkvideo.siteId).toBe('vk');
        expect(vkvideo.candidateMode).toBe('single');

        const listHint = buildStaticMetadataResolveContext('https://vk.com/club1?list=1');
        expect(listHint.siteId).toBe('vk');
        expect(listHint.candidateMode).toBe('multi');
    });

    it('returns multi when flat probe lists two entries', async () => {
        spawnPlans.push({
            exitCode: 0,
            stdout: JSON.stringify({
                extractor_key: 'vk',
                title: 'Wall',
                entries: [
                    {
                        id: '1',
                        title: 'Video A',
                        url: 'https://vk.com/video-1_1',
                        duration: 100
                    },
                    {
                        id: '2',
                        title: 'Video B',
                        url: 'https://vk.com/video-2_2',
                        duration: 200
                    }
                ]
            })
        });

        const { resolveMediaUrlMetadata } = await import('../electron/services/metadata');
        const url = 'https://vk.com/club_wall1?list=x';
        const r = await resolveMediaUrlMetadata(url, {});

        expect(r.kind).toBe('multi');
        if (r.kind !== 'multi') {
            return;
        }
        expect(r.siteId).toBe('vk');
        expect(r.extractorKey).toBe('vk');
        expect(r.entryCount).toBe(2);
        expect(spawnPlans).toHaveLength(0);
    });

    it('returns single from single-video probe', async () => {
        spawnPlans.push({
            exitCode: 1,
            stderr: 'ERROR: flat failed'
        });
        spawnPlans.push({
            exitCode: 0,
            stdout: JSON.stringify({
                extractor_key: 'vk',
                id: '99_88',
                title: 'Clip',
                webpage_url: 'https://vk.com/video-99_88',
                duration: 90
            })
        });

        const { resolveMediaUrlMetadata } = await import('../electron/services/metadata');
        const pasted = 'https://vk.com/video-99_88';
        const r = await resolveMediaUrlMetadata(pasted, {});

        expect(r.kind).toBe('single');
        if (r.kind !== 'single') {
            return;
        }
        expect(r.siteId).toBe('vk');
        expect(spawnPlans).toHaveLength(0);
    });

    it('returns auth-required when stderr asks for cookies', async () => {
        const err = 'ERROR: Use --cookies-from-browser or --cookies for authentication';
        spawnPlans.push({ exitCode: 1, stderr: err });
        spawnPlans.push({ exitCode: 1, stderr: err });

        const { resolveMediaUrlMetadata } = await import('../electron/services/metadata');
        const pasted = 'https://vk.com/video-private';
        const r = await resolveMediaUrlMetadata(pasted, {});

        expect(r.kind).toBe('auth-required');
        if (r.kind !== 'auth-required') {
            return;
        }
        expect(r.siteId).toBe('vk');
        expect(r.siteDisplayName).toBe('VK');
        expect(r.signInTargetUrl).toBe('https://vk.com');
        expect(r.authCookiesRecommended).toBe(true);
        expect(spawnPlans).toHaveLength(0);
    });

    it('maps vk:wallpost extractor key via loose match', async () => {
        spawnPlans.push({
            exitCode: 1,
            stderr: 'ERROR: flat failed'
        });
        spawnPlans.push({
            exitCode: 0,
            stdout: JSON.stringify({
                extractor_key: 'vk:wallpost',
                id: 'wp1',
                title: 'Wall video',
                webpage_url: 'https://vk.com/wall-1_2',
                duration: 45
            })
        });

        const { resolveMediaUrlMetadata } = await import('../electron/services/metadata');
        const pasted = 'https://vk.com/wall-1_2';
        const r = await resolveMediaUrlMetadata(pasted, {});

        expect(r.kind).toBe('single');
        if (r.kind !== 'single') {
            return;
        }
        expect(r.siteId).toBe('vk');
        expect(r.extractorKey).toBe('vk:wallpost');
        expect(spawnPlans).toHaveLength(0);
    });
});
