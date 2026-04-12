#!/usr/bin/env node
/**
 * Watch input/ for new video files.
 * On detection: transcribe → render.
 *
 * Usage:
 *   node scripts/watch.mjs
 */

import { spawnSync } from "child_process";
import { readdirSync, existsSync, mkdirSync } from "fs";
import { extname, resolve } from "path";

const INPUT_DIR = resolve("input");
const POLL_MS = 2000;
const TIMEOUT_MS = 300_000; // 5 min per operation
const VIDEO_EXTS = new Set([".mp4", ".mov", ".mkv", ".webm"]);

if (!existsSync(INPUT_DIR)) mkdirSync(INPUT_DIR, { recursive: true });

const processed = new Set();
const failed = new Set();

// Seed with files already present at startup so we don't reprocess them.
for (const f of readdirSync(INPUT_DIR)) {
  if (VIDEO_EXTS.has(extname(f).toLowerCase())) processed.add(f);
}

console.log(`[watch] Watching ${INPUT_DIR} — waiting for new video files...`);

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
    console.log(`\n[watch] New file detected: ${inputPath}`);

    console.log("[watch] Transcribing...");
    const transcribeResult = spawnSync(
      "python3",
      ["scripts/transcribe.py", inputPath],
      { stdio: "inherit", timeout: TIMEOUT_MS }
    );

    if (transcribeResult.status !== 0 || transcribeResult.error) {
      const reason = transcribeResult.error?.message ?? `exit ${transcribeResult.status}`;
      console.error(`[watch] FAILED transcribe: ${file} — ${reason}`);
      console.error(`[watch] To retry: rename or re-copy the file into input/`);
      failed.add(file);
      continue;
    }

    console.log("[watch] Rendering...");
    const renderResult = spawnSync("npm", ["run", "render"], {
      stdio: "inherit",
      timeout: TIMEOUT_MS,
      shell: true,
    });

    if (renderResult.status !== 0 || renderResult.error) {
      const reason = renderResult.error?.message ?? `exit ${renderResult.status}`;
      console.error(`[watch] FAILED render: ${file} — ${reason}`);
      console.error(`[watch] transcript.json is intact — run 'npm run render' manually to retry`);
      failed.add(file);
      continue;
    }

    console.log(`[watch] Done → output/video.mp4`);
  }
}, POLL_MS);
