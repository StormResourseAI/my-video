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
import { readdirSync, existsSync, mkdirSync, renameSync } from "fs";
import { extname, resolve } from "path";

const INPUT_DIR      = resolve("input");
const PROCESSED_DIR  = resolve("input/processed");
const POLL_MS        = 3000;
const TRANSCRIBE_TIMEOUT_MS = 600_000;  // 10 min per clip
const MANIFEST_TIMEOUT_MS   = 60_000;   // 1 min
const RENDER_TIMEOUT_MS     = 1_800_000; // 30 min (large batches)
const VIDEO_EXTS = new Set([".mp4", ".mov", ".mkv", ".webm"]);

mkdirSync(INPUT_DIR,    { recursive: true });
mkdirSync(PROCESSED_DIR, { recursive: true });
mkdirSync("data/transcripts", { recursive: true });

// Track state across poll cycles
const done    = new Set(); // successfully processed
const failed  = new Set(); // failed at any step — will retry on next drop

// Seed with files already present at startup so they aren't re-triggered.
for (const f of readdirSync(INPUT_DIR)) {
  if (VIDEO_EXTS.has(extname(f).toLowerCase())) done.add(f);
}

console.log(`[watch] Watching ${INPUT_DIR}`);
console.log(`[watch] Drop video files to trigger the pipeline.`);

function run(cmd, args, opts = {}) {
  const r = spawnSync(cmd, args, { stdio: "inherit", shell: false, ...opts });
  return r.status === 0 && !r.error;
}

function ts() {
  return new Date().toTimeString().slice(0, 8);
}

setInterval(() => {
  let allFiles;
  try {
    allFiles = readdirSync(INPUT_DIR);
  } catch {
    return;
  }

  // Collect files not yet processed or previously failed
  const pending = allFiles.filter(
    (f) => VIDEO_EXTS.has(extname(f).toLowerCase()) && !done.has(f)
  );

  if (pending.length === 0) return;

  const total = pending.length;
  console.log(`\n[watch] ${ts()} ── Batch: ${total} file(s) pending ──`);

  // ── Step 1: Transcribe all pending clips ─────────────────────────────────
  const transcribed = [];
  const transcribeFailed = [];

  for (let idx = 0; idx < pending.length; idx++) {
    const file = pending[idx];
    const inputPath   = `input/${file}`;
    const transcriptOut = `data/transcripts/${file}.json`;
    console.log(`[watch] [transcribe ${idx + 1}/${total}] ${file}`);

    const ok = run("python3", ["scripts/transcribe.py", inputPath, transcriptOut], {
      timeout: TRANSCRIBE_TIMEOUT_MS,
    });

    if (ok) {
      transcribed.push(file);
    } else {
      console.error(`[watch] [FAIL] Transcribe failed for ${file} — skipping, will retry next drop`);
      transcribeFailed.push(file);
    }
  }

  if (transcribed.length === 0 && transcribeFailed.length > 0) {
    console.error(`[watch] All clips failed transcription — skipping manifest + render`);
    return;
  }

  // ── Step 2: Rebuild manifest once ────────────────────────────────────────
  console.log(`[watch] [manifest] Rebuilding for ${transcribed.length} clip(s)...`);
  const manifestOk = run("npm", ["run", "manifest"], {
    timeout: MANIFEST_TIMEOUT_MS,
    shell: true,
  });

  if (!manifestOk) {
    console.error(`[watch] [FAIL] Manifest build failed — retry: npm run manifest`);
    return;
  }

  // ── Step 3: Render once ───────────────────────────────────────────────────
  console.log(`[watch] [render] Starting render...`);
  const renderOk = run("npm", ["run", "render:multi"], {
    timeout: RENDER_TIMEOUT_MS,
    shell: true,
  });

  if (!renderOk) {
    console.error(`[watch] [FAIL] Render failed — retry: npm run render:multi`);
    return;
  }

  // ── Step 3b: Update style memory ─────────────────────────────────────────
  run("node", ["scripts/update-style-memory.mjs"], { timeout: 10_000 });

  // ── Step 4: Move successfully transcribed clips to processed/ ────────────
  for (const file of transcribed) {
    try {
      renameSync(`input/${file}`, `input/processed/${file}`);
      done.add(file);
    } catch {
      done.add(file); // file may have been moved externally — still mark done
    }
  }

  // ── Batch summary ─────────────────────────────────────────────────────────
  console.log(`\n[watch] ${ts()} ── Batch complete ──`);
  console.log(`[watch]   ✓ processed : ${transcribed.length}`);
  if (transcribeFailed.length > 0) {
    console.log(`[watch]   ✗ failed    : ${transcribeFailed.length} (${transcribeFailed.join(", ")})`);
    console.log(`[watch]     Re-copy failed files into input/ to retry.`);
  }
  console.log(`[watch]   → output/multi.mp4`);

  // Auto-open on macOS
  spawnSync("open", ["output/multi.mp4"], { stdio: "ignore" });

}, POLL_MS);
