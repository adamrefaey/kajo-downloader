import { describe, expect, it } from 'vitest';
import {
    isNonResumableRangeFailure,
    isPermanentDownloadFailure,
    isRateLimitedFailure,
    shouldRetryTransientNetwork,
    shouldRetryVideoWithRecode
} from './retryLogic';

describe('isNonResumableRangeFailure', () => {
    it('detects HTTP 416 and range-not-satisfiable errors', () => {
        expect(
            isNonResumableRangeFailure('HTTP Error 416: Requested Range Not Satisfiable', 1)
        ).toBe(true);
        expect(
            isNonResumableRangeFailure('unable to download: requested range not satisfiable', 1)
        ).toBe(true);
    });

    it('returns false on success and unrelated errors', () => {
        expect(isNonResumableRangeFailure('HTTP Error 416', 0)).toBe(false);
        expect(isNonResumableRangeFailure('connection reset', 1)).toBe(false);
    });
});

describe('isPermanentDownloadFailure', () => {
    it('returns false on success', () => {
        expect(isPermanentDownloadFailure('Video unavailable', 0)).toBe(false);
    });

    it('classifies permanent content failures', () => {
        const permanent = [
            'ERROR: [youtube] xyz: Video unavailable',
            'ERROR: Private video. Sign in to confirm access',
            'HTTP Error 404: Not Found',
            'ERROR: Unsupported URL: https://example.com/x'
        ];
        for (const msg of permanent) {
            expect(isPermanentDownloadFailure(msg, 1)).toBe(true);
        }
    });

    it('does not classify transient or unknown errors as permanent', () => {
        expect(isPermanentDownloadFailure('Connection timed out', 1)).toBe(false);
        expect(isPermanentDownloadFailure('ERROR: something weird happened', 1)).toBe(false);
    });
});

describe('shouldRetryTransientNetwork', () => {
    it('returns false on success', () => {
        expect(shouldRetryTransientNetwork('Connection timed out', 0)).toBe(false);
    });

    it('treats transient network/server failures as retryable', () => {
        const transient = [
            'ERROR: unable to download video data: The read operation timed out',
            '[download] Got error: [Errno 54] Connection reset by peer',
            'urlopen error [Errno 8] nodename nor servname provided',
            'ERROR: Unable to connect to proxy',
            'HTTP Error 503: Service Unavailable',
            'getaddrinfo failed',
            'Temporary failure in name resolution',
            'ssl.SSLError: read operation timed out',
            'Network is unreachable',
            'incomplete read'
        ];
        for (const msg of transient) {
            expect(shouldRetryTransientNetwork(msg, 1)).toBe(true);
        }
    });

    it('treats permanent/content failures as NOT retryable (partials are deleted only when permanent)', () => {
        const permanent = [
            'ERROR: [youtube] xyz: Video unavailable',
            'ERROR: Private video. Sign in to confirm access',
            'ERROR: This video has been removed by the uploader',
            'HTTP Error 404: Not Found',
            'ERROR: members-only content',
            'ERROR: Requested format is not available',
            'ERROR: Unsupported URL: https://example.com/x'
        ];
        for (const msg of permanent) {
            expect(shouldRetryTransientNetwork(msg, 1)).toBe(false);
        }
    });

    it('treats HTTP 429 as transient (capped separately) so partials are kept', () => {
        expect(shouldRetryTransientNetwork('HTTP Error 429: Too Many Requests', 1)).toBe(true);
        expect(isPermanentDownloadFailure('HTTP Error 429: Too Many Requests', 1)).toBe(false);
        expect(isRateLimitedFailure('HTTP Error 429: Too Many Requests', 1)).toBe(true);
        expect(isRateLimitedFailure('too many requests from server', 1)).toBe(true);
        expect(isRateLimitedFailure('HTTP Error 429: Too Many Requests', 0)).toBe(false);
        expect(isRateLimitedFailure('Connection reset', 1)).toBe(false);
    });

    it('returns false for an unrecognized non-network error', () => {
        expect(shouldRetryTransientNetwork('ERROR: something weird happened', 1)).toBe(false);
    });

    it('prioritizes permanent signal even if a transient word also appears', () => {
        expect(
            shouldRetryTransientNetwork('HTTP Error 404: Not Found; connection timed out', 1)
        ).toBe(false);
    });
});

describe('isRateLimitedFailure edge cases', () => {
    it('returns false on success exit code', () => {
        expect(isRateLimitedFailure('HTTP Error 429', 0)).toBe(false);
    });
});

describe('shouldRetryVideoWithRecode', () => {
    it('returns false on success and permanent failures', () => {
        expect(shouldRetryVideoWithRecode('ffmpeg exited', 0)).toBe(false);
        expect(shouldRetryVideoWithRecode('Video unavailable', 1)).toBe(false);
    });

    it('returns true for ffmpeg merge/postprocess failures', () => {
        const cases = [
            'ERROR: ffmpeg exited with code 1',
            'error: ffmpeg codec not found',
            'conversion failed!',
            'could not find tag for codec mp4a',
            'could not write header for output file',
            'invalid data found when processing input',
            'Merging formats failed',
            'error merging video and audio',
            'Some merge failed badly',
            'Postprocessor error while muxing'
        ];
        for (const stderr of cases) {
            expect(shouldRetryVideoWithRecode(stderr, 1)).toBe(true);
        }
    });
});
