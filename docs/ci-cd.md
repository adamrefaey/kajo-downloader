# CI/CD (GitHub Actions)

Continuous integration, cross-platform packaging, and manual releases for this repository. All workflows live under [`.github/workflows/`](../.github/workflows/).

---

## Summary

| Workflow | File | When it runs | What it does |
| -------- | ---- | -------------- | ------------- |
| **CI** | [`ci.yml`](../.github/workflows/ci.yml) | Push / PR to `main` or `master`; nightly cron at 02:00 UTC | `quality` job: security audit, binary fetch + SHA check, Biome, typecheck, knip, i18n key check, React Compiler ESLint, Vitest + coverage, electron-vite build + bundle budget/delta + summary, Linux dir-pack. `docs` job: env reference sync. |
| **Build** | [`build.yml`](../.github/workflows/build.yml) | **Manual** (`workflow_dispatch` only) | Ten matrix legs (2 macOS + 2 Windows + 6 Linux, one per format): `pnpm run build:<target>` + `electron-builder`; SLSA provenance attestation + SBOM for **Windows, macOS, and Linux**; artifacts from **`release/`**. For **signed/notarized** macOS artifacts use **`release.yml`** (see [`code-signing.md`](code-signing.md)). |
| **Release** | [`release.yml`](../.github/workflows/release.yml) | **Manual** (`workflow_dispatch` only) | Validates tag ↔ [`package.json`](../package.json) `version`; **three** dual-arch build jobs (`build:mac` / `build:win` / `build:linux`) so `latest*.yml` lists every arch; imports Apple cert when secrets are set; **GitHub Release** (draft by default) + installers + updater metadata + **`SHA256SUMS`**. |
| **SAST** | [`sast.yml`](../.github/workflows/sast.yml) | Push / PR to `main` or `master`; weekly cron (Mondays 03:00 UTC) | Semgrep SAST scan across the repo; skips fork PRs to avoid token leakage. |

---

## Shared runner setup (CI, Build, Release build jobs)

- **Single package:** no pnpm workspaces; single lockfile at repo root [`pnpm-lock.yaml`](../pnpm-lock.yaml). [`pnpm-workspace.yaml`](../pnpm-workspace.yaml) holds only pnpm project settings (`onlyBuiltDependencies`, `overrides`).
- **Node.js:** `24` and **pnpm:** `11` — single source: [`.github/actions/setup-workspace/action.yml`](../.github/actions/setup-workspace/action.yml). Local installs: root [`package.json`](../package.json) `packageManager` (Corepack) and [`.nvmrc`](../.nvmrc).
- **Install:** `pnpm install --frozen-lockfile`
- **Cache:** pnpm store keyed on [`pnpm-lock.yaml`](../pnpm-lock.yaml)
- **Tasks:** plain `pnpm run <script>` / `pnpm exec …` (no `--filter`, no `working-directory`).

The **Release** **validate** job reads `version` from [`package.json`](../package.json). **publish** downloads artifacts to `release-assets` at the root.

---

## Permissions and concurrency

- **Default workflow permission:** `contents: read` on CI, SAST, and Release (except where overridden).
- **Build:** `contents: read` + `actions: write` (artifact upload) + `id-token: write` (SLSA provenance attestation).
- **Release — publish job:** `permissions: contents: write` so `softprops/action-gh-release` can create the release and upload files using `GITHUB_TOKEN`.
- **Concurrency:** CI and Build set `concurrency: group: ${{ github.workflow }}-${{ github.ref }}` with `cancel-in-progress: true`, so newer pushes on the same ref cancel older runs.

---

## Supply-chain hardening — pinned actions + Dependabot

- **Every third-party action is pinned to a full commit SHA**, never a moving tag — an immutable reference that a tag-retargeting compromise (e.g. the March 2025 `tj-actions/changed-files` incident) cannot hijack. Each `uses:` keeps a trailing `# vX.Y.Z` comment for readability. This covers the workflows **and** the composite action in [`.github/actions/setup-workspace`](../.github/actions/setup-workspace/action.yml).
- **[`dependabot.yml`](../.github/dependabot.yml)** keeps those pins from going stale: the `github-actions` updater bumps the SHA **and** rewrites the version comment weekly (grouped into one PR). The same config updates **npm** dependencies weekly — dev and prod minor/patch bumps grouped, majors raised individually, with a release **cooldown** so a freshly-published (possibly compromised) version is not adopted immediately.

