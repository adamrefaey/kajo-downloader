/**
 * QA: Top-20 rollout site #15 (NBC) — metadata resolve paths.
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

describe('rollout #15 NBC — resolveMediaUrlMetadata', () => {
    beforeEach(() => {
        spawnPlans.length = 0;
        vi.resetModules();
    });

    it('locks nbc as rollout rank 15', () => {
        expect(ROLLOUT_TOP_20_SITE_IDS[14]).toBe('nbc');
        expect(listSiteProfilesInRolloutOrder()[14]?.siteId).toBe('nbc');
    });

    it('builds static context for nbc.com, msnbc.com, and playlist-style path', () => {
        const watch = buildStaticMetadataResolveContext(
            'https://www.nbc.com/the-office/video/slug/9000123456'
        );
        expect(watch.siteId).toBe('nbc');
        expect(watch.candidateMode).toBe('single');
        expect(watch.authCookiesRecommended).toBe(true);

        const news = buildStaticMetadataResolveContext(
            'https://www.msnbc.com/msnbc/amp-video-ncna123456'
        );
        expect(news.siteId).toBe('nbc');
        expect(news.candidateMode).toBe('single');

        const pl = buildStaticMetadataResolveContext('https://www.nbc.com/show/foo/playlist/bar');
        expect(pl.siteId).toBe('nbc');
        expect(pl.candidateMode).toBe('multi');
    });

    it('returns multi when flat probe lists two entries', async () => {
        spawnPlans.push({
            exitCode: 0,
            stdout: JSON.stringify({
                extractor_key: 'NBC',
                title: 'Show clips',
                entries: [
                    {
                        id: 'a',
                        title: 'Clip A',
                        url: 'https://www.nbc.com/watch/a',
                        duration: 300
                    },
                    {
                        id: 'b',
                        title: 'Clip B',
                        url: 'https://www.nbc.com/watch/b',
                        duration: 400
                    }
                ]
            })
        });

        const { resolveMediaUrlMetadata } = await import('../electron/services/metadata');
        const url = 'https://www.nbc.com/show/x/playlist/y';
        const r = await resolveMediaUrlMetadata(url, {});

        expect(r.kind).toBe('multi');
        if (r.kind !== 'multi') {
            return;
        }
        expect(r.siteId).toBe('nbc');
        expect(r.extractorKey).toBe('NBC');
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
                extractor_key: 'NBC',
                id: 'vid1',
                title: 'Segment',
                webpage_url: 'https://www.nbc.com/watch/vid1',
                duration: 600
            })
        });

        const { resolveMediaUrlMetadata } = await import('../electron/services/metadata');
        const pasted = 'https://www.nbc.com/watch/vid1';
        const r = await resolveMediaUrlMetadata(pasted, {});

        expect(r.kind).toBe('single');
        if (r.kind !== 'single') {
            return;
        }
        expect(r.siteId).toBe('nbc');
        expect(spawnPlans).toHaveLength(0);
    });

    it('returns auth-required when stderr asks for cookies', async () => {
        const err = 'ERROR: Use --cookies-from-browser or --cookies for authentication';
        spawnPlans.push({ exitCode: 1, stderr: err });
        spawnPlans.push({ exitCode: 1, stderr: err });

        const { resolveMediaUrlMetadata } = await import('../electron/services/metadata');
        const pasted = 'https://www.nbc.com/watch/locked';
        const r = await resolveMediaUrlMetadata(pasted, {});

        expect(r.kind).toBe('auth-required');
        if (r.kind !== 'auth-required') {
            return;
        }
        expect(r.siteId).toBe('nbc');
        expect(r.siteDisplayName).toBe('NBC');
        expect(r.signInTargetUrl).toBe('https://www.nbc.com');
        expect(r.authCookiesRecommended).toBe(true);
        expect(spawnPlans).toHaveLength(0);
    });

    it('maps NBCNews extractor key via loose match', async () => {
        spawnPlans.push({
            exitCode: 1,
            stderr: 'ERROR: flat failed'
        });
        spawnPlans.push({
            exitCode: 0,
            stdout: JSON.stringify({
                extractor_key: 'NBCNews',
                id: 'n1',
                title: 'News clip',
                webpage_url: 'https://www.msnbc.com/watch/n1',
                duration: 120
            })
        });

        const { resolveMediaUrlMetadata } = await import('../electron/services/metadata');
        const pasted = 'https://www.msnbc.com/watch/n1';
        const r = await resolveMediaUrlMetadata(pasted, {});

        expect(r.kind).toBe('single');
        if (r.kind !== 'single') {
            return;
        }
        expect(r.siteId).toBe('nbc');
        expect(r.extractorKey).toBe('NBCNews');
        expect(spawnPlans).toHaveLength(0);
    });
});
