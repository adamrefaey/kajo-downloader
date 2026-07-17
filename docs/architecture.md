# Architecture overview

High-level structure of the Kajo Downloader Electron app. For build and test workflows, see [`building.md`](building.md) and [`testing.md`](testing.md).

## Process model

- **Main process** — IPC handlers, filesystem access, yt-dlp/ffmpeg orchestration, download queue, in-app search, download history, site-auth (sign-in) management, and auto-update.
- **Custom protocol** — [`electron/customProtocol.ts`](../electron/customProtocol.ts) registers `kajo-app://` as a privileged scheme and serves the renderer bundle from it in production. This narrows the renderer's origin to `kajo-app://localhost` (tighter CSP, no `file://` surface).
- **Preload** — Exposes a typed `window.api` bridge (via `createRendererApi`). Context isolation is enforced; the preload refuses to bind if `process.contextIsolated` is `false`.
- **Renderer** — React 19 UI, Zustand 5 stores, `i18next` / `react-i18next` i18n (11 locales in [`src/i18n/supportedLocales.ts`](../src/i18n/supportedLocales.ts)).

## Local persistence (userData)

[`electron/lib/configureUserDataPaths.ts`](../electron/lib/configureUserDataPaths.ts) runs as the first main-process import and pins paths before `ready`:

| Path | Location |
|---|---|
| `userData` | Packaged: `…/kajo-downloader`; unpackaged: `…/kajo-downloader-dev` (or `KAJO_USER_DATA`) |
| `sessionData` | `<userData>/session` — Chromium cookies / HTTP cache |
| logs | `<userData>/logs` via `app.setAppLogsPath` |

Identity constants live in [`electron/lib/appIdentity.ts`](../electron/lib/appIdentity.ts) (kept in sync with `package.json` / `electron-builder.config.mjs` by tests). Wipe both profiles with `pnpm run clean:appdata`.

## IPC handlers

Handler modules live in [`electron/ipc/`](../electron/ipc/):

| Module | Responsibility |
|---|---|
| `downloadHandlers/` | Start / pause / resume / cancel download, metadata, playlist info, video info, history |
| `searchHandlers.ts` | In-app YouTube search (`youtube:search`) and search usage readout |
| `siteAuthHandlers.ts` | Site cookie sessions (sign-in browser, save, delete) |
| `settingsHandlers.ts` | App settings get / set, proxy profile URL |
| `localFilesHandlers.ts` | Open / reveal local media; paths must pass media allowlist + sit under settings `outputDir` |
| `externalLinkHandlers.ts` | Allowlisted external URLs via `auth:open-external` |
| `rendererErrorHandlers.ts` | Renderer error / telemetry forwarding |

All renderer→main calls go through two guards in [`electron/ipc/validateIpcPayload.ts`](../electron/ipc/validateIpcPayload.ts):

- **`withValidSender`** — HOF that checks the sender origin before invoking the handler; returns an `IpcFailureEnvelope` on failure.
- **`parseIpcPayload(schema, raw, channel?)`** — Zod-validates the raw IPC payload; returns `null` and logs a warning on failure. Use for every payload-bearing invoke (or a thin wrapper such as `parseSearchIpcPayload`). Argument-less handlers still require `withValidSender`.

