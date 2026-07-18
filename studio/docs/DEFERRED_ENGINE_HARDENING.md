# Deferred Engine Hardening

Known defects in the existing rendering engine, deliberately **not** fixed on the
Phase 1 UI branch. Recommended remediation branch:

```
fix/myvideo-engine-safety-hardening
```

Evidence below comes from read-only inspection only; no engine file was modified.

| # | Defect | Severity | Blocks Phase 2? | Blocks commercial release? |
|---|--------|----------|-----------------|----------------------------|
| 1 | Watcher marks pre-existing input files as processed | HIGH | No | Yes |
| 2 | File identity degrades to filename-only after move | HIGH | Partially (media linking) | Yes |
| 3 | Shell-interpolated FFprobe in `build-manifest.mjs` | HIGH (security) | No | Yes |
| 4 | Implicit alphabetical music selection | MEDIUM | Yes (UI needs explicit choice) | Yes |
| 5 | Ingestion moves originals instead of copy-only | HIGH (data loss) | No | Yes |
| 6 | Legacy compositions depend on global JSON | MEDIUM | Yes (adapter seam) | No |
| 7 | Runtime data mixed into repository paths | MEDIUM | Yes (ProjectDocument home) | No |
| 8 | Remotion commercial licensing unresolved | HIGH (legal) | No | **Yes — gating** |

## 1. Watcher marks pre-existing input files as processed
- **Evidence:** `scripts/watch.mjs` maintains `data/processed-ledger.json` and moves
  files via `renameSync("input/<file>", "input/processed/<file>")` (line 206). Files
  present before the watcher starts can be swept into the processed set without a
  successful render behind them.
- **Remediation:** Treat the ledger as append-only per verified render output;
  seed-scan should mark files `seen`, never `processed`.
- **Tests:** Start watcher against a pre-populated `input/`; assert nothing is
  ledgered as processed until a render completes.

## 2. File identity degrades to filename-only after move
- **Evidence:** `scripts/ingest_media.sh` renames with
  `mv -- "$filepath" "$INGESTED_DIR/$filename"` (line 36) keyed on `basename` only;
  no content hash travels with the file. Duplicate basenames collide; moved files
  lose their history.
- **Remediation:** Record a content hash (e.g. SHA-256) at first sight and key all
  ledgers/manifests by hash, not path.
- **Tests:** Ingest two distinct files with the same basename; assert both survive
  with distinct identities.

## 3. Shell-interpolated FFprobe
- **Evidence:** `scripts/build-manifest.mjs:181` builds
  `` `ffprobe … "${filePath}"` `` for a shell call. A crafted filename in `input/`
  can inject shell syntax.
- **Remediation:** Use `execFile("ffprobe", [args, filePath])` — no shell.
- **Tests:** Manifest build over a filename containing `"$(touch pwned)"`; assert no
  side effect and correct probing.

## 4. Implicit alphabetical music selection
- **Evidence:** `scripts/build-manifest.mjs:200-203` — "Detect first audio file
  (alphabetical) to use as background music" via `.sort()[0]`.
- **Remediation:** Explicit music reference in the project document (Architecture
  decision 9); alphabetical only as a labeled fallback.
- **Tests:** Manifest with multiple audio files honors the explicit selection.

## 5. Ingestion moves originals instead of defaulting to copy-only
- **Evidence:** `scripts/ingest_media.sh:36` uses `mv --`; `scripts/watch.mjs:206`
  uses `renameSync`. Originals leave their source location; a mid-move failure or a
  later bug loses the only copy.
- **Remediation:** Copy + verify (size/hash) + only then optionally archive the
  original behind an explicit `--move` flag.
- **Tests:** Simulated failure between copy and archive leaves the original intact.

## 6. Legacy compositions depend on global JSON
- **Evidence:** `src/lib/manifest.ts` loads the global `data/manifest.json`;
  compositions (`MultiClip*`, etc.) read from it implicitly rather than taking
  typed props.
- **Remediation:** The Phase 2 typed adapter around `VerticalCoreComposition`
  passes an explicit `ProjectDocument`-derived props object; global JSON becomes a
  legacy loader.
- **Tests:** Compositions render from injected props with no filesystem read.

## 7. Runtime data mixed into repository paths
- **Evidence:** `data/processed-ledger.json`, `data/manifest.json`,
  `input/processed/`, `output/`, and `public/runtime-selects/` all live inside the
  repo working tree, mixing mutable runtime state with source control.
- **Remediation:** Move runtime state to an OS data directory or a single
  git-ignored workspace root (Architecture decision 8).
- **Tests:** Pipeline run leaves `git status` clean.

## 8. Remotion commercial licensing unresolved
- **Evidence:** Root `package.json` depends on `remotion@4.0.445`
  (license "UNLICENSED" project). Remotion requires a paid company license beyond
  the free tier for commercial use.
- **Remediation:** Confirm team size/revenue against Remotion's licensing terms and
  purchase a company license before any paid delivery is produced with it.
- **Tests:** N/A — legal/compliance checklist item.

## Recommended remediation order

1. **#3 FFprobe injection** (small, isolated, security) →
2. **#5 copy-only ingestion** + **#1 watcher ledger** (data-loss pair, same touchpoints) →
3. **#2 hash identity** (foundation for media linking) →
4. **#7 runtime data location** → **#6 typed props** → **#4 explicit music** (Phase 2 seam work) →
5. **#8 licensing** runs in parallel as a business action and gates commercial release.
