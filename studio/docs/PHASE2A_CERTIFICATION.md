# myvideo_ Studio — Phase 2A Read-Only Integration Certification

Date: 2026-07-18
Branch: `feat/studio-phase2-readonly-integration`
Base: `v1-top-5-skills` @ `b18446b479d35cecbb8cd1a35e6f6be63a9d815b`
Governing architecture: `PHASE2_READONLY_INTEGRATION_PLAN.md` (committed as `598bd27`)

## 1. What shipped

The Studio now discovers the engine's real materialized projects read-only,
loads a validated `ProjectDocumentV1`, and plays the actual
`VerticalCoreComposition` through `@remotion/player` — play, pause, seek,
preview scale — with persistent Read-only / Cached-props labeling and
controlled absent/stale/invalid/missing-media states. No engine file, media
file, manifest, cache, or project datum is written, and no render, export,
FFmpeg/FFprobe, ingestion, or watcher path exists in the Studio.

Operator launch (loopback-only by construction):

```
cd studio && npm run dev        # binds 127.0.0.1:3000, anchors MYVIDEO_REPO_ROOT
```

## 2. Final architecture (as implemented)

```
Browser (client zone)                       Next server (server zone)
 ProjectNav / PreviewMonitor /               app/api/projects/route.ts
 MediaBrowser / Inspector / Timeline         app/api/projects/[projectId]/route.ts
   │ studioStore (zustand)                   app/api/assets/[assetId]/route.ts
   │ lib/projectClient.ts  ← only fetch()      │ server/http.ts (Host allowlist)
   │ lib/projectDocument.ts (validators ×2)    │ server/projectRepository.ts
   │ lib/projectAdapter.ts → PlayerConfig      │ server/assetStream.ts (Range)
   │ components/RealPreview.tsx                │ server/pathPolicy.ts (realpath)
   │   └ <Player> + ../src/VerticalCore…       ▼  read-only fs (see roots)
```

### Project roots (allowlisted, realpath-resolved, read-only)

Anchored at `MYVIDEO_REPO_ROOT` (set by the dev/start scripts; sentinel-checked
for `package.json` name `my-video`, fails closed otherwise):

- `input/selects/` — discovery (directory names only)
- `input/metadata/` — display metadata JSON
- `.cache/render-props/` — materialized `VerticalCoreProps` (source of truth)
- `public/runtime-selects/` — staged media bytes (Range-served)

### Security boundary

- Every `studio/server/*` module starts with `import "server-only"`; a client
  bundle import fails the build. Structural tests re-verify the boundary.
- Routes export **only** `GET`/`HEAD` + `dynamic = "force-dynamic"`. No POST/
  PUT/PATCH/DELETE, no server actions, no mutation surface exists.
- Host allowlist `127.0.0.1 | localhost | [::1]` (optional port) enforced
  before any repository access; dev/start bind `-H 127.0.0.1` (verified via
  `lsof`: single `127.0.0.1:3000` listener).
- Project ids: `^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$`, no `..`; unknown → 404.
- Asset ids: canonical unpadded base64url of `slug/fileName`, decode →
  re-encode byte-equality, exactly one `/`, then **membership check against
  the project's props cache** before any path resolution; `realpath` prefix
  check against the allowlisted root as backstop.
- Responses: `Cache-Control: no-store` (JSON) / `private` (media), `nosniff`,
  `Cross-Origin-Resource-Policy: same-origin`, no CORS headers, no absolute
  paths, no stack traces (verified by tests and by response scans in QA).
- Write prevention: zero write-capable `fs` APIs, zero `child_process`, zero
  `@remotion/renderer|bundler|cli` imports anywhere in studio runtime —
  enforced by `tests/safety.test.tsx` static scans.

## 3. ProjectDocumentV1

Implemented in `studio/lib/projectDocument.ts` exactly as planned (§7 of the
architecture doc): `schemaVersion: 1`, slug-validated `projectId`, display
name, `status ∈ {ready, props-missing, media-missing, invalid}`,
`readOnly: true`, `source: "materialized-cache"`, `cacheTimestamp` (props
mtime), `freshness ∈ {current, stale, unknown}` (cache mtime vs selects +
metadata mtimes), fixed composition meta (1080×1920 @30fps, duration by the
engine formula Σclips − overlaps), validated `VerticalCorePropsV1` with clip
`src` rewritten to `api/assets/<assetId>` before validation (engine-relative
paths never cross the boundary), asset refs, explicit `captions: null` /
`music: null`, bounded `warnings`. Validators run server-side before
responding AND client-side after fetching; unknown keys are stripped; colors
must match `^#[0-9a-fA-F]{3,8}$`; numbers are range-checked integers.
`lib/projectAdapter.ts` maps the document to Player props purely.

