import { describe, expect, it } from 'vitest';
import {
    applyStructuredDownloadCapabilities,
    buildApplyCapabilitiesContext,
    mergeAdvancedDownloadDefaultsStored,
    mergeAdvancedStartCapabilities,
    mergeWithAutomaticFileEmbedding,
    normalizeMergedCapabilities,
    sanitizeAdvancedDownloadDefaultsPatch,
    sanitizeDownloadEngineCapabilities,
    sanitizeSponsorBlockCategories,
    validateOutputFilenameTemplate,
    validateRateLimitString,
    validateTrimTimestamp
} from '../electron/services/downloadCapabilities';
import { mergeDownloadCapabilityLayers } from '../src/shared/advancedDownloadSettings';
import { DEFAULT_ADVANCED_DOWNLOAD_DEFAULTS } from '../src/types';

describe('validateTrimTimestamp', () => {
    it('accepts hh:mm:ss and rejects invalid', () => {
        expect(validateTrimTimestamp('  0:01:02  ')).toBe('0:01:02');
        expect(validateTrimTimestamp('')).toBeUndefined();
        expect(validateTrimTimestamp('not-a-time')).toBeUndefined();
    });
});

describe('validateOutputFilenameTemplate', () => {
    it('accepts safe single-segment templates', () => {
        expect(validateOutputFilenameTemplate(' %(title)s ')).toBe('%(title)s');
    });

    it('rejects traversal, slashes, and empty', () => {
        expect(validateOutputFilenameTemplate('')).toBeUndefined();
        expect(validateOutputFilenameTemplate('../x')).toBeUndefined();
        expect(validateOutputFilenameTemplate('a/b')).toBeUndefined();
        expect(validateOutputFilenameTemplate('~x')).toBeUndefined();
    });
});

describe('validateRateLimitString', () => {
    it('accepts common yt-dlp limit-rate forms', () => {
        expect(validateRateLimitString('500K')).toBe('500K');
        expect(validateRateLimitString(' 1M ')).toBe('1M');
        expect(validateRateLimitString('2.5m')).toBe('2.5m');
    });

    it('rejects invalid values', () => {
        expect(validateRateLimitString('')).toBeUndefined();
        expect(validateRateLimitString('abc')).toBeUndefined();
        expect(validateRateLimitString('1;rm')).toBeUndefined();
    });
});

describe('sanitizeDownloadEngineCapabilities', () => {
    it('returns undefined for non-objects', () => {
        expect(sanitizeDownloadEngineCapabilities(null)).toBeUndefined();
        expect(sanitizeDownloadEngineCapabilities('x')).toBeUndefined();
    });

    it('accepts valid subtitle and embedding blocks', () => {
        expect(
            sanitizeDownloadEngineCapabilities({
                subtitles: { mode: 'embed', languages: ['en', 'de'] },
                embedding: { metadata: true, thumbnail: true },
                proxy: { enabled: true, profileId: ' home ' }
            })
        ).toEqual({
            subtitles: { mode: 'embed', languages: ['en', 'de'] },
            embedding: { metadata: true, thumbnail: true },
            proxy: { enabled: true, profileId: 'home' }
        });
    });

    it('sanitizes output and network', () => {
        expect(
            sanitizeDownloadEngineCapabilities({
                output: { videoContainer: 'mkv', audioFormat: 'flac' },
                network: { rateLimit: '850K' }
            })
        ).toEqual({
            output: { videoContainer: 'mkv', audioFormat: 'flac' },
            network: { rateLimit: '850K' }
        });
    });

    it('drops invalid subtitle modes', () => {
        expect(
            sanitizeDownloadEngineCapabilities({
                subtitles: { mode: 'invalid' }
            })
        ).toBeUndefined();
    });

    it('requires true for embedding flags', () => {
        expect(
            sanitizeDownloadEngineCapabilities({
                embedding: { metadata: 'yes' as unknown as boolean }
            })
        ).toBeUndefined();
    });

    it('accepts chapters', () => {
        expect(
            sanitizeDownloadEngineCapabilities({
                embedding: { chapters: true }
            })
        ).toEqual({ embedding: { chapters: true } });
    });

    it('accepts sponsorblock mark/remove and archive', () => {
        expect(
            sanitizeDownloadEngineCapabilities({
                sponsorblock: { mode: 'mark', categories: ['intro', 'intro', 'badcat'] },
                archive: { enabled: true },
                trim: { start: '0:00:01', end: '0:00:02' }
            })
        ).toEqual({
            sponsorblock: { mode: 'mark', categories: ['intro'] },
            archive: { enabled: true },
            trim: { start: '0:00:01', end: '0:00:02' }
        });
        expect(
            sanitizeDownloadEngineCapabilities({
                sponsorblock: { mode: 'remove', categories: [] }
            })
        ).toEqual({ sponsorblock: { mode: 'remove', categories: ['sponsor'] } });
        expect(sanitizeDownloadEngineCapabilities({ sponsorblock: { mode: 'off' } })).toEqual({
            sponsorblock: { mode: 'off', categories: [] }
        });
    });

    it('enables proxy without profile id', () => {
        expect(sanitizeDownloadEngineCapabilities({ proxy: { enabled: true } })).toEqual({
            proxy: { enabled: true }
        });
    });
});