To upgrade an action by hand, replace the SHA and its `# vX.Y.Z` comment together; resolve a tag to its SHA with `gh api repos/<owner>/<repo>/commits/<tag> --jq .sha`.

---

## CI workflow ([`ci.yml`](../.github/workflows/ci.yml))

### Job: `quality` (display name: **Quality — lint, typecheck, test, build**)

**Runner:** `ubuntu-latest`
**Timeout:** 45 minutes

| Step | Command / action |
| ---- | ---------------- |
| Verify pinned binaries | `node scripts/fetch-binaries.mjs --platform linux --arch x64` (fetch + SHA-256 check); requires `squashfs-tools` and `p7zip-full` |
| Security audit | `pnpm audit --audit-level=high` |
| Lint | `pnpm exec biome check .` (no `--write`) |
| Typecheck | `pnpm run typecheck` |
| Dead-code check | `pnpm run knip` |
| i18n key hygiene | `pnpm run check:i18n` |
| React Compiler ESLint | `pnpm run check:compiler` |
| Tests + coverage | `pnpm run test:coverage` (thresholds in [`vitest.config.ts`](../vitest.config.ts)) |
| Build + bundle checks | `node scripts/ensure-dev-binaries.mjs`, then `electron-vite build`, then `check-renderer-bundle-budget.mjs` and `check-renderer-bundle-delta.mjs`, then `electron-builder --config electron-builder.config.mjs --dir --linux --x64` |
| Binary matrix (schedule only) | Nightly cron: fetch + verify pinned binaries for all 6 platform/arch combos |
| Bundle size summary | Writes budget + delta output to `$GITHUB_STEP_SUMMARY` (runs `if: always()`) |

**Build environment variables (Electron build step):** `CI`, `KAJO_AUTO_UPDATE_FEED_URL`.

### Job: `docs` (display name: **Docs — env reference sync**)

**Runner:** `ubuntu-latest`
**Timeout:** 5 minutes

| Step | Command / action |
| ---- | ---------------- |
| Env reference sync | `node scripts/check-env-docs.mjs` — verifies all `.env.example` vars are documented in `env_reference.md` |

This job runs unconditionally on every push and PR.

---

## Build workflow ([`build.yml`](../.github/workflows/build.yml))

**Trigger:** manual (`workflow_dispatch`) only — not triggered by pushes or PRs.

**Permissions:** `contents: read`, `actions: write` (artifact upload), `id-token: write` (SLSA provenance attestation)

**Job:** `package` (display name: **Package (`<job_name>`)**)
**Matrix:** `fail-fast: false` (one leg failing does not cancel the others)
**Timeout:** 90 minutes per job

Ten matrix legs (each Linux format is a separate leg):

| OS | `runs-on` | job_name | Script |
| ---- | --------- | -------- | ------ |
| macOS | `macos-latest` | macos x64 | `build:mac:x64` |
| macOS | `macos-latest` | macos arm64 | `build:mac:arm64` |
| Windows | `windows-latest` | windows x64 | `build:win:x64` |
| Windows | `windows-latest` | windows arm64 | `build:win:arm64` |
| Linux | `ubuntu-latest` | linux x64 deb | `build:linux:x64:deb` |
| Linux | `ubuntu-latest` | linux x64 rpm | `build:linux:x64:rpm` |
| Linux | `ubuntu-latest` | linux x64 AppImage | `build:linux:x64:appimage` |
| Linux | `ubuntu-latest` | linux arm64 deb | `build:linux:arm64:deb` |
| Linux | `ubuntu-latest` | linux arm64 rpm | `build:linux:arm64:rpm` |
| Linux | `ubuntu-latest` | linux arm64 AppImage | `build:linux:arm64:appimage` |

**Build command:** `pnpm run ${{ matrix.script }}`.

**Environment (all package jobs):**

