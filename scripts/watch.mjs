#!/usr/bin/env node
/**
 * Watch input/ for new video files.
 * Batches all pending files together: transcribe all → manifest once → render once.
 *
 * Usage:
 *   node scripts/watch.mjs
 *   ./start_pipeline.sh
 */

import { spawnSync } from "child_process";
import { readdirSync, existsSync, mkdirSync, renameSync, readFileSync, writeFileSync, statSync } from "fs";
import { extname, resolve } from "path";

const INPUT_DIR      = resolve("input");
const PROCESSED_DIR  = resolve("input/processed");
const FAILED_DIR     = resolve("input/failed");
const FAILED_LOG     = resolve("data/failed-files.json");
const LEDGER_PATH    = resolve("data/processed-ledger.json");
const REPORTS_DIR    = resolve("data/reports");
const POLL_MS        = 3000;
const TRANSCRIBE_TIMEOUT_MS = 600_000;
const MANIFEST_TIMEOUT_MS   = 60_000;
const RENDER_TIMEOUT_MS     = 1_800_000;
const VIDEO_EXTS = new Set([".mp4", ".mov", ".mkv", ".webm"]);

mkdirSync(INPUT_DIR,    { recursive: true });
mkdirSync(PROCESSED_DIR, { recursive: true });
mkdirSync(FAILED_DIR,    { recursive: true });
mkdirSync(REPORTS_DIR,   { recursive: true });
mkdirSync("data/transcripts", { recursive: true });

// ── Processed ledger (persistent across restarts) ───────────────────────────
function loadLedger() {
  try { return JSON.parse(readFileSync(LEDGER_PATH, "utf8")); } catch { return {}; }
}
function saveLedger(ledger) {
  writeFileSync(LEDGER_PATH, JSON.stringify(ledger, null, 2));
}
function fileKey(file) {
  try {
    const st = statSync(`${INPUT_DIR}/${file}`);
    return `${file}::${st.size}::${st.mtimeMs}`;
  } catch { return file; }
}

// ── Failed-files log ─────────────────────────────────────────────────────────
function loadFailedLog() {
  try { return JSON.parse(readFileSync(FAILED_LOG, "utf8")); } catch { return []; }
}
function appendFailedLog(entry) {
  const log = loadFailedLog();
  log.push(entry);
  writeFileSync(FAILED_LOG, JSON.stringify(log, null, 2));
}
function quarantine(file, reason) {
  const src  = `${INPUT_DIR}/${file}`;
  const dest = `${FAILED_DIR}/${file}`;
  try { renameSync(src, dest); } catch { /* already moved */ }
  appendFailedLog({
    file,
    reason,
    quarantinedAt: new Date().toISOString(),
  });
  console.error(`[watch] [QUARANTINE] ${file} → input/failed/ (${reason})`);
}

// ── Preflight validation via ffprobe ─────────────────────────────────────────
function preflight(file) {
  const path = `${INPUT_DIR}/${file}`;
  const r = spawnSync("ffprobe", [
    "-v", "quiet",
    "-print_format", "json",
    "-show_entries", "format=duration:stream=codec_type",
    path,
  ], { encoding: "utf8", timeout: 15_000 });

  if (r.status !== 0 || r.error) return { ok: false, reason: "ffprobe failed — file may be corrupt or unsupported" };

  let info;
  try { info = JSON.parse(r.stdout); } catch { return { ok: false, reason: "ffprobe output unparseable" }; }

  const dur = parseFloat(info?.format?.duration ?? "0");
  if (!isFinite(dur) || dur <= 0) return { ok: false, reason: `invalid duration: ${dur}` };

  const hasVideo = (info?.streams ?? []).some((s) => s.codec_type === "video");
  if (!hasVideo) return { ok: false, reason: "no video stream detected" };

  return { ok: true };
}

// ── In-memory state ──────────────────────────────────────────────────────────
const ledger = loadLedger();
const done   = new Set(Object.keys(ledger)); // files known completed

// Seed: files already in input/ at startup go into done so they aren't re-triggered
for (const f of readdirSync(INPUT_DIR)) {
  if (VIDEO_EXTS.has(extname(f).toLowerCase())) done.add(f);
}

// Seed: files in input/failed/ must never be retried
const quarantined = new Set(
  readdirSync(FAILED_DIR).filter((f) => VIDEO_EXTS.has(extname(f).toLowerCase()))
);

console.log(`[watch] Watching ${INPUT_DIR}`);
console.log(`[watch] Drop video files to trigger the pipeline.`);
if (quarantined.size > 0) {
  console.log(`[watch] ${quarantined.size} quarantined file(s) in input/failed/ — inspect and re-copy to retry.`);
}

function run(cmd, args, opts = {}) {
  const r = spawnSync(cmd, args, { stdio: "inherit", shell: false, ...opts });
  return r.status === 0 && !r.error;
}
function ts() { return new Date().toTimeString().slice(0, 8); }

