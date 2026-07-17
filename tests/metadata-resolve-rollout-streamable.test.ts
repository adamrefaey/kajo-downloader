/**
 * QA: Top-20 rollout site #17 (Streamable) — metadata resolve paths.
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

describe('rollout #17 Streamable — resolveMediaUrlMetadata', () => {
    beforeEach(() => {
        spawnPlans.length = 0;
        vi.resetModules();
    });

    it('locks streamable as rollout rank 17', () => {
        expect(ROLLOUT_TOP_20_SITE_IDS[16]).toBe('streamable');
        expect(listSiteProfilesInRolloutOrder()[16]?.siteId).toBe('streamable');
    });

    it('builds static context for streamable.com (always single heuristic)', () => {
        const clip = buildStaticMetadataResolveContext('https://streamable.com/abc12');
        expect(clip.siteId).toBe('streamable');
        expect(clip.candidateMode).toBe('single');
        expect(clip.authCookiesRecommended).toBe(false);

        const withList = buildStaticMetadataResolveContext('https://streamable.com/o/xyz?list=1');
        expect(withList.siteId).toBe('streamable');
        expect(withList.candidateMode).toBe('single');
    });

    it('returns multi when flat probe lists two entries', async () => {
        spawnPlans.push({
            exitCode: 0,
            stdout: JSON.stringify({
                extractor_key: 'Streamable',
                title: 'Folder',
                entries: [
                    {
                        id: 'a',
                        title: 'One',
                        url: 'https://streamable.com/a',
                        duration: 10
                    },
                    {
                        id: 'b',
                        title: 'Two',
                        url: 'https://streamable.com/b',
                        duration: 12
                    }
                ]
            })
        });

        const { resolveMediaUrlMetadata } = await import('../electron/services/metadata');
        const url = 'https://streamable.com/o/user';
        const r = await resolveMediaUrlMetadata(url, {});

        expect(r.kind).toBe('multi');
        if (r.kind !== 'multi') {
            return;
        }
        expect(r.siteId).toBe('streamable');
        expect(r.extractorKey).toBe('Streamable');
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
                extractor_key: 'Streamable',
                id: 'k9',
                title: 'Short',
                webpage_url: 'https://streamable.com/k9',
                duration: 8
            })
        });

        const { resolveMediaUrlMetadata } = await import('../electron/services/metadata');
        const pasted = 'https://streamable.com/k9';
        const r = await resolveMediaUrlMetadata(pasted, {});

        expect(r.kind).toBe('single');
        if (r.kind !== 'single') {
            return;
        }
        expect(r.siteId).toBe('streamable');
        expect(spawnPlans).toHaveLength(0);
    });
});
