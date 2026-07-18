# myvideo_ Studio — Phase 1 Architecture

Phase 1 delivers the isolated Studio shell: the commercial product surface and the
architectural boundary between the UI and the existing Remotion rendering engine.

## Decisions

1. **`studio/` is an isolated local application.** It has its own `package.json`,
   lockfile, TypeScript/ESLint/Next/Vitest configuration, and `node_modules`.
   Nothing is installed at the repository root, and the root engine is unaware of it.
   Stack: Next.js 16.2.10 (App Router, Turbopack, static output), React 19.2.7,
   TypeScript 5.9.3, Tailwind CSS 4.3.3, Zustand 5.0.14, Vitest 4 + Testing Library.
   `turbopack.root` is pinned to `studio/` so Next never infers the repo root
   workspace from the root lockfile.

2. **Phase 1 is mock-only.** Every project, media asset, track, and clip comes from
   hardcoded fixtures in `studio/fixtures/`. Panel data states (normal/empty/
   loading/error) are driven by explicit demo switchers because no real data source
   exists yet. Controls are disabled, mock-only, or local-state-only.

3. **No root engine imports.** Studio code never imports from `../src`, `../scripts`,
   or `../data`. The TypeScript path alias `@/*` resolves inside `studio/` only.

4. **No media access.** Studio reads no files under `input/`, `output/`,
   `deliveries/`, `public/runtime-selects/`, or any project media path. Thumbnails
   and waveforms are CSS placeholders. A test (`tests/safety.test.tsx`) statically
   verifies that runtime source imports no `fs`/`child_process`/network modules and
   that shell interactions never call `fetch`.

5. **No render integration.** `@remotion/player` is not installed; the preview
   monitor is an explicitly labeled mock canvas driven by local state.

6. **Future integration seam: a typed adapter around `VerticalCoreComposition`.**
   Phase 2 will introduce an adapter module (e.g. `studio/lib/engine/`) that maps a
   `ProjectDocument` to the props of `VerticalCoreComposition` and hosts Remotion
   Player behind that boundary. The engine's own types remain the engine's; the
   Studio speaks only through the adapter.

7. **Future project state is a versioned `ProjectDocument`.** Timeline persistence
   will serialize to a `{ schemaVersion, project, media, tracks, clips, settings }`
   document with explicit migrations, replacing today's implicit global
   `data/manifest.json` shape.

8. **Runtime project data lives outside source-controlled application code.**
   Phase 2+ project documents and caches will live in an OS-appropriate data
   directory (or a git-ignored workspace path), never inside `studio/` source or the
   repository's tracked engine paths.

9. **Explicit music selection replaces implicit alphabetical selection.** The engine
   currently picks the first audio file alphabetically
   (`scripts/build-manifest.mjs:200-203`). The `ProjectDocument` will carry an
   explicit music asset reference chosen in the UI.

10. **Engine defects are deferred, not mixed in.** Known watcher, file-identity,
    FFprobe, and ingestion defects are documented in
    `DEFERRED_ENGINE_HARDENING.md` and belong to a separate hardening branch
    (`fix/myvideo-engine-safety-hardening`). This UI branch does not touch them.

## State management

A single Zustand store (`studio/state/studioStore.ts`) holds all cross-panel state:
active nav item, project/section selection, media filter/search, inspector
selection, preview transport (aspect ratio, play state, mock clock, safe zones,
fullscreen), timeline zoom and per-track lock/mute/hide, panel visibility, and the
demo panel states. Purely presentational values (e.g. the nothing-selected project
settings) stay in component-local state.

### Data layer in Phase 2

The demo `StateSwitcher` controls and the store's explicit `PanelState` fields are
placeholders for a real async boundary. When project loading lands, the store's
`projectPanelState`/`mediaPanelState` become derived from actual load status
reported by the engine adapter (`studio/lib/engine/`), and the switchers are
removed. Pages stay statically rendered; all project data enters client-side
through the adapter (local reads via a narrow, typed IPC/loader surface — never
direct `fs` from UI components), hydrating the same Zustand store.

## Layout

Six regions in a CSS grid: application rail, project navigation, media browser,
preview monitor, inspector, and multitrack timeline, under a slim workspace toolbar
that hosts panel-visibility toggles. Narrow viewports get a controlled
"desktop workspace recommended" overlay.
