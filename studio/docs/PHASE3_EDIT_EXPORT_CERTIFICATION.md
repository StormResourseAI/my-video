# Phase 3 Certification — Non-Destructive Editing, Draft Persistence, and Local MP4 Export

Certified against the real `demo` project in a real browser (Chrome headless,
driven over CDP) with a real full-duration H.264 render on 2026-07-18.

## Final architecture

- **Read side (unchanged from Phase 2A):** server-only path policy with
  realpath + sentinel anchoring, read-only project repository over the
  engine's materialized state, GET/HEAD asset streaming with a strict range
  parser, loopback Host allowlist.
- **Write side (new):** `studio/server/write/` — data-root policy,
  atomic JSON persistence, draft repository, render repository, write-request
  guard. `studio/server/render/` — single-job render queue and the only
  child-process module (`renderRunner.ts`). The fixed worker lives at
  `scripts/studio-render-worker.mjs` in the engine repo.
- **Contracts:** `StudioDraftV1` (`studio/lib/draftDocument.ts`) and
  `RenderJobV1` (`studio/lib/renderDocument.ts`), both with dual-side
  hand-rolled validators in the established house style. The shared
  `deriveEngineProps` maps a draft onto the source props for both the live
  Player preview (API asset srcs) and the render worker (staged-media srcs),
  reusing the engine's exact duration formula.

## Source immutability

Phase 3 never writes to `input/selects/`, `input/metadata/`,
`.cache/render-props/`, `public/runtime-selects/`, source media, project
manifests, or cache files. Enforcement is layered: static tests pin
write-capable fs APIs to the write zone; every write path component is
server-generated (UUIDs, fixed names) under the data root; and the
certification run recorded SHA-256 + size + mtime for every file under the
protected roots before QA and verified byte-identical state after QA
(including a full real render). Result: identical.

## Writable data root

`MYVIDEO_STUDIO_DATA_ROOT` must be absolute; it is created 0700 by the write
subsystem only, lstat-checked (symlink roots rejected), realpath-resolved,
and rejected if it equals or resolves inside the repository. Failures are
re-evaluated per request and fail closed with `data_root_unavailable` (503);
only success is cached. Layout:

```
drafts/<draftId>/draft.json
drafts/<draftId>/history/<version>.json   (immutable, link-created)
renders/<renderId>/{job.json, props.json, output.mp4, render.log}
```

Files are written 0600. The dev/start scripts default the root to the
operator's `Library/Application Support/myvideo-studio` (quoted, overridable
via the same variable). CI, `next build`, and read-only browsing never touch
the data root.

## Draft schema, atomic saves, history, concurrency

`StudioDraftV1` carries only validated identifiers and editable values;
clips reference canonical asset ids and the materialized source window.
Unknown properties are stripped on both sides; malformed drafts are
rejected. Every save serializes through an in-process queue, re-reads the
persisted draft, enforces `expectedVersion` (mismatch → 409
`version_conflict`, no last-write-wins), writes the next immutable
`history/<version>.json` via exclusive link, then atomically replaces
`draft.json` (unique temp file, exclusive create, fsync, rename, dir fsync).

## Source fingerprint

Server-derived SHA-256 over the props-cache bytes/size/mtime, referenced
asset names and sizes, and the metadata hash (or absence marker); media
bytes are not hashed (documented trade-off — see LOW findings). Recomputed
before every save and render; the worker recomputes it independently with a
byte-identical algorithm and refuses stale sources. A changed source marks
the draft `source-changed`, keeps local editing available, and blocks
rendering with no bypass. Recovery is Create New Draft From Latest Source
(create a fresh draft; the stale one remains readable).

## Render queue and worker

One render at a time: the queue slot is reserved synchronously before any
await (TOCTOU-safe; concurrent POSTs get 409 `render_busy`, regression-
tested). The queue validates the saved draft version, source currency, and
render eligibility, derives engine props server-side, persists
`job.json`/`props.json` exclusively, then spawns
`node scripts/studio-render-worker.mjs <renderId>` with `shell: false`,
fixed executable (`process.execPath`), fixed script path, fixed cwd
(sentinel-verified repo root), an allowlisted environment (PATH, HOME,
TMPDIR, NODE_ENV, the two MYVIDEO roots — no secrets, no NODE_OPTIONS), and
stdout/stderr piped to the render's `render.log`. Hard timeout 30 minutes →
SIGKILL → `timed-out`. The worker re-validates everything (draft structure,
version, fingerprint, staged-media membership, queued-props equality),
bundles only the engine entry, renders `vertical-core` H.264 1080×1920@30
for the full validated duration via the programmatic Remotion 4.0.445
renderer, never overwrites an existing output, and updates job status
atomically; parent finalization never clobbers a worker-terminal status.

## Write-request security

All mutations require: local Host, local Origin (or local Referer when
Origin is absent; both absent → reject), exact `application/json`, bounded
body (256 KiB), and `X-Myvideo-Intent: studio-write-v1`. No CORS allowance
is emitted anywhere; no GET/query/form mutation exists; no DELETE route
exists. Errors carry controlled codes only — no stacks, no absolute paths.

