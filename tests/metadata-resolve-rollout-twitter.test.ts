/**
 * QA: Top-20 rollout site #5 (X / Twitter) — metadata resolve paths.
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

describe('rollout #5 X (Twitter) — resolveMediaUrlMetadata', () => {
    beforeEach(() => {
        spawnPlans.length = 0;
        vi.resetModules();
    });

    it('locks twitter as rollout rank 5', () => {
        expect(ROLLOUT_TOP_20_SITE_IDS[4]).toBe('twitter');
        expect(listSiteProfilesInRolloutOrder()[4]?.siteId).toBe('twitter');
    });

    it('builds static context for x.com, twitter.com, and mobile host', () => {
        const x = buildStaticMetadataResolveContext(
            'https://x.com/user/status/1234567890123456789'
        );
        expect(x.siteId).toBe('twitter');
        expect(x.candidateMode).toBe('single');
        expect(x.authCookiesRecommended).toBe(true);

        const legacy = buildStaticMetadataResolveContext(
            'https://twitter.com/user/status/9876543210987654321'
        );
        expect(legacy.siteId).toBe('twitter');
        expect(legacy.candidateMode).toBe('single');

        const mobile = buildStaticMetadataResolveContext(
            'https://mobile.twitter.com/user/status/1111111111111111111'
        );
        expect(mobile.siteId).toBe('twitter');
        expect(mobile.candidateMode).toBe('single');
    });

    it('returns multi when flat probe lists two tweet entries', async () => {
        spawnPlans.push({
            exitCode: 0,
            stdout: JSON.stringify({
                extractor_key: 'twitter',
                title: 'Thread',
                entries: [
                    {
                        id: 'a1',
                        title: 'Clip one',
                        url: 'https://x.com/user/status/a1',
                        duration: 30
                    },
                    {
                        id: 'b2',
                        title: 'Clip two',
                        url: 'https://x.com/user/status/b2',
                        duration: 45
                    }
                ]
            })
        });

        const { resolveMediaUrlMetadata } = await import('../electron/services/metadata');
        const url = 'https://x.com/search?q=video&f=live';
        const r = await resolveMediaUrlMetadata(url, {});

        expect(r.kind).toBe('multi');
        if (r.kind !== 'multi') {
            return;
        }
        expect(r.siteId).toBe('twitter');
        expect(r.extractorKey).toBe('twitter');
        expect(r.entryCount).toBe(2);
        expect(r.candidates).toHaveLength(2);
        expect(spawnPlans).toHaveLength(0);
    });

    it('returns single from single-video probe', async () => {
        spawnPlans.push({
            exitCode: 1,
            stderr: 'ERROR: Not a playlist'
        });
        spawnPlans.push({
            exitCode: 0,
            stdout: JSON.stringify({
                extractor_key: 'twitter',
                id: 'tweet1',
                title: 'Post',
                webpage_url: 'https://x.com/user/status/tweet1',
                duration: 12
            })
        });

        const { resolveMediaUrlMetadata } = await import('../electron/services/metadata');
        const pasted = 'https://x.com/user/status/tweet1';
        const r = await resolveMediaUrlMetadata(pasted, {});

        expect(r.kind).toBe('single');
        if (r.kind !== 'single') {
            return;
        }
        expect(r.siteId).toBe('twitter');
        expect(r.extractorKey).toBe('twitter');
        expect(spawnPlans).toHaveLength(0);
    });

    it('returns auth-required when stderr asks for cookies', async () => {
        const err = 'ERROR: Use --cookies-from-browser or --cookies for authentication';
        spawnPlans.push({ exitCode: 1, stderr: err });
        spawnPlans.push({ exitCode: 1, stderr: err });

        const { resolveMediaUrlMetadata } = await import('../electron/services/metadata');
        const pasted = 'https://x.com/user/status/private123';
        const r = await resolveMediaUrlMetadata(pasted, {});

        expect(r.kind).toBe('auth-required');
        if (r.kind !== 'auth-required') {
            return;
        }
        expect(r.siteId).toBe('twitter');
        expect(r.siteDisplayName).toBe('X (Twitter)');
        expect(r.signInTargetUrl).toBe('https://x.com');
        expect(r.authCookiesRecommended).toBe(true);
        expect(spawnPlans).toHaveLength(0);
    });

    it('maps twitter:spaces extractor key via loose match', async () => {
        spawnPlans.push({
            exitCode: 1,
            stderr: 'ERROR: flat failed'
        });
        spawnPlans.push({
            exitCode: 0,
            stdout: JSON.stringify({
                extractor_key: 'twitter:spaces',
                id: 'space1',
                title: 'Space',
                webpage_url: 'https://twitter.com/i/spaces/1',
                duration: 600
            })
        });

        const { resolveMediaUrlMetadata } = await import('../electron/services/metadata');
        const pasted = 'https://twitter.com/i/spaces/1';
        const r = await resolveMediaUrlMetadata(pasted, {});

        expect(r.kind).toBe('single');
        if (r.kind !== 'single') {
            return;
        }
        expect(r.siteId).toBe('twitter');
        expect(r.extractorKey).toBe('twitter:spaces');
        expect(spawnPlans).toHaveLength(0);
    });
});
