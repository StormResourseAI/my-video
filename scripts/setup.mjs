#!/usr/bin/env node
/**
 * Validate and create required directories, check runtime dependencies.
 *
 * Usage:
 *   npm run setup
 *   node scripts/setup.mjs
 */

import { execSync } from "child_process";
import { mkdirSync } from "fs";

const DIRS = ["input", "output", "data"];

let allGood = true;

function check(label, fn) {
  try {
    fn();
    console.log(`  [ok] ${label}`);
  } catch {
    console.error(`  [!!] ${label}`);
    allGood = false;
  }
}

function warn(label, fn) {
  try {
    fn();
    console.log(`  [ok] ${label}`);
  } catch {
    console.warn(`  [--] ${label} (optional — install when needed)`);
  }
}

console.log("\nDirectories:");
for (const dir of DIRS) {
  mkdirSync(dir, { recursive: true });
  console.log(`  [ok] ${dir}/`);
}

console.log("\nRequired dependencies:");
check("node", () => execSync("node --version", { stdio: "pipe" }));
check("python3", () => execSync("python3 --version", { stdio: "pipe" }));
check("ffmpeg  (brew install ffmpeg)", () =>
  execSync("ffmpeg -version", { stdio: "pipe" })
);

console.log("\nOptional Python dependencies:");
warn("openai-whisper  (pip3 install openai-whisper)", () =>
  execSync('python3 -c "import whisper"', { stdio: "pipe" })
);
warn("librosa + soundfile  (pip3 install librosa soundfile)", () =>
  execSync('python3 -c "import librosa"', { stdio: "pipe" })
);

console.log();
if (allGood) {
  console.log("Setup complete. Ready to run.");
} else {
  console.error("Setup incomplete. Fix required dependencies above.");
  process.exit(1);
}
