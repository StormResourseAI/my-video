#!/usr/bin/env node

import { spawnSync, execFileSync } from "child_process";
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "fs";
import path from "path";

const FPS = 30;
const DEFAULT_MAX_CLIP_SEC = 4;
const DEFAULT_TITLE_FRAMES = 45;
const DEFAULT_TRANSITION_FRAMES = 8;
const VIDEO_EXTS = new Set([".mp4", ".mov", ".mkv", ".webm", ".m4v"]);

const project = process.argv[2] ?? "demo";
const repoRoot = process.cwd();
const selectsDir = path.resolve(repoRoot, "input", "selects", project);
const metadataPath = path.resolve(repoRoot, "input", "metadata", `${project}.json`);
const outputDir = path.resolve(repoRoot, "output", "vertical", project);
const outputPath = path.join(outputDir, "vertical-core.mp4");
const propsDir = path.resolve(repoRoot, ".cache", "render-props");
const propsPath = path.join(propsDir, `${project}.json`);
const runtimePublicDir = path.resolve(repoRoot, "public", "runtime-selects", project);

const ensureDir = (dir) => mkdirSync(dir, { recursive: true });

const readMetadata = () => {
  if (!existsSync(metadataPath)) {
    return {};
  }

  return JSON.parse(readFileSync(metadataPath, "utf8"));
};

const getDurationSec = (filePath) => {
  const raw = execFileSync(
    "ffprobe",
    [
      "-v",
      "quiet",
      "-print_format",
      "json",
      "-show_entries",
      "format=duration",
      filePath,
    ],
    {
      encoding: "utf8",
      timeout: 15_000,
    }
  );
  const durationSec = Number.parseFloat(JSON.parse(raw).format.duration);

  if (!Number.isFinite(durationSec) || durationSec <= 0) {
    throw new Error(`Invalid duration for ${filePath}`);
  }

  return durationSec;
};

ensureDir(selectsDir);
ensureDir(outputDir);
ensureDir(propsDir);
ensureDir(path.resolve(repoRoot, "public", "runtime-selects"));

const metadata = readMetadata();
const preferredOrder = Array.isArray(metadata.clipOrder) ? metadata.clipOrder : null;
const maxClipSec = typeof metadata.maxClipSec === "number"
  ? metadata.maxClipSec
  : DEFAULT_MAX_CLIP_SEC;
const titleFrames = typeof metadata.titleFrames === "number"
  ? metadata.titleFrames
  : DEFAULT_TITLE_FRAMES;
const transitionFrames = typeof metadata.transitionFrames === "number"
  ? metadata.transitionFrames
  : DEFAULT_TRANSITION_FRAMES;

const files = readdirSync(selectsDir)
  .filter((file) => VIDEO_EXTS.has(path.extname(file).toLowerCase()))
  .sort((left, right) => left.localeCompare(right, undefined, { numeric: true }));

const orderedFiles = preferredOrder
  ? preferredOrder.filter((file) => files.includes(file))
      .concat(files.filter((file) => !preferredOrder.includes(file)))
  : files;

if (orderedFiles.length === 0) {
  console.error(`[vertical] No video clips found in ${selectsDir}`);
  console.error(`[vertical] Add files to input/selects/${project}/ and rerun.`);
  process.exit(1);
}

rmSync(runtimePublicDir, { force: true, recursive: true });
ensureDir(runtimePublicDir);

const clips = orderedFiles.map((file) => {
  const absolutePath = path.join(selectsDir, file);
  const durationSec = getDurationSec(absolutePath);
  const renderDurationSec = Math.min(durationSec, maxClipSec);
  const durationInFrames = Math.max(1, Math.round(renderDurationSec * FPS));
  const stagedPath = path.join(runtimePublicDir, file);

  copyFileSync(absolutePath, stagedPath);

  return {
    file,
    src: `runtime-selects/${project}/${file}`,
    durationInFrames,
    trimBefore: 0,
    trimAfter: durationInFrames,
  };
});

const props = {
  backgroundColor: metadata.backgroundColor ?? "#111111",
  clips,
  title: metadata.title ?? null,
  titleFrames,
  transitionFrames,
};

writeFileSync(propsPath, JSON.stringify(props, null, 2));

console.log(`[vertical] Project: ${project}`);
console.log(`[vertical] Selects: ${orderedFiles.length} clip(s) from input/selects/${project}/`);
console.log(`[vertical] Output: ${path.relative(repoRoot, outputPath)}`);

const render = spawnSync(
  "npx",
  [
    "remotion",
    "render",
    "vertical-core",
    outputPath,
    `--props=${propsPath}`,
  ],
  {
    cwd: repoRoot,
    stdio: "inherit",
    shell: false,
  }
);

if (render.status !== 0) {
  process.exit(render.status ?? 1);
}
