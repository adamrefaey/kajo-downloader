# Release ops checklist (first public v1)

Operator-owned steps that cannot be completed from application code alone. Complete before undrafting the first public GitHub Release.

## 1. Secrets

Populate the GitHub **`production`** environment with every secret listed in [`code-signing.md`](code-signing.md) (Apple notarization + Windows Authenticode + `WIN_PUBLISHER_NAME` matching the cert CN).

## 2. Signed dry-run

```bash
gh workflow run release.yml -f tag=v1.0.0
```

Verify:

- Three dual-arch jobs completed (`macos` / `windows` / `linux`) — each `latest*.yml` should list both arches
- macOS: `spctl -a -vv` / Gatekeeper on a clean Mac
- Windows: Authenticode signature; publisher string matches `WIN_PUBLISHER_NAME`
- Linux: AppImage / deb / rpm launch

Keep the GitHub Release as a **draft** until QA passes.

## 3. Auto-update

1. Install the draft v1.0.0 artifact.
2. Publish a follow-up draft/release pair (e.g. v1.0.1) so `electron-updater` can see a newer version.
3. Confirm Help → Check for updates finds the new build (Windows publisher name must match; Linux only via AppImage).
4. Confirm updater metadata (`latest*.yml` / `*.blockmap`) landed on the Release alongside installers (`release.yml` uploads these globs).
5. Confirm `publish.owner`/`repo` in `electron-builder.config.mjs` matches the GitHub repo hosting Releases.

To ship without updates temporarily, set `KAJO_DISABLE_AUTO_UPDATE=1` in the build environment (not recommended for the public track).

## 4. Manual QA

Execute the full [`release-qa.md`](release-qa.md) checklist on clean VMs for each OS.

## 5. Branch protection

Require:

- Quality — lint, typecheck, test, build
- Docs — env reference sync
- Semgrep SAST (optional but recommended)

## 6. Public tag

When the checklist passes: ensure `package.json` `version` matches the tag, undraft/publish the Release, announce.
