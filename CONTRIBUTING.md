# Contributing to Kajo Downloader

## Prerequisites

- [Node.js](https://nodejs.org/) **24.x** (see `engines` in [`package.json`](package.json))
- [pnpm](https://pnpm.io/) **11.8.0** (pinned via `packageManager` in [`package.json`](package.json); CI uses [`pnpm/action-setup`](https://github.com/pnpm/action-setup))
- [Semgrep](https://semgrep.dev/) — required for the SAST pre-push hook (see [Git hooks](#git-hooks) below)

  ```bash
  # macOS
  brew install semgrep
  # or via pip/pipx
  pip install semgrep
  ```

## Repository layout

- `electron/` — Electron main process, preload, and IPC handlers
- `src/` — React renderer, shared IPC contract, i18n locales
- `scripts/` — binary-fetch and build helper scripts
- `docs/` — architecture, building, and CI notes

## Setup

From the repository root:

```bash
pnpm install
```

`pnpm install` also runs the `prepare` script which installs the [Husky](https://typicode.github.io/husky/) git hooks automatically.

`postinstall` runs `electron-builder install-app-deps` (native module rebuild for Electron). If that step fails, see `scripts/postinstall-app-deps.mjs`.

## Common commands

| Area | Command |
| ------ | --------- |
| Dev (Electron + Vite HMR) | `pnpm run dev` |
| Typecheck | `pnpm run typecheck` |
| Tests | `pnpm run test` |
| Tests + coverage | `pnpm run test:coverage` |
| Lint | `pnpm run lint` |
| Build (compile) | `pnpm run build` |
| Full local gate (format → lint → typecheck → knip → check:i18n → coverage → React Compiler ESLint) | `pnpm run check` |
| Dead-code check | `pnpm run knip` |
| i18n key hygiene | `pnpm run check:i18n` |

Formatting and general lint for TypeScript/JSON are handled by **Biome**. **ESLint** is used exclusively for the React Compiler check (`pnpm run check:compiler`), which is part of the `pnpm run check` gate.

## Git hooks

Husky manages two hooks installed by `pnpm install`:

| Hook | What it runs |
| ---- | ------------ |
| `pre-commit` | `lint-staged` — runs Biome check/format on staged `.ts`/`.tsx` files and Biome format on staged `.js`/`.json` files |
| `pre-push` | `pnpm run typecheck` → `pnpm run test` → **Semgrep SAST scan** (`semgrep scan --config=auto --error .`) |

The pre-push hook rejects the push if Semgrep finds any issues. If Semgrep is not installed it prints a warning and allows the push — install it to enforce the check locally (see [Prerequisites](#prerequisites)). The same scan also runs in CI via `.github/workflows/sast.yml`.

## Pull requests

Use the checklist in `.github/pull_request_template.md`. Prefer small, focused changes and match existing patterns (formatting via Biome, IPC validation via Zod in `src/shared/ipcPayloadSchemas.ts`).
