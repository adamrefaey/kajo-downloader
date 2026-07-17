export const PROCESS_FORCE_KILL_DELAY_MS: number = 5_000;
export const IS_WIN: boolean = process.platform === 'win32';

/** No yt-dlp stdout/stderr for this long during the network phase → stall-kill and resume. */
export const NETWORK_STALL_WINDOW_MS: number = 5 * 60 * 1000; // 5 minutes

/** ffmpeg merge/postprocess is silent — allow a much longer idle window before stall-kill. */
export const MERGE_STALL_WINDOW_MS: number = 30 * 60 * 1000; // 30 minutes

/** How often the stall watchdog re-checks activity while a download is in flight. */
export const STALL_WATCHDOG_POLL_MS: number = 30_000; // 30 seconds

/** Base delay before re-spawning after a transient network failure. */
export const RESUME_BACKOFF_BASE_MS: number = 2_000;

/** Maximum delay between auto-resume attempts during a long outage. */
export const RESUME_BACKOFF_CAP_MS: number = 60_000;

/**
 * Cap on automatic `--continue` re-spawns after transient network failures.
 * Progress advancement resets the counter (see `resetDownloadStateForRetry`).
 */
export const MAX_NETWORK_RESUME_ATTEMPTS: number = 15;

/**
 * Stricter cap when the failure is HTTP 429 (rate limit). Prevents retry storms
 * that would otherwise burn attempts up to {@link MAX_NETWORK_RESUME_ATTEMPTS}.
 */
export const MAX_RATE_LIMIT_RESUME_ATTEMPTS: number = 3;

export const DEFAULT_COMMAND_TIMEOUT_MS: number = 60_000;
