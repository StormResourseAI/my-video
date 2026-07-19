# myvideo_ Studio — Phase 2 Read-Only Integration Architecture

Status: IMPLEMENTED — Phase 2A shipped on `feat/studio-phase2-readonly-integration`;
see `PHASE2A_CERTIFICATION.md` for the implementation outcome, validation
results, browser QA, non-mutation proof, and the deviations log (§11 there:
tsconfig-paths aliasing instead of turbopack resolveAlias; the browser-safe
boundary is the existing composition file guarded by `check:browser-safe`;
`server/http.ts` added for the Host allowlist). All five §19 founder
decisions were resolved and applied on 2026-07-18.
Date: 2026-07-18
Baseline: `v1-top-5-skills` @ `b18446b479d35cecbb8cd1a35e6f6be63a9d815b`
Branch: `feat/studio-phase2-readonly-architecture`

---

## 1. Executive decision

Phase 2A connects the Phase 1 mock Studio shell to the real engine through a
read-only server boundary, and renders the real `vertical-core` Remotion
composition in the preview via `@remotion/player` — with **zero changes to
engine code** and **zero write paths**.

The decisive discovery: the engine already materializes everything Phase 2A
needs, per project, on disk:

| Need | Already produced by engine | Evidence |
|---|---|---|
| Project identity | `input/selects/<slug>/` directory name | `scripts/render-vertical.mjs:21-23` |
| Full composition props (incl. clip durations) | `.cache/render-props/<slug>.json` | `scripts/render-vertical.mjs:120-128` |
| Browser-servable media copies | `public/runtime-selects/<slug>/<file>` | `scripts/render-vertical.mjs:99-109` |
| Display metadata | `input/metadata/<slug>.json` | `scripts/render-vertical.mjs:24,33-39` |
| Composition dimensions/fps/duration formula | `vertical-core` registration | `src/Root.tsx:65-75,105-120` |

Because clip durations are read from the props cache, Phase 2A needs **no
FFprobe, no ingestion, no media decoding, and no new engine execution**. The
server boundary is a pure JSON-and-static-file reader.

Recommendation: **GO** for Phase 2A implementation, gated on the founder
decisions listed in §19.

## 2. Current-system inventory

### 2.1 Engine (repo root)

- **Remotion packages at 4.0.445** (root `package.json:8-15`): `remotion`,
  `@remotion/cli`, `@remotion/tailwind-v4` pinned exact; **`@remotion/media`
  is caret-ranged (`^4.0.445`)** — contrary to the vendor's own "remove the
  `^`" guidance (`@remotion/media` README). All are verified installed at
  4.0.445 and the lockfile currently holds `@remotion/media` there, but a
  future fresh install after a new 4.0.x release would drift it away from
  `remotion@4.0.445` exact. Pinning it is a one-character engine change
  deferred to founder decision (§19.5); the §10 aliases shield the Studio
  Player path either way. `@remotion/player@4.0.445` is already present in root
  `node_modules` as a transitive install and pins `remotion: "4.0.445"` exact
  (root `package-lock.json`, entry `node_modules/@remotion/player`).
- **Entry**: `src/index.ts` → `registerRoot(RemotionRoot)` from `src/Root.tsx`.
- **Registered compositions** (`src/Root.tsx:77-135`): `DronePromo`, `MyComp`,
  `MultiClip`, `vertical-core`, and `MultiClip-<VARIANT>` per
  `data/variants.json`.
- **`vertical-core`** (`src/Root.tsx:105-120`): 1080×1920 @ 30 fps,
  `defaultProps = { backgroundColor: "#111111", clips: [], title: "Vertical
  Core", titleFrames: 45, transitionFrames: 8 }`, with
  `calculateMetadata` (`src/Root.tsx:65-75`):
  `durationInFrames = max(Σ clip.durationInFrames − (nClips−1)·transitionFrames, 1)`.
- **`VerticalCoreComposition`** (`src/VerticalCoreComposition.tsx`): props type
  `VerticalCoreProps` (lines 5-19): `backgroundColor?`, `clips:
  {file, src, durationInFrames, trimBefore?, trimAfter?}[]`, `title?`,
  `titleFrames?`, `transitionFrames?`. Renders `<Series>` of `@remotion/media`
  `<Video src={staticFile(clip.src)}>` wrapped in `ClipTransition`
  (lines 116-155). Has a built-in empty state for `clips.length === 0`
  (lines 92-112).
- **Browser compatibility**: the entire composition graph is browser-clean.
  `grep` over `src/` finds **zero** imports of `fs`/`path`/`child_process`/
  `os`/`net`/`http` and **zero** `process.env` references.
  `VerticalCoreComposition.tsx` imports only `remotion`, `@remotion/media`,
  and `./components/ClipTransition` (which imports only `remotion`); the
  `<Series>` render spans lines 116-155. It does
  **not** import `src/index.css` — no Tailwind pipeline needed in Studio.
