#!/usr/bin/env node
/**
 * Scan transcripts for keywords, match to input/broll/ filenames,
 * write keyword-triggered broll matches to data/broll.json.
 *
 * Usage:
 *   npm run broll:match
 *   node scripts/build-broll-manifest.mjs
 *
 * Output: data/broll.json (matches[] appended to existing structure)
 *
 * Convention:
 *   input/broll/ocean.mp4  matches keyword "ocean" in any transcript
 *   input/broll/fire.mp4   matches keyword "fire"
 */

import { readdirSync, existsSync, readFileSync, writeFileSync, mkdirSync } from "fs";
import { extname, basename } from "path";

const BROLL_DIR      = "input/broll";
const TRANSCRIPTS_DIR = "data/transcripts";
const OUT_PATH       = "data/broll.json";
const VIDEO_EXTS     = new Set([".mp4", ".mov", ".mkv", ".webm"]);
const DISPLAY_SEC    = 2.0; // how long to show each broll overlay

// Words to skip even if >= 5 chars
const STOP_WORDS = new Set([
  "about","after","again","also","always","another","anything","around",
  "because","before","being","between","could","every","getting","going",
  "gonna","having","here","i'm","i've","just","know","like","little",
  "maybe","might","never","other","really","right","should","since",
  "still","there","these","thing","think","those","through","trying",
  "under","until","using","watch","when","where","which","while",
  "would","your","you're","you've","that's","it's","don't","can't","won't",
]);

if (!existsSync(BROLL_DIR)) {
  console.log(`[broll] No broll directory found at ${BROLL_DIR} — writing empty matches`);
  mkdirSync("data", { recursive: true });
  writeFileSync(OUT_PATH, JSON.stringify({ fps: 30, clips: [], matches: [] }, null, 2));
  process.exit(0);
}

// Index broll files by lowercase stem (filename without extension)
const brollFiles = readdirSync(BROLL_DIR)
  .filter((f) => VIDEO_EXTS.has(extname(f).toLowerCase()));

if (brollFiles.length === 0) {
  console.log(`[broll] No video files in ${BROLL_DIR} — writing empty matches`);
  mkdirSync("data", { recursive: true });
  writeFileSync(OUT_PATH, JSON.stringify({ fps: 30, clips: [], matches: [] }, null, 2));
  process.exit(0);
}

const brollIndex = new Map(); // stem → filename
for (const f of brollFiles) {
  const stem = basename(f, extname(f)).toLowerCase().replace(/[_-]/g, " ");
  for (const word of stem.split(/\s+/)) {
    if (word.length >= 4) brollIndex.set(word, f);
  }
}
console.log(`[broll] Indexed ${brollFiles.length} broll file(s): ${[...brollIndex.keys()].join(", ")}`);

// Scan transcripts
const matches = [];
if (!existsSync(TRANSCRIPTS_DIR)) {
  console.log(`[broll] No transcripts directory — skipping keyword scan`);
} else {
  const transcriptFiles = readdirSync(TRANSCRIPTS_DIR).filter((f) => f.endsWith(".json"));

  for (const tf of transcriptFiles) {
    const clipFile = tf; // transcript file = clip file + ".json", but stored as "<clipfile>.json"
    let transcript;
    try {
      transcript = JSON.parse(readFileSync(`${TRANSCRIPTS_DIR}/${tf}`, "utf8"));
    } catch { continue; }

    const cues = transcript?.captions ?? [];
    for (const cue of cues) {
      const words = cue.text.toLowerCase().replace(/[^a-z\s]/g, "").split(/\s+/);
      for (const word of words) {
        if (word.length < 4 || STOP_WORDS.has(word)) continue;
        if (brollIndex.has(word)) {
          const brollFile = brollIndex.get(word);
          // Avoid duplicate matches for same clip+broll combo
          const isDup = matches.some(
            (m) => m.clipFile === tf && m.brollFile === brollFile
          );
          if (!isDup) {
            matches.push({
              clipFile:   tf,   // transcript filename = clip filename + ".json" prefix
              keyword:    word,
              brollFile,
              sourceSec:  parseFloat(cue.start.toFixed(3)),
              displaySec: DISPLAY_SEC,
            });
            console.log(`[broll] match: "${word}" in ${tf} → ${brollFile} @ ${cue.start.toFixed(1)}s`);
          }
          break; // one match per cue
        }
      }
    }
  }
}

mkdirSync("data", { recursive: true });
writeFileSync(OUT_PATH, JSON.stringify({ fps: 30, clips: [], matches }, null, 2));
console.log(`[broll] Done — ${matches.length} match(es) → ${OUT_PATH}`);
