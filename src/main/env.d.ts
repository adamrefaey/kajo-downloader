/// <reference types="electron-vite/node" />

/** Injected by `electron.vite.config.ts`; always `prod` in production builds. */
declare const __KAJO_APP_ENV__: 'dev' | 'prod';
/**
 * Public marketing website URL baked at build time from `KAJO_WEBSITE_URL`
 * (default: `https://github.com/adamrefaey/kajo-downloader`). Normalized: `https://<host>[/path]`, no
 * trailing slash. Use for openExternal allowlisting and derived public URLs.
 */
declare const __KAJO_WEBSITE_URL__: string;
/** Registrable domain extracted from `__KAJO_WEBSITE_URL__` (lowercased). */
declare const __KAJO_WEBSITE_DOMAIN__: string;
