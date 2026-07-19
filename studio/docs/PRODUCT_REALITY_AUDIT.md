# myvideo_ Studio Product-Reality Audit

## Executive verdict

The Phase 3 engine workflow was operational, but the default shell was not truthful: ten rail buttons changed styling only; fixture projects and dead sections competed with real projects; and fixture media, timelines, creative controls, AI scores, and a mock preview appeared whenever no real project was selected. The remediated operator mode is a single real-project workflow: project selection, immutable preview, protected draft editing, explicit version save, local render, and MP4 download.

Audit date: 2026-07-19. Baseline: `b1a901698863af064fac8bf2c7ad1b4c1f11c400`.

## Control register

| Visible control / state | Source | Location | Promise and observed action | API/state | Before | Severity | Treatment / result |
|---|---|---|---|---|---|---|---|
| Studio rail | AppRail | far left | Ten destinations; only active styling changed | `activeNavItem` only | MISLEADING | HIGH | REMOVE; rail no longer rendered |
| Projects, Media Library, Transcripts, AI Editor, Templates, Brand Kits, Exports, Notifications, Settings | AppRail | rail | Implied unsupported workspaces | local styling only | MOCK | HIGH | REMOVE from operator mode |
| Projects panel toggle | StudioShell | header | Hide/show project panel | `panels.projectNav` | PARTIAL | MEDIUM | IMPLEMENT accurate Show/Hide label |
| Media panel toggle | StudioShell | header | Hide/show source-media panel | `panels.mediaBrowser` | MISLEADING | MEDIUM | IMPLEMENT accurate Show/Hide label |
| Inspector panel toggle | StudioShell | header | Hide/show inspector | `panels.inspector` | PARTIAL | MEDIUM | IMPLEMENT accurate Show/Hide label |
| Timeline panel toggle | StudioShell | header | Hide/show timeline | `panels.timeline` | PARTIAL | MEDIUM | IMPLEMENT accurate Show/Hide label |
| Real project rows | ProjectNav | left panel | Load validated local project | `GET /api/projects/:id` | WORKING | LOW | Retained; first preview-ready row auto-selected |
| Mock project rows | ProjectNav | left panel | Looked production-equivalent | fixture selection | MOCK | HIGH | REMOVE from operator mode |
| Mock sections | ProjectNav | left panel | Suggested project destinations | local styling only | DEAD | HIGH | REMOVE |
| Project retry | ProjectNav | error/empty | Reload real project list | `GET /api/projects` | WORKING | — | Retained and added to empty state |
| Project loading | ProjectNav | left panel | Loading feedback | remote state | PARTIAL | HIGH | IMPLEMENT; fixture content never flashes |
| Source media rows | MediaBrowser | media panel | Select actual project asset | inspector selection | WORKING | — | Retained and labeled Source / Read-only |
| Fixture media search and filters | MediaBrowser | media panel | Filtered invented assets | fixture/local state | MOCK | HIGH | REMOVE |
| Fake AI scores/metadata | MediaBrowser | media cards | Implied analysis | fixture only | MISLEADING | HIGH | REMOVE |
| Play/Pause | PreviewMonitor | transport | Controls Remotion Player | Player ref | WORKING | — | Retained |
| Seek | PreviewMonitor | transport | Seeks real composition | Player ref | WORKING | — | Retained |
| 50/75/100% scale | PreviewMonitor | transport | Changes preview scale | store | WORKING | — | Retained |
| Safe zones | PreviewMonitor | transport | Shows guides | store | WORKING | — | Retained |
| Fullscreen workspace | PreviewMonitor | transport | Expands preview workspace | store | PARTIAL | LOW | Retained; panel suppression is explicit |
| Mock aspect selector/clock/preview | PreviewMonitor | fallback | Simulated playback | fixture clock | MOCK | HIGH | Hidden from operator mode; honest loading state replaces fallback |
| Create Draft | PreviewMonitor | source header | Creates protected copy | `POST /api/drafts` | WORKING | — | Promoted as primary next action |
| Save Draft | PreviewMonitor | draft header | Explicit version save | `PUT /api/drafts/:id` | WORKING | — | Prominent; disabled reason retained |
| Render MP4 | PreviewMonitor | draft header | Local H.264 render | `POST /api/renders` | WORKING | — | Blocked while dirty/ineligible/busy |
| Exit draft | PreviewMonitor | draft header | Return to immutable source | session/store | WORKING | — | Unsaved discard confirmation retained |
| Download MP4 | PreviewMonitor | render status | Downloads completed output for the current saved draft version | `GET /api/renders/:id/output` | WORKING | — | Prominent only when `renderJob.draftVersion === draft.version`; a successful newer save clears stale output state |
| Workflow status strip | PreviewMonitor | below header | Identifies next action | derived state | IMPLEMENT | HIGH | Added seven-state guidance |
| Draft title | Inspector | draft settings | Edits title in memory | draft working copy | WORKING | — | Retained with explicit-save context |
| Background color | Inspector | draft settings | Edits validated color | draft working copy | PARTIAL | MEDIUM | Plain label and inline format error |
| Transition length | Inspector | draft settings | Edits transition frames | draft working copy | PARTIAL | MEDIUM | Frames plus approximate seconds |
| Creative direction, pacing, caption, brand, platform controls | Inspector | source view | Suggested unsupported editing | component-local state | MISLEADING | HIGH | REMOVE |
| AI clip tools and transform/color/audio fields | Inspector | selection view | Suggested unsupported editing | disabled fixture UI | MOCK | HIGH | REMOVE |
| Source timeline | Timeline | bottom | Shows actual cached clip sequence | document props | WORKING | — | Retained read-only |
| Draft clip selection | Timeline | bottom | Selects editable clip | store selection | WORKING | — | Retained; inspector updates |
| Move up/down | Timeline | clip row | Explicit reorder | draft working copy | WORKING | — | Retained with boundary-disabled states |
| Enable/disable | Timeline | clip row | Changes render inclusion | draft working copy | WORKING | — | Retained with text and pressed state |
| Fixture six-track timeline | Timeline | fallback | Suggested freeform editor | fixtures only | MISLEADING | HIGH | Removed from reachable operator flow |
| Narrow-screen notice | StudioShell | viewport overlay | Warns about desktop layout | dismiss state | WORKING | LOW | Retained with Continue action |

