/**
 * QA: Top-20 rollout site #9 (Reddit) — metadata resolve paths.
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

describe('rollout #9 Reddit — resolveMediaUrlMetadata', () => {
    beforeEach(() => {
        spawnPlans.length = 0;
        vi.resetModules();
    });

    it('locks reddit as rollout rank 9', () => {
        expect(ROLLOUT_TOP_20_SITE_IDS[8]).toBe('reddit');
        expect(listSiteProfilesInRolloutOrder()[8]?.siteId).toBe('reddit');
    });

    it('builds static context for www, old, and post URL (always single heuristic)', () => {
        const www = buildStaticMetadataResolveContext(
            'https://www.reddit.com/r/videos/comments/abc/title/'
        );
        expect(www.siteId).toBe('reddit');
        expect(www.candidateMode).toBe('single');
        expect(www.authCookiesRecommended).toBe(true);

        const old = buildStaticMetadataResolveContext(
            'https://old.reddit.com/r/test/comments/xyz/'
        );
        expect(old.siteId).toBe('reddit');
        expect(old.candidateMode).toBe('single');

        const listUrl = buildStaticMetadataResolveContext('https://reddit.com/foo?list=1');
        expect(listUrl.siteId).toBe('reddit');
        expect(listUrl.candidateMode).toBe('single');
    });

    it('returns multi when flat probe lists two entries', async () => {
        spawnPlans.push({
            exitCode: 0,
            stdout: JSON.stringify({
                extractor_key: 'Reddit',
                title: 'Subreddit media',
                entries: [
                    {
                        id: 'p1',
                        title: 'Post one',
                        url: 'https://www.reddit.com/r/a/comments/p1/x/',
                        duration: 0
                    },
                    {
                        id: 'p2',
                        title: 'Post two',
                        url: 'https://www.reddit.com/r/b/comments/p2/y/',
                        duration: 0
                    }
                ]
            })
        });

        const { resolveMediaUrlMetadata } = await import('../electron/services/metadata');
        const url = 'https://www.reddit.com/r/videos/';
        const r = await resolveMediaUrlMetadata(url, {});

        expect(r.kind).toBe('multi');
        if (r.kind !== 'multi') {
            return;
        }
        expect(r.siteId).toBe('reddit');
        expect(r.extractorKey).toBe('Reddit');
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
                extractor_key: 'Reddit',
                id: 'abc',
                title: 'Interesting video',
                webpage_url: 'https://www.reddit.com/r/v/comments/abc/x/',
                duration: 120
            })
        });

        const { resolveMediaUrlMetadata } = await import('../electron/services/metadata');
        const pasted = 'https://www.reddit.com/r/v/comments/abc/x/';
        const r = await resolveMediaUrlMetadata(pasted, {});

        expect(r.kind).toBe('single');
        if (r.kind !== 'single') {
            return;
        }
        expect(r.siteId).toBe('reddit');
        expect(spawnPlans).toHaveLength(0);
    });

    it('returns auth-required when stderr asks for cookies', async () => {
        const err = 'ERROR: Use --cookies-from-browser or --cookies for authentication';
        spawnPlans.push({ exitCode: 1, stderr: err });
        spawnPlans.push({ exitCode: 1, stderr: err });

        const { resolveMediaUrlMetadata } = await import('../electron/services/metadata');
        const pasted = 'https://www.reddit.com/r/private/comments/z/';
        const r = await resolveMediaUrlMetadata(pasted, {});

        expect(r.kind).toBe('auth-required');
        if (r.kind !== 'auth-required') {
            return;
        }
        expect(r.siteId).toBe('reddit');
        expect(r.siteDisplayName).toBe('Reddit');
        expect(r.signInTargetUrl).toBe('https://www.reddit.com');
        expect(r.authCookiesRecommended).toBe(true);
        expect(spawnPlans).toHaveLength(0);
    });
});
