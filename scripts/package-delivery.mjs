#!/usr/bin/env node
/**
 * Package rendered outputs into a timestamped delivery folder.
 *
 * Usage:
 *   npm run deliver                  # packages current output/
 *   npm run deliver -- --client acme # tags delivery with client name
 *
 * Output:
 *   deliveries/YYYY-MM-DD-HHmm[-client]/
 *     multi-<preset>.mp4
 *     multi-a-<preset>.mp4   (if exists)
 *     multi-b-<preset>.mp4   (if exists)
 *     multi-c-<preset>.mp4   (if exists)
 *     delivery.md
 */

import {
  existsSync, mkdirSync, copyFileSync, readdirSync, readFileSync, writeFileSync,
} from "fs";
import { basename } from "path";

// ── Parse args ──────────────────────────────────────────────────────────────
const args = process.argv.slice(2);
const clientIdx = args.indexOf("--client");
const clientTag = clientIdx !== -1 ? args[clientIdx + 1] : null;

// ── Resolve preset name ──────────────────────────────────────────────────────
let presetName = "default";
try {
  presetName = readFileSync("data/.active-preset", "utf8").trim();
} catch { /* no marker file — use default */ }

// ── Build delivery folder name ───────────────────────────────────────────────
const now = new Date();
const pad = (n) => String(n).padStart(2, "0");
const stamp = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}-${pad(now.getHours())}${pad(now.getMinutes())}`;
const folderName = clientTag ? `${stamp}-${clientTag}` : stamp;
const deliveryDir = `deliveries/${folderName}`;

mkdirSync(deliveryDir, { recursive: true });

// ── Files to package ─────────────────────────────────────────────────────────
const OUTPUT_MAP = [
  { src: "output/multi.mp4",   dest: `multi-${presetName}.mp4` },
  { src: "output/multi-a.mp4", dest: `multi-a-${presetName}.mp4` },
  { src: "output/multi-b.mp4", dest: `multi-b-${presetName}.mp4` },
  { src: "output/multi-c.mp4", dest: `multi-c-${presetName}.mp4` },
  { src: "output/video.mp4",   dest: `single-${presetName}.mp4` },
];

const copied = [];
for (const { src, dest } of OUTPUT_MAP) {
  if (!existsSync(src)) continue;
  const destPath = `${deliveryDir}/${dest}`;
  copyFileSync(src, destPath);
  copied.push(dest);
  console.log(`[deliver] ${dest}`);
}

if (copied.length === 0) {
  console.error("[deliver] No output files found in output/ — run render:multi first");
  process.exit(1);
}

// ── Write delivery note ───────────────────────────────────────────────────────
const deliveryNote = `# Delivery — ${stamp}

**Preset:** ${presetName}
**Client:** ${clientTag ?? "—"}
**Packaged:** ${now.toISOString()}

## Files

${copied.map((f) => `- \`${f}\``).join("\n")}

## Reproduction

\`\`\`bash
npm run preset -- ${presetName}
npm run manifest
npm run render:multi
npm run render:variants
npm run deliver${clientTag ? ` -- --client ${clientTag}` : ""}
\`\`\`
`;

writeFileSync(`${deliveryDir}/delivery.md`, deliveryNote, "utf8");
console.log(`[deliver] delivery.md`);
console.log(`[deliver] → ${deliveryDir}/ (${copied.length} file(s))`);
