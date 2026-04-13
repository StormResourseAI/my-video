#!/usr/bin/env node
/**
 * Record client feedback for a rendered output.
 *
 * Usage:
 *   node scripts/feedback.mjs approve output/multi.mp4
 *   node scripts/feedback.mjs reject  output/multi.mp4 "too fast"
 *   node scripts/feedback.mjs prefer-hook "Watch till the end."
 *   node scripts/feedback.mjs prefer-pacing 5
 *   node scripts/feedback.mjs show
 *
 * Feedback is stored in data/client-feedback.json and influences
 * future scoring via build-manifest.mjs (+1 bias on approved clip lengths).
 */

import { existsSync, readFileSync, writeFileSync } from "fs";

const FEEDBACK_PATH = "data/client-feedback.json";

function load() {
  try { return JSON.parse(readFileSync(FEEDBACK_PATH, "utf8")); } catch {
    return { approved: [], rejected: [], preferredHook: null, preferredMaxClipSec: null, notes: [] };
  }
}
function save(fb) { writeFileSync(FEEDBACK_PATH, JSON.stringify(fb, null, 2)); }

const [,, cmd, ...rest] = process.argv;
const fb = load();

switch (cmd) {
  case "approve": {
    const output = rest[0];
    if (!output) { console.error("Usage: feedback.mjs approve <output-file>"); process.exit(1); }
    fb.approved.push({ output, recordedAt: new Date().toISOString() });
    save(fb);
    console.log(`[feedback] Approved: ${output}`);
    break;
  }
  case "reject": {
    const output = rest[0];
    const reason = rest[1] ?? "";
    if (!output) { console.error("Usage: feedback.mjs reject <output-file> [reason]"); process.exit(1); }
    fb.rejected.push({ output, reason, recordedAt: new Date().toISOString() });
    save(fb);
    console.log(`[feedback] Rejected: ${output}${reason ? ` (${reason})` : ""}`);
    break;
  }
  case "prefer-hook": {
    fb.preferredHook = rest[0] ?? null;
    save(fb);
    console.log(`[feedback] Preferred hook set: "${fb.preferredHook}"`);
    break;
  }
  case "prefer-pacing": {
    const val = parseFloat(rest[0]);
    if (!isFinite(val)) { console.error("Usage: feedback.mjs prefer-pacing <seconds>"); process.exit(1); }
    fb.preferredMaxClipSec = val;
    save(fb);
    console.log(`[feedback] Preferred max clip length: ${val}s`);
    break;
  }
  case "show": {
    console.log(JSON.stringify(fb, null, 2));
    break;
  }
  default:
    console.log("Commands: approve | reject | prefer-hook | prefer-pacing | show");
}