describe('applyStructuredDownloadCapabilities', () => {
    it('appends subtitle and embed flags', () => {
        const args: string[] = ['--newline'];
        applyStructuredDownloadCapabilities(args, {
            subtitles: { mode: 'embed', languages: ['en'] },
            embedding: { metadata: true, thumbnail: true, chapters: true },
            network: { rateLimit: '1M' }
        });
        expect(args).toEqual([
            '--newline',
            '--write-subs',
            '--sub-langs',
            'en',
            '--embed-subs',
            '--embed-metadata',
            '--embed-thumbnail',
            '--embed-chapters',
            '--limit-rate',
            '1M'
        ]);
    });

    it('adds proxy when context provides URL', () => {
        const args: string[] = [];
        applyStructuredDownloadCapabilities(
            args,
            { proxy: { enabled: true, profileId: 'default' } },
            { resolvedProxyUrl: 'http://127.0.0.1:8888' }
        );
        expect(args).toEqual(['--proxy', 'http://127.0.0.1:8888']);
    });

    it('skips proxy without resolved URL', () => {
        const args: string[] = [];
        applyStructuredDownloadCapabilities(args, { proxy: { enabled: true } }, {});
        expect(args).toEqual([]);
    });

    it('applies embedding flags independently', () => {
        const meta: string[] = [];
        applyStructuredDownloadCapabilities(meta, { embedding: { metadata: true } });
        expect(meta).toEqual(['--embed-metadata']);

        const thumb: string[] = [];
        applyStructuredDownloadCapabilities(thumb, { embedding: { thumbnail: true } });
        expect(thumb).toEqual(['--embed-thumbnail']);

        const ch: string[] = [];
        applyStructuredDownloadCapabilities(ch, { embedding: { chapters: true } });
        expect(ch).toEqual(['--embed-chapters']);
    });

    it('appends sponsorblock mark/remove, trim, archive, and sidecar subs', () => {
        const mark: string[] = [];
        applyStructuredDownloadCapabilities(mark, {
            sponsorblock: { mode: 'mark', categories: ['sponsor', 'intro'] }
        });
        expect(mark).toEqual(['--sponsorblock-mark', 'sponsor,intro']);

        const rm: string[] = [];
        applyStructuredDownloadCapabilities(rm, {
            sponsorblock: { mode: 'remove', categories: ['outro'] }
        });
        expect(rm).toEqual(['--sponsorblock-remove', 'outro']);

        const markDefaultCat: string[] = [];
        applyStructuredDownloadCapabilities(markDefaultCat, {
            sponsorblock: { mode: 'mark', categories: [] }
        });
        expect(markDefaultCat).toEqual(['--sponsorblock-mark', 'sponsor']);

        const removeDefaultCat: string[] = [];
        applyStructuredDownloadCapabilities(removeDefaultCat, {
            sponsorblock: { mode: 'remove', categories: [] }
        });
        expect(removeDefaultCat).toEqual(['--sponsorblock-remove', 'sponsor']);

        const trimArgs: string[] = [];
        applyStructuredDownloadCapabilities(trimArgs, {
            trim: { start: '0:00:01', end: '0:00:05' }
        });
        expect(trimArgs).toEqual(['--download-sections', '*0:00:01-0:00:05']);

        const arch: string[] = [];
        applyStructuredDownloadCapabilities(
            arch,
            { archive: { enabled: true } },
            { resolvedArchivePath: '/a.txt' }
        );
        expect(arch).toEqual(['--download-archive', '/a.txt']);

        const sidecar: string[] = [];
        applyStructuredDownloadCapabilities(sidecar, { subtitles: { mode: 'sidecar' } });
        expect(sidecar).toEqual(['--write-subs']);
    });
});

