/**
 * QA: Top-20 rollout site #10 (Rumble) — metadata resolve paths.
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

describe('rollout #10 Rumble — resolveMediaUrlMetadata', () => {
    beforeEach(() => {
        spawnPlans.length = 0;
        vi.resetModules();
    });

    it('locks rumble as rollout rank 10', () => {
        expect(ROLLOUT_TOP_20_SITE_IDS[9]).toBe('rumble');
        expect(listSiteProfilesInRolloutOrder()[9]?.siteId).toBe('rumble');
    });

    it('builds static context for video URL, channel-style path, and list query multi hint', () => {
        const video = buildStaticMetadataResolveContext('https://rumble.com/vabc123-title.html');
        expect(video.siteId).toBe('rumble');
        expect(video.candidateMode).toBe('single');
        expect(video.authCookiesRecommended).toBe(false);

        const channel = buildStaticMetadataResolveContext('https://rumble.com/c/CreatorName');
        expect(channel.siteId).toBe('rumble');
        expect(channel.candidateMode).toBe('single');

        const listHint = buildStaticMetadataResolveContext('https://rumble.com/c/foo?list=1');
        expect(listHint.siteId).toBe('rumble');
        expect(listHint.candidateMode).toBe('multi');
    });

    it('returns multi when flat probe lists two entries', async () => {
        spawnPlans.push({
            exitCode: 0,
            stdout: JSON.stringify({
                extractor_key: 'Rumble',
                title: 'Channel',
                entries: [
                    {
                        id: 'v1',
                        title: 'Clip A',
                        url: 'https://rumble.com/v1-a.html',
                        duration: 60
                    },
                    {
                        id: 'v2',
                        title: 'Clip B',
                        url: 'https://rumble.com/v2-b.html',
                        duration: 90
                    }
                ]
            })
        });

        const { resolveMediaUrlMetadata } = await import('../electron/services/metadata');
        const url = 'https://rumble.com/c/test?list=x';
        const r = await resolveMediaUrlMetadata(url, {});

        expect(r.kind).toBe('multi');
        if (r.kind !== 'multi') {
            return;
        }
        expect(r.siteId).toBe('rumble');
        expect(r.extractorKey).toBe('Rumble');
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
                extractor_key: 'Rumble',
                id: 'v9',
                title: 'Standalone',
                webpage_url: 'https://rumble.com/v9-z.html',
                duration: 45
            })
        });

        const { resolveMediaUrlMetadata } = await import('../electron/services/metadata');
        const pasted = 'https://rumble.com/v9-z.html';
        const r = await resolveMediaUrlMetadata(pasted, {});

        expect(r.kind).toBe('single');
        if (r.kind !== 'single') {
            return;
        }
        expect(r.siteId).toBe('rumble');
        expect(spawnPlans).toHaveLength(0);
    });

    it('maps RumbleChannel extractor key via loose match', async () => {
        spawnPlans.push({
            exitCode: 1,
            stderr: 'ERROR: flat failed'
        });
        spawnPlans.push({
            exitCode: 0,
            stdout: JSON.stringify({
                extractor_key: 'RumbleChannel',
                id: 'c1',
                title: 'Channel root',
                webpage_url: 'https://rumble.com/c/foo',
                duration: 0
            })
        });

        const { resolveMediaUrlMetadata } = await import('../electron/services/metadata');
        const pasted = 'https://rumble.com/c/foo';
        const r = await resolveMediaUrlMetadata(pasted, {});

        expect(r.kind).toBe('single');
        if (r.kind !== 'single') {
            return;
        }
        expect(r.siteId).toBe('rumble');
        expect(r.extractorKey).toBe('RumbleChannel');
        expect(spawnPlans).toHaveLength(0);
    });
});
