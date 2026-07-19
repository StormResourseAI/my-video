# Phase 3 — Non-Destructive Editing, Draft Persistence, and Local Export MVP

Status: implemented. See the Implementation Outcome section at the end and
PHASE3_EDIT_EXPORT_CERTIFICATION.md for the certified results.

## Goal

Turn the read-only Phase 2 Studio into a usable local editor: create a draft
from a real project, edit a bounded set of fields, save explicitly, render a
local H.264 MP4 — while the original project and source media stay byte-for-
byte untouched.

## Draft schema — StudioDraftV1

Stored as `drafts/<draftId>/draft.json` under the writable data root.

```
schemaVersion: 1
draftId               server-generated UUID v4
sourceProjectId       engine slug (SLUG_RE)
sourceProjectName     display name at creation time
sourceCompositionId   "vertical-core"
sourceCacheTimestamp  props-cache mtime ISO at creation
sourceFingerprint     server-derived hash binding the draft to its source
createdAt / updatedAt ISO timestamps
version               integer >= 1, incremented on every save
readOnlySource        literal true
draftTitle            string|null, <= 200 chars, plain text
backgroundColor       COLOR_RE hex
transitionFrames      integer 0..MAX_FRAMES
clips[]               <= 100 entries, see below
```

Each clip: `sourceAssetId` (canonical base64url id, must be a member of the
source project's props cache), `fileName`, `sourceDurationInFrames` (the
materialized clip window from the props cache), `trimBefore` / `trimAfter`
(integer frames removed from the start / end of that window;
`trimBefore + trimAfter < sourceDurationInFrames`), `enabled`, `order`
(must equal array index). No paths, no commands, no env, no free-form props.
Unknown properties are stripped; malformed drafts are rejected.

Derived engine props (shared pure function, client preview and render worker):
effective clip length = `source − trimBefore − trimAfter`; absolute engine
trims = cached window trims offset by the draft trims; total duration =
`durationInFramesFor` (same formula as the engine's calculateMetadata).
Render eligibility: >= 1 enabled clip, positive duration, duration <=
MAX_FRAMES, fingerprint current.

## Write trust boundary

New server-only zone `studio/server/write/` (dataRootPolicy, atomicJson,
draftRepository, renderRepository) plus `studio/server/render/` (renderQueue,
renderRunner). The Phase 2 read-only modules (pathPolicy, projectRepository,
assetStream, http) remain write-free; static tests pin write-capable fs APIs
to the write zone and `child_process` to renderRunner only.

All mutation routes require: local Host, local Origin, exact
`Content-Type: application/json`, bounded body, and the custom header
`X-Myvideo-Intent: studio-write-v1`. No CORS relaxation, no GET mutation,
no DELETE routes. Errors are controlled codes only — no stacks, no paths.

## Data-root policy

`MYVIDEO_STUDIO_DATA_ROOT` must be an absolute path; it is created (0700) by
the write subsystem only, realpath-resolved, rejected if it is a symlink,
equals the repository root, or resolves anywhere inside the repository.
Successful resolution is cached; failures are re-evaluated per request (fail
closed with `data_root_unavailable`). Layout:

```
drafts/<draftId>/draft.json
drafts/<draftId>/history/<version>.json
renders/<renderId>/{job.json, props.json, output.mp4, render.log}
```

All path components are server-generated (UUIDs, fixed names). Dev/start
scripts set the data root to the operator's application-support directory;
CI, build, and read-only browsing never require it.

## Concurrency model

Optimistic concurrency on drafts: clients send `expectedVersion`; the server
serializes writes per process behind an in-process queue, re-reads the
persisted draft, and returns 409 `version_conflict` on mismatch. Every save
writes the immutable `history/<version>.json` first, then atomically replaces
`draft.json` (unique temp file in the destination directory, flush, rename).

## Source fingerprint policy

Server-derived SHA-256 over: source project id, props-cache content hash,
size and mtime, referenced asset file names and sizes, and the metadata file
hash (or an absence marker). Media bytes are not hashed. Recomputed before
every save and render; a mismatch marks the draft Source Changed, keeps local
editing available, and blocks render (no bypass). The recovery path is
Create New Draft From Latest Source.

## Render worker

One render at a time (second POST → 409 `render_busy`). The route enqueues a
server-generated `renderId`; the runner spawns `node scripts/studio-render-worker.mjs <renderId>`
with `shell: false`, fixed executable (`process.execPath`), fixed script path,
fixed cwd (verified repo root), an allowlisted environment, stdout/stderr
piped to `render.log`, and a hard timeout. The worker reloads and re-validates
the draft, recomputes the fingerprint (refusing stale sources), maps asset ids
back to staged `public/runtime-selects/` media, constructs engine props
internally, bundles only `vertical-core`, and renders H.264 MP4 at the
original 1080×1920/30fps for the full validated draft duration via the
programmatic Remotion 4.0.445 renderer. Output goes only to the
server-generated `renders/<renderId>/output.mp4`; existing outputs are never
overwritten; job status updates are atomic. CI never runs a real render — 
tests use a fake runner.

## Approved edits

Draft title, background color, transition frames, clip order (move up/down),
trim-before, trim-after, clip enabled/disabled. Nothing else.

## Explicit non-goals

Media import/deletion/replacement, asset browsing, captions, music, AI
features, speed ramps, transforms, color grading, drag-and-drop timeline,
project/output deletion, render cancellation, multiple concurrent renders,
cloud publishing, deployment.

## Rollback plan

The feature is additive and branch-isolated. Rolling back = reverting the
Phase 3 merge (or deleting the branch pre-merge); the read-only Phase 2
surface is untouched. User data under the data root is never written by
tracked code paths outside the write subsystem, and originals are never
modified, so rollback has no data-migration step. Drafts/renders on disk are
plain JSON/MP4 the operator may delete manually at any time.

## Implementation Outcome

Delivered as planned with these notes:

- The source fingerprint reads the RAW engine props cache (whose clip `src`
  values are engine-relative), so it extracts clip file names structurally
  instead of reusing the API-shape props validator. The worker mirrors the
  same extraction byte-for-byte.
- Clip enable/disable is a draft-level flag; disabled clips are simply
  omitted from the derived engine props (the engine schema has no enabled
  field and its validators strip unknown keys).
- Trim semantics: draft trims are frames removed from each end of the
  materialized clip window; derived engine trims offset the window's own
  base trim, and the derived clip duration is the trimmed effective length,
  keeping the engine's calculateMetadata in exact agreement with
  `durationInFramesFor`.
- Draft-mode UI state (including the session-scoped draft restore used by
  the refresh flow) lives in the existing zustand store; sessionStorage
  holds only `{projectId, draftId}` — never draft content.
- Two Phase 2 robustness defects found during the merge gate were repaired
  here: the media-missing warning is bounded to the document validator's
  500-char cap, and `getRoots` re-resolves roots that did not exist at first
  request.
- No bounded/test-only render configuration was needed: the certification
  render is the real full-duration product path (286 frames, H.264).
