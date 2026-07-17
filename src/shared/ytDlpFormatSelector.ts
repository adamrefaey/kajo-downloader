/**
 * Allows yt-dlp format selector syntax: alphanumeric and chars used in filter expressions
 * (`[height<=1080]`, `+`, `/`, etc.). No shell metacharacters; argv is passed via spawn array.
 */
export const YT_DLP_FORMAT_SELECTOR_RE: RegExp = /^[a-zA-Z0-9+\-/[\]<>=.,@_]+$/;
