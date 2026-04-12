#!/usr/bin/env node
/**
 * Watch input/ for new video files.
 * On detection: transcribe per-clip → rebuild manifest → render MultiClip.
 *
 * Usage:
 *   node scripts/watch.mjs
 *   ./start_pipeline.sh
 */

import { spawnSync } from "child_process";
import { readdirSync, existsSync, mkdirSync, renameSync } from "fs";
import { extname, resolve } from "path";

const INPUT_DIR = resolve("input");
const PROCESSED_DIR = resolve("input/processed");
const POLL_MS = 2000;
const TIMEOUT_MS = 300_000; // 5 min per operation
const VIDEO_EXTS = new Set([".mp4", ".mov", ".mkv", ".webm"]);

mkdirSync(INPUT_DIR, { recursive: true });
mkdirSync(PROCESSED_DIR, { recursive: true });
mkdirSync("data/transcripts", { recursive: true });

const processed = new Set();
const failed = new Set();

// Seed with files already present at startup so we don't reprocess them.
for (const f of readdirSync(INPUT_DIR)) {
  if (VIDEO_EXTS.has(extname(f).toLowerCase())) processed.add(f);
}

console.log(`[watch] Watching ${INPUT_DIR} — drop video files to start the pipeline.`);

setInterval(() => {
  let files;
  try {
    files = readdirSync(INPUT_DIR);
  } catch {
    return;
  }

  for (const file of files) {
    if (!VIDEO_EXTS.has(extname(file).toLowerCase())) continue;
    if (processed.has(file)) continue;

    processed.add(file);
    const inputPath = `input/${file}`;
    const transcriptOut = `data/transcripts/${file}.json`;
    console.log(`\n[watch] ● ${file}`);

    // Step 1 — transcribe
    console.log(`[watch] [1/3] Transcribing...`);
    const transcribeResult = spawnSync(
      "python3",
      ["scripts/transcribe.py", inputPath, transcriptOut],
      { stdio: "inherit", timeout: TIMEOUT_MS }
    );

    if (transcribeResult.status !== 0 || transcribeResult.error) {
      const reason = transcribeResult.error?.message ?? `exit ${transcribeResult.status}`;
      console.error(`[watch] [FAIL] Transcribe — ${reason}`);
      console.error(`[watch]        Retry: rename or re-copy the file into input/`);
      failed.add(file);
      continue;
    }

    // Step 2 — rebuild manifest
    console.log(`[watch] [2/3] Rebuilding manifest...`);
    const manifestResult = spawnSync("npm", ["run", "manifest"], {
      stdio: "inherit",
      timeout: TIMEOUT_MS,
      shell: true,
    });

    if (manifestResult.status !== 0 || manifestResult.error) {
      const reason = manifestResult.error?.message ?? `exit ${manifestResult.status}`;
      console.error(`[watch] [FAIL] Manifest — ${reason}`);
      console.error(`[watch]        Retry: npm run manifest && npm run render:multi`);
      failed.add(file);
      continue;
    }

    // Step 3 — render
    console.log(`[watch] [3/3] Rendering...`);
    const renderResult = spawnSync("npm", ["run", "render:multi"], {
      stdio: "inherit",
      timeout: TIMEOUT_MS,
      shell: true,
    });

    if (renderResult.status !== 0 || renderResult.error) {
      const reason = renderResult.error?.message ?? `exit ${renderResult.status}`;
      console.error(`[watch] [FAIL] Render — ${reason}`);
      console.error(`[watch]        Retry: npm run render:multi`);
      failed.add(file);
      continue;
    }

    // Success — move source clip to input/processed/
    try {
      renameSync(`input/${file}`, `input/processed/${file}`);
    } catch {
      // Non-fatal — file may have been moved externally
    }

    console.log(`[watch] [DONE] output/multi.mp4`);

    // Auto-open on macOS (fail silently if unavailable)
    spawnSync("open", ["output/multi.mp4"], { stdio: "ignore" });
  }
}, POLL_MS);
