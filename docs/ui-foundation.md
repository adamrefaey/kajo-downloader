# UI foundation

**Scope:** [`src/renderer/src/`](../src/renderer/src/)

This document is the single source of truth for how the renderer UI is built, styled, and made accessible. It replaces informal “template defaults” with what the codebase actually does today and what is allowed going forward.

---

## Goals

- **Predictable styling:** No runtime style engines; everything visible should trace to static CSS and design tokens.
- **Accessible by default:** Semantic HTML, explicit ARIA where needed, visible focus, and keyboard-friendly controls.
- **Electron-friendly:** Keep the renderer bundle and dev server lean; avoid heavy CSS-in-JS or large runtime styling stacks.

---

## Runtime stack

| Layer | Choice | Notes |
| ----- | ------ | -------- |
| UI library | **React** (see [`package.json`](../package.json)) | Renderer entry: [`src/renderer/src/main.tsx`](../src/renderer/src/main.tsx) |
| Controls | **Native HTML** (`button`, `input`, `select`, `section`, …) | No headless component library in use; accessibility via semantics + `aria-*` attributes (see **Accessibility** below). |
| State | **Zustand** | Download / queue state: [`src/store/downloadStore.ts`](../src/store/downloadStore.ts) |
| i18n | **`i18next` + `react-i18next`** | 11 locales ([`src/i18n/supportedLocales.ts`](../src/i18n/supportedLocales.ts)); wired via `I18nextProvider` in [`main.tsx`](../src/renderer/src/main.tsx); RTL direction toggled on `<html dir>` from the active locale. |
| Fonts | **`@fontsource/ibm-plex-sans`** | Imported in [`main.tsx`](../src/renderer/src/main.tsx) (300 / 400 / 600). `body` uses `"IBM Plex Sans"` in the active stylesheet. |

---

## Styling model (zero runtime CSS)

1. **Single app stylesheet entry (current):** [`src/renderer/src/assets/global.css`](../src/renderer/src/assets/global.css)  
   Imported from [`main.tsx`](../src/renderer/src/main.tsx). It composes tokens, platform overrides, and global resets.

2. **Imports inside that file (order matters):**
   - [`src/renderer/src/design/tokens.css`](../src/renderer/src/design/tokens.css) — semantic design tokens (`--surface-*`, `--text-*`, `--accent`, radii, shadows, blur values, application-level `--app-*` tokens, compatibility `--ev-*` and `--color-*` aliases).
   - [`src/renderer/src/design/platform.css`](../src/renderer/src/design/platform.css) — overrides when `body` has `data-platform`.
   - [`src/renderer/src/assets/base.css`](../src/renderer/src/assets/base.css) — box sizing and list reset only; `html` / `body` / `#root` are in [`global.css`](../src/renderer/src/assets/global.css).
   - [`src/renderer/src/assets/shared.css`](../src/renderer/src/assets/shared.css) — shared primitive class names (`.input`, `.panel`, `.sr-only`, etc.).
   - [`src/renderer/src/assets/toolbar-settings.css`](../src/renderer/src/assets/toolbar-settings.css) — toolbar and settings panel primitives.
   - [`src/renderer/src/assets/settings-modal.css`](../src/renderer/src/assets/settings-modal.css) — settings modal layout rules.
   - [`src/renderer/src/assets/responsive.css`](../src/renderer/src/assets/responsive.css) — viewport-width breakpoint overrides.

   `global.css` also owns its own `:root` block that defines app-level colour shortcuts (`--bg-1`, `--bg-2`, `--panel`, `--panel-2`, `--border`, `--text`, `--text-dim`, `--text-faint`, `--green`, `--green-dim`) and the layout constant `--app-main-column-max-width: 1040px`. These tokens complement `tokens.css`; source them from whichever file provides the right semantic level.

3. **Component styles:** Prefer colocated **`*.module.css`** + `clsx` for scoped UI. Keep **global** class strings for shared primitives (`.input`, `.panel`, …) from [`shared.css`](../src/renderer/src/assets/shared.css) and related imports. No `styled-*`, Emotion, or Tailwind runtime.

4. **Utility for screen readers:** Shared helpers such as `.sr-only` live in [`shared.css`](../src/renderer/src/assets/shared.css).

---

## Platform theming

