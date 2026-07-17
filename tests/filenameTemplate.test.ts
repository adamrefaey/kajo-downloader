import { describe, expect, it } from 'vitest';
import {
    BUILTIN_TEMPLATES,
    buildTemplateContext,
    renderFilenameTemplate,
    type TemplateContext,
    toYtdlpTemplate,
    validateFilenameTemplate
} from '../electron/services/filenameTemplate';

const sample: TemplateContext = {
    title: 'T',
    channel: 'C',
    uploadDate: '',
    platform: 'youtube',
    duration: '',
    resolution: '',
    ext: 'mp4',
    id: 'id1'
};

describe('filenameTemplate', () => {
    it('exposes built-in template keys', () => {
        expect(Object.keys(BUILTIN_TEMPLATES).sort()).toEqual(
            ['dated', 'default', 'detailed', 'organized'].sort()
        );
    });

    describe('toYtdlpTemplate', () => {
        it('maps known placeholders and resolution height', () => {
            expect(toYtdlpTemplate('{{title}} — {{resolution}}')).toBe('%(title)s — %(height)sp');
        });

        it('leaves unknown placeholders unchanged', () => {
            expect(toYtdlpTemplate('{{title}}_{{unknown}}')).toBe('%(title)s_{{unknown}}');
        });
    });

    describe('renderFilenameTemplate', () => {
        it('substitutes known vars and keeps unknown tokens', () => {
            expect(renderFilenameTemplate('{{title}}_{{nope}}', sample)).toBe('T_{{nope}}');
        });

        it('treats defined-but-empty placeholder values as empty segments', () => {
            const ctx = {
                ...sample,
                title: undefined as unknown as string
            };
            expect(renderFilenameTemplate('{{title}}', ctx)).toBe('');
        });

        it('sanitises each path segment and preserves slashes', () => {
            expect(
                renderFilenameTemplate('a/b:bad', {
                    ...sample,
                    title: 'x',
                    channel: 'y'
                })
            ).toBe('a/bbad');
        });

        it('filters empty segments after sanitise', () => {
            expect(renderFilenameTemplate(':::{{title}}', { ...sample, title: 'ok' })).toBe('ok');
        });
    });

    describe('validateFilenameTemplate', () => {
        it('rejects empty template', () => {
            expect(validateFilenameTemplate('   ')).toEqual({
                valid: false,
                error: 'Template cannot be empty'
            });
        });

        it('rejects unknown variables', () => {
            const r = validateFilenameTemplate('{{title}}_{{nope}}');
            expect(r.valid).toBe(false);
            expect(r.error).toContain('nope');
        });

        it('rejects template that renders to empty', () => {
            expect(validateFilenameTemplate('::::')).toEqual({
                valid: false,
                error: 'Template produces an empty filename'
            });
        });

        it('returns preview for valid template', () => {
            const r = validateFilenameTemplate('{{channel}}/{{title}}');
            expect(r.valid).toBe(true);
            expect(r.preview).toContain('My Channel');
        });
    });

    describe('buildTemplateContext', () => {
        it('formats duration with hours when long enough', () => {
            const ctx = buildTemplateContext({
                title: 'a',
                channel: 'b',
                durationSeconds: 3665
            });
            expect(ctx.duration).toBe('1:01:05');
        });

        it('formats duration without leading hour when under one hour', () => {
            const ctx = buildTemplateContext({
                durationSeconds: 125
            });
            expect(ctx.duration).toBe('2:05');
        });

        it('leaves duration empty when seconds missing or non-positive', () => {
            expect(buildTemplateContext({ durationSeconds: null }).duration).toBe('');
            expect(buildTemplateContext({ durationSeconds: 0 }).duration).toBe('');
        });

        it('normalises uploadDate, extractor, ext, id, resolution', () => {
            const ctx = buildTemplateContext({
                uploadDate: '2024-03-15T00:00:00Z',
                extractor: 'YouTube:Tab',
                ext: '.MKV',
                id: '  z  ',
                videoHeight: 720
            });
            expect(ctx.uploadDate).toBe('20240315');
            expect(ctx.platform).toBe('youtube');
            expect(ctx.ext).toBe('MKV');
            expect(ctx.id).toBe('z');
            expect(ctx.resolution).toBe('720p');
        });

        it('uses fallbacks for missing metadata', () => {
            const ctx = buildTemplateContext({});
            expect(ctx.title).toBe('Unknown');
            expect(ctx.channel).toBe('Unknown');
            expect(ctx.platform).toBe('unknown');
            expect(ctx.ext).toBe('mp4');
        });
    });
});
