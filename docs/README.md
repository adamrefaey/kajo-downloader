# Kajo Downloader — documentation

Technical reference for the Electron desktop app. For first-time setup and day-to-day commands, start with the repository [`README.md`](../README.md). For contributing workflow and git hooks, see [`CONTRIBUTING.md`](../CONTRIBUTING.md).

**Adult / explicit video sites** are blocked by policy — URLs on those hosts are rejected before metadata and download (see [architecture overview — content policy](architecture.md#content-policy-prohibited-hosts)).

## Documentation index

| Topic | Location |
| --- | --- |
| Architecture | [architecture.md](architecture.md) |
| UI stack | [ui-foundation.md](ui-foundation.md) |
| Building and binaries | [building.md](building.md) |
| Environment variables | [env_reference.md](env_reference.md) |
| Testing and coverage | [testing.md](testing.md) |
| CI/CD and releases | [ci-cd.md](ci-cd.md) |
| Code signing | [code-signing.md](code-signing.md) |

## Quick reference

| Command | Purpose |
| --- | --- |
| `pnpm dev` | Dev app with HMR (auto-fetches pinned yt-dlp / ffmpeg when missing) |
| `pnpm run build` | Compile main / preload / renderer (no installer) |
| `pnpm run check` | Full local gate — see [`CONTRIBUTING.md`](../CONTRIBUTING.md) |
| `pnpm run test:coverage` | Vitest with enforced coverage thresholds |

Platform-specific `binaries:*` and `build:*` scripts are documented in [building.md](building.md).