## First-time journey

Before remediation, startup selected a fixture project and exposed a mock preview; a user could click dead rail and section controls indefinitely. After remediation the first preview-ready real project is selected deterministically. In live QA, real preview appeared without a project click; Create Draft was the first primary action; editing immediately showed Unsaved changes; Render was disabled until Save Draft; refresh restored saved v2; render and download were explicit.

Measured locally: first real preview under one second after page load; draft creation under one second; editable fields immediately visible after creation; save under one second; render initiation explicit after save. The original 294-frame acceptance render completed in about 54 seconds. Remediation validation performed no additional real render.

## Fixture dependency map

Fixtures remain in `studio/fixtures/` as unused historical data. Production components and the Zustand store no longer import them; the legacy rail and unreachable fixture timeline renderer were removed. No demo route or flag is exposed in operator mode.

## Truthful discovery and versioned output

The central workspace now distinguishes loading, project-list failure, zero materialized projects, and projects present with no preview-ready cache. Only the deterministic first preview-ready project is auto-selected. A completed render is current only when its `draftVersion` equals the saved draft version. Saving a newer draft clears the former render from current UI state, restores the Render action, and prevents the obsolete download from being promoted as deliverable output.

## Deferred roadmap

Transcripts, AI editing, templates, brand kits, media import, captions, music selection, cloud publishing, collaboration, customer access, and billing remain unsupported and absent from production navigation.
