#!/usr/bin/env node
/**
 * Scan input/ for video files, get durations via ffprobe, write data/manifest.json.
 * Preserves existing usableStartSec / usableEndSec / maxClipSec overrides.
 *
 * Usage:
 *   npm run manifest
 *   node scripts/build-manifest.mjs
 *
 * Output: data/manifest.json
 */

import { execSync } from "child_process";
import { readdirSync, writeFileSync, mkdirSync, existsSync, readFileSync } from "fs";
import { extname } from "path";

const FPS = 30;
const VIDEO_EXTS = new Set([".mp4", ".mov", ".mkv", ".webm"]);
const INPUT_DIR = "input";
const OUT_PATH = "data/manifest.json";

function getDurationSec(filePath) {
  const raw = execSync(
    `ffprobe -v quiet -print_format json -show_entries format=duration "${filePath}"`,
    { encoding: "utf8" }
  );
  return parseFloat(JSON.parse(raw).format.duration);
}

// Load existing manifest to preserve manual overrides
let existing = {};
if (existsSync(OUT_PATH)) {
  try {
    const prev = JSON.parse(readFileSync(OUT_PATH, "utf8"));
    for (const c of prev.clips ?? []) existing[c.file] = c;
  } catch { /* ignore parse errors */ }
}

const files = readdirSync(INPUT_DIR)
  .filter((f) => VIDEO_EXTS.has(extname(f).toLowerCase()))
  .sort(); // deterministic alphabetical order

if (files.length === 0) {
  console.log("[manifest] No video files found in input/ — writing empty manifest.");
}

const clips = files.map((file) => {
  const path = `${INPUT_DIR}/${file}`;
  const durationSec = getDurationSec(path);
  const durationFrames = Math.round(durationSec * FPS);
  const prev = existing[file] ?? {};

  // Embed per-clip transcript if a file exists at data/transcripts/<file>.json
  const transcriptPath = `data/transcripts/${file}.json`;
  let transcript = null;
  if (existsSync(transcriptPath)) {
    try {
      transcript = JSON.parse(readFileSync(transcriptPath, "utf8"));
      console.log(`[manifest] ${file} — transcript loaded from ${transcriptPath}`);
    } catch {
      console.warn(`[manifest] WARNING: could not parse ${transcriptPath} — skipping`);
    }
  }

  console.log(`[manifest] ${file} — ${durationSec.toFixed(2)}s / ${durationFrames} frames${transcript ? " (with transcript)" : ""}`);
  return {
    file,
    durationSec: parseFloat(durationSec.toFixed(3)),
    durationFrames,
    transcript,
    // Preserve manual overrides; default null means "use computed defaults"
    usableStartSec: prev.usableStartSec ?? null,
    usableEndSec:   prev.usableEndSec   ?? null,
    maxClipSec:     prev.maxClipSec     ?? null,
  };
});

mkdirSync("data", { recursive: true });
writeFileSync(OUT_PATH, JSON.stringify({ fps: FPS, clips }, null, 2));
console.log(`[manifest] Done. ${clips.length} clip(s) → ${OUT_PATH}`);