The IPC contract spans three focused modules, re-exported through [`src/shared/ipcContract.ts`](../src/shared/ipcContract.ts): [`src/shared/ipcChannels.ts`](../src/shared/ipcChannels.ts) (channel names), [`src/shared/ipcPayloadSchemas.ts`](../src/shared/ipcPayloadSchemas.ts) (Zod payload schemas — each annotated `z.ZodType<T>` so a schema and its static type can't drift), and [`electron/preloadApi/createRendererApi.ts`](../electron/preloadApi/createRendererApi.ts) (the `RendererApi` `window.api` bridge). The `ipcPreloadParity` test asserts the preload references every channel.

An IPC rate limiter ([`electron/ipc/rateLimiter.ts`](../electron/ipc/rateLimiter.ts)) enforces per-channel sliding-window throttling (global across senders for that channel).

## Security

### IPC sender validation

`validateSender` in [`electron/mainHelpers.ts`](../electron/mainHelpers.ts) accepts:

- `kajo-app://localhost` — custom protocol used by the production renderer.
- `file:` URLs whose path falls under `TRUSTED_RENDERER_FILE_ROOTS` (defined in `main.ts`, legacy; production path uses the custom protocol).
- Any `http:` or `https:` origin in dev mode (`is.dev`).

Everything else is rejected. [`electron/mainWindowSecurity.ts`](../electron/mainWindowSecurity.ts) exports `SECURE_MAIN_WEB_PREFERENCES_BASE` — hardened `BrowserWindow` web preferences (`contextIsolation: true`, `nodeIntegration: false`, `sandbox: true`, `webSecurity: true`). The main window's `will-navigate` guard (allows only `kajo-app:` and `http://localhost` in dev) lives in [`electron/mainWindowTray.ts`](../electron/mainWindowTray.ts).

### Content policy (prohibited hosts)

Downloads from adult video hosts are blocked. The shared `isProhibitedAdultMediaUrl` function from [`src/shared/prohibitedAdultContentHosts.ts`](../src/shared/prohibitedAdultContentHosts.ts) is enforced in the main process:

- `mainHelpers.ts` — autopaste clipboard scanning skips prohibited URLs.
- `electron/services/metadata/resolve.ts` — URL metadata resolution rejects prohibited URLs.
- `electron/services/metadata/streamingPlaylist.ts` — streaming-playlist enumeration drops prohibited entries.
- `electron/ipc/downloadHandlers/startDownloadHandler.ts` — start-download IPC handler rejects prohibited URLs.

Renderer code additionally pre-filters via `src/renderer/src/lib/mediaUrlValidation.ts` and `batchUrlInputValidation.ts` for UX; main-process enforcement above is authoritative.

### External URL allowlist

`isSafeOpenExternalUrl` (in `mainHelpers.ts`) permits `shell.openExternal` only for the build-time `__KAJO_WEBSITE_DOMAIN__` (derived from `KAJO_WEBSITE_URL`, default `github.com`) plus `linkedin.com` (the author link) — all `https:` only, subdomains included. In dev mode, `http:` to local dev hosts is also allowed. `file:` and all other schemes are always blocked.

## Renderer stores (Zustand 5)

Stores live in [`src/store/`](../src/store/):

| Store | Key state |
|---|---|
| `useDownloadStore` | `DownloadItem[]` queue (persisted to `localStorage`); `AppSettings` hydrated at boot from main via `settings:get` (authoritative in electron-store) |
| `useSearchStore` | In-app search state |
| `useSetupStore` | `setupStatus`, `isInstallingYtdlp`, `setupLogs[]` (capped at 300 lines) |
| `useSignedSitesStore` | Signed site cookie sessions |
| `usePlatformStore` | OS platform info |

[`src/store/safeLocalJsonStorage.ts`](../src/store/safeLocalJsonStorage.ts) provides a Zod-validated `localStorage` adapter used by the `persist` middleware in `useDownloadStore`.

## Main-process services

Heavy logic lives in [`electron/services/`](../electron/services/):

### yt-dlp / ffmpeg

- **`binaries.ts`** — Resolves bundled binaries from `resources/bin/<platform>-<arch>/`; falls back to `PATH`; verifies SHA-256 integrity via `.kajo-bin-runtime.json`.
- **Deno (JS runtime)** — yt-dlp's YouTube challenge solving (nsig/signature) runs on a bundled, sandboxed Deno binary passed via `--js-runtimes deno:<path>`. The app does **not** use the Electron binary as a Node runtime: the `runAsNode` fuse is disabled for hardening, so an `ELECTRON_RUN_AS_NODE` shim would launch a second app instance per download.
- **`ytdlp/downloadEngine.ts`** (with the surrounding `ytdlp/` modules) — Core orchestration: `startDownload`, `pauseDownload`, `resumeDownload`, `cancelDownload`, orphan cleanup. Process lifecycle is split across `downloadEngineProcessBinding`, `downloadEngineOutputHandlers`, `downloadEngineTerminal`, and `downloadEngineRetry`.
- **`ytdlp/ytdlpUtilityProcess.ts` / `ytdlpWorker.ts`** — yt-dlp runs in an Electron `UtilityProcess` (sandboxed); unexpected worker exit fails in-flight jobs and allows respawn.
- **`metadata/`** — URL metadata resolution, format normalisation, playlist enumeration, thumbnail fetching, streaming-playlist handling.
- **`downloadCapabilities.ts`** — Detects per-platform format / audio-only capability support. Downloads always merge metadata, thumbnail, and chapter embedding via `mergeWithAutomaticFileEmbedding` at start time (not user-toggleable).
- **`userFacingEngineErrors.ts`** — Maps yt-dlp error output to user-readable error messages.

### Search

- **`youtubeInAppSearch.ts`** — In-app Search tab entry point (YouTube-only; yt-dlp `ytsearchN:`). IPC payload parsing lives in `src/shared/ipcPayloadSchemas.ts` (`parseSearchIpcPayload`).
- **`youtubeSearch.ts`** / **`youtubeYtdlpDefaults.ts`** — Shared yt-dlp search primitive (`searchViaYtDlp`) and per-site default args.
- **`searchUsageStore.ts`** — Daily search usage readout (search is unlimited).

### Site sign-in

- **`siteAuthBrowserController.ts`** — Orchestrates the embedded sign-in browser; delegates to:
  - **`siteAuthSessionState.ts`** — shared session state
  - **`siteAuthNavigationGuards.ts`** — HTTPS / host allowlist and permission denial
  - **`siteAuthViewLifecycle.ts`** — WebContentsView attach/detach
  - **`siteAuthCookieCapture.ts`** — cookie persistence on save
- **`siteAuthSessionRefresher.ts`** / **`siteAuthCookieStore.ts`** — background session refresh; encrypted cookie store. Session “refresh status” re-reads the local snapshot (`cookieHealth`); it is not a live network login probe.

### History

- **`historyArchive.ts`** — Persists completed/error/cancelled download history (electron-store, max 2500 entries). Entries are Zod-validated on read; invalid rows are dropped. The renderer History modal consumes `downloadHistory.*` IPC.

### Auto-update

`electron/services/autoUpdate.ts` uses `electron-updater` v6 with a 4-hour check interval (1-minute initial delay, ±15 % jitter). `allowDowngrade = false`. Disabled when `KAJO_DISABLE_AUTO_UPDATE=1`, `!app.isPackaged`, or on Linux installs that are not AppImage (deb/rpm use the system package manager).

### Other services

- **`filenameTemplate.ts`** — Filename template expansion.
- **`src/shared/urlSiteResolveContext.ts`** — Site / URL context for yt-dlp metadata resolution.
- **`proxyProfileStore.ts`** — Proxy profile URLs encrypted at rest (`encryptField` / `decryptField`), re-validated on read before yt-dlp `--proxy`.
- **`desktopNotifications.ts`** — OS desktop notification delivery for download completion.
- **`ytdlpVersionProbe.ts`** — Probes the bundled yt-dlp version; used for version compatibility checks.
- **`fileContentHash.ts`** — File SHA-256 hashing utility for binary integrity checks.
