#!/usr/bin/env node
/**
 * Copy a named profile preset to data/style-profile.json.
 *
 * Usage:
 *   npm run preset -- default
 *   npm run preset -- client-a
 *   PROFILE_PRESET=client-b npm run preset
 *
 * Falls back to "default" if the named preset file is not found.
 */

import { copyFileSync, existsSync, readdirSync, writeFileSync } from "fs";
import { extname, basename } from "path";

const PROFILES_DIR = "data/profiles";
const TARGET = "data/style-profile.json";

// Preset name: CLI arg > env var > "default"
const name = process.argv[2] ?? process.env.PROFILE_PRESET ?? "default";
const requested = `${PROFILES_DIR}/${name}.json`;

let src = requested;
if (!existsSync(src)) {
  console.warn(`[preset] WARNING: preset "${name}" not found at ${src}`);
  const fallback = `${PROFILES_DIR}/default.json`;
  if (!existsSync(fallback)) {
    console.error(`[preset] ERROR: fallback default.json also missing — aborting`);
    process.exit(1);
  }
  console.warn(`[preset] Falling back to "default"`);
  src = fallback;
}

copyFileSync(src, TARGET);
const activeName = basename(src, ".json");
writeFileSync("data/.active-preset", activeName, "utf8");
console.log(`[preset] Active preset: ${activeName} → ${TARGET}`);

// List available presets for convenience
const available = existsSync(PROFILES_DIR)
  ? readdirSync(PROFILES_DIR)
      .filter((f) => extname(f) === ".json")
      .map((f) => basename(f, ".json"))
  : [];
console.log(`[preset] Available: ${available.join(", ")}`);