describe('buildApplyCapabilitiesContext', () => {
    it('resolves profile via getter', () => {
        const ctx = buildApplyCapabilitiesContext(
            { proxy: { enabled: true, profileId: 'p1' } },
            (id) => (id === 'p1' ? 'socks5://h:1' : null)
        );
        expect(ctx.resolvedProxyUrl).toBe('socks5://h:1');
    });

    it('passes archive path only when archive enabled', () => {
        const withArchive = buildApplyCapabilitiesContext(
            { archive: { enabled: true } },
            () => null,
            '/data/archive.txt'
        );
        expect(withArchive.resolvedArchivePath).toBe('/data/archive.txt');
        const noPath = buildApplyCapabilitiesContext(
            { archive: { enabled: true } },
            () => null,
            null
        );
        expect(noPath.resolvedArchivePath).toBeUndefined();
    });
});

describe('mergeWithAutomaticFileEmbedding', () => {
    it('merges embedding defaults', () => {
        const m = mergeWithAutomaticFileEmbedding({ network: { rateLimit: '1M' } });
        expect(m.embedding).toEqual({ metadata: true, thumbnail: true, chapters: true });
        expect(m.network).toEqual({ rateLimit: '1M' });
        expect(mergeWithAutomaticFileEmbedding(undefined).embedding).toEqual({
            metadata: true,
            thumbnail: true,
            chapters: true
        });
    });
});

describe('normalizeMergedCapabilities', () => {
    it('returns undefined for empty merged object', () => {
        expect(normalizeMergedCapabilities({})).toBeUndefined();
    });

    it('returns undefined when merged is undefined', () => {
        expect(normalizeMergedCapabilities(undefined)).toBeUndefined();
    });

    it('passes through subtitle + sponsorblock caps', () => {
        const merged = sanitizeDownloadEngineCapabilities({
            subtitles: { mode: 'sidecar', languages: ['en'] },
            sponsorblock: { mode: 'remove', categories: ['sponsor'] }
        });
        const gated = normalizeMergedCapabilities(merged);
        expect(gated?.subtitles?.mode).toBe('sidecar');
        expect(gated?.sponsorblock?.mode).toBe('remove');
    });

    it('passes through embed + sponsorblock caps', () => {
        const merged = sanitizeDownloadEngineCapabilities({
            sponsorblock: { mode: 'remove', categories: ['sponsor'] },
            subtitles: { mode: 'embed', languages: ['en'] }
        });
        const gated = normalizeMergedCapabilities(merged);
        expect(gated?.sponsorblock?.mode).toBe('remove');
        expect(gated?.subtitles?.mode).toBe('embed');
    });
});

describe('mergeAdvancedStartCapabilities', () => {
    it('merges defaults with IPC overlay', () => {
        const defaults: typeof DEFAULT_ADVANCED_DOWNLOAD_DEFAULTS = {
            ...DEFAULT_ADVANCED_DOWNLOAD_DEFAULTS,
            output: { videoContainer: 'mkv', audioFormat: 'mp3' }
        };
        const overlay = sanitizeDownloadEngineCapabilities({
            subtitles: { mode: 'sidecar', languages: ['ja'] },
            network: { rateLimit: '500K' }
        });
        const merged = mergeAdvancedStartCapabilities(defaults, overlay);
        expect(merged?.output?.videoContainer).toBe('mkv');
        expect(merged?.subtitles).toEqual({ mode: 'sidecar', languages: ['ja'] });
        expect(merged?.network).toEqual({ rateLimit: '500K' });
    });

    it('returns undefined when baseline caps and overlay are both empty', () => {
        expect(
            mergeAdvancedStartCapabilities(DEFAULT_ADVANCED_DOWNLOAD_DEFAULTS, undefined)
        ).toBeUndefined();
    });
});

