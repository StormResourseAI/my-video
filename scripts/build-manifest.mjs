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
import { extname, resolve } from "path";

const FPS = 30;
const VIDEO_EXTS = new Set([".mp4", ".mov", ".mkv", ".webm"]);
const AUDIO_EXTS = new Set([".mp3", ".wav", ".aac", ".m4a", ".ogg"]);
const INPUT_DIR = "input";
const OUT_PATH = "data/manifest.json";
const PROFILE_PATH = "data/style-profile.json";
const MEMORY_PATH  = "data/style-memory.json";

// Load style memory for scoring bias (graceful fallback)
let memoryPreferredSec = null;
try {
  const mem = JSON.parse(readFileSync(MEMORY_PATH, "utf8"));
  memoryPreferredSec = mem?.summary?.preferredAvgClipSec ?? null;
} catch { /* no memory yet */ }

// Load style-profile for selection settings (graceful fallback)
let selectionMode = "all";
let selectionTopN = 5;
let selectionMinScore = -Infinity;
let selectionHookEnabled = false;
let pacingMinSec = 1.5;
let pacingMaxSec = 7;
try {
  const profileRaw = JSON.parse(readFileSync(PROFILE_PATH, "utf8"));
  selectionMode        = profileRaw?.selection?.mode          ?? selectionMode;
  selectionTopN        = profileRaw?.selection?.topN          ?? selectionTopN;
  selectionMinScore    = profileRaw?.selection?.minScore      ?? selectionMinScore;
  selectionHookEnabled = profileRaw?.selection?.hookEnabled   ?? selectionHookEnabled;
  pacingMinSec         = profileRaw?.pacing?.minClipSec       ?? pacingMinSec;
  pacingMaxSec         = profileRaw?.pacing?.maxClipSec       ?? pacingMaxSec;
} catch { /* use defaults */ }

const PENALTY_NAMES = ["test", "backup", "tmp", "raw", "draft", "junk"];

/**
 * Deterministic score for a clip. Higher = more suitable.
 * Heuristics: duration fit, transcript presence, speech density, filename.
 */
function scoreClip(file, durationSec, transcript) {
  let score = 0;

  // Duration suitability: sweet spot is [minClipSec, maxClipSec]
  if (durationSec >= pacingMinSec && durationSec <= pacingMaxSec) score += 3;
  else if (durationSec >= pacingMinSec && durationSec <= pacingMaxSec * 1.5) score += 1;

  // Transcript presence
  if (transcript && transcript.captions?.length > 0) {
    score += 2;
    // Speech density: words per second of captioned span
    const cues = transcript.captions;
    const spanSec = cues[cues.length - 1].end - cues[0].start;
    const words = cues.reduce((n, c) => n + c.text.trim().split(/\s+/).length, 0);
    const density = spanSec > 0 ? words / spanSec : 0;
    if (density >= 2.0) score += 2;
    else if (density >= 1.0) score += 1;
  }

  // Filename penalty for common throwaway names
  const lower = file.toLowerCase();
  if (PENALTY_NAMES.some((p) => lower.includes(p))) score -= 2;

  // Memory bias: +1 if clip length is close to historically preferred avg (±1s)
  if (memoryPreferredSec !== null && Math.abs(durationSec - memoryPreferredSec) <= 1.0) {
    score += 1;
  }

  return score;
}

/**
 * Hook score: how well a clip works as the FIRST clip.
 * Favors 2–5s duration, transcript presence, high speech density.
 */
function hookScore(file, durationSec, transcript) {
  let score = 0;

  // Ideal hook length: 2–5s punchy opener
  if (durationSec >= 2 && durationSec <= 5) score += 4;
  else if (durationSec > 5 && durationSec <= 7) score += 2;
  else if (durationSec < 2) score -= 1;

  if (transcript && transcript.captions?.length > 0) {
    score += 3; // speech in first clip = strong hook
    const cues = transcript.captions;
    const spanSec = cues[cues.length - 1].end - cues[0].start;
    const words = cues.reduce((n, c) => n + c.text.trim().split(/\s+/).length, 0);
    const density = spanSec > 0 ? words / spanSec : 0;
    if (density >= 2.5) score += 3;
    else if (density >= 1.5) score += 2;
    else if (density >= 0.8) score += 1;
  }

  // Filename hints for hook-y content
  const lower = file.toLowerCase();
  if (["hook", "intro", "open", "start"].some((h) => lower.includes(h))) score += 2;

  return score;
}

