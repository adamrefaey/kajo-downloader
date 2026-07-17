export interface SetupStatus {
    ytdlpInstalled: boolean;
    ffmpegInstalled: boolean;
    homebrewInstalled: boolean;
    /** First CalVer token from `yt-dlp --version`, or null if missing / unreadable. */
    ytdlpVersion: string | null;
    /** When installed, false if a parsed version is below `MIN_YTDLP_VERSION` in `ytdlpVersionPolicy.ts`. */
    ytdlpMeetsMinimumVersion: boolean;
    ytdlpReady: boolean;
}