setInterval(() => {
  let allFiles;
  try { allFiles = readdirSync(INPUT_DIR); } catch { return; }

  const pending = allFiles.filter(
    (f) => VIDEO_EXTS.has(extname(f).toLowerCase()) && !done.has(f) && !quarantined.has(f)
  );

  if (pending.length === 0) return;

  const total = pending.length;
  const batchStart = new Date().toISOString();
  console.log(`\n[watch] ${ts()} ── Batch: ${total} file(s) pending ──`);

  // Batch report accumulators
  let batchSeen = total, batchProcessed = 0, batchSkipped = 0, batchFailed = 0;

  // ── Step 0: Preflight validation ─────────────────────────────────────────
  const valid = [];
  for (const file of pending) {
    const { ok, reason } = preflight(file);
    if (ok) {
      valid.push(file);
    } else {
      quarantine(file, reason);
      quarantined.add(file);
      done.add(file);
      batchFailed++;
    }
  }

  // ── Step 1: Transcribe all valid clips ───────────────────────────────────
  const transcribed = [];
  const transcribeFailed = [];

  for (let idx = 0; idx < valid.length; idx++) {
    const file = valid[idx];
    const inputPath    = `input/${file}`;
    const transcriptOut = `data/transcripts/${file}.json`;
    console.log(`[watch] [transcribe ${idx + 1}/${valid.length}] ${file}`);

    const ok = run("python3", ["scripts/transcribe.py", inputPath, transcriptOut], {
      timeout: TRANSCRIBE_TIMEOUT_MS,
    });

    if (ok) {
      transcribed.push(file);
    } else {
      quarantine(file, "transcription failed");
      quarantined.add(file);
      done.add(file);
      transcribeFailed.push(file);
      batchFailed++;
    }
  }

  if (transcribed.length === 0) {
    console.error(`[watch] No clips survived preflight + transcription — skipping manifest + render`);
    writeBatchReport({ batchStart, seen: batchSeen, processed: 0, skipped: batchSkipped, failed: batchFailed, output: null });
    return;
  }

  // ── Step 2: Rebuild manifest ─────────────────────────────────────────────
  console.log(`[watch] [manifest] Rebuilding for ${transcribed.length} clip(s)...`);
  const manifestOk = run("npm", ["run", "manifest"], { timeout: MANIFEST_TIMEOUT_MS, shell: true });

  if (!manifestOk) {
    console.error(`[watch] [FAIL] Manifest build failed — retry: npm run manifest`);
    writeBatchReport({ batchStart, seen: batchSeen, processed: 0, skipped: batchSkipped, failed: batchFailed, output: null });
    return;
  }

  // ── Step 3: Render ───────────────────────────────────────────────────────
  console.log(`[watch] [render] Starting render...`);
  const renderOk = run("npm", ["run", "render:multi"], { timeout: RENDER_TIMEOUT_MS, shell: true });

  if (!renderOk) {
    console.error(`[watch] [FAIL] Render failed — retry: npm run render:multi`);
    writeBatchReport({ batchStart, seen: batchSeen, processed: 0, skipped: batchSkipped, failed: batchFailed, output: null });
    return;
  }

  // ── Step 3b: Update style memory ────────────────────────────────────────
  run("node", ["scripts/update-style-memory.mjs"], { timeout: 10_000 });

  // ── Step 4: Move clips + update ledger ──────────────────────────────────
  for (const file of transcribed) {
    try {
      renameSync(`input/${file}`, `input/processed/${file}`);
    } catch { /* moved externally */ }
    ledger[file] = { completedAt: new Date().toISOString(), key: fileKey(file) };
    done.add(file);
    batchProcessed++;
  }
  saveLedger(ledger);

  const outputPath = "output/multi.mp4";

  // ── Step 5: Batch summary report ────────────────────────────────────────
  writeBatchReport({ batchStart, seen: batchSeen, processed: batchProcessed, skipped: batchSkipped, failed: batchFailed, output: outputPath });

  console.log(`\n[watch] ${ts()} ── Batch complete ──`);
  console.log(`[watch]   ✓ processed : ${batchProcessed}`);
  console.log(`[watch]   ✗ failed    : ${batchFailed}${batchFailed > 0 ? " (quarantined in input/failed/)" : ""}`);
  console.log(`[watch]   → ${outputPath}`);

  spawnSync("open", [outputPath], { stdio: "ignore" });

}, POLL_MS);

// ── Batch report writer ───────────────────────────────────────────────────────
function writeBatchReport({ batchStart, seen, processed, skipped, failed, output }) {
  const stamp = batchStart.replace(/[:.]/g, "-").slice(0, 19);
  const reportPath = `${REPORTS_DIR}/batch-${stamp}.json`;
  const report = {
    batchStart,
    completedAt: new Date().toISOString(),
    filesSeen:      seen,
    filesProcessed: processed,
    filesSkipped:   skipped,
    filesFailed:    failed,
    outputGenerated: output,
  };
  try { writeFileSync(reportPath, JSON.stringify(report, null, 2)); } catch { /* non-fatal */ }
  console.log(`[watch] report → ${reportPath}`);
}