- `GITHUB_TOKEN` — available for steps that call the GitHub API (e.g. binary fetch scripts).
- `KAJO_WEBSITE_URL` (baked into the renderer bundle), `KAJO_AUTO_UPDATE_FEED_URL` (optional generic update-feed override; otherwise the electron-builder GitHub Releases provider supplies the feed).
- **macOS code signing:** `APPLE_SIGNING_IDENTITY`, `APPLE_ID`, `APPLE_APP_SPECIFIC_PASSWORD`, `APPLE_TEAM_ID`.
- **Windows code signing:** `CSC_LINK` (`WIN_CSC_LINK` secret), `CSC_KEY_PASSWORD` (`WIN_CSC_KEY_PASSWORD` secret), `WIN_CERTIFICATE_SUBJECT_NAME`, `WIN_PUBLISHER_NAME`.

**Linux-only step:** installs `fakeroot`, `dpkg-dev`, `libarchive-tools`, and `rpm` for deb/rpm packaging.

**Post-build steps (Windows and macOS only):**
- `actions/attest-build-provenance` — generates a SLSA provenance attestation for the installer.
- `anchore/sbom-action` — produces an SPDX SBOM artifact (e.g. `sbom-macos-x64.spdx.json`).

**Artifacts:** each matrix leg uploads from **`release/`**:

| Platform | Artifact name pattern | Contents |
| -------- | --------------------- | -------- |
| Windows | `build-windows-<arch>` | `.exe` |
| macOS | `build-macos-<arch>` | `.dmg` |
| Linux | `build-linux-<arch>-<ext>` | `.deb`, `.rpm`, or `.AppImage` (one per leg) |

(`if-no-files-found: error` — missing expected file fails the job.)

> **Note:** [`electron-builder.config.mjs`](../electron-builder.config.mjs) sets `directories.output: release`. The renderer build writes to **`dist/`**; installers land under **`release/`**.

---

## Release workflow ([`release.yml`](../.github/workflows/release.yml))

### Inputs (`workflow_dispatch`)

| Input | Required | Default | Purpose |
| ----- | -------- | ------- | ------- |
| `tag` | Yes | — | Existing Git tag, e.g. `v1.2.0` (must match [`package.json`](../package.json) `version` — see validation) |
| `release_name` | No | empty → tag used as title | GitHub Release title |
| `draft` | Yes | `true` | Create as draft for review |
| `prerelease` | Yes | `false` | Mark as prerelease |

### Job 1: `validate` (“Validate tag and version”)

- Checks out **`ref: ${{ inputs.tag }}`** (shallow).
- Ensures tag matches: `^v[0-9]+\.[0-9]+\.[0-9]+(-[a-zA-Z0-9.-]+)?$`
- Reads `version` from [`package.json`](../package.json) and requires **`v${version}` === `tag`**.
- Outputs `version` for downstream jobs.

### Job 2: `build` (“Release build (`platform`)”)

- **`needs: validate`**
- Three-leg matrix: macOS (`build:mac`), Windows (`build:win`), Linux (`build:linux`). Each job packs **x64 + arm64** in one electron-builder invocation so a single `latest*.yml` references both arches (required for `electron-updater`).
- Runs `pnpm run ${{ matrix.script }}`; same env vars, Linux packages, and post-build attestation/SBOM steps as **Build**. Checks out the **tag** ref.
- Uploads one artifact per OS (e.g. `release-macos-v1.2.0`) containing installers **plus** `*.yml` / `*.blockmap` updater metadata.

### Job 3: `publish` (“Publish GitHub Release”)

- **`needs: build`**
- Downloads all artifacts matching **`release-*-${{ inputs.tag }}`** into `release-assets` (`merge-multiple: true`).
- Writes **`SHA256SUMS`** in `release-assets`.
- **`softprops/action-gh-release`:** creates/updates the release for `tag_name`, sets name/draft/prerelease, **`generate_release_notes: true`**, uploads **`release-assets/**`** (binaries, updater yml/blockmaps, checksums).
- Uses `GITHUB_TOKEN` with **`contents: write`**.

---

## SAST workflow ([`sast.yml`](../.github/workflows/sast.yml))

**Trigger:** push / PR to `main` or `master`; weekly cron (Mondays 03:00 UTC).

**Skips fork PRs** (`github.event.pull_request.head.repo.full_name == github.repository`) to avoid token leakage.

**Job:** "Semgrep SAST" — runs in the `semgrep/semgrep` container, timeout 30 minutes.

Runs `semgrep scan --config=auto --error .` (Semgrep CE token-free local scanning with auto-detected language/framework rules). To upload results to semgrep.dev, add `SEMGREP_APP_TOKEN` as a repository secret and swap in `semgrep ci`.