## 4. Player integration

- `@remotion/player@4.0.445` + `@remotion/media@4.0.445` (exact) in studio;
  root `@remotion/media` pinned exact (founder decision 5).
- Single-instance rule: `studio/tsconfig.json` `paths` pins `remotion` and
  `@remotion/media` to the studio copies for all compiled source (Turbopack
  honors the app tsconfig; `turbopack.root` spans the repo so
  `../src/VerticalCoreComposition.tsx` compiles in). React is unified by
  Next's compiler. **Verified in the emitted production bundle**: unique
  remotion-internal marker strings appear exactly once across all chunks.
  `vitest.config.ts` mirrors the aliases for tests.
- Boot assertion: `RealPreview` refuses to render unless `VERSION === 4.0.445`.
- The Player receives `component={VerticalCoreComposition}` (imported directly
  from the engine source; `src/Root.tsx` is never imported), validated
  inputProps, and `acknowledgeRemotionLicense` (§6). `controls={false}` —
  the Studio transport drives `play()/pause()/seekTo()` via `PlayerRef`, and
  `frameupdate`/`play`/`pause` events replace the Phase 1 mock clock.
- Media loads through `staticFile("api/assets/<id>")` → `/api/assets/<id>`
  with byte-range requests (observed 206s in QA). `@remotion/media` renders
  via WebCodecs to a `<canvas>` in Chrome.

## 5. Dependency state

| Package | Where | Version |
|---|---|---|
| remotion, @remotion/cli, @remotion/tailwind-v4 | root | 4.0.445 exact (unchanged) |
| @remotion/media | root | **4.0.445 exact (pinned this branch)** |
| @remotion/player, @remotion/media | studio | 4.0.445 exact (added) |
| server-only | studio | 0.0.1 exact (added) |

Lockfile review: registry-only resolutions, no git/URL deps, no new install
scripts, single remotion version per tree (nested `zod@4.3.6` is a vendor
dependency of `@remotion/media`).

## 6. Licensing basis and future gate

- Mechanism (verified in installed 4.0.445 types and source,
  `studio/node_modules/@remotion/player/dist/cjs/Player.d.ts` — declares
  `acknowledgeRemotionLicense?: boolean` — and `dist/esm/index.mjs`, whose
  `acknowledgeRemotionLicenseMessage` only suppresses a console notice
  pointing at remotion.dev/license; 2026-07-18): no key, no separate API, no
  network activation exists in this version. We pass the prop.
- Approved basis (founder decision 4, 2026-07-18): individual use, local
  Studio, no customer distribution, no hosted product, no automated paid
  rendering, team below the free-license threshold (Remotion Special License:
  free for individuals and for-profit orgs ≤3 employees; source
  `github.com/remotion-dev/remotion/LICENSE.md`, fetched 2026-07-18).
- **Future gate**: commercial distribution, customer-facing access,
  organizational growth past 3 employees, or any hosted/automated rendering
  product REQUIRES licensing re-verification against the then-current terms
  (and likely a Company License) before launch. Nothing was purchased.

## 7. Test matrix

110 tests, 8 files, all passing; no local media or project data required
(temp fixture repos only — CI-safe):

- `safety.test.tsx` — static: client zone free of Node imports/`process.env`/
  server-zone imports; `server-only` markers; write-capable fs ban; child-
  process/renderer/bundler/CLI ban; fetch confined to `lib/projectClient.ts`;
  GET/HEAD-only route exports + `force-dynamic`; engine composition graph
  browser-safety; no `dangerouslySetInnerHTML`; no serialized `/Users/`
  paths. Dynamic: shell interactions produce only same-origin GET
  `/api/(projects|assets)` calls; WebSocket/XHR/EventSource banned.
