# CLAUDE.md — AI-assisted development guide

Reference this file when working on the Kajo Downloader Electron app with an AI coding assistant.

---

## Project structure

Single Electron app at the repository root (no pnpm workspaces).

```text
/
├── electron/      Electron main process, preload, IPC handlers, services
├── src/           React 19 renderer, shared IPC contract, i18n locales
├── scripts/       Binary-fetch + build helper scripts (yt-dlp / ffmpeg)
├── docs/          Architecture, building, CI notes
└── resources/     Bundled binaries cache (resources/bin)
```

Managed with **pnpm** (`pnpm@11.8.0`), Node **24**. `pnpm-workspace.yaml` has no members — it only holds pnpm project settings (`onlyBuiltDependencies`, `overrides`). All scripts run via plain `pnpm run <script>` (no `--filter`, no workspaces).

---

## Running tests

```bash
pnpm run test            # Vitest (no Docker needed)
pnpm run test:watch      # watch mode
pnpm run test:coverage   # unit tests + coverage (enforced)
```

Full local gate (format → lint → typecheck → knip → check:i18n → test:coverage → React Compiler ESLint):

```bash
pnpm run check
```

---

## Key architectural decisions

### Downloader pipeline

- yt-dlp engine for single video / playlist / channel batch downloads, metadata
  extraction, queue UI (pause/resume/cancel), quality/format selection, subtitles,
  and concurrency control. ffmpeg/ffprobe handle remux/merge.
- **In-app Search** — local `ytsearchN:` via yt-dlp; no API key, no account.
- **Download history** — local persistence; open-file / reveal-in-folder.
- **Site sign-in** — embedded browser sessions for member / private / age-gated content.
- All downloads are free and unrestricted — no tiers, no paywall.

### IPC security model

Renderer→main IPC handlers wrap work in `withValidSender` (rejects untrusted senders) and
must Zod-validate any payload via `parseIpcPayload(schema, raw, channel?)` (or a thin
wrapper such as `parseSearchIpcPayload`) before use — returns `null` (+ logs a warning) on
failure. Argument-less invokes still need `withValidSender`.

The IPC contract lives in three focused modules, re-exported through the
`src/shared/ipcContract.ts` barrel: `src/shared/ipcChannels.ts` (channel names),
`src/shared/ipcPayloadSchemas.ts` (Zod payload schemas — each annotated `z.ZodType<T>` so a
schema and its static type can't drift), and `electron/preloadApi/createRendererApi.ts` (the
`RendererApi` `window.api` bridge). The `ipcPreloadParity` test asserts the preload references
every channel.

### Local persistence

electron-store for settings and download history.

---

## Common patterns

### `parseIpcPayload`

```ts
const payload = parseIpcPayload(MyZodSchema, rawPayload, 'channel-name');
if (!payload) return; // validation failed; warning was already logged
```

The `channel` argument is optional (used only for log context).

### Zod + ESM imports

Import from `'zod'` — no subpath imports needed.

---

## Common pitfalls

| Pitfall | Details |
| --- | --- |
| Coverage gate | Coverage is enforced for `src/**` and `electron/**`. New files enter the coverage scope immediately and must be tested. |
| IPC parity | New channel? Add it to `ipcChannels.ts`, wire it in `createRendererApi.ts`, and add a Zod schema in `ipcPayloadSchemas.ts` for any validated payload; the `ipcPreloadParity` test fails if the preload never references a channel. |
| Shared download services | The yt-dlp/ffmpeg engine, metadata resolver, and download queue under `electron/services/` are shared by every download path — changing one signature ripples through start/pause/resume/cancel and the history store. |
| `electron-store` tampering | The IPC layer accepts values from electron-store on startup — validate them before use. |
| Binary fetch | `pnpm run dev` runs `scripts/ensure-dev-binaries.mjs`, which fetches pinned yt-dlp / ffmpeg / ffprobe / Deno (yt-dlp's JS runtime) when missing. Set `KAJO_SKIP_DEV_BINARIES=1` to skip. |
| JS runtime ≠ Electron-as-Node | yt-dlp's YouTube nsig/sig solving needs an external JS runtime. It runs on the **bundled Deno** (`--js-runtimes deno:<path>`), NOT the Electron binary as Node: the `runAsNode` fuse is disabled, so an `ELECTRON_RUN_AS_NODE` shim would boot a second app instance per download. |

---

## CI overview

| Workflow | Trigger | Purpose |
| --- | --- | --- |
| `ci.yml` | Push / PR to `main` or `master`; nightly cron (02:00 UTC) | Quality gate: audit → biome → typecheck → knip → check:i18n → React Compiler ESLint → tests + coverage → Electron build + bundle budget/delta → Linux dir pack. Plus a small docs job (`.env.example` ↔ `docs/env_reference.md` sync). |
| `build.yml` | Manual dispatch | Full packaging for macOS/Windows/Linux (electron-builder) |
| `release.yml` | Manual dispatch (tag input) | Creates a GitHub Release and uploads artifacts |
| `sast.yml` | Push / PR to `main` or `master`; weekly cron (Mondays 03:00 UTC) | Semgrep SAST scan |

---

## Environment files

- `.env.example` — all environment variables.
- `docs/env_reference.md` — authoritative descriptions + defaults.
- `docs/architecture.md` — system topology.
