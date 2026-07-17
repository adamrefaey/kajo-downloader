/**
 * QA: Top-20 rollout site #14 (PBS) — metadata resolve paths.
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

describe('rollout #14 PBS — resolveMediaUrlMetadata', () => {
    beforeEach(() => {
        spawnPlans.length = 0;
        vi.resetModules();
    });

    it('locks pbs as rollout rank 14', () => {
        expect(ROLLOUT_TOP_20_SITE_IDS[13]).toBe('pbs');
        expect(listSiteProfilesInRolloutOrder()[13]?.siteId).toBe('pbs');
    });

    it('builds static context for pbs.org and video.pbs.org', () => {
        const main = buildStaticMetadataResolveContext(
            'https://www.pbs.org/wgbh/frontline/episode/foo/'
        );
        expect(main.siteId).toBe('pbs');
        expect(main.candidateMode).toBe('single');
        expect(main.authCookiesRecommended).toBe(false);

        const video = buildStaticMetadataResolveContext('https://video.pbs.org/video/show-12345/');
        expect(video.siteId).toBe('pbs');
        expect(video.candidateMode).toBe('single');

        const kids = buildStaticMetadataResolveContext('https://pbskids.org/video/kid-clip/');
        expect(kids.siteId).toBe('pbs');
        expect(kids.candidateMode).toBe('single');

        const listHint = buildStaticMetadataResolveContext('https://www.pbs.org/show/foo?list=1');
        expect(listHint.siteId).toBe('pbs');
        expect(listHint.candidateMode).toBe('multi');
    });

    it('returns multi when flat probe lists two entries', async () => {
        spawnPlans.push({
            exitCode: 0,
            stdout: JSON.stringify({
                extractor_key: 'pbs',
                title: 'Programme',
                entries: [
                    {
                        id: '1',
                        title: 'Part 1',
                        url: 'https://video.pbs.org/video/1/',
                        duration: 1200
                    },
                    {
                        id: '2',
                        title: 'Part 2',
                        url: 'https://video.pbs.org/video/2/',
                        duration: 1200
                    }
                ]
            })
        });

        const { resolveMediaUrlMetadata } = await import('../electron/services/metadata');
        const url = 'https://www.pbs.org/show/x?list=1';
        const r = await resolveMediaUrlMetadata(url, {});

        expect(r.kind).toBe('multi');
        if (r.kind !== 'multi') {
            return;
        }
        expect(r.siteId).toBe('pbs');
        expect(r.extractorKey).toBe('pbs');
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
                extractor_key: 'pbs',
                id: 'vid9',
                title: 'Episode',
                webpage_url: 'https://video.pbs.org/video/vid9/',
                duration: 3600
            })
        });

        const { resolveMediaUrlMetadata } = await import('../electron/services/metadata');
        const pasted = 'https://video.pbs.org/video/vid9/';
        const r = await resolveMediaUrlMetadata(pasted, {});

        expect(r.kind).toBe('single');
        if (r.kind !== 'single') {
            return;
        }
        expect(r.siteId).toBe('pbs');
        expect(spawnPlans).toHaveLength(0);
    });

    it('maps PBSKids extractor key via loose match', async () => {
        spawnPlans.push({
            exitCode: 1,
            stderr: 'ERROR: flat failed'
        });
        spawnPlans.push({
            exitCode: 0,
            stdout: JSON.stringify({
                extractor_key: 'PBSKids',
                id: 'kid1',
                title: 'Kids clip',
                webpage_url: 'https://pbskids.org/video/kid1/',
                duration: 300
            })
        });

        const { resolveMediaUrlMetadata } = await import('../electron/services/metadata');
        const pasted = 'https://pbskids.org/video/kid1/';
        const r = await resolveMediaUrlMetadata(pasted, {});

        expect(r.kind).toBe('single');
        if (r.kind !== 'single') {
            return;
        }
        expect(r.siteId).toBe('pbs');
        expect(r.extractorKey).toBe('PBSKids');
        expect(spawnPlans).toHaveLength(0);
    });
});