describe('sanitizeAdvancedDownloadDefaultsPatch + mergeAdvancedDownloadDefaultsStored', () => {
    it('merges partial patches without wiping sibling fields', () => {
        const patch = sanitizeAdvancedDownloadDefaultsPatch({
            network: { rateLimit: '2M' }
        });
        expect(patch).toEqual({ network: { rateLimit: '2M' } });
        if (!patch) {
            throw new Error('expected patch');
        }
        const merged = mergeAdvancedDownloadDefaultsStored(
            DEFAULT_ADVANCED_DOWNLOAD_DEFAULTS,
            patch
        );
        expect(merged.network.rateLimit).toBe('2M');
        expect(merged.subtitles.mode).toBe('off');
    });

    it('sanitizes full advanced defaults patch branches', () => {
        const patch = sanitizeAdvancedDownloadDefaultsPatch({
            subtitles: { mode: 'embed', languages: ['en'] },
            output: { videoContainer: 'webm', audioFormat: 'ogg' },
            proxy: { enabled: true, profileId: ' z ' },
            sponsorblock: { mode: 'mark', categories: ['sponsor'] },
            archive: { enabled: true },
            filenameTemplate: '%(title)s'
        });
        expect(patch?.proxy?.profileId).toBe('z');
        expect(patch?.filenameTemplate).toBe('%(title)s');
        if (!patch) {
            throw new Error('expected patch');
        }
        const merged = mergeAdvancedDownloadDefaultsStored(
            DEFAULT_ADVANCED_DOWNLOAD_DEFAULTS,
            patch
        );
        expect(merged.archive.enabled).toBe(true);
        expect(merged.sponsorblock.mode).toBe('mark');
    });

    it('ignores embedding and trim keys in advanced defaults patches', () => {
        expect(
            sanitizeAdvancedDownloadDefaultsPatch({
                embedding: { metadata: false }
            })
        ).toBeUndefined();
        expect(
            sanitizeAdvancedDownloadDefaultsPatch({
                trim: { enabled: true, start: '0:00:01', end: '0:00:02' }
            })
        ).toBeUndefined();
        const merged = mergeAdvancedDownloadDefaultsStored(DEFAULT_ADVANCED_DOWNLOAD_DEFAULTS, {
            subtitles: { mode: 'sidecar' }
        });
        expect(merged.subtitles.mode).toBe('sidecar');
        expect('embedding' in merged).toBe(false);
        expect('trim' in merged).toBe(false);
    });

    it('returns undefined for non-object patch', () => {
        expect(sanitizeAdvancedDownloadDefaultsPatch(null)).toBeUndefined();
    });

    it('mergeAdvancedDownloadDefaultsStored applies category patch', () => {
        const merged = mergeAdvancedDownloadDefaultsStored(DEFAULT_ADVANCED_DOWNLOAD_DEFAULTS, {
            sponsorblock: { categories: ['intro', 'intro'] }
        });
        expect(merged.sponsorblock.categories).toEqual(['intro']);
    });

    it('patch proxy false-only and invalid filename omit those keys', () => {
        expect(sanitizeAdvancedDownloadDefaultsPatch({ proxy: { enabled: false } })).toEqual({
            proxy: { enabled: false }
        });
        expect(
            sanitizeAdvancedDownloadDefaultsPatch({ filenameTemplate: '../bad' })
        ).toBeUndefined();
    });
});

describe('sanitizeSponsorBlockCategories', () => {
    it('skips non-strings, dedupes, and caps length', () => {
        expect(
            sanitizeSponsorBlockCategories(
                ['sponsor', 1 as unknown as string, 'sponsor', 'intro', 'outro'],
                2
            )
        ).toEqual(['sponsor', 'intro']);
    });

    it('returns [] for non-array input', () => {
        expect(sanitizeSponsorBlockCategories(null)).toEqual([]);
        expect(sanitizeSponsorBlockCategories({} as never)).toEqual([]);
    });
});

