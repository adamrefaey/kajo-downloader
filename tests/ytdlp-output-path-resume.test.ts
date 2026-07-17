import { beforeEach, describe, expect, it, vi } from 'vitest';

const access = vi.fn();
const readdir = vi.fn();

vi.mock('node:fs/promises', async (importOriginal) => {
    const actual = await importOriginal<typeof import('node:fs/promises')>();
    return {
        ...actual,
        access: (...args: unknown[]) => access(...args),
        readdir: (...args: unknown[]) => readdir(...args)
    };
});

vi.mock('../electron/services/ytdlp/downloadEngineCommands', () => ({
    runYtDlpCommand: vi.fn()
}));

describe('resolveUniqueOutputPath resume hint', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        access.mockRejectedValue(new Error('ENOENT'));
        readdir.mockRejectedValue(new Error('ENOENT'));
    });

    it('reuses reservedOutputPathHint when the final file does not exist yet', async () => {
        const { resolveUniqueOutputPath } = await import(
            '../electron/services/ytdlp/downloadEngineOutputPath'
        );
        const hint = '/downloads/My Video.mp4';
        const path = await resolveUniqueOutputPath(
            {
                url: 'https://example.com/v',
                formatId: 'best',
                outputDir: '/downloads',
                downloadId: 'd1',
                webContents: { send: vi.fn(), isDestroyed: () => false } as never
            },
            [],
            hint
        );
        expect(path).toBe(hint);
        expect(access).toHaveBeenCalledWith(hint);
    });
});
