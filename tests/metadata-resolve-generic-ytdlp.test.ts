/**
 * Generic yt-dlp fallback: hosts outside rollout profiles still resolve when yt-dlp has an extractor.
 */
import { EventEmitter } from 'node:events';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { GENERIC_YTDLP_SITE_ID } from '../src/shared/siteProfiles';
import {
    buildStaticMetadataResolveContext,
    refineMetadataResolveContextWithExtractor
} from '../src/shared/urlSiteResolveContext';

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

describe('generic yt-dlp metadata resolve', () => {
    beforeEach(() => {
        spawnPlans.length = 0;
        vi.resetModules();
    });

    it('refineMetadataResolveContextWithExtractor assigns synthetic siteId when extractor is unknown to rollout', () => {
        const base = buildStaticMetadataResolveContext('https://unknown.example.org/watch/123');
        expect(base.siteId).toBeUndefined();
        const refined = refineMetadataResolveContextWithExtractor(base, 'SomeOtherExtractor');
        expect(refined.siteId).toBe(GENERIC_YTDLP_SITE_ID);
        expect(refined.extractorKey).toBe('SomeOtherExtractor');
    });

    it('keeps rollout siteId from host when extractor also matches another profile', () => {
        const base = buildStaticMetadataResolveContext(
            'https://www.youtube.com/watch?v=dQw4w9WgXcQ'
        );
        const refined = refineMetadataResolveContextWithExtractor(base, 'youtube');
        expect(refined.siteId).toBe('youtube');
    });

    it('returns multi with generic siteId when flat lists multiple entries', async () => {
        spawnPlans.push({
            exitCode: 0,
            stdout: JSON.stringify({
                extractor_key: 'NiconicoPlaylist',
                title: 'Series',
                entries: [
                    {
                        id: 'sm1',
                        title: 'Ep 1',
                        url: 'https://www.nicovideo.jp/watch/sm1',
                        duration: 60
                    },
                    {
                        id: 'sm2',
                        title: 'Ep 2',
                        url: 'https://www.nicovideo.jp/watch/sm2',
                        duration: 61
                    }
                ]
            })
        });

        const { resolveMediaUrlMetadata } = await import('../electron/services/metadata');
        const url = 'https://www.nicovideo.jp/mylist/12345';
        const r = await resolveMediaUrlMetadata(url, {});

        expect(r.kind).toBe('multi');
        if (r.kind !== 'multi') {
            return;
        }
        expect(r.siteId).toBe(GENERIC_YTDLP_SITE_ID);
        expect(r.extractorKey).toBe('NiconicoPlaylist');
        expect(r.entryCount).toBe(2);
        expect(r.candidates).toHaveLength(2);
        expect(spawnPlans).toHaveLength(0);
    });

    it('allows single-video probe after flat failure when URL looks multi but host has no rollout profile', async () => {
        spawnPlans.push({
            exitCode: 1,
            stderr: 'ERROR: flat playlist not supported'
        });
        spawnPlans.push({
            exitCode: 0,
            stdout: JSON.stringify({
                extractor_key: 'Niconico',
                id: 'sm999',
                title: 'Clip',
                webpage_url: 'https://www.nicovideo.jp/watch/sm999',
                duration: 120
            })
        });

        const { resolveMediaUrlMetadata } = await import('../electron/services/metadata');
        const pasted = 'https://www.nicovideo.jp/playlist?list=foo';
        const r = await resolveMediaUrlMetadata(pasted, {});

        expect(r.kind).toBe('single');
        if (r.kind !== 'single') {
            return;
        }
        expect(r.url).toBe('https://www.nicovideo.jp/watch/sm999');
        expect(r.siteId).toBe(GENERIC_YTDLP_SITE_ID);
        expect(r.extractorKey).toBe('Niconico');
        expect(spawnPlans).toHaveLength(0);
    });
});