describe('sanitizeDownloadEngineCapabilities edge branches', () => {
    it('ignores invalid sponsorblock shapes and trim partials', () => {
        expect(sanitizeDownloadEngineCapabilities({ sponsorblock: 'x' as never })).toBeUndefined();
        expect(
            sanitizeDownloadEngineCapabilities({
                sponsorblock: { mode: 'bogus' }
            })
        ).toBeUndefined();
        expect(
            sanitizeDownloadEngineCapabilities({
                trim: { start: '0:00:01', end: '' }
            })
        ).toBeUndefined();
        expect(
            sanitizeDownloadEngineCapabilities({
                trim: { start: '', end: '0:00:02' }
            })
        ).toBeUndefined();
        expect(
            sanitizeDownloadEngineCapabilities({
                trim: { start: 1 as never, end: '0:00:02' }
            })
        ).toBeUndefined();
        expect(
            sanitizeDownloadEngineCapabilities({
                trim: { start: '0:00:01', end: 1 as never }
            })
        ).toBeUndefined();
        expect(
            sanitizeDownloadEngineCapabilities({
                archive: 'nope' as never
            })
        ).toBeUndefined();
        expect(
            sanitizeDownloadEngineCapabilities({
                archive: { enabled: false }
            })
        ).toBeUndefined();
    });

    it('subtitles off still records languages when provided', () => {
        expect(
            sanitizeDownloadEngineCapabilities({
                subtitles: { mode: 'off', languages: ['en'] }
            })
        ).toEqual({ subtitles: { mode: 'off', languages: ['en'] } });
    });

    it('subtitles drops non-string language entries', () => {
        expect(
            sanitizeDownloadEngineCapabilities({
                subtitles: { mode: 'sidecar', languages: ['en', 3 as never, '', '  de  '] }
            })
        ).toEqual({ subtitles: { mode: 'sidecar', languages: ['en', 'de'] } });
    });

    it('embedding ignores non-true flags', () => {
        expect(
            sanitizeDownloadEngineCapabilities({
                embedding: { metadata: false, thumbnail: false, chapters: false }
            })
        ).toBeUndefined();
    });

    it('output ignores unknown container and audio format', () => {
        expect(
            sanitizeDownloadEngineCapabilities({
                output: { videoContainer: 'avi', audioFormat: 'mp3' }
            })
        ).toEqual({ output: { audioFormat: 'mp3' } });
    });

    it('output drops block when both container and audio are invalid', () => {
        expect(
            sanitizeDownloadEngineCapabilities({
                output: { videoContainer: 'avi', audioFormat: 'bogus' }
            })
        ).toBeUndefined();
    });

    it('network drops invalid rate limit', () => {
        expect(
            sanitizeDownloadEngineCapabilities({
                network: { rateLimit: 'not-a-rate' }
            })
        ).toBeUndefined();
    });

    it('subtitles without languages array still records mode', () => {
        expect(
            sanitizeDownloadEngineCapabilities({
                subtitles: { mode: 'embed' }
            })
        ).toEqual({ subtitles: { mode: 'embed' } });
    });

    it('output accepts only videoContainer when audio omitted', () => {
        expect(
            sanitizeDownloadEngineCapabilities({
                output: { videoContainer: 'mkv' }
            })
        ).toEqual({ output: { videoContainer: 'mkv' } });
    });

    it('network ignores non-string rateLimit', () => {
        expect(
            sanitizeDownloadEngineCapabilities({
                network: { rateLimit: 500 as never }
            })
        ).toBeUndefined();
    });
});

describe('validators edge cases', () => {
    it('validateRateLimitString trims and bounds length', () => {
        expect(validateRateLimitString('   ')).toBeUndefined();
        expect(validateRateLimitString('12345678901234567')).toBe('1234567890123456');
    });

    it('validateTrimTimestamp rejects long strings', () => {
        expect(validateTrimTimestamp(`0:00:01${'x'.repeat(30)}`)).toBeUndefined();
    });

    it('validateOutputFilenameTemplate rejects long and null byte', () => {
        expect(validateOutputFilenameTemplate('a'.repeat(201))).toBeUndefined();
        expect(validateOutputFilenameTemplate('ok\u0000')).toBeUndefined();
    });
});

describe('applyStructuredDownloadCapabilities guards', () => {
    it('no-ops on undefined capabilities', () => {
        const a: string[] = [];
        applyStructuredDownloadCapabilities(a, undefined);
        expect(a).toEqual([]);
    });

    it('skips sponsorblock off and partial trim', () => {
        const a: string[] = [];
        applyStructuredDownloadCapabilities(a, {
            sponsorblock: { mode: 'off', categories: [] },
            trim: { start: '0:00:01', end: '' }
        });
        expect(a).toEqual([]);
    });

    it('does not emit sponsor argv when mode is neither mark nor remove', () => {
        const a: string[] = [];
        applyStructuredDownloadCapabilities(a, {
            sponsorblock: { mode: 'neither' as never, categories: ['sponsor'] }
        });
        expect(a).toEqual([]);
    });
});

