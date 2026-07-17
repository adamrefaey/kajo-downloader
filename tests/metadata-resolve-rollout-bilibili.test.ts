/**
 * QA: Top-20 rollout site #11 (Bilibili) — metadata resolve paths.
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

describe('rollout #11 Bilibili — resolveMediaUrlMetadata', () => {
    beforeEach(() => {
        spawnPlans.length = 0;
        vi.resetModules();
    });

    it('locks bilibili as rollout rank 11', () => {
        expect(ROLLOUT_TOP_20_SITE_IDS[10]).toBe('bilibili');
        expect(listSiteProfilesInRolloutOrder()[10]?.siteId).toBe('bilibili');
    });

    it('builds static context for bilibili.com video, b23 short link, and playlist path', () => {
        const bv = buildStaticMetadataResolveContext('https://www.bilibili.com/video/BV1xx411c7mD');
        expect(bv.siteId).toBe('bilibili');
        expect(bv.candidateMode).toBe('single');
        expect(bv.authCookiesRecommended).toBe(true);

        const short = buildStaticMetadataResolveContext('https://b23.tv/abc123');
        expect(short.siteId).toBe('bilibili');
        expect(short.candidateMode).toBe('single');

        const pl = buildStaticMetadataResolveContext(
            'https://www.bilibili.com/playlist/detail/pl123'
        );
        expect(pl.siteId).toBe('bilibili');
        expect(pl.candidateMode).toBe('multi');
    });

    it('returns multi when flat probe lists two entries', async () => {
        spawnPlans.push({
            exitCode: 0,
            stdout: JSON.stringify({
                extractor_key: 'BiliBili',
                title: '合集',
                entries: [
                    {
                        id: '1',
                        title: 'Part 1',
                        url: 'https://www.bilibili.com/video/BV111',
                        duration: 300
                    },
                    {
                        id: '2',
                        title: 'Part 2',
                        url: 'https://www.bilibili.com/video/BV222',
                        duration: 400
                    }
                ]
            })
        });

        const { resolveMediaUrlMetadata } = await import('../electron/services/metadata');
        const url = 'https://www.bilibili.com/playlist/detail/pl1';
        const r = await resolveMediaUrlMetadata(url, {});

        expect(r.kind).toBe('multi');
        if (r.kind !== 'multi') {
            return;
        }
        expect(r.siteId).toBe('bilibili');
        expect(r.extractorKey).toBe('BiliBili');
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
                extractor_key: 'BiliBili',
                id: 'BV999',
                title: 'Single',
                webpage_url: 'https://www.bilibili.com/video/BV999',
                duration: 600
            })
        });

        const { resolveMediaUrlMetadata } = await import('../electron/services/metadata');
        const pasted = 'https://www.bilibili.com/video/BV999';
        const r = await resolveMediaUrlMetadata(pasted, {});

        expect(r.kind).toBe('single');
        if (r.kind !== 'single') {
            return;
        }
        expect(r.siteId).toBe('bilibili');
        expect(spawnPlans).toHaveLength(0);
    });

    it('returns auth-required when stderr asks for cookies', async () => {
        const err = 'ERROR: Use --cookies-from-browser or --cookies for authentication';
        spawnPlans.push({ exitCode: 1, stderr: err });
        spawnPlans.push({ exitCode: 1, stderr: err });

        const { resolveMediaUrlMetadata } = await import('../electron/services/metadata');
        const pasted = 'https://www.bilibili.com/video/BVprivate';
        const r = await resolveMediaUrlMetadata(pasted, {});

        expect(r.kind).toBe('auth-required');
        if (r.kind !== 'auth-required') {
            return;
        }
        expect(r.siteId).toBe('bilibili');
        expect(r.siteDisplayName).toBe('Bilibili');
        expect(r.signInTargetUrl).toBe('https://www.bilibili.com');
        expect(r.authCookiesRecommended).toBe(true);
        expect(spawnPlans).toHaveLength(0);
    });

    it('maps BilibiliPlaylist extractor key via loose match', async () => {
        spawnPlans.push({
            exitCode: 1,
            stderr: 'ERROR: flat failed'
        });
        spawnPlans.push({
            exitCode: 0,
            stdout: JSON.stringify({
                extractor_key: 'BilibiliPlaylist',
                id: 'plx',
                title: 'List meta',
                webpage_url: 'https://www.bilibili.com/video/plx',
                duration: 0
            })
        });

        const { resolveMediaUrlMetadata } = await import('../electron/services/metadata');
        const pasted = 'https://www.bilibili.com/video/plx';
        const r = await resolveMediaUrlMetadata(pasted, {});

        expect(r.kind).toBe('single');
        if (r.kind !== 'single') {
            return;
        }
        expect(r.siteId).toBe('bilibili');
        expect(r.extractorKey).toBe('BilibiliPlaylist');
        expect(spawnPlans).toHaveLength(0);
    });
});