function getDurationSec(filePath) {
  const raw = execSync(
    `ffprobe -v quiet -print_format json -show_entries format=duration "${filePath}"`,
    { encoding: "utf8", timeout: 15_000 }
  );
  const dur = parseFloat(JSON.parse(raw).format.duration);
  if (!isFinite(dur) || dur <= 0) throw new Error(`invalid duration: ${dur}`);
  return dur;
}

// Load existing manifest to preserve manual overrides
let existing = {};
if (existsSync(OUT_PATH)) {
  try {
    const prev = JSON.parse(readFileSync(OUT_PATH, "utf8"));
    for (const c of prev.clips ?? []) existing[c.file] = c;
  } catch { /* ignore parse errors */ }
}

const allInputFiles = readdirSync(INPUT_DIR);

// Detect first audio file (alphabetical) to use as background music
const musicFile = allInputFiles
  .filter((f) => AUDIO_EXTS.has(extname(f).toLowerCase()))
  .sort()[0] ?? null;

if (musicFile) {
  console.log(`[manifest] Music track detected: ${musicFile}`);
}

const files = allInputFiles
  .filter((f) => VIDEO_EXTS.has(extname(f).toLowerCase()))
  .sort(); // deterministic alphabetical order

if (files.length === 0) {
  console.log("[manifest] No video files found in input/ — writing empty manifest.");
}

const startMs = Date.now();

const skipped = [];
const clips = files.flatMap((file, idx) => {
  console.log(`[manifest] [${idx + 1}/${files.length}] ${file}`);
  const path = `${INPUT_DIR}/${file}`;
  let durationSec;
  try {
    durationSec = getDurationSec(path);
  } catch (err) {
    console.warn(`[manifest] SKIP ${file} — ffprobe failed: ${err.message}`);
    skipped.push(file);
    return [];
  }
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

  const score        = scoreClip(file, durationSec, transcript);
  const hScore       = hookScore(file, durationSec, transcript);
  const transcriptWordCount = transcript?.captions
    ? transcript.captions.reduce((n, c) => n + c.text.trim().split(/\s+/).length, 0)
    : 0;
  console.log(`[manifest]   ${durationSec.toFixed(2)}s / ${durationFrames}f${transcript ? ` +transcript(${transcriptWordCount}w)` : ""} score=${score} hookScore=${hScore}`);
  return [{
    file,
    durationSec: parseFloat(durationSec.toFixed(3)),
    durationFrames,
    transcript,
    // Preserve manual overrides; default null means "use computed defaults"
    usableStartSec: prev.usableStartSec ?? null,
    usableEndSec:   prev.usableEndSec   ?? null,
    maxClipSec:     prev.maxClipSec     ?? null,
    score,
    hookScore: hScore,
    transcriptWordCount,
  }];
});

// Apply selection if mode is "top": sort by score desc, take topN, then restore original order
let selectedClips = clips;
if (selectionMode === "top" && clips.length > selectionTopN) {
  const top = [...clips]
    .sort((a, b) => b.score - a.score)
    .slice(0, selectionTopN);
  const topFiles = new Set(top.map((c) => c.file));
  selectedClips = clips.filter((c) => topFiles.has(c.file));
  console.log(`[manifest] selection=top${selectionTopN}: kept ${selectedClips.length}/${clips.length} clips`);
}

// Apply minScore threshold
if (isFinite(selectionMinScore)) {
  const before = selectedClips.length;
  selectedClips = selectedClips.filter((c) => c.score >= selectionMinScore);
  if (selectedClips.length < before) {
    console.log(`[manifest] minScore=${selectionMinScore}: dropped ${before - selectedClips.length} clip(s)`);
  }
}

// Hook promotion: move best-hookScore clip to position 0
if (selectionHookEnabled && selectedClips.length > 1) {
  const bestHookIdx = selectedClips.reduce(
    (best, c, i) => (c.hookScore > selectedClips[best].hookScore ? i : best),
    0
  );
  if (bestHookIdx !== 0) {
    const [hookClip] = selectedClips.splice(bestHookIdx, 1);
    selectedClips.unshift(hookClip);
    console.log(`[manifest] hookEnabled: promoted "${hookClip.file}" to position 0 (hookScore=${hookClip.hookScore})`);
  }
}

mkdirSync("data", { recursive: true });
writeFileSync(OUT_PATH, JSON.stringify({ fps: FPS, clips: selectedClips, musicFile }, null, 2));
const elapsed = ((Date.now() - startMs) / 1000).toFixed(1);
console.log(`[manifest] Done in ${elapsed}s — ${selectedClips.length} clip(s)${skipped.length ? `, ${skipped.length} skipped` : ""}${musicFile ? `, music: ${musicFile}` : ""} → ${OUT_PATH}`);