describe('normalizeMergedCapabilities network', () => {
    it('passes through network rate limit', () => {
        const merged = sanitizeDownloadEngineCapabilities({
            network: { rateLimit: '1M' }
        });
        expect(normalizeMergedCapabilities(merged)?.network?.rateLimit).toBe('1M');
    });
});

describe('sanitizeAdvancedDownloadDefaultsPatch exhaustive', () => {
    it('ignores subtitles block when not an object', () => {
        expect(sanitizeAdvancedDownloadDefaultsPatch({ subtitles: 'x' as never })).toBeUndefined();
    });

    it('subtitles object with languages only', () => {
        expect(
            sanitizeAdvancedDownloadDefaultsPatch({
                subtitles: { languages: ['en'] }
            })
        ).toEqual({ subtitles: { languages: ['en'] } });
    });

    it('subtitles drops invalid mode', () => {
        expect(
            sanitizeAdvancedDownloadDefaultsPatch({
                subtitles: { mode: 'bogus', languages: ['de'] }
            })
        ).toEqual({ subtitles: { languages: ['de'] } });
    });

    it('subtitles object with invalid mode and no languages yields no patch', () => {
        expect(
            sanitizeAdvancedDownloadDefaultsPatch({
                subtitles: { mode: 'bogus' }
            })
        ).toBeUndefined();
    });

    it('output and network partial branches', () => {
        expect(sanitizeAdvancedDownloadDefaultsPatch({ output: 'x' as never })).toBeUndefined();
        expect(
            sanitizeAdvancedDownloadDefaultsPatch({
                output: { videoContainer: 'bogus', audioFormat: 'flac' }
            })
        ).toEqual({ output: { audioFormat: 'flac' } });
        expect(
            sanitizeAdvancedDownloadDefaultsPatch({
                network: { rateLimit: '  1M  ' }
            })
        ).toEqual({ network: { rateLimit: '1M' } });
        expect(
            sanitizeAdvancedDownloadDefaultsPatch({
                network: { rateLimit: 1 as never }
            })
        ).toBeUndefined();
    });

    it('proxy profileId-only and sponsorblock categories-only', () => {
        expect(
            sanitizeAdvancedDownloadDefaultsPatch({
                proxy: { profileId: 'pid' }
            })
        ).toEqual({ proxy: { profileId: 'pid' } });
        expect(
            sanitizeAdvancedDownloadDefaultsPatch({
                sponsorblock: { categories: ['outro'] }
            })
        ).toEqual({ sponsorblock: { categories: ['outro'] } });
    });

    it('archive edge keys; legacy trim is ignored', () => {
        expect(
            sanitizeAdvancedDownloadDefaultsPatch({
                trim: { start: ' 0:00:01 ', end: '0:00:02' }
            })
        ).toBeUndefined();
        expect(
            sanitizeAdvancedDownloadDefaultsPatch({
                archive: { enabled: false }
            })
        ).toEqual({ archive: { enabled: false } });
        expect(sanitizeAdvancedDownloadDefaultsPatch({ archive: {} })).toBeUndefined();
    });

    it('subtitles patch without languages array uses mode only', () => {
        expect(
            sanitizeAdvancedDownloadDefaultsPatch({
                subtitles: { mode: 'sidecar' }
            })
        ).toEqual({ subtitles: { mode: 'sidecar' } });
    });

    it('drops empty output, proxy, sponsorblock shell; ignores legacy trim', () => {
        expect(sanitizeAdvancedDownloadDefaultsPatch({ output: {} })).toBeUndefined();
        expect(sanitizeAdvancedDownloadDefaultsPatch({ proxy: {} })).toBeUndefined();
        expect(sanitizeAdvancedDownloadDefaultsPatch({ sponsorblock: {} })).toBeUndefined();
        expect(sanitizeAdvancedDownloadDefaultsPatch({ sponsorblock: { mode: 'mark' } })).toEqual({
            sponsorblock: { mode: 'mark' }
        });
        expect(
            sanitizeAdvancedDownloadDefaultsPatch({
                trim: { enabled: true, start: 1 as never, end: 2 as never }
            })
        ).toBeUndefined();
        expect(sanitizeAdvancedDownloadDefaultsPatch({ trim: {} })).toBeUndefined();
    });
});

