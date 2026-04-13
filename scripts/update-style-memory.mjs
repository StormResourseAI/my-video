#!/usr/bin/env node
/**
 * Append a render record to data/style-memory.json after each successful render.
 * Called automatically by watch.mjs after render succeeds.
 *
 * Usage:
 *   node scripts/update-style-memory.mjs
 */

import { existsSync, readFileSync, writeFileSync } from "fs";

const MEMORY_PATH  = "data/style-memory.json";
const MANIFEST_PATH = "data/manifest.json";
const PROFILE_PATH  = "data/style-profile.json";
const PRESET_PATH   = "data/.active-preset";

// Load existing memory
let memory = { runs: [], summary: {} };
if (existsSync(MEMORY_PATH)) {
  try { memory = JSON.parse(readFileSync(MEMORY_PATH, "utf8")); } catch { /* reset */ }
}
if (!Array.isArray(memory.runs)) memory.runs = [];

// Read manifest + profile
let manifest = { clips: [] };
let profile  = {};
let preset   = "default";
try { manifest = JSON.parse(readFileSync(MANIFEST_PATH, "utf8")); } catch { /* skip */ }
try { profile  = JSON.parse(readFileSync(PROFILE_PATH,  "utf8")); } catch { /* skip */ }
try { preset   = readFileSync(PRESET_PATH, "utf8").trim();          } catch { /* skip */ }

const clips = manifest.clips ?? [];
const clipLengths = clips.map((c) => c.durationSec);
const avgClipSec  = clipLengths.length > 0
  ? clipLengths.reduce((a, b) => a + b, 0) / clipLengths.length
  : 0;

const record = {
  timestamp:   new Date().toISOString(),
  preset,
  clipCount:   clips.length,
  avgClipSec:  parseFloat(avgClipSec.toFixed(2)),
  hookText:    profile?.hook?.text ?? null,
  hookEnabled: profile?.hook?.enabled ?? false,
  maxClipSec:  profile?.pacing?.maxClipSec ?? 7,
  selectionMode: profile?.selection?.mode ?? "all",
};

memory.runs.push(record);

// Keep last 50 runs
if (memory.runs.length > 50) memory.runs = memory.runs.slice(-50);

// Recompute summary from all runs
const allAvgLengths  = memory.runs.map((r) => r.avgClipSec).filter((n) => n > 0);
const hookTexts      = memory.runs.map((r) => r.hookText).filter(Boolean);
const presetCounts   = {};
for (const r of memory.runs) presetCounts[r.preset] = (presetCounts[r.preset] ?? 0) + 1;

memory.summary = {
  totalRuns:       memory.runs.length,
  preferredAvgClipSec: allAvgLengths.length > 0
    ? parseFloat((allAvgLengths.reduce((a, b) => a + b, 0) / allAvgLengths.length).toFixed(2))
    : null,
  lastHookText:    hookTexts.at(-1) ?? null,
  mostUsedPreset:  Object.entries(presetCounts).sort((a, b) => b[1] - a[1])[0]?.[0] ?? null,
};

writeFileSync(MEMORY_PATH, JSON.stringify(memory, null, 2));
console.log(`[memory] Recorded run #${memory.runs.length} — preset=${preset}, clips=${clips.length}, avgSec=${record.avgClipSec}`);
