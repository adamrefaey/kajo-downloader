/**
 * QA: Top-20 rollout site #13 (BBC) — metadata resolve paths.
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

describe('rollout #13 BBC — resolveMediaUrlMetadata', () => {
    beforeEach(() => {
        spawnPlans.length = 0;
        vi.resetModules();
    });

    it('locks bbc as rollout rank 13', () => {
        expect(ROLLOUT_TOP_20_SITE_IDS[12]).toBe('bbc');
        expect(listSiteProfilesInRolloutOrder()[12]?.siteId).toBe('bbc');
    });

    it('builds static context for bbc.co.uk, bbc.com, and list query', () => {
        const iplayer = buildStaticMetadataResolveContext(
            'https://www.bbc.co.uk/iplayer/episode/m0001abc'
        );
        expect(iplayer.siteId).toBe('bbc');
        expect(iplayer.candidateMode).toBe('single');
        expect(iplayer.authCookiesRecommended).toBe(true);

        const com = buildStaticMetadataResolveContext('https://www.bbc.com/news/av/world-123');
        expect(com.siteId).toBe('bbc');
        expect(com.candidateMode).toBe('single');

        const listHint = buildStaticMetadataResolveContext(
            'https://www.bbc.co.uk/iplayer/shows/foo?list=1'
        );
        expect(listHint.siteId).toBe('bbc');
        expect(listHint.candidateMode).toBe('multi');
    });

    it('returns multi when flat probe lists two entries', async () => {
        spawnPlans.push({
            exitCode: 0,
            stdout: JSON.stringify({
                extractor_key: 'bbc',
                title: 'Series',
                entries: [
                    {
                        id: 'e1',
                        title: 'Ep 1',
                        url: 'https://www.bbc.co.uk/iplayer/episode/e1',
                        duration: 1800
                    },
                    {
                        id: 'e2',
                        title: 'Ep 2',
                        url: 'https://www.bbc.co.uk/iplayer/episode/e2',
                        duration: 1800
                    }
                ]
            })
        });

        const { resolveMediaUrlMetadata } = await import('../electron/services/metadata');
        const url = 'https://www.bbc.co.uk/iplayer/shows/foo?list=1';
        const r = await resolveMediaUrlMetadata(url, {});

        expect(r.kind).toBe('multi');
        if (r.kind !== 'multi') {
            return;
        }
        expect(r.siteId).toBe('bbc');
        expect(r.extractorKey).toBe('bbc');
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
                extractor_key: 'bbc',
                id: 'ep9',
                title: 'Episode',
                webpage_url: 'https://www.bbc.co.uk/iplayer/episode/ep9',
                duration: 2400
            })
        });

        const { resolveMediaUrlMetadata } = await import('../electron/services/metadata');
        const pasted = 'https://www.bbc.co.uk/iplayer/episode/ep9';
        const r = await resolveMediaUrlMetadata(pasted, {});

        expect(r.kind).toBe('single');
        if (r.kind !== 'single') {
            return;
        }
        expect(r.siteId).toBe('bbc');
        expect(spawnPlans).toHaveLength(0);
    });

    it('returns auth-required when stderr asks for cookies', async () => {
        const err = 'ERROR: Use --cookies-from-browser or --cookies for authentication';
        spawnPlans.push({ exitCode: 1, stderr: err });
        spawnPlans.push({ exitCode: 1, stderr: err });

        const { resolveMediaUrlMetadata } = await import('../electron/services/metadata');
        const pasted = 'https://www.bbc.co.uk/iplayer/episode/locked';
        const r = await resolveMediaUrlMetadata(pasted, {});

        expect(r.kind).toBe('auth-required');
        if (r.kind !== 'auth-required') {
            return;
        }
        expect(r.siteId).toBe('bbc');
        expect(r.siteDisplayName).toBe('BBC');
        expect(r.signInTargetUrl).toBe('https://www.bbc.co.uk');
        expect(r.authCookiesRecommended).toBe(true);
        expect(spawnPlans).toHaveLength(0);
    });

    it('maps bbc.co.uk:iplayer:episodes extractor key via loose match', async () => {
        spawnPlans.push({
            exitCode: 1,
            stderr: 'ERROR: flat failed'
        });
        spawnPlans.push({
            exitCode: 0,
            stdout: JSON.stringify({
                extractor_key: 'bbc.co.uk:iplayer:episodes',
                id: 'show1',
                title: 'All episodes',
                webpage_url: 'https://www.bbc.co.uk/iplayer/episodes/show1',
                duration: 0
            })
        });

        const { resolveMediaUrlMetadata } = await import('../electron/services/metadata');
        const pasted = 'https://www.bbc.co.uk/iplayer/episodes/show1';
        const r = await resolveMediaUrlMetadata(pasted, {});

        expect(r.kind).toBe('single');
        if (r.kind !== 'single') {
            return;
        }
        expect(r.siteId).toBe('bbc');
        expect(r.extractorKey).toBe('bbc.co.uk:iplayer:episodes');
        expect(spawnPlans).toHaveLength(0);
    });
});
