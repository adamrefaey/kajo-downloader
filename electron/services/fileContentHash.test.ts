import { createHash } from 'node:crypto';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Readable } from 'node:stream';
import { describe, expect, it, vi } from 'vitest';

const fsHoisted = vi.hoisted(() => ({
    useBoomStream: false,
    realCreateReadStream: null as null | typeof import('node:fs').createReadStream
}));

vi.mock('node:fs', async (importOriginal) => {
    const mod = await importOriginal<typeof import('node:fs')>();
    fsHoisted.realCreateReadStream = mod.createReadStream;
    return {
        ...mod,
        createReadStream: (
            ...args: Parameters<typeof mod.createReadStream>
        ): ReturnType<typeof mod.createReadStream> => {
            if (fsHoisted.useBoomStream) {
                const s = new Readable({
                    read() {
                        queueMicrotask(() => this.destroy(new Error('stream boom')));
                    }
                });
                return s as ReturnType<typeof mod.createReadStream>;
            }
            const real = fsHoisted.realCreateReadStream;
            if (!real) {
                return mod.createReadStream(...args);
            }
            return real(...args);
        }
    };
});

import { sha256FileHex } from './fileContentHash';

describe('sha256FileHex', () => {
    it('returns null for empty or whitespace path', async () => {
        expect(await sha256FileHex('')).toBeNull();
        expect(await sha256FileHex('   ')).toBeNull();
    });

    it('returns null when path is missing or not a file', async () => {
        expect(await sha256FileHex('/nonexistent/kajo-sha-test-xyz')).toBeNull();
        const dir = await mkdtemp(join(tmpdir(), 'kajo-sha-'));
        expect(await sha256FileHex(dir)).toBeNull();
        await rm(dir, { recursive: true, force: true });
    });

    it('returns stable lowercase hex for file contents', async () => {
        const dir = await mkdtemp(join(tmpdir(), 'kajo-sha-'));
        const filePath = join(dir, 'blob.bin');
        const body = 'kajo-test-bytes';
        await writeFile(filePath, body);
        const hex = await sha256FileHex(`  ${filePath}  `);
        expect(hex).toBe(createHash('sha256').update(body).digest('hex'));
        await rm(dir, { recursive: true, force: true });
    });

    it('rejects when the read stream errors', async () => {
        const dir = await mkdtemp(join(tmpdir(), 'kajo-sha-'));
        const filePath = join(dir, 'readable.txt');
        await writeFile(filePath, 'x');
        fsHoisted.useBoomStream = true;
        await expect(sha256FileHex(filePath)).rejects.toThrow('stream boom');
        fsHoisted.useBoomStream = false;
        await rm(dir, { recursive: true, force: true });
    });
});
