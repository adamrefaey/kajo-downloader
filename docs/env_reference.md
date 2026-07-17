# Environment Variable Reference

Quick reference for all environment variables used by the Kajo Downloader app. See [`.env.example`](../.env.example) for commented examples. CI runs `node scripts/check-env-docs.mjs` to ensure every variable declared there appears in this file (by name in backticks).

**Observability posture (v1):** local structured logs and optional on-disk crash dumps by default. Cloud telemetry is opt-in via `KAJO_SENTRY_DSN` / `KAJO_CRASH_REPORTER_URL`. There is no product analytics.

---

## App (`.env.example`)

| Variable | Required | Description |
| -------- | -------- | ----------- |
| `KAJO_WEBSITE_URL` | No | Project homepage URL. Baked at build time by `electron.vite.config.ts` and exposed as `__KAJO_WEBSITE_URL__` / `__KAJO_WEBSITE_DOMAIN__`; drives the `openExternal` HTTPS allowlist (host + subdomains). Must be `https:`. Default: `https://github.com/adamrefaey/kajo-downloader`. |
| `KAJO_AUTO_UPDATE_FEED_URL` | No | HTTPS generic update feed URL (overrides `app-update.yml` from the build). |
| `KAJO_DISABLE_AUTO_UPDATE` | No | Set `1` to disable auto-update entirely. |
| `KAJO_DEBUG_TOOLS` | No | Set `1` to enable DevTools, View menu, and context-menu inspector in unpackaged/dev builds (also enabled automatically in electron-vite `dev`). On packaged builds, also requires `KAJO_SUPPORT_BUILD=1`. |
| `KAJO_SUPPORT_BUILD` | No | Set `1` with `KAJO_DEBUG_TOOLS=1` to allow DevTools on a packaged support/debug build. Ignored when unset. |
| `KAJO_SKIP_DEV_BINARIES` | No | Set `1` to skip automatic pinned dev-binary setup before `pnpm run dev` / `pnpm start` (skips `scripts/ensure-dev-binaries.mjs`, which runs `fetch-binaries.mjs` when yt-dlp / ffmpeg / ffprobe are missing). |
| `KAJO_APP_ENV` | No | `dev` (default in `electron-vite dev`) enables dev-only conveniences locally. Production builds always embed `prod`. |
| `KAJO_SENTRY_DSN` | No | Optional Sentry-compatible HTTPS DSN for main-process error reporting (`electron/lib/errorTelemetry.ts`). **Runtime** `process.env` only (not baked into the installer) — set via support/debug launch env if needed. Unset = local logs only. |
| `KAJO_CRASH_REPORTER_URL` | No | Optional HTTPS URL for Electron `crashReporter` uploads. **Runtime** `process.env` only (same as Sentry). Unset = local crash dumps only. |
| `KAJO_MAIN_LOG_LEVEL` | No | Main-process log level: `error`, `warn`, `info`, or `debug` (`electron/mainLogger.ts`). |
| `KAJO_USER_DATA` | No | Absolute path override for Electron `userData` root. Applied in `electron/lib/configureUserDataPaths.ts` (before ready) and read by workers via `electron/lib/electronProcessContext.ts`. Session data lives at `<userData>/session`; logs at `<userData>/logs`. Unpackaged default: `kajo-downloader-dev`; packaged: `kajo-downloader`. |

---

## Related docs

- [`architecture.md`](architecture.md) — system topology and component overview
- [`building.md`](building.md) — build, bundled binaries, and packaging