## Tests

197 studio tests pass (110 Phase 1/2 regression + 87 new), including:
draft validator/derivation coverage; create/save/version/history/conflict/
staleness flows over temp fixture repos and temp data roots with source-tree
hash proofs; the data-root fail-closed matrix (unset/relative/inside-repo/
symlink); the CSRF matrix; render queue with a fake runner (success, busy,
concurrent TOCTOU, unsaved version, stale source, failed worker, timeout);
output GET/HEAD/range/416, hostile-title Content-Disposition, log
non-disclosure; and static boundaries (write-fs pinned to the write zone,
child_process pinned to a shell-free runner, worker proofs, exact 4.0.445
pins, per-route method allowlist). CI runs no real render and needs no
data root; the fake runner and `mkdtemp` roots keep it hermetic.

## Real-browser and real-render QA

Chrome (real browser binary, headless) against `npm run dev` on
127.0.0.1:3000 with a temporary data root outside the repository:

1–3: real demo project loaded; Create Draft produced Saved v1 with the
source still labeled read-only. 4–8: title, background color, transition
frames (8→12), clip reorder (move down), trim-before (5), all applied.
9–10: Unsaved-changes chip appeared and the real Remotion Player re-timed to
the derived 286 frames. 11–12: Save Draft persisted version 2. 13–14: a full
browser refresh restored the same draft (v2, title, 286f). 15–18: the render
summary dialog reported "3 clip(s) · 286 frames (~9.5s) · 1080×1920 H.264";
the real render ran through the constrained worker and completed in 66s
(queued → running → succeeded, exit 0). 19–21: the MP4 downloaded via the
output route (11,861,599 bytes, `ISO Media, MP4 Base Media`), byte ranges
worked (206), and media parsing confirmed exactly 286 video frames at
1080×1920/30fps — matching the validated draft duration. 22: every protected
source file was byte-identical after QA. 23–24: the browser made zero
non-local requests and only the documented write endpoints were called.
25: the only console error was the pre-existing missing `/favicon.ico`
(present since Phase 1; documented LOW). 26: the only listener was
`127.0.0.1:3000`; after shutdown no Studio, worker, or Remotion process and
no listener remained. The temporary certification data root was removed.

## Adversarial second-pass review

Fresh-context review of the full Phase 3 diff: **0 HIGH, 1 MEDIUM, 4 LOW.**
The MEDIUM (concurrent-render TOCTOU on the queue slot) was fixed with a
synchronous reservation and a concurrency regression test. Zero unresolved
HIGH or MEDIUM findings.

Documented non-blocking LOW findings:

1. The fingerprint keys media on name+size, not content — a same-length
   in-place media replacement would not trip staleness. Accepted for the
   single-user local tool; content hashing is the upgrade path.
2. The write body guard counts UTF-16 code units after buffering; a
   multibyte-heavy body can exceed the byte budget before rejection.
   Bounded by platform limits; no practical impact locally.
3. Worker failure messages strip the data root, repo root, and HOME but
   could still echo other local paths (e.g. temp bundle dirs) to the local
   operator's own UI.
4. Resolved source roots stay cached for the server's lifetime (only
   previously-missing roots are re-resolved); a root deleted mid-session
   serves its last realpath until restart. Read-only impact.
5. Studio serves no favicon; browsers log a 404 for `/favicon.ico`
   (pre-existing since Phase 1).

## Licensing

Installed evidence re-verified: all Remotion packages exact 4.0.445;
`remotion` declares `SEE LICENSE IN LICENSE.md` (company-license terms live
at remotion.dev/docs/license); `acknowledgeRemotionLicense` is present in
the installed `@remotion/media` / media-parser types and is passed by the
Player integration. Current basis remains individual, local, non-hosted,
non-customer-facing use with no paid automated rendering service. HARD
FUTURE GATE (unchanged): customer-facing use, hosted use, commercial
distribution, organization growth beyond the free threshold, or
rendering-as-a-service each require fresh licensing verification first.

## Rollback

Revert the Phase 3 merge (or delete the branch pre-merge). No migrations:
originals are untouched, and user drafts/renders are plain JSON/MP4 under
the operator's data root, independent of repository state.

## Operator launch

```
git switch v1-top-5-skills
git pull --ff-only origin v1-top-5-skills
cd studio
npm run dev
```

Studio binds to http://127.0.0.1:3000. Drafts and renders live under
`~/Library/Application Support/myvideo-studio` (override with
`MYVIDEO_STUDIO_DATA_ROOT`).

## Current limitations

- Edits limited to: draft title, background color, transition frames, clip
  order (move up/down), trim-before, trim-after, clip enable/disable.
- One render at a time; no cancellation; no render/draft deletion (clean up
  the data root manually if desired).
- No media import/replacement, captions, music, AI features, transforms,
  color grading, or drag-and-drop timeline.
- A draft bound to a changed source cannot render (by design); create a new
  draft from the latest source instead.
- Output is always full-duration H.264 MP4 at the composition's native
  1080×1920/30.
- The first render on a fresh machine lets Remotion download its managed
  headless browser; no other network access exists in the render path.
