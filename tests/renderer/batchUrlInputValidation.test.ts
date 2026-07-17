/** @vitest-environment jsdom */

import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import i18n from '../../src/i18n/rendererI18n';
import { getMultilineBatchValidationMessage } from '../../src/renderer/src/lib/batchUrlInputValidation';
import * as mediaUrlResolver from '../../src/shared/mediaUrlResolver';

beforeAll(async () => {
    await i18n.changeLanguage('en');
});

afterEach(() => {
    vi.restoreAllMocks();
});

describe('getMultilineBatchValidationMessage', () => {
    it('returns null for zero or one line', () => {
        expect(getMultilineBatchValidationMessage([])).toBeNull();
        expect(getMultilineBatchValidationMessage(['https://youtu.be/x'])).toBeNull();
    });

    it('returns null for two valid single-video YouTube URLs', () => {
        expect(
            getMultilineBatchValidationMessage([
                'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
                'https://youtu.be/dQw4w9WgXcQ'
            ])
        ).toBeNull();
    });

    it('skips empty middle entries and still validates remaining lines', () => {
        expect(
            getMultilineBatchValidationMessage([
                'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
                '',
                'https://youtu.be/dQw4w9WgXcQ'
            ])
        ).toBeNull();
    });

    it('rejects invalid http(s) URL on a line', () => {
        const msg = getMultilineBatchValidationMessage([
            'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
            'not-a-valid-url'
        ]);
        expect(msg).toMatch(/Line 2/i);
        expect(msg).toMatch(/http/i);
    });

    it('rejects prohibited host on a line', () => {
        const msg = getMultilineBatchValidationMessage([
            'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
            'https://www.pornhub.com/view_video.php?viewkey=x'
        ]);
        expect(msg).toMatch(/Line 2/i);
        expect(msg).toMatch(/not allowed|host/i);
    });

    it('rejects unsupported YouTube shape on a line', () => {
        const msg = getMultilineBatchValidationMessage([
            'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
            'https://www.youtube.com/'
        ]);
        expect(msg).toMatch(/Line 2/i);
        expect(msg).toMatch(/YouTube/i);
    });

    it('allows playlist URL on a line in a multiline batch', () => {
        expect(
            getMultilineBatchValidationMessage([
                'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
                'https://www.youtube.com/playlist?list=PLrAXtmErZgOeiKm4sgNOknGvNjby9efdf'
            ])
        ).toBeNull();
    });

    it('uses generic unsupported copy when resolution is unsupported without YouTube profile', () => {
        const originalResolve = mediaUrlResolver.resolveMediaInputUrl;
        vi.spyOn(mediaUrlResolver, 'resolveMediaInputUrl').mockImplementation((raw: string) => {
            if (raw.includes('second-line.test')) {
                return {
                    siteProfile: undefined,
                    candidateMode: 'unsupported',
                    youtubeBatchKind: undefined
                };
            }
            return originalResolve(raw);
        });
        const msg = getMultilineBatchValidationMessage([
            'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
            'https://example.com/second-line.test'
        ]);
        expect(msg).toMatch(/Line 2/i);
        expect(msg).toMatch(/unsupported/i);
        expect(msg).not.toMatch(/YouTube/i);
    });
});