- `pathPolicy.test.ts` — sentinel anchoring; slug/file-name matrices; `../`,
  encoded, backslash, absolute traversal; symlink escape; symlinked-directory
  prefix collision; asset-id canonicalization (padding, alternate alphabet,
  zero/multiple slashes, embedded traversal); membership gate (cross-project,
  unreferenced file, unknown project, directory target, unsupported
  extension); full `parseRange` matrix.
- `api.test.ts` — host allowlist accept/reject; list/document endpoints over
  fixture repos for every status; freshness staleness; controlled 400/404/500
  shapes; path-leak scans on bodies and headers; full/HEAD/initial/open/
  suffix/multi/unsatisfiable Range behavior with exact `Content-Range`;
  engine duration formula cross-check (172 = 90+90−8); sentinel fail-closed.
- `projectDocument.test.ts` — validator fuzzing: colors (CSS injection),
  ranges, unknown-key stripping, schema/composition/duration mismatches,
  provenance and asset-ref rejection.
- `realProjects.test.tsx` — list → select → real metadata + player (mocked in
  jsdom) + read-only labels; controlled error instead of mock substitution;
  media-missing warnings; client-side validation rejection; labeled mock
  shell separation; list failure + retry.
- Phase 1 suites (`regions`, `interactions`, `states`) — reconciled and
  passing unchanged in intent.

## 8. Validation results (2026-07-18, local)

| Command | Result |
|---|---|
| root `npm ci --ignore-scripts --no-audit --no-fund` | ok (313 pkgs) |
| root `npx eslint src` | 0 errors, 5 pre-existing warnings (unchanged files) |
| root `npx tsc --noEmit` | clean |
| root `npm run check:browser-safe` | OK — 2 modules verified |
| studio `npm ci --no-audit --no-fund` | ok (463 pkgs) |
| studio `npm run lint` | clean |
| studio `npm run typecheck` | clean |
| studio `npm test -- --run` | 110/110 pass (post-review-fix run) |
| studio `npm run build` | success (page static, 3 API routes dynamic) |
| `git diff --check` / cleanliness | clean; only `?? .mcp.json` untracked |

## 9. Real-browser QA (Chrome via Playwright, 2026-07-18)

Dev server started with `npm run dev`; `lsof` showed a single
`TCP 127.0.0.1:3000 LISTEN` (no `0.0.0.0`, no `[::]`). 21/21 checks passed:

- Studio loads; real list shows `demo` and `test-client-20260422`.
- Selecting demo: metadata `1080×1920 · 30 fps · 299f`, Read-only +
  Cached-props chips, inspector overview (status ready, freshness current,
  3 assets), read-only timeline with the real clip sequence.
- Composition mounts a WebCodecs `<canvas>`; play advances real frames;
  pause freezes the clock; seek to frame 250 lands 250; scale 50% halves the
  canvas box; duration reads 299 frames.
- Media served via `/api/assets/…` (7 requests, 206 partials observed);
  curl checks: 206 `bytes 0-1023/5182667`, HEAD 200, spoofed Host → 403.