---

## Secrets in CI

**CI (`quality` job)** does not require signing credentials — it builds unsigned Linux dir-pack artifacts only.

**Build** and **Release** packaging jobs resolve signing secrets from the **`production` GitHub Environment** when configured (`APPLE_*`, `WIN_CSC_*`, etc.). When secrets are empty (e.g. on a fork), macOS/Windows jobs still complete with unsigned ad-hoc builds rather than failing. See [`code-signing.md`](code-signing.md) for the full secret list.

**Release** build legs also emit SLSA provenance attestations and SPDX SBOM artifacts (Windows, macOS, and Linux), matching **Build** workflow supply-chain steps.

More context: [`code-signing.md`](code-signing.md) — full signing setup for all platforms.

---

## Branch protection (repository settings)

**Settings → Branches → Branch protection** on `main` / `master`:

1. Require status checks before merge.
2. Add checks that match **GitHub’s reported job names** after a successful run, for example:
   - **Quality — lint, typecheck, test, build** and **Docs — env reference sync** (CI)
   - **Package (macos x64)**, **Package (windows x64)**, and other Build legs — optional but useful if packaging regressions should block merges.

Rename a workflow or job → update the branch rule; stale required checks block merges until removed.

**Actions permissions:** allow the default `GITHUB_TOKEN` to create releases where needed (Release **publish** job). Optionally use **Environments** with required reviewers for `Release`.

---

## Release procedure (operator checklist)

1. Bump **`version`** in [`package.json`](../package.json) and merge to the default branch.
2. Create and push a tag **`v` + that version** (e.g. `v1.2.0` for `"1.2.0"`). Pre-releases: `v1.0.0-beta.1` ↔ `"1.0.0-beta.1"`.
3. **Actions → Release → Run workflow**; set **`tag`** to the pushed tag (and optional title / draft / prerelease flags).
4. When the run finishes, open the **draft** release if applicable, verify binaries, **`latest*.yml` / `*.blockmap`**, and **`SHA256SUMS`**, then publish in the GitHub UI. Full operator checklist: [`release-ops-checklist.md`](release-ops-checklist.md).

### Expected installer shapes

Naming and targets follow **[`electron-builder.config.mjs`](../electron-builder.config.mjs)** (Windows NSIS with arch in the `.exe` name, macOS DMG per arch, Linux **deb / rpm / AppImage** per arch). Release uploads one artifact per OS; the GitHub Release receives all files after **`merge-multiple`** download.

---

## Troubleshooting

| Symptom | What to check |
| ------- | ------------- |
| Release validate fails on checkout | Tag not pushed or wrong `tag` input. |
| Tag / version mismatch | [`package.json`](../package.json) `version` must equal the tag without the leading `v`. |
| Package job fails on artifact upload | Empty or missing **`release/`** outputs (expected installer globs) after `electron-builder` — inspect build logs on that leg. |
| Build queue / cancellations | Concurrency cancels superseded runs; re-run failed jobs if needed. |
| Required check never completes | Branch rule still lists a renamed or removed job. |
| Partial release | Delete draft release and fix; adjust tag or version and re-run. |
| SAST skips on fork PR | Expected — fork PRs are intentionally excluded to prevent token leakage. |

---

## Local parity (before pushing)

From the repository root (after `pnpm install`):

```bash
pnpm exec biome check .
pnpm run typecheck
pnpm run knip
pnpm run check:i18n
pnpm run test:coverage
```

Or run the full gate in one command: `pnpm run check`.

Optional full packaging (slow; run on matching host OS):

```bash
pnpm run build:mac    # macOS x64 + arm64
pnpm run build:win    # Windows x64 + arm64
pnpm run build:linux  # Linux x64 + arm64
```

Per-arch only (smaller CI-like runs):

```bash
pnpm run build:mac:arm64
pnpm run build:win:x64
pnpm run build:linux:x64
```

---

## Related documentation

- [`README.md`](../README.md) — project setup and commands; [docs index](README.md) — app docs
- [`testing.md`](testing.md) — Vitest and coverage scope
- [`building.md`](building.md) — what `build:*` and bundled binaries do
- [`code-signing.md`](code-signing.md) — macOS notarization, Windows Authenticode, Linux checksums, and required secrets
