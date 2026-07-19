# Operator Readiness Certification

## Product boundary and workflow

Certified scope is local real-project discovery, immutable cached-props preview, protected/versioned draft editing, explicit save, one-at-a-time local H.264 rendering, status polling, and MP4 download. Unsupported future workspaces are absent. Fixture content is not visible or selectable in normal operator mode.

Navigation is one workspace with four truthful panel toggles: Projects, Source Media, Inspector, and Timeline. The application rail was removed. A contextual status strip leads the operator through Select, Preview, Create Draft, Edit, Save, Render, and Download.

## Browser QA

Clean-session Chrome QA on `127.0.0.1:3000` auto-selected Demo Vertical Batch, displayed real assets and a 1080×1920/30fps preview, played and sought, created a protected draft, edited all supported field categories, reordered and toggled a clip, blocked dirty rendering, saved v2, and restored v2 after refresh. Panel controls and icon controls had accessible names; selected/disabled states included text or ARIA state. The narrow-screen notice has an explicit Continue action.

Viewport layout was inspected at the requested desktop layout and automated component coverage exercises panel suppression and narrow-screen escape. Deterministic component acceptance now drives the exact Render MP4 control path: confirmation accepted, exactly one POST observed, queued/running feedback shown, same-version success promoted to Download MP4, and dirty, source-changed, and older-version outputs blocked from current delivery. The original authorized guarded local render remains the only real render; remediation performed no additional real render.

Project discovery is truthful in both the Projects panel and central workspace: loading, API error with Retry direction, zero materialized projects with source-safety guidance, and projects present with no preview-ready cache are distinct states. The deterministic first preview-ready project remains the only automatic selection.

## Validation and real render

- Studio typecheck: pass.
- Studio lint: pass, zero warnings after remediation.
- Studio tests: 211/211 pass across 14 files.
- Studio production build: pass without local project data; one existing Next trace warning.
- Real render: `b7c13bfc-540b-4354-9a86-91181fc593de`, draft v2, 294 frames, succeeded, 12,045,375 bytes.
- Download: valid MP4, H.264 1080×1920 at 30fps, AAC audio, 9.856 seconds.
- No external service was contacted; all observed application requests were loopback `/api` traffic.

## Safety and adversarial review

No server security code changed. Immutable source boundary, source fingerprints, optimistic versioning, write intent/origin guards, path containment, symlink and output protections, loopback binding, shell-free render execution, and single-render concurrency remain covered by the passing Phase 2/3 tests. Git shows no project/media modifications.

Fresh-context remediation resolved stale-output promotion, misleading discovery states, and the missing deterministic Render-button acceptance. LOW: fullscreen is a workspace expansion rather than browser Fullscreen API; the build retains a known broad-trace warning; the unused `studio/fixtures/` data remains historical cleanup debt but is not imported by production code.

## Rollback

Revert this branch’s commits. Draft/output data is isolated beneath the configured Studio data root and source projects are unaffected.

## Verdict

READY_FOR_INDEPENDENT_OPERATOR_READINESS_REVIEW. Founder hands-on testing and explicit merge authorization remain required.
