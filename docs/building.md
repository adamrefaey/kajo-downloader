# Building

How the repository is compiled, how native tools are bundled, and how installers are produced.

## Toolchain

1. **electron-vite** ([`electron.vite.config.ts`](../electron.vite.config.ts)) builds:
   - Main process output → `out/main/`
   - Preload → `out/preload/`
   - Renderer → `dist/`

   The repo pins **electron-vite 6.x beta** because Vite 8 support is not yet on a stable 6.x release. Do not downgrade to electron-vite 5 (Vite 7). Re-check for a stable 6.x pin before each public release; CI already smoke-builds with `electron-vite build`. Keep **vitest / @vitest/coverage-v8 at 4.1.9** until 4.1.10+ fixes intermittent `coverage/.tmp` ENOENT races under parallel workers.

   Typecheck uses **tsgo** (`@typescript/native-preview`) via `pnpm run typecheck`, not `tsc`.

2. **`pnpm build`** rebuilds native modules for Electron's ABI, then runs `electron-vite build` via [`scripts/with-env.mjs`](../scripts/with-env.mjs) (which loads `.env` / an untracked `.env.local` so compile-time defines such as `KAJO_WEBSITE_URL` are present). Run the quality gate separately with `pnpm run check`.

3. **electron-builder** ([`electron-builder.config.mjs`](../electron-builder.config.mjs)) packages `out/` + `dist/` plus `extraResources` (`resources/bin` → `bin/` for yt-dlp / ffmpeg / ffprobe) into platform artifacts under `release/`.

## Bundled binaries (yt-dlp, ffmpeg, ffprobe, Deno)

Build scripts run [`scripts/fetch-binaries.mjs`](../scripts/fetch-binaries.mjs) to populate `resources/bin/<platform>-<arch>/`. yt-dlp, ffmpeg, ffprobe, and Deno (yt-dlp’s JS runtime for YouTube nsig/sig) are pinned in [`scripts/binary-pins.json`](../scripts/binary-pins.json); SHA-256 is verified on every download and cache hit.

Examples: `darwin-arm64`, `win32-x64`, `linux-x64`.

`pnpm dev` / `pnpm start` run [`scripts/ensure-dev-binaries.mjs`](../scripts/ensure-dev-binaries.mjs), which fetches the pinned binaries when missing. Set `KAJO_SKIP_DEV_BINARIES=1` to skip that step.

Deno is passed to yt-dlp as `--js-runtimes deno:<path>`. The app does **not** use Electron as Node (`runAsNode` fuse disabled); an `ELECTRON_RUN_AS_NODE` shim would launch a second app instance per download.

**Runtime resolution** (simplified) is implemented in [`electron/services/binaries.ts`](../electron/services/binaries.ts):

1. `resources/bin/<runtime-platform>-<runtime-arch>/` (packaged: under `process.resourcesPath/bin`)
2. `resources/bin/` fallback
3. Executables on `PATH`

**Manual fetch** (optional, from repo root):

```bash
pnpm run binaries:mac
pnpm run binaries:win
pnpm run binaries:linux
```

Individual arch targets exist as `binaries:win:x64`, `binaries:linux:arm64`, etc. (see [`package.json`](../package.json)).

## Packaging commands

`pnpm build` and all `build:*` scripts compile only — they do **not** run the quality gate (`pnpm run check`). Run `pnpm run check` separately before pushing.

| Script | What it does |
| -------- | ---------------- |
| `pnpm build` | Rebuild native modules + compile main / preload / renderer |
| `pnpm build:unpack` | Compile + `electron-builder --dir` (unpackaged app for inspection) |
| `pnpm build:mac` | Compile + macOS binaries (x64 + arm64) + macOS DMGs |
| `pnpm build:mac:x64` | Compile + macOS x64 binaries + macOS x64 DMG |
| `pnpm build:mac:arm64` | Compile + macOS arm64 binaries + macOS arm64 DMG |
| `pnpm build:win` | Compile + Windows binaries (x64 + arm64) + NSIS installers |
| `pnpm build:win:x64` | Compile + Windows x64 binaries + x64 NSIS installer |
| `pnpm build:win:arm64` | Compile + Windows arm64 binaries + arm64 NSIS installer |
| `pnpm build:linux` | Compile + Linux binaries + deb / rpm / AppImage (x64 + arm64 in one electron-builder invocation) |
| `pnpm build:linux:x64` | Compile + Linux x64 binaries + deb + rpm + AppImage |
| `pnpm build:linux:arm64` | Compile + Linux arm64 binaries + deb + rpm + AppImage |
| `pnpm build:linux:x64:deb` | Compile + Linux x64 binaries + deb only (used in CI matrix) |
| `pnpm build:linux:x64:rpm` | Compile + Linux x64 binaries + rpm only (used in CI matrix) |
| `pnpm build:linux:x64:appimage` | Compile + Linux x64 binaries + AppImage only (used in CI matrix) |
| `pnpm build:linux:arm64:deb` | Compile + Linux arm64 binaries + deb only (used in CI matrix) |
| `pnpm build:linux:arm64:rpm` | Compile + Linux arm64 binaries + rpm only (used in CI matrix) |
| `pnpm build:linux:arm64:appimage` | Compile + Linux arm64 binaries + AppImage only (used in CI matrix) |

Run the target that matches the host OS when possible; cross-compilation has platform-specific limits depending on your environment. The per-format Linux scripts (`build:linux:x64:deb`, etc.) are used by the `build.yml` CI matrix so each format is a separate job.

## Clean

`pnpm clean` removes `dist`, `out`, `release`, `resources/.cache`, `resources/.tmp`, and `.turbo` (see script in [`package.json`](../package.json)).

`pnpm run clean:appdata` deletes OS-level Electron profiles (`kajo-downloader`, `kajo-downloader-dev`, and any leftover `productName` folder) plus macOS Preferences / CrashReporter entries — see [`scripts/clean-appdata.mjs`](../scripts/clean-appdata.mjs) and [architecture — Local persistence](./architecture.md#local-persistence-userdata).

## CI

GitHub Actions build matrices and artifacts are described in [`docs/ci-cd.md`](ci-cd.md).
