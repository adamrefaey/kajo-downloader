import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('electron', () => ({
    app: {
        isPackaged: false,
        getAppPath: () => '/Users/proj/kajo-video-ai',
        getPath: (name: string) => (name === 'userData' ? '/ud' : '/exe'),
        isReady: () => true
    }
}));

vi.mock('node:fs/promises', async (importOriginal) => {
    const actual = await importOriginal<typeof import('node:fs/promises')>();
    return {
        ...actual,
        readdir: vi.fn(async () => {
            throw new Error('no bin');
        }),
        access: vi.fn(async () => {
            throw new Error('no access');
        }),
        stat: vi.fn(async () => {
            throw new Error('no stat');
        })
    };
});

import { getBundledBinaryPath } from '../electron/services/binaries';

describe('binaries', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('getBundledBinaryPath joins resources layout', () => {
        const p = getBundledBinaryPath('yt-dlp');
        expect(p).toContain('resources');
        expect(p).toContain('bin');
        expect(p).toContain('yt-dlp');
    });
});
