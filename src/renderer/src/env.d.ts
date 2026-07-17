/// <reference types="vite/client" />

declare module '*.module.css' {
    const classes: Readonly<Record<string, string>>;
    export default classes;
}

/** Injected by `electron.vite.config.ts`; always `prod` in production builds. */
declare const __KAJO_APP_ENV__: 'dev' | 'prod';
/** Public marketing site URL (e.g. `https://github.com/adamrefaey/kajo-downloader`) baked at build time from `KAJO_WEBSITE_URL`. */
declare const __KAJO_WEBSITE_URL__: string;
/** Registrable domain extracted from `__KAJO_WEBSITE_URL__` (lowercased, e.g. `github.com`). */
declare const __KAJO_WEBSITE_DOMAIN__: string;
