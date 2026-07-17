# Testing

Test runner: **Vitest** ([`vitest.config.ts`](../vitest.config.ts)). Tests live under [`tests/`](../tests/) (and may include colocated `*.test.ts` patterns per config).

## Vitest project

[`vitest.config.ts`](../vitest.config.ts) defines a single **`desktop`** project (Node environment, [`tests/setup.ts`](../tests/setup.ts)) covering the main process, preload, renderer, and stores. Compile-time defines (`__KAJO_APP_ENV__`, `__KAJO_WEBSITE_URL__`, …) are set in the shared `define` block. Run the full coverage gate with `pnpm run test:coverage`.

## Commands

From the repository root (after `pnpm install`):

```bash
pnpm run test             # run the full Vitest suite once
pnpm run test:watch       # watch mode
pnpm run test:coverage    # run + enforce 100% coverage
```

Vitest collects tests from three locations:

- `tests/**/*.test.{ts,tsx}` — primary test directory
- `src/**/*.test.{ts,tsx}` — colocated renderer/store tests
- `electron/**/*.test.ts` — colocated Electron main-process tests

## Coverage policy

`pnpm test:coverage` enforces **global thresholds of 100%** (statements, branches, functions, lines) over an **explicit allowlist** defined in [`vitest.config.ts`](../vitest.config.ts) — not every file in the repo. Only paths listed under `coverage.include` are measured; everything else is ignored by the gate. The electron coverage list is a named allowlist, not a recursive glob, so IPC registration files are excluded. Covered paths:

- `electron/mainHelpers.ts`, `electron/preload.ts`, `electron/preloadApi/`
- `electron/lib/**/*.ts`
- `electron/services/**/*.ts`
- `electron/i18n/**/*.ts`
- `electron/ipc/rateLimiter.ts`
- [`src/main/load-env.ts`](../src/main/load-env.ts) and [`load-env-core.ts`](../src/main/load-env-core.ts)
- [`src/shared/**/*.ts`](../src/shared/) (type-only barrels excluded — see [`vitest-coverage-excludes.ts`](../vitest-coverage-excludes.ts))
- [`src/store/**/*.ts`](../src/store/)
- [`src/renderer/src/**/*.{ts,tsx}`](../src/renderer/src/)

Several files are **excluded from coverage numerators** (integration-tested or manual-QA targets). The full list lives in [`vitest-coverage-excludes.ts`](../vitest-coverage-excludes.ts), grouped into four categories:

| Category | Examples |
| -------- | -------- |
| Tooling & entrypoints | `src/main/index.ts`, `src/preload/index.ts`, `vitest.config.ts` |
| Bootstrap types | `src/types/**`, `src/renderer/src/main.tsx`, type-only barrels under `src/shared/` |
| Shared helpers | `src/shared/**` — listed in coverage `include` for visibility; excluded from the 100% denominator (exercised by `tests/sharedCoverageGaps.test.ts` + domain tests; many modules are type/Zod surface area) |
| Electron integration/manual QA | `electron/main.ts`, `electron/bootstrap.ts`, site-auth controller siblings, `electron/services/binaries.ts`, yt-dlp process I/O modules (see excludes list), `electron/services/metadata/` (index/types/resolve/ytdlpProcess only — pure helpers remain covered) |
| Renderer UI surfaces | `src/renderer/src/App.tsx`, `src/renderer/src/components/SettingsModal.tsx`, `src/renderer/src/components/**`, `src/renderer/src/hooks/**`, `src/renderer/src/app/**` |

**yt-dlp pure modules in the gate:** `retryLogic.ts`, `downloadEngineState.ts`, and `downloadEngineConstants.ts` are covered at 100% alongside their colocated / companion unit tests. `progressParser.ts` stays excluded (defensive NaN branches). Process I/O, worker, start, terminal, retry orchestration, and argv modules stay excluded.

## Planned Playwright E2E (next automation step)

Vitest covers main-process logic, IPC contracts, stores, and pure helpers. **Browser-level smoke** (real Electron window, download lifecycle, open/reveal) is the next automation layer — not wired into CI yet.

Planned scope for a future `@playwright/test` + Electron fixture suite:

1. **Launch** — packaged or `electron-vite preview` build starts; boot splash clears; setup gate passes when binaries are present.
2. **Single download** — paste a public URL → metadata preview → queue → progress → complete.
3. **Open / reveal** — completed row **Open** and **Reveal in folder** invoke the local-files IPC paths successfully.

Manual checklist until then: [`release-qa.md`](release-qa.md). Stub notes for the future runner: [`scripts/e2e-smoke.md`](../scripts/e2e-smoke.md). Planned script (exits 1 until implemented): `pnpm run test:e2e:planned` — not wired into CI.

## Renderer debug logs

Prefer a single prefix pattern for new `console` diagnostics: **`[kajo:<module>]`** (e.g. `[kajo:metadata]`, `[kajo:site-auth]`).

## CI

Continuous integration runs `pnpm install` then `pnpm run test:coverage` per [`.github/workflows/ci.yml`](../.github/workflows/ci.yml). Details: [`ci-cd.md`](ci-cd.md).