- **Global singleton JSON state**: `src/Root.tsx:11-14` statically imports
  `data/manifest.json`, `data/beats.json`, `data/style-profile.json`,
  `data/variants.json` at module load. These serve the single-project
  `MultiClip` pipeline (clips + transcripts + beats + music via
  `data/manifest.json`'s `musicFile`, `src/lib/manifest.ts:18-22`). The
  `vertical-core` flow does **not** use any of them — captions, beats,
  transcripts, and music are not part of the vertical-core data path today.
  Consequence: Studio must import `src/VerticalCoreComposition.tsx` directly
  and must **never** import `src/Root.tsx` (which would drag the global JSON
  and all legacy compositions into the Studio bundle).
- **CWD assumptions**: every engine script resolves from `process.cwd()`
  (e.g. `scripts/render-vertical.mjs:22`). The Next dev server runs with
  `cwd = studio/`, so the server boundary must resolve the repo root
  explicitly (§6), never via `cwd` conventions.

### 2.2 Project data flow (vertical-core)

`scripts/render-vertical.mjs` defines the de-facto project model:

1. `project` = CLI arg = directory name under `input/selects/<project>/`
   (lines 21-23).
2. Optional metadata `input/metadata/<project>.json` (lines 24, 33-39, 72-82):
   `title`, `clipOrder`, `maxClipSec`, `titleFrames`, `transitionFrames`,
   `backgroundColor`. The watcher-produced variant also carries
   `project_slug`, `client_slug`, `hook`, `cta`, `notes`
   (`input/metadata/test-client-20260422.json`).
3. Clip list = video files in the selects dir, ordered (lines 84-91);
   durations via FFprobe (lines 41-65), capped at `maxClipSec`.
4. Media staged to `public/runtime-selects/<project>/<file>` (lines 99-109) so
   `staticFile("runtime-selects/<project>/<file>")` resolves during render.
5. Complete `VerticalCoreProps` written to `.cache/render-props/<project>.json`
   (lines 120-128) — durations already in frames.
6. Render output at `output/vertical/<project>/vertical-core.mp4`.

### 2.3 Real projects available as first fixtures

Both existing projects are fully materialized (selects + metadata + props
cache + staged runtime-selects + prior render output):

- **`demo`** — 3 clips (`01_open.mp4`, `02_offer.mp4`, `03_close.mp4`), title
  "Demo Vertical Batch", 315 total clip frames → 299 duration frames after
  two 8-frame overlaps. **Chosen as the first read-only preview fixture** (it
  has a human title and is not client data).
- **`test-client-20260422`** — 3 clips, watcher-shaped metadata, empty title.
  Serves as the second fixture and exercises the missing-title path.

### 2.4 Studio (Phase 1 shell, `studio/`)

- Next 16.2.10 / React 19.2.7 / zustand 5.0.14; **no Remotion packages**
  (`studio/package.json`; studio lockfile contains no `remotion` entries).
- Pure mock: fixtures in `studio/fixtures/index.ts`, state in
  `studio/state/studioStore.ts`, mock playback clock in
  `studio/components/PreviewMonitor.tsx:35-39` (setInterval ticking
  `currentTime`), no server code, no API routes
  (`studio/next.config.ts`: "no server code").
- Safety tests (`studio/tests/safety.test.tsx`): (a) runtime shell performs no
  network egress (fetch spy + throwing WebSocket/XHR/EventSource stubs,
  lines 14-41); (b) a recursive source scan asserting **no** Node
  module imports anywhere in `app/ components/ state/ lib/ fixtures/`
  (lines 43-67). Phase 2 must restructure — not delete — these (§11).
- **Version skew**: root React is 19.2.3, Studio React is 19.2.7 (§10 risk).

## 3. Evidence table

| # | Claim | Evidence |
|---|---|---|
| E1 | Remotion packages installed at 4.0.445; `remotion`/`@remotion/cli`/`@remotion/tailwind-v4` pinned exact, `@remotion/media` caret-ranged `^4.0.445` | `package.json:8-15`; `node_modules/{remotion,@remotion/media,@remotion/cli}/package.json` |
| E2 | `@remotion/player@4.0.445` already resolvable; pins `remotion@4.0.445` exact | root `package-lock.json` entry `node_modules/@remotion/player` |
| E3 | `vertical-core` is 1080×1920@30 with duration formula | `src/Root.tsx:65-75,105-120` |
| E4 | Composition graph has zero Node imports / env reads | grep over `src/` (imports, `process.env`): no matches |
| E5 | Media addressed via `staticFile(clip.src)` | `src/VerticalCoreComposition.tsx:133` |
| E6 | `staticFile()` without `window.remotion_staticBase` returns `/`-prefixed, per-segment URI-encoded path; rejects absolute/relative/`public/` prefixes | `node_modules/remotion/dist/esm/index.mjs:8411-8457` (`inner`, `encodeBySplitting`, `staticFile`) |
| E7 | `@remotion/media` `<Video>` supports the Player environment (explicit `isPlayer` branches + HTML5 fallback machinery) | `node_modules/@remotion/media/dist/esm/index.mjs` (`isPlayer` ×9, `useRemotionEnvironment` ×11, `fallbackHtml` ×10) |
| E8 | Project identity, props cache, staged media, metadata paths | `scripts/render-vertical.mjs:21-29,99-128` |
| E9 | Props cache is exact `VerticalCoreProps` JSON incl. durations | `.cache/render-props/demo.json` |
| E10 | Two fully materialized real projects | `input/selects/{demo,test-client-20260422}` + matching `.cache/render-props/*.json` + `public/runtime-selects/*` |
| E11 | Engine scripts assume `cwd = repo root` | `scripts/render-vertical.mjs:22` (`process.cwd()`) |
| E12 | Phase 1 safety tests: egress ban + blanket no-Node-imports scan | `studio/tests/safety.test.tsx:14-67` |
| E13 | Root React 19.2.3 vs Studio React 19.2.7 | `package.json` vs `studio/package.json` |
| E14 | Global JSON singletons load at Root import time | `src/Root.tsx:11-28` |
| E15 | Remotion license: free for individuals & for-profit orgs ≤3 employees; one license covers all `@remotion/*` packages | `node_modules/@remotion/player/package.json` (`"license": "SEE LICENSE IN LICENSE.md"`); remotion-dev/remotion `LICENSE.md` fetched 2026-07-18 (§12) |

Everything in §§5-11 not marked with an evidence row is a **proposal**.

## 4. Proposed architecture

```
┌────────────────────────── Browser (client) ──────────────────────────┐
│  StudioShell / ProjectNav / PreviewMonitor          "use client"     │
│    │ fetch /api/projects, /api/projects/:id   (same-origin only)     │
│    ▼                                                                 │
│  ProjectDocumentV1 (validated DTO)                                   │
│    │ toPlayerConfig()  — studio/lib/projectAdapter.ts                │
│    ▼                                                                 │
│  <Player component={VerticalCoreComposition} inputProps={...}>       │
│    └─ <Video src=staticFile("api/assets/<assetId>")>                 │
│         │  GET/HEAD /api/assets/<assetId>  (Range requests)          │
╞═════════╪══════════ trust boundary (HTTP, loopback) ═════════════════╡
│         ▼                              Next.js server (server-only)  │
│  app/api/projects/route.ts          ──┐                              │
│  app/api/projects/[projectId]/route.ts│→ server/projectRepository.ts │
│  app/api/assets/[assetId]/route.ts  ──┘        │                     │
│                                                ▼                     │
│                                     server/pathPolicy.ts             │
│                          (repo-root anchor, allowlisted roots,       │
│                           slug/file validation, realpath checks)     │
╞════════════════════ filesystem (READ-ONLY) ══════════════════════════╡
│  input/selects/<slug>/          (existence only — discovery)         │
│  input/metadata/<slug>.json     (JSON read)                          │
│  .cache/render-props/<slug>.json(JSON read)                          │
│  public/runtime-selects/<slug>/ (video bytes, Range-served)          │
└──────────────────────────────────────────────────────────────────────┘
Shared compile-time source (no runtime fs):
  ../src/VerticalCoreComposition.tsx + ../src/components/ClipTransition.tsx
```

## 5. Trust boundaries

1. **Browser ↔ Next server (HTTP)**: the only channel. Client receives
   serializable DTOs and media byte streams; it never receives filesystem
   paths, and never sends any. All requests are same-origin relative URLs.
   **Caution**: `next dev`/`next start` bind **all interfaces** by default —
   loopback is not automatic. Phase 2A therefore requires `-H 127.0.0.1` on
   the studio `dev` and `start` scripts (`studio/package.json` is already in
   the §14 modify list) and an acceptance check that the listener is
   loopback-only. Additionally, route handlers reject requests whose `Host`
   header is not `localhost`/`127.0.0.1` (optionally `:port`) — this closes
   DNS-rebinding, where an attacker-controlled hostname re-resolves to
   127.0.0.1 and becomes same-origin. No CORS headers are added (which blocks
   cross-origin `fetch` reads but **not** cross-origin `<video src>`
   embedding — the Host check and loopback bind are the actual controls).
2. **Next server ↔ filesystem**: crosses only inside `studio/server/*` through
   `pathPolicy`. Route handlers never touch `node:fs` directly.
3. **Studio ↔ engine**: compile-time-only sharing of two browser-clean
   component files (E4). Studio never imports `src/Root.tsx` or `src/index.ts`
   and never executes engine scripts.

## 6. Server-only filesystem boundary

Proposed files (names final unless implementation finds better):

- `studio/server/pathPolicy.ts` — the only module that turns names into
  absolute paths.
  - **Repo-root anchor**: `MYVIDEO_REPO_ROOT` env var, defaulting to
    `path.resolve(process.cwd(), "..")`; validated once at first use by
    checking sentinels (`package.json` with `"name": "my-video"`,
    `input/selects/` exists). Fails closed with a clear error. Rationale: E11 —
    engine cwd conventions don't hold inside Next.
  - **Allowlisted roots** (all resolved through `fs.realpathSync` at startup):
    `input/selects` (readdir of directory names only), `input/metadata`,
    `.cache/render-props`, `public/runtime-selects`. Nothing else is reachable.
  - **Slug validation**: `^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$` **and** no `..`
    substring (both real slugs `demo`, `test-client-20260422` conform).
  - **File-name validation**: must byte-equal a `basename()`-of-itself and
    contain no `/`, and — for media — must be **listed in that project's
    props cache** (membership allowlist, §9). No `..`-substring rule for file
    names: the engine stages arbitrary basenames (only the extension is
    constrained, `render-vertical.mjs:19`), and membership + basename
    equality + realpath already close traversal. (Slugs do keep the stricter
    charset above.)
  - **Escape check**: every resolved candidate path is `realpath`-resolved and
    must start with `<allowlisted-root>/` (prefix check on the resolved path,
    with trailing separator). Symlinked files inside the roots that point
    outside are thereby rejected.
- `studio/server/projectRepository.ts` — read-only repository:
  `listProjects()`, `getProject(slug)`. Composes `pathPolicy` reads into the
  internal model and maps it to `ProjectDocumentV1`. Uses only
  `fs.promises.readdir/readFile/stat/realpath` — no write-capable API.
- `studio/server/assetStream.ts` — opens a policy-approved media file and
  produces a Range-aware response body (§9).
- Marker: every `studio/server/*` file begins with
  `import "server-only"` (the Next-supported build-time guard; adds the
  `server-only` package — a compile-time-only dep) so any client-graph import
  fails the build, plus the structural test in §11 as a second net.

**Non-goals enforced by construction**: no POST/PUT/PATCH/DELETE handlers
exist; no `child_process`, `@remotion/renderer`, `@remotion/bundler`, or
`@remotion/cli` import anywhere under `studio/`; no directory-listing
endpoint (project list returns curated DTOs, not dirents; asset route serves
single validated files only).

## 7. ProjectDocumentV1 schema (proposal)

Layer separation:

- **A. Engine/internal**: files in §2.2 (never leaves the server).
- **B. Server repository model**: parsed metadata + parsed props cache +
  staged-file stat results (server-only).
- **C. Client DTO**: `ProjectDocumentV1` below (the only shape crossing the
  boundary).
- **D. Player inputProps**: derived from C by a pure client adapter (§8).

```ts
// studio/lib/projectDocument.ts  (client-safe: types + validators only)
export type ProjectSummaryV1 = {
  schemaVersion: 1;
  projectId: string;          // validated slug
  projectName: string;        // metadata.title || slug
  clientSlug: string | null;  // metadata.client_slug ?? null
  previewReady: boolean;      // props cache + all staged media present
  updatedAt: string | null;   // ISO mtime of props cache, null if absent
};

export type ProjectDocumentV1 = ProjectSummaryV1 & {
  status: "ready" | "props-missing" | "media-missing" | "invalid";
  readOnly: true;             // literal — Phase 2 has no other mode
  composition: {
    compositionId: "vertical-core";
    width: 1080; height: 1920; fps: 30;       // from src/Root.tsx:105-120 (E3)
    durationInFrames: number;                  // Root.tsx:65-75 formula (E3)
    aspectRatio: "9:16";
  } | null;                   // null unless status === "ready"
  props: VerticalCorePropsV1 | null;  // null unless status === "ready"
  assets: AssetRefV1[];
  captions: null;             // explicit: not part of vertical-core (E14/§2.1)
  music: null;                // explicit: same
  warnings: string[];         // e.g. "metadata.json missing; using defaults"
};

export type VerticalCorePropsV1 = {   // mirrors src/VerticalCoreComposition.tsx:5-19
  backgroundColor: string;
  clips: {
    file: string;                     // display name only
    src: string;                      // REWRITTEN: "api/assets/<assetId>" — never a path
    durationInFrames: number;
    trimBefore: number;
    trimAfter: number;
  }[];
  title: string | null;
  titleFrames: number;
  transitionFrames: number;
};

export type AssetRefV1 = {
  assetId: string;            // opaque, URL-safe (§9)
  fileName: string;
  kind: "video";
  previewUrl: string;         // "/api/assets/<assetId>"
};
```

- **Validation strategy**: hand-rolled field validators in
  `projectDocument.ts` (plain TS, no new runtime dep), run **twice** — on the
  server before responding (defense against a corrupt props cache) and on the
  client after `fetch` (defense against contract drift). Numbers must be
  finite, integral, ≥0; `durationInFrames ≥ 1`; strings length-capped
  (title ≤ 200, names ≤ 128); `clips` length ≤ 100; unknown extra keys
  stripped, never forwarded. `backgroundColor` must match
  `^#[0-9a-fA-F]{3,8}$` (both real caches use `#111111`) — it flows into
  inline styles and a CSS border template
  (`VerticalCoreComposition.tsx:62,97,117`), and the corrupt-props-cache
  threat model must not rely on React's CSSOM behavior alone; violation →
  `status: "invalid"`.
- **Error strategy**: API errors are `{ error: { code, message } }` with
  codes `project_not_found` (404), `invalid_id` (400), `asset_not_found`
  (404), `props_unreadable` (500 with generic message). Messages never
  include absolute paths.
- **Versioning/migration**: `schemaVersion` is a literal `1`; client rejects
  any other value with the "unsupported project" UI state. Future breaking
  changes mint `ProjectDocumentV2` + a server-side up-converter; V1 stays
  served until the client migrates.
- **Null/missing data**: metadata file absent → defaults per
  `render-vertical.mjs:72-82` + warning. Props cache absent →
  `status: "props-missing"`, `props: null`, UI shows "Run
  `npm run render:vertical -- <slug>` to stage a preview". Staged media file
  missing → `status: "media-missing"` listing missing file names.
- **Unsupported projects**: a props cache that fails validation →
  `status: "invalid"` + warnings; the client keeps the mock preview and shows
  the error. No blob passthrough: the server re-serializes only known fields.

## 8. Composition adapter (proposal)

- `studio/lib/projectAdapter.ts` (client-safe, pure):
  `toPlayerConfig(doc)` → `{ component: VerticalCoreComposition, inputProps,
  durationInFrames, fps, compositionWidth, compositionHeight }`.
  `inputProps` is `doc.props` verbatim — clip `src` values already rewritten
  server-side to `api/assets/<assetId>`. Inside the Player,
  `staticFile("api/assets/<id>")` → `/api/assets/<id>` (E6), so the request
  hits the asset route. **No engine file is modified**; no narrow re-export
  wrapper is needed because the composition file is already browser-clean (E4).
- Studio imports the component directly:
  `import { VerticalCoreComposition } from "../../src/VerticalCoreComposition"`.
  Build wiring (Next compiling a file above `turbopack.root`) is an
  implementation task: extend `studio/next.config.ts` with the repo-root
  `turbopack.root` or an explicit alias, and add the resolve aliases in §10.
  This wiring choice is deliberately left to implementation; both options keep
  the engine untouched.

## 9. Asset-serving design (proposal)

- **Asset identity**: `assetId = base64url(`${slug}/${fileName}`)` —
  stateless, opaque, URL-safe (survives `staticFile`'s per-segment encoding
  untouched, E6). **Canonicalization is mandatory** (Node's base64url decoder
  is lenient — it tolerates padding and the standard `+/` alphabet, so many
  strings decode to the same value): the decoded bytes must be valid UTF-8
  containing **exactly one** `/`; split on it; then re-encode the decoded
  value as canonical unpadded base64url and require byte-equality with the
  presented id — reject on any mismatch. After that, re-validate slug and
  fileName against `pathPolicy`, and require `fileName` to be a member of the
  decoded project's props-cache clip list (`clips[].file`). Membership — not
  path arithmetic — is the primary traversal defense; realpath prefix checks
  (§6) are the backstop. Unknown/undecodable/non-canonical IDs → 404,
  constant shape.
- **Route**: `studio/app/api/assets/[assetId]/route.ts` exporting **only**
  `GET` and `HEAD`.
  - `HEAD`/`GET` both send: `Content-Type` from an internal extension map
    (`.mp4 → video/mp4`, `.mov → video/quicktime`, `.webm`, `.m4v`, `.mkv`
    per `render-vertical.mjs:19`'s extension set), `Content-Length`,
    `Accept-Ranges: bytes`, `Cache-Control: private, max-age=0,
    must-revalidate`, `X-Content-Type-Options: nosniff`.
  - **Range**: single-range `bytes=a-b` honored with 206 +
    `Content-Range`; open-ended and suffix ranges supported; unsatisfiable →
    416 with `Content-Range: bytes */<size>`; multi-range → ignored, 200 full
    body (legal per RFC 9110 and what browsers tolerate). Chrome/Safari
    `<video>` seeking requires this; the WebCodecs path in `@remotion/media`
    issues ranged reads too (E7).
  - Streaming via `fs.createReadStream(path, { start, end })` wrapped in a
    web `ReadableStream` — the only non-`readFile` fs API in the boundary,
    still read-only.
- **No CORS headers** ever, plus the Host allowlist and mandatory loopback
  bind from §5.1 — together these are the Phase 2 exposure contract (CORS
  absence alone does not stop cross-origin `<video>` embedding of guessable
  asset URLs; the bind and Host check do).

## 10. Remotion Player integration (proposal)

- **Version**: add `@remotion/player@4.0.445` (exact, no `^`) to
  `studio/package.json` at implementation time. All Remotion packages must be
  version-identical (vendor requirement stated in `@remotion/media` README;
  player hard-pins `remotion@4.0.445`, E2).
- **Single-instance rule (top integration risk)**: the composition source
  imports `remotion`/`@remotion/media`, which Node-resolves from **root**
  `node_modules`, while the Player would resolve from **studio**
  `node_modules`. Two `remotion` instances break React context
  (`useCurrentFrame` outside provider); two Reacts (19.2.3 vs 19.2.7, E13)
  break hooks entirely. Mitigation: `resolveAlias` in `studio/next.config.ts`
  forcing single resolutions of `react`, `react-dom`, `remotion`,
  `@remotion/media` (recommended target: the studio copies; add
  `@remotion/media@4.0.445` to studio deps). First implementation commit must
  include a boot assertion comparing `VERSION` exports. Founder note: the
  simpler long-term fix is aligning the two React versions.
- **Player props**: `component` (not `lazyComponent`), `inputProps`,
  `durationInFrames`, `fps`, `compositionWidth={1080}`,
  `compositionHeight={1080*16/9 → 1920}`, `controls={false}` (Studio supplies
  its own transport), `acknowledgeRemotionLicense` per §12 conclusion,
  `style` sized by the existing aspect-ratio box in `PreviewMonitor`.
- **Playback state**: replace the mock `setInterval` clock
  (`PreviewMonitor.tsx:34-39`) with a `PlayerRef`: subscribe to
  `play`/`pause`/`frameupdate` events → write `playing`/`currentFrame` into
  `studioStore`; transport buttons call `playerRef.play()/pause()/seekTo()`;
  preview scale continues to use the existing CSS aspect box, with the 9:16
  ratio auto-selected from the document.
- **Mock fallback**: `PreviewMonitor` branches on "loaded ProjectDocument with
  status ready" — otherwise it renders the existing Phase 1 mock canvas
  unchanged (loading / unavailable / invalid states each get the existing
  `PanelState` treatment plus the document's warnings).
- **Forbidden by design**: no `@remotion/renderer`/`bundler`/`cli` import in
  Studio, no `renderMedia`, no server-side bundling. The Player is a pure
  client component fed by static props.

## 11. Safety-test changes (proposal)

Replace the blanket "no Node imports anywhere" scan (E12) with
boundary-aware structural tests — all still plain `vitest` + source scanning,
same style as today:

1. **Client-zone purity**: `app/` (excluding `app/api/`), `components/`,
   `state/`, `lib/`, `fixtures/` still import no Node modules (existing
   FORBIDDEN regex, narrowed roots, **with `path` added to its module
   list**) — and additionally must not import from `server/` or `app/api/`.
   The existing `BROWSER_EGRESS` source scan (`safety.test.tsx:50`) must be
   narrowed: `fetch(` becomes legal but only inside the one designated API
   client module (`lib/projectApi.ts` or equivalent), which the scan
   excludes; `WebSocket`/`XMLHttpRequest`/`EventSource` stay banned
   everywhere.
2. **Server-zone containment**: Node `fs`/`path` imports may appear **only**
   under `server/` and `app/api/`; `child_process`, `net`, `dgram`, `tls`,
   `worker_threads` remain forbidden **everywhere** in `studio/`.
3. **No write-capable fs**: scan `server/` + `app/api/` for write-capable
   calls **anchored to the fs receiver** to avoid false positives (`rm\b`
   matches `transform`, `exec\(` matches `RegExp#exec`):
   `(fs|promises|fsp)\s*\.\s*(writeFile|appendFile|createWriteStream|mkdir|
   rmdir|rm|rename|unlink|chmod|chown|truncate|cp|copyFile|link|symlink)\b`
   plus `open\(` with a `w`/`a` mode flag — must be empty.
4. **No render/exec path**: scan all of `studio/` for
   `@remotion/(renderer|bundler|cli)|renderMedia|child_process|\bspawn(Sync)?
   \(|\bexecFile(Sync)?\(` — must be empty.
5. **"use client" graph isolation**: walk import graphs from every file whose
   source starts with `"use client"`; assert no path reaches `server/` or
   `app/api/`. (Belt to `import "server-only"`'s suspenders.)
6. **No mutation surface**: assert route files export only `GET`/`HEAD`.
7. **Path-policy unit tests**: reject `..`, encoded traversal (`%2e%2e`),
   absolute paths, slugs with separators, assetIds decoding outside the
   membership list, **non-canonical assetIds** (padded, `+/`-alphabet, and
   decoded values with zero or multiple `/` separators — §9); symlink-escape
   test creates a temp symlink inside an allowlisted temp root pointing
   outside and asserts rejection.
7b. **Host / loopback tests**: route handlers reject non-allowlisted `Host`
   headers (§5.1); dev-script assertion that `-H 127.0.0.1` is present in
   `studio/package.json` `dev`/`start`.
8. **No-path-leak test**: serialize every API response for the fixture
   projects; assert no `/Users/`, no repo-root absolute prefix, no
   `input/`-relative engine path other than the sanctioned display fileName.
9. **Egress test evolution**: the Phase 1 fetch-ban becomes an allowlist —
   `fetch` may be called only with relative URLs matching
   `^/api/(projects|assets)`; WebSocket/XHR/EventSource stay banned.

## 12. Licensing gate

- **Facts (verified 2026-07-18)**: every installed Remotion package is
  distributed under the Remotion Special License
  (`node_modules/@remotion/player/package.json` → `"SEE LICENSE IN
  LICENSE.md"`; note the npm tarball ships **no** LICENSE.md file, so the
  authoritative text lives only upstream). Source:
  `https://github.com/remotion-dev/remotion/blob/main/LICENSE.md` (raw
  fetch, 2026-07-18). Load-bearing excerpt as fetched that day: free use is
  granted to individuals, non-profits, those evaluating commercially, and
  "a for-profit organization with up to 3 employees"; beyond that a Company
  License is required; the license prohibits selling/relicensing Remotion
  derivatives; it draws **no distinction between rendering and Player
  embedding** — embedding `@remotion/player` does not move the project into
  a different license category, but it is covered by the same license and
  the Player API expects license acknowledgement
  (`acknowledgeRemotionLicense` prop). Because this evidence is a dated web
  fetch, re-verification against the then-current text is part of the
  deferred commercial gate below.
- **Current use case**: Brian's local, personal/internal Studio, solo — inside
  the free tier as licensed today.
- **Future use case (unresolved)**: a commercial product or client-facing
  editor. Before any commercial distribution or customer-facing deployment:
  re-read the then-current `LICENSE.md` and remotion.pro FAQ, determine
  whether team size or usage crosses the Company License threshold, and
  purchase if required. This decision is **explicitly deferred** and recorded
  as founder-gated; nothing in Phase 2 purchases or accepts commercial terms.
  (Matches deferred defect #8, `studio/docs/DEFERRED_ENGINE_HARDENING.md`.)

## 13. Phase 2A acceptance criteria

1. `npm run dev` in `studio/` starts with no engine process spawned.
2. Project nav lists `demo` and `test-client-20260422` from the real
   filesystem (mock fixture projects removed from the nav or clearly
   separated).
3. Selecting `demo` shows real metadata: name, 1080×1920, 30 fps, computed
   duration (299 frames ≈ 0:09.97), clip count, updated time.
4. Preview shows the real `VerticalCoreComposition` playing `demo`'s three
   staged clips with title overlay and transitions; play/pause/seek work and
   the timecode tracks real frames; preview scale (aspect box) works.
5. A visible persistent **Read-only** label replaces the "Mock preview" chip
   whenever a real document is loaded.
6. Deleting/renaming a staged file (manually, outside Studio) yields the
   `media-missing` UI with the offending file name — no crash, no blank
   player.
7. All §11 tests pass; `git status` in the repo shows no engine file modified
   after a full Studio session.
8. The dev server listens on 127.0.0.1 only (verify with `lsof -iTCP -sTCP:LISTEN`)
   and API routes reject a spoofed `Host` header (§5.1).

**Explicitly deferred** (unchanged from the task charter): timeline editing,
media import, any file write, render/export, AI editing, caption editing,
music selection, watcher integration, background processing, project
create/delete, drag/drop, persistence, engine hardening beyond this slice.

## 14. Expected files (Phase 2A implementation)

Add — `studio/server/pathPolicy.ts`, `studio/server/projectRepository.ts`,
`studio/server/assetStream.ts`, `studio/app/api/projects/route.ts`,
`studio/app/api/projects/[projectId]/route.ts`,
`studio/app/api/assets/[assetId]/route.ts`, `studio/lib/projectDocument.ts`,
`studio/lib/projectAdapter.ts`, `studio/tests/pathPolicy.test.ts`,
`studio/tests/api.test.ts`.

Modify — `studio/package.json` (+`@remotion/player@4.0.445`,
`@remotion/media@4.0.445`, `server-only`; `-H 127.0.0.1` on `dev`/`start`
scripts per §5.1), `studio/next.config.ts` (aliases / root), `studio/components/PreviewMonitor.tsx`,
`studio/components/ProjectNav.tsx`, `studio/state/studioStore.ts`,
`studio/lib/types.ts`, `studio/fixtures/index.ts` (mock demotion),
`studio/tests/safety.test.tsx` (§11 restructure).

Modify **nothing** under `src/`, `scripts/`, `data/`, `input/`, `public/`,
`.cache/`, or root `package.json`.

## 15. Commit plan (implementation branch, proposal)

1. `feat(studio): server-only project repository with path policy + tests`
2. `feat(studio): read-only project and asset API routes + tests`
3. `feat(studio): ProjectDocumentV1 contract and client adapter`
4. `feat(studio): Remotion Player preview wired to real projects`
5. `test(studio): restructure safety tests around server boundary`

Each commit keeps `studio` `lint`, `typecheck`, `test` green.

## 16. Validation plan

- Unit: §11.7 path-policy suite; DTO validator suite (fuzz malformed props
  caches: wrong types, negative frames, oversized arrays, extra keys).
- Integration (vitest, node env): repository against the two real fixtures +
  a synthetic temp-dir fixture tree for missing/corrupt cases. Includes a
  **duration cross-check**: the server-computed `durationInFrames` for `demo`
  must equal 299 — the §3/E3 formula result — because the server re-implements
  `calcVerticalCoreMetadata` (unexported, and `Root.tsx` is import-forbidden);
  this pins the duplicate formula against drift.
- API: route handlers invoked in-process; §11.8 no-path-leak snapshots; Range
  matrix (none / `0-` / `a-b` / suffix / unsatisfiable / multi).
- Manual: acceptance walk-through §13 on `demo`, plus Safari + Chrome seek
  check (Range behavior differs); kill-switch check — stop the dev server,
  confirm nothing engine-side keeps running.
- Static: existing `lint` + `typecheck` gates; §11 structural suite.

## 17. Rollback plan

Phase 2A touches only `studio/` on its own branch. Rollback = revert the
Phase 2A commits (or delete the branch); the engine is untouched by
construction (§14), so no engine state, media, or manifests can need
restoration. The Phase 1 mock shell remains intact behind the
document-loaded branch in `PreviewMonitor`, so a partial rollback (feature
flag: hide real projects) is also available.

## 18. Deferred risks

- **DR1 (MEDIUM)**: props cache can be stale relative to selects dir (clips
  added/removed since last render). Phase 2A shows `updatedAt` and a
  warning when the selects listing disagrees with the cache; regeneration
  stays a manual engine command.
- **DR2 (MEDIUM)**: React/Remotion duplicate-instance risk (§10) is mitigated
  by aliases + boot assertion but only fully retired by aligning React
  versions across the two package trees — an engine-adjacent change deferred
  to its own task.
- **DR3 (LOW)**: `.mov`/`.mkv` staged files may not decode in all browsers
  even with correct MIME; surfaced as a player error state, not fixed.
- **DR4 (LOW)**: multi-user deployment is out of scope; the design assumes a
  single local operator (no auth on the API), protected by the mandatory
  loopback bind + Host allowlist (§5.1). Removing either control without
  adding auth reopens LAN exposure.
- **DR5 (LOW)**: `@remotion/media` is vendor-labeled "experimental"
  (README). Fallback if the Player spike fails: a Studio-only composition
  variant substituting Remotion core `<Video>` — kept as contingency, not
  built.
- Engine defects #1-#8 in `DEFERRED_ENGINE_HARDENING.md` remain deferred;
  none blocks this slice (§ its table).

## 19. GO / NO-GO recommendation

**GO**, contingent on founder sign-off on the MEDIUM-level decisions:

1. **DR1** — accept stale-cache preview with warning (vs. blocking preview
   until re-render)?
2. **DR2** — accept alias-pinned duplicate React versions for Phase 2A, with
   version alignment as a follow-up task?
3. **§10 dependency posture** — approve adding `@remotion/player`,
   `@remotion/media`, `server-only` to `studio/package.json` (first real
   runtime deps beyond Next/React/zustand)?
4. **§12 licensing** — confirm the free-tier reading (solo, ≤3 employees,
   internal use) and accept `acknowledgeRemotionLicense` on that basis.
5. **E1** — authorize the one-character engine follow-up pinning root
   `@remotion/media` to `4.0.445` exact (outside this branch's
   zero-engine-changes rule), or explicitly accept caret-drift risk.

No HIGH findings remain open (see adversarial review log, §20).

## 20. Adversarial review log

A fresh-context adversarial review (2026-07-18) verified evidence rows
E3-E14 against the repository and returned 1 HIGH, 4 MEDIUM, 6 LOW findings,
**all resolved in this revision**:

- **H1** Next dev binds all interfaces, not loopback → §5.1 rewritten;
  `-H 127.0.0.1` made a Phase 2A requirement (§13.8, §14, §11.7b).
- **M1** root `@remotion/media` is caret-ranged, E1 was overstated → E1/§2.1
  corrected; pin deferred to founder decision §19.5.
- **M2** CORS-absence claim overstated (DNS rebinding, `<video>` embedding)
  → Host allowlist added (§5.1, §9, §11.7b).
- **M3** base64url assetId non-canonical under Node's lenient decoder →
  canonical re-encode + byte-equality + exactly-one-`/` rule (§9, §11.7).
- **M4** `backgroundColor` unvalidated into inline CSS → format regex (§7).
- **L1-L6** regex anchoring (§11.3/4), Phase 1 test reconciliation (§11.1),
  file-name `..` rule dropped as over-restrictive (§6), duration-formula
  drift cross-check (§16), license excerpt archived in-doc (§12), citation
  line fixes (E5, §2.1, §2.4).

Resolved during initial architecture design (2026-07-18):

- *Accidental browser bundling of Node code* → `server-only` marker + §11.1/2/5
  structural tests; engine import limited to two verified-clean files (E4).
- *Arbitrary file disclosure / traversal / symlink escape* → membership
  allowlist as primary control (§9), realpath-prefix as backstop (§6); §11.7.
- *Absolute-path leakage* → DTO carries display fileName only; §11.8 snapshot.
- *Read-to-write escalation* → no mutation routes (§11.6), no write-capable
  fs API (§11.3), no exec (§11.4).
- *Unsafe media serving / Range / CORS* → §9: nosniff, extension-mapped MIME,
  single-range 206/416 semantics, no CORS headers, loopback assumption
  documented (DR4).
- *Malformed documents / prop injection* → dual-side validation, key
  stripping, size caps (§7); Player receives only the validated mirror type,
  and `VerticalCoreProps` contains no dangerouslySet/eval-adjacent surface
  (E5: props feed `staticFile` and styles only).
- *Hidden render invocation / version mismatch / dependency duplication* →
  §11.4 scan; §10 pinning, aliases, boot assertion (DR2).
- *Licensing uncertainty* → §12 dated evidence + explicit deferred decision.
- *Scope creep* → §13 deferred list restated; no mutation API exists to creep
  onto.
