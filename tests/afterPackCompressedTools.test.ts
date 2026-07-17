import { describe, expect, it } from 'vitest';
import { isCompressedBundledTool } from '../build/afterPack.mjs';

describe('afterPack compressed-tool detection', () => {
    it('treats ffmpeg/ffprobe/deno (and their win32 .exe variants) as compressed bundled tools', () => {
        for (const name of ['ffmpeg', 'ffprobe', 'deno', 'ffmpeg.exe', 'ffprobe.exe', 'deno.exe']) {
            expect(isCompressedBundledTool(name)).toBe(true);
        }
    });

    it('does not treat yt-dlp (which ships loose) as a compressed bundled tool', () => {
        expect(isCompressedBundledTool('yt-dlp')).toBe(false);
        expect(isCompressedBundledTool('yt-dlp.exe')).toBe(false);
    });
});
