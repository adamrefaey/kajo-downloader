# E2E smoke (planned)

**Status:** not implemented — placeholder for the next automation step after Vitest.

## Goal

Playwright-driven smoke against a real Electron build:

1. Launch app (preview or packaged artifact).
2. Download one public video end-to-end.
3. Verify **Open** and **Reveal in folder** on a completed queue row.

## Future wiring

- Add `@playwright/test` + an Electron test fixture (or `@playwright/test` with `_electron.launch`).
- Script: `pnpm run test:e2e:planned` → runs `scripts/e2e-smoke` (TBD).
- CI: optional nightly job after `build:unpack`; not part of the default PR gate initially.

See [`docs/testing.md`](../docs/testing.md) and [`docs/release-qa.md`](../docs/release-qa.md).