`body` receives **`data-platform`** at runtime (`macos` | `windows` | `linux`). [`WorkflowProvider`](../src/renderer/src/app/context/WorkflowProvider.tsx) reads the platform value directly from the preload API (`window.api?.getPlatform?.()`) — it is **not** passed down as a prop from [`App.tsx`](../src/renderer/src/App.tsx). `WorkflowProvider` then calls [`useAppInitAndCatalogEffects`](../src/renderer/src/app/controller/useAppInitAndCatalogEffects.ts) with the platform value; that hook sets the attribute on `document.body` via a `useEffect`.  
[`src/renderer/src/design/platform.css`](../src/renderer/src/design/platform.css) defines `body[data-platform="…"] { … }` blocks that adjust fonts, radii, panel backgrounds, and other shell-adjacent tokens so the same markup feels native on each OS.

Do not hardcode OS checks in CSS; extend [`platform.css`](../src/renderer/src/design/platform.css) or tokens when adding platform-specific polish.

---

## Accessibility

Components use semantic HTML plus attributes such as `aria-label`, `aria-labelledby`, `aria-describedby`, `aria-invalid`, `aria-live`, `role="progressbar"`, `role="log"` where appropriate. Examples: [`src/renderer/src/components/UrlInput.tsx`](../src/renderer/src/components/UrlInput.tsx), [`DownloadItem.tsx`](../src/renderer/src/components/DownloadItem.tsx), [`App.tsx`](../src/renderer/src/App.tsx).

For **complex widgets** (dialogs, menus, comboboxes), either implement patterns carefully (focus trap, roving tabindex, WAI-ARIA authoring practices) or add a **small, justified** dependency in a PR. Avoid pulling in large UI stacks for simple buttons and fields.

---

## What not to add (without an architecture exception)

- Runtime **CSS-in-JS** (e.g. Emotion, Styled Components, Stitches).
- **Tailwind** or other utility pipelines that inject a large runtime or require a parallel token story unless explicitly approved.
- Heavy **component libraries** “by default” for primitives the app already covers with native elements.
- Ad-hoc **inline `style={{}}`** for theme or layout except rare one-offs (e.g. dynamic progress width) with a short comment.

Document exceptions in a PR and link rationale here or in the overview doc.

---

## File map (quick reference)

| Path | Role |
| ---- | ---- |
| [`src/renderer/src/main.tsx`](../src/renderer/src/main.tsx) | Font + global CSS import, React root |
| [`src/renderer/src/assets/global.css`](../src/renderer/src/assets/global.css) | CSS entry point: imports, `html`/`body`/`#root` rules, app-level `:root` tokens |
| [`src/renderer/src/design/tokens.css`](../src/renderer/src/design/tokens.css) | `:root` semantic tokens (`--surface-*`, `--text-*`, `--app-*`, compatibility aliases) |
| [`src/renderer/src/design/platform.css`](../src/renderer/src/design/platform.css) | `data-platform` overrides |
| [`src/renderer/src/assets/base.css`](../src/renderer/src/assets/base.css) | Universal box-sizing + list reset |
| [`src/renderer/src/assets/shared.css`](../src/renderer/src/assets/shared.css) | Shared primitive classes (`.input`, `.panel`, `.sr-only`, …) |
| [`src/renderer/src/assets/toolbar-settings.css`](../src/renderer/src/assets/toolbar-settings.css) | Toolbar and settings panel primitives |
| [`src/renderer/src/assets/settings-modal.css`](../src/renderer/src/assets/settings-modal.css) | Settings modal layout rules |
| [`src/renderer/src/assets/responsive.css`](../src/renderer/src/assets/responsive.css) | Breakpoint overrides |
| [`src/renderer/src/App.tsx`](../src/renderer/src/App.tsx) | Root component; mounts `WorkflowProvider` (platform is read inside `WorkflowProvider` from the preload API, not passed as a prop from here) |
| [`src/renderer/src/components/`](../src/renderer/src/components/) | Presentational and feature components |

---

## Checklist for new UI work

1. Reuse or extend **tokens** in [`tokens.css`](../src/renderer/src/design/tokens.css) before introducing one-off hex values.
2. Prefer **native elements** first; document any new widget pattern (focus, keyboard, ARIA) in the PR.
3. Add component rules in a colocated **`*.module.css`**; extend [`global.css`](../src/renderer/src/assets/global.css) (or `shared.css` / `toolbar-settings.css`) only for true globals.
4. Verify **keyboard** use, **focus visibility**, and **screen reader** labels / live regions for loading and errors.

---

## Related docs

- System architecture: [`architecture.md`](architecture.md)
