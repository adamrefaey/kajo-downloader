import type { WebContents } from 'electron';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
    extractAutopasteClipboardInput,
    extractAutopasteMediaUrl,
    getUniqueDirectoryPath,
    isOpenableLocalMediaPath,
    isSafeOpenExternalUrl,
    prepareChannelOutputDirectory,
    preparePlaylistOutputDirectory,
    safeSend,
    sanitizeFolderName,
    sanitizePlaylistDirectoryName,
    validateSender
} from '../electron/mainHelpers';

describe('mainHelpers', () => {
    afterEach(() => {
        vi.unstubAllEnvs();
    });
    it('extractAutopasteMediaUrl finds http(s) URLs, strips trailing junk, skips adult hosts', () => {
        expect(extractAutopasteMediaUrl('')).toBeNull();
        expect(extractAutopasteMediaUrl('no url')).toBeNull();
        const u = 'https://www.youtube.com/watch?v=dQw4w9WgXcQ';
        expect(extractAutopasteMediaUrl(`see ${u})`)).toBe(u);
        const ch = 'https://www.youtube.com/@SomeChannel/videos';
        expect(extractAutopasteMediaUrl(`link ${ch}`)).toBe(ch);
        expect(extractAutopasteMediaUrl('https://vimeo.com/123456')).toBe(
            'https://vimeo.com/123456'
        );
        expect(
            extractAutopasteMediaUrl('https://www.pornhub.com/view_video.php?viewkey=x')
        ).toBeNull();
        expect(
            extractAutopasteMediaUrl('x https://xvideos.com/foo y https://example.org/watch z')
        ).toBeNull();
        expect(extractAutopasteMediaUrl('https://[')).toBeNull();
    });

    it('extractAutopasteMediaUrl returns null when the scanned prefix is only whitespace', () => {
        const tail = 'x';
        const text = `${' '.repeat(48_000)}${tail}`;
        expect(text.length).toBeGreaterThan(48_000);
        expect(extractAutopasteMediaUrl(text)).toBeNull();
    });

    it('extractAutopasteMediaUrl skips non-http(s) protocol and empty hostname before a valid URL', () => {
        const Original = globalThis.URL;
        let call = 0;
        globalThis.URL = class MockUrlForClipboardCoverage {
            protocol: string;
            hostname: string;
            href: string;

            constructor(input: string | URL) {
                const s = String(input);
                call += 1;
                if (call === 1) {
                    this.protocol = 'ftp:';
                    this.hostname = 'x';
                    this.href = s;
                } else if (call === 2) {
                    this.protocol = 'https:';
                    this.hostname = '';
                    this.href = s;
                } else {
                    const u = new Original(s);
                    this.protocol = u.protocol;
                    this.hostname = u.hostname;
                    this.href = u.href;
                }
            }
        } as unknown as typeof URL;
        try {
            expect(
                extractAutopasteMediaUrl('https://one.test https://two.test https://vimeo.com/a')
            ).toBe('https://vimeo.com/a');
        } finally {
            globalThis.URL = Original;
        }
    });

    it('extractAutopasteMediaUrl only scans a bounded prefix of very large clipboards', () => {
        const target = 'https://vimeo.com/bounded';
        const fillerLen = 48_000 - 1 - target.length;
        const text = `${'q'.repeat(fillerLen)} ${target}${'z'.repeat(60_000)}`;
        expect(text.length).toBeGreaterThan(48_000);
        expect(extractAutopasteMediaUrl(text)).toBe(target);
    });

    it('extractAutopasteClipboardInput returns null for empty or whitespace-only clipboard', () => {
        expect(extractAutopasteClipboardInput('')).toBeNull();
        expect(extractAutopasteClipboardInput('   \n\t  \r\n')).toBeNull();
        expect(extractAutopasteClipboardInput(undefined as unknown as string)).toBeNull();
    });

    it('extractAutopasteClipboardInput joins newline-separated URL lines for batch autopaste', () => {
        const a = 'https://www.youtube.com/watch?v=aaa';
        const b = 'https://vimeo.com/999';
        expect(extractAutopasteClipboardInput(`${a}\n${b}`)).toBe(`${a}\n${b}`);
        expect(extractAutopasteClipboardInput(`${a}\r\n${b}\r\n`)).toBe(`${a}\n${b}`);
    });

    it('extractAutopasteClipboardInput bounds very long lines when joining multiline URLs', () => {
        const a = 'https://www.youtube.com/watch?v=aaa';
        const longLine = `https://vimeo.com/999 ${'z'.repeat(50_000)}`;
        expect(longLine.length).toBeGreaterThan(48_000);
        expect(extractAutopasteClipboardInput(`${a}\n${longLine}`)).toBe(
            `${a}\nhttps://vimeo.com/999`
        );
    });

    it('extractAutopasteClipboardInput falls back to first URL when a line is not a URL', () => {
        const a = 'https://www.youtube.com/watch?v=aaa';
        const b = 'https://vimeo.com/999';
        expect(extractAutopasteClipboardInput(`${a}\nnot a url\n${b}`)).toBe(a);
    });

    it('extractAutopasteClipboardInput matches single-line behavior', () => {
        const u = 'https://www.youtube.com/watch?v=dQw4w9WgXcQ';
        expect(extractAutopasteClipboardInput(`see ${u})`)).toBe(u);
    });

    it('validateSender', () => {
        const roots = ['/app'] as const;
        const opts = { trustedFileRoots: roots };
        expect(validateSender(null, true, undefined, opts)).toBe(false);
        expect(
            validateSender({ url: 'notabsolute' } as Electron.WebFrameMain, true, undefined, opts)
        ).toBe(false);
        expect(
            validateSender(
                { url: 'file:///app/index.html' } as Electron.WebFrameMain,
                false,
                undefined,
                opts
            )
        ).toBe(true);
        expect(
            validateSender(
                { url: 'file:///other/index.html' } as Electron.WebFrameMain,
                false,
                undefined,
                opts
            )
        ).toBe(false);
        expect(
            validateSender(
                { url: 'http://localhost:5173/' } as Electron.WebFrameMain,
                true,
                undefined,
                opts
            )
        ).toBe(true);
        expect(
            validateSender(
                { url: 'http://localhost:5173/' } as Electron.WebFrameMain,
                false,
                undefined,
                opts
            )
        ).toBe(false);
        expect(validateSender(null, false, 'file:///app/index.html', opts)).toBe(true);
        expect(validateSender(null, false, 'http://example.com/', opts)).toBe(false);
        expect(
            validateSender(
                { url: 'file:///app/index.html' } as Electron.WebFrameMain,
                false,
                undefined,
                { trustedFileRoots: [] }
            )
        ).toBe(false);
        expect(
            validateSender({ url: 'not-a-url' } as Electron.WebFrameMain, false, undefined, opts)
        ).toBe(false);
        expect(
            validateSender(
                { url: 'file:///app/index.html' } as Electron.WebFrameMain,
                false,
                undefined,
                { trustedFileRoots: ['/app/index.html'] }
            )
        ).toBe(true);
        expect(
            validateSender(
                { url: 'file:///app/nested/page.html' } as Electron.WebFrameMain,
                false,
                undefined,
                { trustedFileRoots: ['/app'] }
            )
        ).toBe(true);
        expect(
            validateSender(
                { url: 'file:///app/index.html' } as Electron.WebFrameMain,
                false,
                undefined,
                undefined
            )
        ).toBe(false);
        // kajo-app:// custom protocol (production renderer)
        expect(
            validateSender(
                { url: 'kajo-app://localhost/' } as Electron.WebFrameMain,
                false,
                undefined,
                opts
            )
        ).toBe(true);
        expect(
            validateSender(
                { url: 'kajo-app://evil.com/' } as Electron.WebFrameMain,
                false,
                undefined,
                opts
            )
        ).toBe(false);
    });

    it('sanitizePlaylistDirectoryName', () => {
        expect(sanitizePlaylistDirectoryName('')).toBe('playlist');
        expect(sanitizePlaylistDirectoryName('  hello/world  ')).toContain('hello');
        expect(sanitizePlaylistDirectoryName('a'.repeat(120)).length).toBeLessThanOrEqual(96);
        expect(sanitizePlaylistDirectoryName(`bad\x00\x1fname`)).not.toContain('\x00');
    });

    it('sanitizeFolderName uses provided fallback for empty input', () => {
        expect(sanitizeFolderName('', 'channel')).toBe('channel');
        expect(sanitizeFolderName('  My Channel  ', 'channel')).toBe('My Channel');
        expect(sanitizeFolderName('a/b:c?d*e', 'channel')).not.toMatch(/[/\\:?*]/);
        expect(sanitizeFolderName('a'.repeat(120), 'channel').length).toBeLessThanOrEqual(96);
    });

    it('getUniqueDirectoryPath', async () => {
        const exists = vi.fn(async (p: string) => p === '/base');
        expect(await getUniqueDirectoryPath('/other', exists)).toBe('/other');
        expect(await getUniqueDirectoryPath('/base', exists)).toBe('/base (2)');
        let n = 0;
        const always = vi.fn(async () => {
            n += 1;
            return n < 10_500;
        });
        const result = await getUniqueDirectoryPath('/x', always);
        expect(result).toMatch(/\/x \(\d+\)$/);

        const alwaysTrue = vi.fn(async () => true);
        const fallback = await getUniqueDirectoryPath('/y', alwaysTrue);
        expect(fallback).toMatch(/^\/y \(\d+\)$/);
    });

    it('preparePlaylistOutputDirectory', async () => {
        const mkdirRecursive = vi.fn(async () => {});
        const join = (...p: string[]) => p.join('/');
        const pathExists = vi.fn(async () => false);
        const dir = await preparePlaylistOutputDirectory(
            { outputDir: '/out', playlistTitle: 'My Mix' },
            { join, mkdirRecursive, pathExists }
        );
        expect(dir).toContain('/out/My Mix');
        expect(mkdirRecursive).toHaveBeenCalledWith(dir);
    });

    it('prepareChannelOutputDirectory creates channel base dir and section subdirs', async () => {
        const mkdirRecursive = vi.fn(async () => {});
        const join = (...p: string[]) => p.join('/');
        const pathExists = vi.fn(async () => false);
        const result = await prepareChannelOutputDirectory(
            { outputDir: '/out', channelTitle: 'TechChannel', sections: ['videos', 'shorts'] },
            { join, mkdirRecursive, pathExists }
        );
        expect(result.channelDir).toBe('/out/TechChannel');
        expect(result.sectionDirs.videos).toBe('/out/TechChannel/videos');
        expect(result.sectionDirs.shorts).toBe('/out/TechChannel/shorts');
        expect(result.sectionDirs.live).toBeUndefined();
        // channelDir + both section dirs
        expect(mkdirRecursive).toHaveBeenCalledTimes(3);
        expect(mkdirRecursive).toHaveBeenCalledWith('/out/TechChannel');
        expect(mkdirRecursive).toHaveBeenCalledWith('/out/TechChannel/videos');
        expect(mkdirRecursive).toHaveBeenCalledWith('/out/TechChannel/shorts');
    });

    it('prepareChannelOutputDirectory creates unique channel dir when name taken', async () => {
        const mkdirRecursive = vi.fn(async () => {});
        const join = (...p: string[]) => p.join('/');
        const pathExists = vi.fn(async (p: string) => p === '/out/MyChannel');
        const result = await prepareChannelOutputDirectory(
            { outputDir: '/out', channelTitle: 'MyChannel', sections: ['live'] },
            { join, mkdirRecursive, pathExists }
        );
        expect(result.channelDir).toBe('/out/MyChannel (2)');
        expect(result.sectionDirs.live).toBe('/out/MyChannel (2)/live');
    });

    it('prepareChannelOutputDirectory sanitizes channel title', async () => {
        const mkdirRecursive = vi.fn(async () => {});
        const join = (...p: string[]) => p.join('/');
        const pathExists = vi.fn(async () => false);
        const result = await prepareChannelOutputDirectory(
            { outputDir: '/out', channelTitle: 'Bad/Name:Here', sections: ['videos'] },
            { join, mkdirRecursive, pathExists }
        );
        // The channel folder name (last segment) must not contain illegal filesystem chars
        const folderName = result.channelDir.split('/').pop() ?? '';
        expect(folderName).not.toMatch(/[<>:"/\\|?*]/);
        expect(result.sectionDirs.videos).toBeDefined();
    });

    it('prepareChannelOutputDirectory falls back to "channel" for empty title', async () => {
        const mkdirRecursive = vi.fn(async () => {});
        const join = (...p: string[]) => p.join('/');
        const pathExists = vi.fn(async () => false);
        const result = await prepareChannelOutputDirectory(
            { outputDir: '/out', channelTitle: '   ', sections: ['videos'] },
            { join, mkdirRecursive, pathExists }
        );
        expect(result.channelDir).toBe('/out/channel');
    });

    it('isSafeOpenExternalUrl allowlists https hosts, blocks file and dangerous schemes', () => {
        expect(isSafeOpenExternalUrl('https://github.com/adamrefaey/kajo-downloader')).toBe(true);
        expect(isSafeOpenExternalUrl('https://www.github.com/x')).toBe(true);
        expect(isSafeOpenExternalUrl('https://www.linkedin.com/in/x')).toBe(true);
        expect(isSafeOpenExternalUrl('https://evil.com/')).toBe(false);
        expect(isSafeOpenExternalUrl('https://example.com/path')).toBe(false);
        expect(isSafeOpenExternalUrl('http://localhost:5173/')).toBe(true);
        // file:// is blocked: opening arbitrary local files via shell.openExternal
        // could expose sensitive data if the renderer is compromised (security checklist #15).
        expect(isSafeOpenExternalUrl('file:///Users/me/video.mp4')).toBe(false);
        expect(isSafeOpenExternalUrl('javascript:alert(1)')).toBe(false);
        expect(isSafeOpenExternalUrl('data:text/html,<script>')).toBe(false);
        expect(isSafeOpenExternalUrl('ftp://example.com/')).toBe(false);
        expect(isSafeOpenExternalUrl('')).toBe(false);
        expect(isSafeOpenExternalUrl('not-a-url')).toBe(false);
    });

    it('blocks remote http and blocks local http when NODE_ENV is production', () => {
        expect(isSafeOpenExternalUrl('http://example.com/')).toBe(false);
        vi.stubEnv('NODE_ENV', 'production');
        expect(isSafeOpenExternalUrl('http://127.0.0.1:1/')).toBe(false);
        expect(isSafeOpenExternalUrl('http://localhost:5173/')).toBe(false);
    });

    it('isOpenableLocalMediaPath allowlists media files and blocks executables, control chars, UNC, relative paths', () => {
        // Valid media/audio/subtitle/image files — note spaces in real macOS paths are allowed.
        expect(isOpenableLocalMediaPath('/Users/me/Movies/My Video.mp4')).toBe(true);
        expect(isOpenableLocalMediaPath('/Users/me/song.MP3')).toBe(true); // case-insensitive ext
        expect(isOpenableLocalMediaPath('/Users/me/clip.webm')).toBe(true);
        expect(isOpenableLocalMediaPath('/Users/me/subs.srt')).toBe(true);
        expect(isOpenableLocalMediaPath('/Users/me/thumb.jpg')).toBe(true);
        // Empty / whitespace-only.
        expect(isOpenableLocalMediaPath('')).toBe(false);
        expect(isOpenableLocalMediaPath('   ')).toBe(false);
        // Executable / script / document / bundle extensions are denied (allowlist, not denylist).
        expect(isOpenableLocalMediaPath('/Users/me/run.command')).toBe(false);
        expect(isOpenableLocalMediaPath('/Applications/Evil.app')).toBe(false);
        expect(isOpenableLocalMediaPath('/Users/me/page.html')).toBe(false);
        expect(isOpenableLocalMediaPath('/Users/me/script.sh')).toBe(false);
        // Double-extension trick resolves to the trailing (non-media) extension.
        expect(isOpenableLocalMediaPath('/Users/me/clip.mp4.command')).toBe(false);
        // No extension at all, including dotfiles.
        expect(isOpenableLocalMediaPath('/Users/me/noext')).toBe(false);
        expect(isOpenableLocalMediaPath('/Users/me/.bashrc')).toBe(false);
        // Relative paths rejected (must be absolute).
        expect(isOpenableLocalMediaPath('Movies/clip.mp4')).toBe(false);
        // UNC / network paths rejected (// and \\ forms).
        expect(isOpenableLocalMediaPath('//server/share/clip.mp4')).toBe(false);
        expect(isOpenableLocalMediaPath('\\\\server\\share\\clip.mp4')).toBe(false);
        // Control chars rejected even with a media extension (NUL = code<32, DEL = code 127).
        expect(isOpenableLocalMediaPath('/Users/me/clip\x00.mp4')).toBe(false);
        expect(isOpenableLocalMediaPath('/Users/me/clip\x7f.mp4')).toBe(false);
    });

    it('safeSend respects destroyed and payload', () => {
        const send = vi.fn();
        const wc = {
            isDestroyed: () => false,
            send
        } as unknown as WebContents;
        safeSend(wc, 'ch');
        safeSend(wc, 'ch2', { a: 1 });
        expect(send).toHaveBeenCalledWith('ch');
        expect(send).toHaveBeenCalledWith('ch2', { a: 1 });
        const dead = { isDestroyed: () => true, send } as unknown as WebContents;
        safeSend(dead, 'x');
        expect(send).toHaveBeenCalledTimes(2);
    });
});
