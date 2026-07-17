import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
    assertBtbnAssetMatchesPolicy,
    compareCalver,
    isMonthEndAutobuildTag,
    pickBtbnReleaseLineAssetName,
    validateBinaryPins
} from '../scripts/lib/binaryPins.mjs';

const pinsPath = join(import.meta.dirname, '..', 'scripts', 'binary-pins.json');

describe('binaryPins', () => {
    it('accepts the committed binary-pins.json', () => {
        const pins = JSON.parse(readFileSync(pinsPath, 'utf8'));
        expect(() => validateBinaryPins(pins)).not.toThrow();
        expect(pins.ffmpegBtbn.releaseLine).toBe('8.1');
        expect(isMonthEndAutobuildTag(pins.ffmpegBtbn.tag)).toBe(true);
    });

    it('rejects master N-* ffmpeg assets', () => {
        expect(() =>
            assertBtbnAssetMatchesPolicy(
                'ffmpeg-N-125628-ga5e6c0175a-linux64-gpl.tar.xz',
                'linux-x64',
                '8.1'
            )
        ).toThrow(/release-line/);
    });

    it('rejects floating -latest- assets', () => {
        expect(() =>
            assertBtbnAssetMatchesPolicy(
                'ffmpeg-n8.1-latest-linux64-gpl-8.1.tar.xz',
                'linux-x64',
                '8.1'
            )
        ).toThrow(/latest/);
    });

    it('accepts release-line GPL asset names', () => {
        expect(() =>
            assertBtbnAssetMatchesPolicy(
                'ffmpeg-n8.1.2-21-gce3c09c101-linux64-gpl-8.1.tar.xz',
                'linux-x64',
                '8.1'
            )
        ).not.toThrow();
        expect(() =>
            assertBtbnAssetMatchesPolicy(
                'ffmpeg-n8.1-11-g75d37c499d-win64-gpl-8.1.zip',
                'win32-x64',
                '8.1'
            )
        ).not.toThrow();
    });

    it('picks release-line assets from a release asset list', () => {
        const assets = [
            { name: 'ffmpeg-N-125628-ga5e6c0175a-linux64-gpl.tar.xz' },
            { name: 'ffmpeg-n8.1-latest-linux64-gpl-8.1.tar.xz' },
            { name: 'ffmpeg-n8.1.2-21-gce3c09c101-linux64-gpl-8.1.tar.xz' },
            { name: 'ffmpeg-n8.1.2-21-gce3c09c101-linux64-lgpl-8.1.tar.xz' }
        ];
        expect(pickBtbnReleaseLineAssetName(assets, 'linux-x64', '8.1')).toBe(
            'ffmpeg-n8.1.2-21-gce3c09c101-linux64-gpl-8.1.tar.xz'
        );
    });

    it('detects month-end autobuild tags', () => {
        expect(isMonthEndAutobuildTag('autobuild-2026-06-30-13-34')).toBe(true);
        expect(isMonthEndAutobuildTag('autobuild-2026-06-20-13-30')).toBe(false);
        expect(isMonthEndAutobuildTag('latest')).toBe(false);
    });

    it('compares CalVer tags', () => {
        expect(compareCalver('2026.07.04', '2025.03.26')).toBeGreaterThan(0);
        expect(compareCalver('2025.03.26', '2025.03.26')).toBe(0);
        expect(compareCalver('2024.01.01', '2025.03.26')).toBeLessThan(0);
    });

    it('rejects non-month-end ffmpegBtbn tags', () => {
        const pins = JSON.parse(readFileSync(pinsPath, 'utf8'));
        pins.ffmpegBtbn.tag = 'autobuild-2026-06-20-13-30';
        expect(() => validateBinaryPins(pins)).toThrow(/month-end/);
    });

    it('rejects pins missing releaseLine', () => {
        const pins = JSON.parse(readFileSync(pinsPath, 'utf8'));
        delete pins.ffmpegBtbn.releaseLine;
        expect(() => validateBinaryPins(pins)).toThrow(/releaseLine/);
    });
});
