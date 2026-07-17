/**
 * When remux-to-MP4 fails (ffmpeg merge/postprocess), retry once with `--recode-video mp4`.
 * Skips obvious non-codec errors (geo, auth, takedown).
 */
export function shouldRetryVideoWithRecode(stderr: string, exitCode: number | null): boolean {
    if (exitCode === 0) {
        return false;
    }
    if (isPermanentDownloadFailure(stderr, exitCode)) {
        return false;
    }
    const s = stderr.toLowerCase();
    return (
        s.includes('ffmpeg exited') ||
        s.includes('error: ffmpeg') ||
        s.includes('conversion failed') ||
        s.includes('could not find tag for codec') ||
        s.includes('could not write header') ||
        s.includes('invalid data found when processing input') ||
        s.includes('merging formats failed') ||
        s.includes('error merging') ||
        (s.includes('postprocessor') && s.includes('error')) ||
        (s.includes('merge') && s.includes('failed'))
    );
}

/** Permanent / content-level failures where retrying is pointless and partials should be deleted. */
export function isPermanentDownloadFailure(stderr: string, exitCode: number | null): boolean {
    if (exitCode === 0) {
        return false;
    }
    const s = stderr.toLowerCase();
    return (
        s.includes('private video') ||
        s.includes('video unavailable') ||
        s.includes('this video is not available') ||
        s.includes('removed by the uploader') ||
        s.includes('sign in to confirm') ||
        s.includes('login required') ||
        s.includes('http error 403') ||
        s.includes('http error 404') ||
        s.includes('copyright') ||
        s.includes('this video is blocked') ||
        s.includes('video is blocked') ||
        s.includes('age-restricted') ||
        s.includes('members-only') ||
        s.includes('requested format is not available') ||
        s.includes('unsupported url')
    );
}

/**
 * HTTP 416 / range-not-satisfiable: the server rejected the resume offset. The stale `.part` must
 * be discarded and yt-dlp re-run with `--no-continue` (one shot) to restart from byte 0.
 */
export function isNonResumableRangeFailure(stderr: string, exitCode: number | null): boolean {
    if (exitCode === 0) {
        return false;
    }
    const s = stderr.toLowerCase();
    return s.includes('http error 416') || s.includes('requested range not satisfiable');
}

/** HTTP 429 / too-many-requests — retryable with a short cap, then treated as terminal. */
export function isRateLimitedFailure(stderr: string, exitCode: number | null): boolean {
    if (exitCode === 0) {
        return false;
    }
    const s = stderr.toLowerCase();
    return s.includes('http error 429') || s.includes('too many requests');
}

/**
 * When a download fails on a TRANSIENT network condition (connection dropped, timeout, DNS, 5xx,
 * or rate-limit 429), the `.part`/fragments are still valid — the download should be re-spawned to
 * resume via `--continue` rather than deleted. Excludes PERMANENT failures (removed/private video,
 * 403/404, geo/age/members blocks) where retrying is pointless and artifacts should be cleaned.
 * HTTP 429 is retryable but capped separately (see MAX_RATE_LIMIT_RESUME_ATTEMPTS).
 */
export function shouldRetryTransientNetwork(stderr: string, exitCode: number | null): boolean {
    if (exitCode === 0) {
        return false;
    }
    if (isPermanentDownloadFailure(stderr, exitCode)) {
        return false;
    }
    if (isRateLimitedFailure(stderr, exitCode)) {
        return true;
    }
    const s = stderr.toLowerCase();
    // Transient network / server signatures worth resuming.
    return (
        s.includes('timed out') ||
        s.includes('timeout') ||
        s.includes('connection reset') ||
        s.includes('connection refused') ||
        s.includes('connection aborted') ||
        s.includes('connection broken') ||
        s.includes('broken pipe') ||
        s.includes('remote end closed connection') ||
        s.includes('network is unreachable') ||
        s.includes('no route to host') ||
        s.includes('temporary failure in name resolution') ||
        s.includes('name or service not known') ||
        s.includes('getaddrinfo') ||
        s.includes('unable to connect') ||
        s.includes('unable to download') ||
        s.includes('incomplete read') ||
        s.includes('content too short') ||
        s.includes('max retries exceeded') ||
        s.includes('http error 5') ||
        s.includes('[errno') ||
        s.includes('urlopen error') ||
        s.includes('ssl') ||
        s.includes('yt-dlp worker process') ||
        s.includes('worker process shut down') ||
        s.includes('worker process exited unexpectedly')
    );
}
