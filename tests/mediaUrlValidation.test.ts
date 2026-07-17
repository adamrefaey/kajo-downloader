/** @vitest-environment jsdom */

import { beforeAll, describe, expect, it } from 'vitest';
import i18n from '../src/i18n/rendererI18n';
import { getMediaUrlValidationMessage } from '../src/renderer/src/lib/mediaUrlValidation';
import type { MediaUrlResolution } from '../src/shared/mediaUrlResolver';

describe('getMediaUrlValidationMessage', () => {
    beforeAll(async () => {
        await i18n.changeLanguage('en');
    });

    it('returns null for empty input', () => {
        expect(getMediaUrlValidationMessage('')).toBeNull();
        expect(getMediaUrlValidationMessage('   ')).toBeNull();
    });

    it('rejects non-http(s) URLs', () => {
        expect(getMediaUrlValidationMessage('ftp://example.com/a')).toMatch(/http/i);
    });

    it('accepts generic https URLs', () => {
        expect(getMediaUrlValidationMessage('https://example.com/watch?v=1')).toBeNull();
    });

    it('uses YouTube-specific message for bad YouTube URLs', () => {
        expect(getMediaUrlValidationMessage('https://www.youtube.com/')).toMatch(/YouTube/i);
    });

    it('rejects prohibited adult hosts', () => {
        const msg = getMediaUrlValidationMessage(
            'https://www.pornhub.com/view_video.php?viewkey=x'
        );
        expect(msg).toBeTruthy();
        expect(msg).not.toMatch(/YouTube/i);
    });

    it('uses generic unsupported copy when resolution is unsupported without YouTube profile', () => {
        const resolution: MediaUrlResolution = {
            siteProfile: undefined,
            candidateMode: 'unsupported',
            youtubeBatchKind: undefined
        };
        const msg = getMediaUrlValidationMessage(
            'https://www.dailymotion.com/video/foo',
            resolution
        );
        expect(msg).toBeTruthy();
        expect(msg).not.toMatch(/YouTube/i);
    });
});
