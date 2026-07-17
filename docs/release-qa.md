# Release QA checklist

Manual smoke checklist before the first public tag (and after major download-engine / packaging changes). Automate later with Playwright — see [`testing.md`](testing.md#planned-playwright-e2e-next-automation-step) and [`scripts/e2e-smoke.md`](../scripts/e2e-smoke.md); this gate is intentional for v1.

## Prerequisites

1. `pnpm run check` passes locally.
2. Trigger a **draft** [`.github/workflows/release.yml`](../.github/workflows/release.yml) dry-run for signed/notarized macOS + Windows + Linux using the `production` GitHub Environment secrets. Do **not** use `build.yml` for macOS signing verification — it does not import the Apple `.p12` into the runner keychain (see [`docs/code-signing.md`](code-signing.md)).

    ```bash
    # Tag must match package.json version; release.yml creates a draft GitHub Release.
    gh workflow run release.yml -f tag=v1.0.0
    ```

    A signed matrix dry-run is a human/ops step before the first public (non-draft) tag — it cannot be completed without those secrets.
3. Install the artifacts on a clean machine (or VM) per OS.

## Functional smoke (each OS)

- [ ] App launches; boot splash completes; setup gate passes when binaries are present.
- [ ] Paste a single public YouTube URL → metadata preview → download completes → **Open** and **Reveal in folder** work.
- [ ] Playlist URL → multi-video picker → batch queue → at least one item completes.
- [ ] Search tab → query → add result to queue → download starts.
- [ ] While Search tab is active, Download tab shows an active-download badge when jobs are running.
- [ ] Settings → Downloads: set subtitle mode, rate limit, filename template; start a download and confirm behavior (sidecar file / limited speed / name pattern).
- [ ] Site Sessions → sign in to a supported site (Back/Forward/Reload + URL strip work; loading indicator appears) → download member/private content that previously failed without cookies.
- [ ] History header button → list shows completed/error rows → open / reveal / clear (with confirm) / queue again.
- [ ] Pause / resume on macOS and Linux; on Windows, pause control is disabled with an explanatory tooltip.
- [ ] Quit during an active download: `.part` files preserved; relaunch resumes with `--continue` where applicable.
- [ ] Auto-update: Help/menu **Check for updates** does not error (or is disabled via `KAJO_DISABLE_AUTO_UPDATE=1` in test builds).

## Packaging / update

- [ ] macOS: Gatekeeper / notarization opens without quarantine warnings on a fresh download.
- [ ] Windows: installer runs; electron-updater publisher name matches the signed binary.
- [ ] Linux: deb/AppImage/rpm launch; `maintainer` metadata is not the electronjs.org placeholder.
- [ ] Linux AppImage: Help → Check for updates works (deb/rpm should explain package-manager updates instead).

## Observability (optional)

- [ ] With `KAJO_SENTRY_DSN` unset, app runs with local logs only (v1 default).
- [ ] With `KAJO_DEBUG_TOOLS=1` and `KAJO_SUPPORT_BUILD=1` on a packaged support build, DevTools / Inspect are available.

## Tag

Only after the checklist passes, run [`.github/workflows/release.yml`](../.github/workflows/release.yml) with a tag that matches `package.json` `version`.