- No horizontal overflow at 1920×1080, 1440×900, 1280×800.
- Zero external network requests, zero non-GET/HEAD requests, zero
  unexpected console errors (only ≥400 response the whole session was the
  QA's own deliberate `/api/projects/ghost` 404 probe).
- Server terminated afterwards; no listener remained. Screenshots/logs kept
  outside the repository (session scratchpad).

## 10. Protected-file non-mutation proof

SHA-256 recorded before QA and re-verified after for `.cache/render-props/
{demo,test-client-20260422}.json` and `input/metadata/*.json` — all `OK`.
Size/mtime/inode tuples recorded for all staged media under
`public/runtime-selects/{demo,test-client-20260422}/` and source selects —
byte-identical diff. `git status` clean except the permitted untracked
`.mcp.json`.

## 11. Deviations from the architecture document

1. **Aliasing mechanism**: the plan proposed `turbopack.resolveAlias`;
   Turbopack 16.2.10 rejects absolute-path alias values, so the equivalent
   pin is implemented via `tsconfig.json` `paths` (verified single-instance
   in the emitted bundle). React is left to Next's own unification.
2. **Boundary marker location**: the browser-safe engine boundary is the
   existing `src/VerticalCoreComposition.tsx` (comment + root
   `check:browser-safe` import-graph guard) rather than a new wrapper module —
   the file was already clean; a wrapper would add indirection without
   isolation. Root registration behavior is unchanged.
3. **`server/http.ts`** exists in addition to the three planned server files
   (Host allowlist + error shaping shared by routes).

## 11b. Adversarial second-pass review (2026-07-18)

A fresh-context adversarial second-pass review (not fully independent — same
automation lineage, fresh context) attacked the complete diff and probed the
Host regex, asset-id canonicalization, Range parser, and path policy with
live logic probes. Findings and resolutions:

- **H1 (fixed)**: the validator rejected the engine's real `title: ""` shape
  (watcher-produced caches, including the on-disk `test-client-20260422`),
  mislabeling a healthy project "invalid". Fix: `""` normalizes to `null`;
  regression tests added at validator and API level; live-verified — the real
  project now returns `status: ready`, 344 frames.
- **M1 (resolved by record)**: commit `f8f60e3` touches engine-zone files
  (root `package.json` pin + script, boundary comment, check script), which
  the architecture doc had founder-gated. These exact changes were explicitly
  authorized in the Phase 2A execution directive (founder decisions 1-5,
  2026-07-18: decision 5 authorizes the root `@remotion/media` pin; Phase 1
  of the directive mandates the browser-safe boundary and static checks under
  the engine tree). Recorded here and in the PR body.
- **M2 (fixed)**: the engine-composition browser-safety test now walks the
  full relative-import graph (mirroring `check:browser-safe`) instead of a
  hardcoded two-file list, so CI enforces it via the studio suite; the root
  script remains the local/manual guard (CI workflow intentionally untouched).
- **M3 (fixed)**: write-capability scans extended with `open/write/writev`
  receivers, named-import forms, and an `open(..., "w"/"a")` mode-flag
  pattern, per plan §11.3.
- **L1 (fixed)**: boot-assertion comment now states it guards version drift
  only. **L2 (fixed)**: test asserts `-H 127.0.0.1` + `MYVIDEO_REPO_ROOT`
  stay in the dev/start scripts. **L5 (fixed)**: `previewReady` now means
  "valid props cache AND all clips staged" (plan §7), asserted in tests.
  **L6 (fixed)**: client-zone scan also bans `app/api` imports.
- **L3 (deferred)**: `getRoots` caches missing roots until restart — if a
  root directory is created later, restart the Studio. **L4 (deferred)**:
  `streamAsset` does no backpressure; acceptable for one local consumer.

Verdict after fixes: zero unresolved HIGH, zero unresolved MEDIUM.

## 12. Known LOW findings (documented, deferred)

- Interleaving `next build` and `next dev` in the same `.next` directory can
  corrupt the dev server's RSC manifest (500s) until `.next` is removed —
  Next dev-cache behavior, not Studio code. Mitigation: `rm -rf studio/.next`
  if `npm run dev` 500s after a production build.
- `input/selects/demo/*.mp4` are tiny placeholder files while the staged
  `public/runtime-selects/demo/*` are real media — freshness comparison still
  behaves correctly (staged set is the serving source of truth).
- `.mov`/`.mkv` staged files may not decode in every browser even with the
  correct MIME type; surfaced as a player error, not fixed (plan DR3).
- The stale-props warning covers selects/metadata mtimes only; content-level
  drift (same mtime, different bytes) is not detected (plan DR1 as approved).

## 13. Rollback

All Phase 2A changes live in five commits on this branch on top of `598bd27`.
Rollback = `git revert` of those commits (or abandon the branch); the engine
is untouched by construction (§10 proof), so no media/cache/manifest
restoration can be needed. The Phase 1 mock shell remains intact behind the
real-mode branch in `PreviewMonitor` and still renders when no real project
is selected.

## 14. Exact limitations (Phase 2A)

Read-only preview only. No editing, saving, import, render/export, AI
editing, caption editing, music selection, watcher integration, background
processing, project creation/deletion, drag/drop, persistence, or multi-user
access. The API trusts the local operator (no auth) and is guarded by
loopback binding + Host allowlist; removing either without adding auth
reopens LAN exposure.

## 15. Next product phase

Founder review of the live draft PR, then explicit merge authorization.
Candidate Phase 2B scope (not authorized): project switching polish,
Safari/Firefox media QA, caption/music read-only surfacing, and the deferred
engine hardening items in `DEFERRED_ENGINE_HARDENING.md`.