describe('sanitizeDownloadEngineCapabilities more keys', () => {
    it('ignores non-object top-level sections', () => {
        expect(
            sanitizeDownloadEngineCapabilities({
                sponsorblock: { mode: 'remove', categories: ['sponsor'] },
                subtitles: 'bad' as never,
                embedding: null as never,
                output: 1 as never,
                network: true as never,
                proxy: [] as never
            })
        ).toEqual({
            sponsorblock: { mode: 'remove', categories: ['sponsor'] }
        });
    });

    it('sponsorblock object with missing mode', () => {
        expect(
            sanitizeDownloadEngineCapabilities({
                sponsorblock: { categories: ['filler'] }
            })
        ).toBeUndefined();
    });

    it('sponsorblock ignores non-string mode', () => {
        expect(
            sanitizeDownloadEngineCapabilities({
                sponsorblock: { mode: 1 as never, categories: ['sponsor'] }
            })
        ).toBeUndefined();
    });

    it('subtitles drops languages when all entries sanitize empty', () => {
        expect(
            sanitizeDownloadEngineCapabilities({
                subtitles: { mode: 'sidecar', languages: ['', '   ', 1 as never] }
            })
        ).toEqual({ subtitles: { mode: 'sidecar' } });
    });
});

describe('applyStructuredDownloadCapabilities trim validation', () => {
    it('skips download-sections when timestamps fail validation', () => {
        const args: string[] = [];
        applyStructuredDownloadCapabilities(args, {
            trim: { start: '0:00:01', end: 'not-valid' }
        });
        expect(args).toEqual([]);
    });
});

describe('mergeAdvancedDownloadDefaultsStored previous normalization', () => {
    it('normalizes non-object previous before merging patch', () => {
        const merged = mergeAdvancedDownloadDefaultsStored(null, {
            network: { rateLimit: '3M' }
        });
        expect(merged.network.rateLimit).toBe('3M');
    });
});

describe('buildApplyCapabilitiesContext default profile id', () => {
    it('uses default when proxy enabled without profileId', () => {
        let seen = '';
        const ctx = buildApplyCapabilitiesContext({ proxy: { enabled: true } }, (id) => {
            seen = id;
            return 'http://p';
        });
        expect(seen).toBe('default');
        expect(ctx.resolvedProxyUrl).toBe('http://p');
    });
});

describe('mergeDownloadCapabilityLayers', () => {
    it('returns a shallow copy when overlay is undefined', () => {
        const base = sanitizeDownloadEngineCapabilities({
            network: { rateLimit: '1M' }
        });
        if (!base) {
            throw new Error('expected capabilities');
        }
        const copy = mergeDownloadCapabilityLayers(base, undefined);
        expect(copy).toEqual(base);
        expect(copy).not.toBe(base);
    });

    it('merges every overlay section over sparse base', () => {
        const overlay = sanitizeDownloadEngineCapabilities({
            sponsorblock: { mode: 'mark', categories: ['intro'] },
            trim: { start: '0:00:01', end: '0:00:03' },
            archive: { enabled: true },
            subtitles: { mode: 'sidecar', languages: ['fr'] },
            embedding: { chapters: true },
            output: { videoContainer: 'webm', audioFormat: 'ogg' },
            network: { rateLimit: '2M' },
            proxy: { enabled: true, profileId: 'p' }
        });
        if (!overlay) {
            throw new Error('expected overlay');
        }
        const merged = mergeDownloadCapabilityLayers(
            {
                sponsorblock: { mode: 'off', categories: [] },
                subtitles: { mode: 'off', languages: ['en'] }
            },
            overlay
        );
        expect(merged.sponsorblock?.mode).toBe('mark');
        expect(merged.trim).toEqual({ start: '0:00:01', end: '0:00:03' });
        expect(merged.archive).toEqual({ enabled: true });
        expect(merged.subtitles).toEqual({ mode: 'sidecar', languages: ['fr'] });
        expect(merged.embedding?.chapters).toBe(true);
        expect(merged.output?.videoContainer).toBe('webm');
        expect(merged.network?.rateLimit).toBe('2M');
        expect(merged.proxy?.enabled).toBe(true);
    });

    it('inherits base subtitle languages when overlay omits them', () => {
        const merged = mergeDownloadCapabilityLayers(
            { subtitles: { mode: 'embed', languages: ['de'] } },
            { subtitles: { mode: 'sidecar' } }
        );
        expect(merged.subtitles).toEqual({ mode: 'sidecar', languages: ['de'] });
    });
});
