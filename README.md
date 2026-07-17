# kajo-downloader

**Kajo Downloader** — a free desktop app for downloading a single video, a playlist, or an entire channel. Powered by yt-dlp + ffmpeg. Supports 1,000+ sites including YouTube, Vimeo, Twitter/X, and TikTok. Includes in-app Search, site sign-in for gated content, and local download history.

Single Electron app (React 19 renderer + Node.js main process), built with Vite and packaged with electron-builder.

## What it does

- **Download** a single video, a whole playlist, or an entire channel — with quality/format selection, subtitles, and a queue (pause / resume / cancel).
- **Search** for videos in-app (local `ytsearchN:` via yt-dlp — no API key, no account).
- **Sign in to sites** for member-only, private, or age-gated content using an embedded browser session.
- **Download history** kept locally, with open-file and reveal-in-folder.

All downloads are free and unrestricted — no tiers, no paywall.

## Prerequisites

- [Node.js](https://nodejs.org/) **24.x** (see [`.nvmrc`](.nvmrc))
- [pnpm](https://pnpm.io/) **11.8.0** (pinned via `packageManager` in [`package.json`](package.json))

## Install

```bash
pnpm install
```

## Develop

```bash
pnpm dev     # Electron + Vite HMR (auto-fetches pinned yt-dlp/ffmpeg binaries)
```

## Checks

```bash
pnpm run format        # Biome format
pnpm run lint          # Biome check --fix
pnpm run typecheck     # tsgo (node + web tsconfigs)
pnpm run knip          # dead-code check
pnpm run check:i18n    # locale key hygiene
pnpm run test:coverage # Vitest + coverage
pnpm run check         # full gate (all of the above + React Compiler ESLint)
```

## Build & package

```bash
pnpm run build              # compile main/preload/renderer
pnpm run build:mac          # package macOS (x64 + arm64)
pnpm run build:win          # package Windows (x64 + arm64)
pnpm run build:linux        # package Linux (deb/rpm/AppImage, x64 + arm64)
```

See [`docs/building.md`](docs/building.md) for the full binary-fetch and packaging walkthrough.

## CI

[`.github/workflows/`](.github/workflows/) — `ci.yml` (quality gate), `build.yml` / `release.yml` (packaging), `sast.yml` (Semgrep). See [`docs/ci-cd.md`](docs/ci-cd.md).

## Security

See [`SECURITY.md`](SECURITY.md) for how to report vulnerabilities.

Node: [`.nvmrc`](.nvmrc) (**24**).
