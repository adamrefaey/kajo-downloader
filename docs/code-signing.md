# Code Signing

How to sign, notarize, and release-sign Kajo Downloader across macOS, Windows, and Linux.

---

## Overview

Signing is not required for local development or CI quality checks. It **is** required for release builds distributed to end users:

- **macOS:** Gatekeeper blocks or strongly warns on unsigned/unnotarized apps; required since macOS 10.15.
- **Windows:** Unsigned installers trigger SmartScreen "unrecognized app" warnings; reputation builds only after a volume of signed downloads.
- **Linux:** No platform enforcement; SHA256 checksums (already generated in the release workflow) are the baseline; GPG signing is only needed if distributing through a package repository.

All signing credentials are stored as **GitHub encrypted repository / environment secrets** and injected into packaging workflows. The manual **`build.yml`** workflow forwards macOS and Windows signing env vars but does **not** import the macOS certificate into a keychain — macOS signing from `build.yml` is skipped unless the runner already has the certificate installed. The **`release.yml`** workflow **now performs full production signing**: it reads secrets from the `production` GitHub Environment, imports the Developer ID certificate into an ephemeral keychain, and lets electron-builder sign + notarize. Just populate the secrets below.

---

## macOS — Developer ID + Notarization

### One-time prerequisites

1. **Apple Developer Program** membership — $99/year at [developer.apple.com](https://developer.apple.com/programs/).
2. **Developer ID Application** certificate — create in **Xcode → Accounts → Manage Certificates**, then export as a `.p12` file and note the passphrase.
3. **App-specific password** for notarization — generate at [appleid.apple.com](https://appleid.apple.com) → Sign-In and Security → App-Specific Passwords. electron-builder's `notarytool` integration reads `APPLE_ID`, `APPLE_APP_SPECIFIC_PASSWORD`, and `APPLE_TEAM_ID` to submit the app for notarization automatically.

### Repository secrets (macOS)

| Secret name | How to produce the value |
| ----------- | ------------------------ |
| `APPLE_SIGNING_IDENTITY` | Certificate common name as shown by `security find-identity -v -p codesigning`, e.g. `Developer ID Application: Your Name (TEAMID)` |
| `APPLE_CERTIFICATE_BASE64` | `base64 -i MyCert.p12` |
| `APPLE_CERTIFICATE_PASSWORD` | Passphrase set when exporting the `.p12` |
| `APPLE_TEAM_ID` | 10-character team ID, e.g. `ABC123DEF4` — visible in the Apple Developer portal |
| `APPLE_ID` | Apple ID email used to log in to [appstoreconnect.apple.com](https://appstoreconnect.apple.com) |
| `APPLE_APP_SPECIFIC_PASSWORD` | App-specific password generated at [appleid.apple.com](https://appleid.apple.com) — required for notarization when using Apple ID credentials |

### Workflow steps (release.yml — already implemented)

These steps are **already wired into** [`release.yml`](../.github/workflows/release.yml): the build job runs in the `production` environment, an `Import Apple Developer ID certificate (macOS)` step loads the `.p12` into an ephemeral `$RUNNER_TEMP` keychain (paired with a guaranteed `Clean up signing keychain` step), and the build job forwards every signing/notarization env var. The import step **auto-skips** when `APPLE_CERTIFICATE_BASE64` is unset, so forks without secrets still build (unsigned/ad-hoc). The snippet below shows the essence; the live workflow is the source of truth.

```yaml
- name: Import Apple Developer certificate
  if: matrix.platform == 'macos'
  env:
    APPLE_CERTIFICATE_BASE64: ${{ secrets.APPLE_CERTIFICATE_BASE64 }}
    APPLE_CERTIFICATE_PASSWORD: ${{ secrets.APPLE_CERTIFICATE_PASSWORD }}
  run: |
    KEYCHAIN_PASSWORD=$(openssl rand -hex 16)
    security create-keychain -p "$KEYCHAIN_PASSWORD" build.keychain
    security default-keychain -s build.keychain
    security unlock-keychain -p "$KEYCHAIN_PASSWORD" build.keychain
    echo "$APPLE_CERTIFICATE_BASE64" | base64 --decode > cert.p12
    security import cert.p12 -k build.keychain -P "$APPLE_CERTIFICATE_PASSWORD" \
      -T /usr/bin/codesign
    security set-key-partition-list -S apple-tool:,apple: \
      -s -k "$KEYCHAIN_PASSWORD" build.keychain
    rm cert.p12

# Replaces the existing generic "Build and package" step.
# Secrets for the non-active platform are empty; electron-builder skips signing when they are unset.
- name: Build and package
  env:
    CSC_NAME: ${{ secrets.APPLE_SIGNING_IDENTITY }}
    APPLE_SIGNING_IDENTITY: ${{ secrets.APPLE_SIGNING_IDENTITY }}
    APPLE_TEAM_ID: ${{ secrets.APPLE_TEAM_ID }}
    APPLE_ID: ${{ secrets.APPLE_ID }}
    APPLE_APP_SPECIFIC_PASSWORD: ${{ secrets.APPLE_APP_SPECIFIC_PASSWORD }}
    CSC_LINK: ${{ secrets.WIN_CSC_LINK }}
    CSC_KEY_PASSWORD: ${{ secrets.WIN_CSC_KEY_PASSWORD }}
    WIN_CERTIFICATE_SUBJECT_NAME: ${{ secrets.WIN_CERTIFICATE_SUBJECT_NAME }}
    WIN_PUBLISHER_NAME: ${{ secrets.WIN_PUBLISHER_NAME }}
  run: pnpm run ${{ matrix.script }}
```

### electron-builder.config.mjs (current state)

[`electron-builder.config.mjs`](../electron-builder.config.mjs) sets `hardenedRuntime: true` and applies `mac.identity` / `notarize` only when the matching env vars are non-empty (`CSC_NAME` or `APPLE_SIGNING_IDENTITY` for identity; `APPLE_ID` + `APPLE_APP_SPECIFIC_PASSWORD` + `APPLE_TEAM_ID` for notarization). Local/unsigned builds set `identity: null` so electron-builder skips signing cleanly instead of treating an unresolved `${env.*}` macro as a certificate name. Packaging scripts pass `--config electron-builder.config.mjs` (electron-builder does not auto-load `*.config.mjs`).

### Entitlements note

[`build/entitlements.mac.plist`](../build/entitlements.mac.plist) grants only the two Chromium/V8 JIT entitlements (`allow-jit`, `allow-unsigned-executable-memory`). Bundled yt-dlp / ffmpeg / Deno run as separate `spawn()` children, so `disable-library-validation` and `allow-dyld-environment-variables` are intentionally omitted to reduce notarization scrutiny.

---

## Windows — Authenticode Code Signing

### Certificate options

**Standard OV (Organization Validation)** — ~$70–200/year from DigiCert, Sectigo, Certum, etc. Delivered as a `.pfx` file. Straightforward to use in CI. Still triggers SmartScreen "unrecognized app" warnings on early downloads until the certificate builds reputation through download volume (typically a few hundred installs).

**EV (Extended Validation)** — ~$300–600/year. Historically gave instant SmartScreen reputation, though that guarantee has weakened. The primary problem for CI is that EV certificates are traditionally delivered on a USB hardware token (SafeNet/DigiCert), which cannot be used in GitHub Actions. The CI-compatible path is a cloud HSM signing service such as [SSL.com eSigner](https://www.ssl.com/esigner/) or [SignPath.io](https://about.signpath.io/).

For a first release, start with an OV certificate. Upgrade to EV/cloud HSM if SmartScreen warnings are causing meaningful user drop-off.

### Repository secrets (Windows)

| Secret name | How to produce the value |
| ----------- | ------------------------ |
| `WIN_CSC_LINK` | `base64 -i cert.pfx` (macOS/Linux) or `certutil -encode cert.pfx encoded.b64` (Windows) — passed to electron-builder as `CSC_LINK` |
| `WIN_CSC_KEY_PASSWORD` | Password used when the `.pfx` was exported — passed to electron-builder as `CSC_KEY_PASSWORD` |
| `WIN_CERTIFICATE_SUBJECT_NAME` | CN of the signing certificate, e.g. `Your Company Name` — applied to `signtoolOptions.certificateSubjectName` in [`electron-builder.config.mjs`](../electron-builder.config.mjs) when set |
| `WIN_PUBLISHER_NAME` | Publisher name as it should appear in the installer and to `electron-updater` — must match the certificate CN |

### Workflow changes (release.yml — Windows)

electron-builder reads `CSC_LINK` (accepts base64 data or a file path) and `CSC_KEY_PASSWORD` automatically when building Windows targets. These env vars are included in the unified `Build and package` step shown in the macOS section above — no additional step or separate build step is needed for Windows.

---

## Linux — Checksums and Package Signing

Linux has no platform-enforced signing comparable to macOS or Windows. The release workflow already generates `SHA256SUMS` for all release assets — that is the baseline and is sufficient for GitHub Releases direct downloads.

If you distribute through a custom package repository in the future:

- **`.deb` / APT repo:** sign packages with a GPG key; users add your public key to their apt keyring.
- **`.rpm` / YUM/DNF repo:** sign packages with GPG via `rpmsign`; required for repository metadata verification.
- **AppImage:** no standard signing mechanism; SHA256 checksums remain the norm.

No additional secrets are needed for the current direct-download distribution model.

---

## Unsigned vs signed packaging workflows

Both **`build.yml`** and **`release.yml`** are manual (`workflow_dispatch`) — neither runs on every push.

**`build.yml`** forwards macOS and Windows signing env vars (`APPLE_SIGNING_IDENTITY`, `APPLE_ID`, `APPLE_APP_SPECIFIC_PASSWORD`, `APPLE_TEAM_ID`, `CSC_LINK`, etc.) but does **not** include the macOS certificate-import step (keychain setup using `APPLE_CERTIFICATE_BASE64`). macOS signing is skipped unless the runner already has the certificate; Windows signing works when `WIN_CSC_LINK` is set.

**`release.yml`** imports the Developer ID certificate into an ephemeral keychain and forwards all macOS + Windows signing/notarization env vars from the `production` environment. Dispatching a tag through it produces **signed + notarized** macOS DMGs and signed Windows installers. When the Apple/Windows secrets are absent (e.g. a fork), the import step skips and electron-builder emits unsigned ad-hoc builds — the release still completes.

When signing secrets are absent or empty, electron-builder silently skips signing on both platforms (on macOS the build is still validly ad-hoc-signed via the `resetAdHocDarwinSignature` fuse, so it runs locally).

---

## All signing secrets at a glance

| Secret | Platform | Purpose |
| ------- | -------- | ------- |
| `APPLE_SIGNING_IDENTITY` | macOS | Certificate CN → `CSC_NAME` / optional `mac.identity` in `electron-builder.config.mjs` |
| `APPLE_CERTIFICATE_BASE64` | macOS | Code signing (`.p12` base64) |
| `APPLE_CERTIFICATE_PASSWORD` | macOS | Code signing (`.p12` password) |
| `APPLE_TEAM_ID` | macOS | Notarization team ID |
| `APPLE_ID` | macOS | Apple ID email for notarization |
| `APPLE_APP_SPECIFIC_PASSWORD` | macOS | App-specific password for notarization |
| `WIN_CSC_LINK` | Windows | Code signing (`.pfx` base64) — electron-builder reads as `CSC_LINK` |
| `WIN_CSC_KEY_PASSWORD` | Windows | Code signing (`.pfx` password) — electron-builder reads as `CSC_KEY_PASSWORD` |
| `WIN_CERTIFICATE_SUBJECT_NAME` | Windows | Certificate CN for `signtoolOptions.certificateSubjectName` |
| `WIN_PUBLISHER_NAME` | Windows | Publisher name verified by `electron-updater` |

---

## Related documentation

- [`docs/ci-cd.md`](ci-cd.md) — workflow structure, matrix legs, artifact names
- [`docs/building.md`](building.md) — local build commands and bundled binaries
