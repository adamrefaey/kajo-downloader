import { describe, expect, it } from 'vitest';
import {
    stripInternalEngineNames,
    userFacingDownloadFailureMessage,
    userFacingMetadataProbeMessage
} from '../electron/services/userFacingEngineErrors';

describe('userFacingEngineErrors', () => {
    it('stripInternalEngineNames removes tool names', () => {
        expect(stripInternalEngineNames('yt-dlp exited with code 1')).toBe('exited with code 1');
        expect(stripInternalEngineNames('FFmpeg merge failed')).toBe('merge failed');
        expect(stripInternalEngineNames('ytdlp failed')).toBe('failed');
    });

    it('stripInternalEngineNames tightens whitespace before punctuation', () => {
        expect(stripInternalEngineNames('oops  , try')).toBe('oops, try');
        expect(stripInternalEngineNames('a  ; b')).toBe('a; b');
    });

    it('userFacingDownloadFailureMessage falls back when empty', () => {
        expect(userFacingDownloadFailureMessage('')).toBe('The download could not be completed.');
        expect(userFacingDownloadFailureMessage('yt-dlp')).toBe(
            'The download could not be completed.'
        );
        expect(userFacingDownloadFailureMessage(undefined)).toBe(
            'The download could not be completed.'
        );
        expect(userFacingDownloadFailureMessage('  works now  ')).toBe('works now');
    });

    it('userFacingMetadataProbeMessage', () => {
        expect(userFacingMetadataProbeMessage('')).toBe('Could not load details for this link.');
        expect(userFacingMetadataProbeMessage('Private video')).toBe('Private video');
        expect(userFacingMetadataProbeMessage('x')).toBe('Could not load details for this link.');
        expect(userFacingMetadataProbeMessage('yt-dlp')).toBe(
            'Could not load details for this link.'
        );
    });
});
