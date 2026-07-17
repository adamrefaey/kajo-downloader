# Security policy

## Supported versions

This project has not shipped a public release yet. Security fixes land on the default branch and ship with the next tagged release.

## Reporting a vulnerability

Please report security issues privately via GitHub Security Advisories for this repository (or email the maintainer listed in `package.json` / the GitHub profile). Do not open a public issue for exploitable vulnerabilities until a fix is available or we agree disclosure is appropriate.

We aim to acknowledge reports within 7 days and to provide a remediation timeline once the issue is confirmed.

## Hardening posture (maintainers)

Production builds are expected to keep:

- `contextIsolation: true`, `nodeIntegration: false`, `sandbox: true`, `webSecurity: true`
- Typed `contextBridge` API only (no raw `ipcRenderer` exposure)
- Zod-validated IPC payloads + `withValidSender` on every invoke
- Custom `kajo-app://` protocol (not `file://`) for the renderer
- Electron Fuses: `runAsNode` off, ASAR integrity, cookie encryption fuse
- Auto-update over HTTPS with signature verification (`electron-updater` + signed artifacts)
- `electron-builder` **≥ 26.15.0** (AppImage `LD_LIBRARY_PATH` CVE-2026-54672 fixed; repo pins **26.15.6+** for NSIS multi-arch install reliability)

See [`docs/architecture.md`](docs/architecture.md) and [`docs/code-signing.md`](docs/code-signing.md).