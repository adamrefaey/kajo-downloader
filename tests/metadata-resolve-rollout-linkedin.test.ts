/**
 * QA: Top-20 rollout site #18 (LinkedIn) — metadata resolve paths.
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

describe('rollout #18 LinkedIn — resolveMediaUrlMetadata', () => {
    beforeEach(() => {
        spawnPlans.length = 0;
        vi.resetModules();
    });

    it('locks linkedin as rollout rank 18', () => {
        expect(ROLLOUT_TOP_20_SITE_IDS[17]).toBe('linkedin');
        expect(listSiteProfilesInRolloutOrder()[17]?.siteId).toBe('linkedin');
    });

    it('builds static context for feed video and learning paths (single heuristic)', () => {
        const feed = buildStaticMetadataResolveContext(
            'https://www.linkedin.com/posts/user_activity-1234567890-abcdef'
        );
        expect(feed.siteId).toBe('linkedin');
        expect(feed.candidateMode).toBe('single');
        expect(feed.authCookiesRecommended).toBe(true);

        const learning = buildStaticMetadataResolveContext(
            'https://www.linkedin.com/learning/course/foo'
        );
        expect(learning.siteId).toBe('linkedin');
        expect(learning.candidateMode).toBe('single');
    });

    it('returns multi when flat probe lists two entries', async () => {
        spawnPlans.push({
            exitCode: 0,
            stdout: JSON.stringify({
                extractor_key: 'LinkedIn',
                title: 'Course',
                entries: [
                    {
                        id: 'l1',
                        title: 'Lesson 1',
                        url: 'https://www.linkedin.com/learning/foo/l1',
                        duration: 300
                    },
                    {
                        id: 'l2',
                        title: 'Lesson 2',
                        url: 'https://www.linkedin.com/learning/foo/l2',
                        duration: 400
                    }
                ]
            })
        });

        const { resolveMediaUrlMetadata } = await import('../electron/services/metadata');
        const url = 'https://www.linkedin.com/learning/foo';
        const r = await resolveMediaUrlMetadata(url, {});

        expect(r.kind).toBe('multi');
        if (r.kind !== 'multi') {
            return;
        }
        expect(r.siteId).toBe('linkedin');
        expect(r.extractorKey).toBe('LinkedIn');
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
                extractor_key: 'LinkedIn',
                id: 'post1',
                title: 'Native video',
                webpage_url: 'https://www.linkedin.com/feed/update/urn:li:activity:1',
                duration: 60
            })
        });

        const { resolveMediaUrlMetadata } = await import('../electron/services/metadata');
        const pasted = 'https://www.linkedin.com/feed/update/urn:li:activity:1';
        const r = await resolveMediaUrlMetadata(pasted, {});

        expect(r.kind).toBe('single');
        if (r.kind !== 'single') {
            return;
        }
        expect(r.siteId).toBe('linkedin');
        expect(spawnPlans).toHaveLength(0);
    });

    it('returns auth-required when stderr asks for cookies', async () => {
        const err = 'ERROR: Use --cookies-from-browser or --cookies for authentication';
        spawnPlans.push({ exitCode: 1, stderr: err });
        spawnPlans.push({ exitCode: 1, stderr: err });

        const { resolveMediaUrlMetadata } = await import('../electron/services/metadata');
        const pasted = 'https://www.linkedin.com/learning/private/lesson';
        const r = await resolveMediaUrlMetadata(pasted, {});

        expect(r.kind).toBe('auth-required');
        if (r.kind !== 'auth-required') {
            return;
        }
        expect(r.siteId).toBe('linkedin');
        expect(r.siteDisplayName).toBe('LinkedIn');
        expect(r.signInTargetUrl).toBe('https://www.linkedin.com');
        expect(r.authCookiesRecommended).toBe(true);
        expect(spawnPlans).toHaveLength(0);
    });

    it('maps linkedin:learning extractor key via loose match', async () => {
        spawnPlans.push({
            exitCode: 1,
            stderr: 'ERROR: flat failed'
        });
        spawnPlans.push({
            exitCode: 0,
            stdout: JSON.stringify({
                extractor_key: 'linkedin:learning',
                id: 'c1',
                title: 'Chapter',
                webpage_url: 'https://www.linkedin.com/learning/path/c1',
                duration: 900
            })
        });

        const { resolveMediaUrlMetadata } = await import('../electron/services/metadata');
        const pasted = 'https://www.linkedin.com/learning/path/c1';
        const r = await resolveMediaUrlMetadata(pasted, {});

        expect(r.kind).toBe('single');
        if (r.kind !== 'single') {
            return;
        }
        expect(r.siteId).toBe('linkedin');
        expect(r.extractorKey).toBe('linkedin:learning');
        expect(spawnPlans).toHaveLength(0);
    });
});
