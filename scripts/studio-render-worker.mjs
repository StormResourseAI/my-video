#!/usr/bin/env node
// myvideo_ Studio constrained render worker (Phase 3).
//
// Invoked ONLY by the Studio render queue as:
//   node scripts/studio-render-worker.mjs <renderId>
// with an allowlisted environment (MYVIDEO_REPO_ROOT, MYVIDEO_STUDIO_DATA_ROOT).
//
// Contract: reads the server-generated job under the writable data root,
// re-validates the saved draft, recomputes the source fingerprint (refusing
// stale sources), maps assets back to staged runtime-selects media, builds
// engine props internally, bundles only vertical-core, renders H.264 MP4 to
// the server-generated output path (never overwriting), and updates job
// status atomically. It never modifies any source-project file.

import { createHash, randomUUID } from "node:crypto";
import fs from "node:fs";
import fsp from "node:fs/promises";
import path from "node:path";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const SLUG_RE = /^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/;
const COLOR_RE = /^#[0-9a-fA-F]{3,8}$/;
const MAX_FRAMES = 108_000;

const sha256 = (data) => createHash("sha256").update(data).digest("hex");

function fail(message) {
  const err = new Error(message);
  err.controlled = true;
  throw err;
}

function isPlainName(name) {
  return (
    typeof name === "string" &&
    name.length >= 1 &&
    name.length <= 200 &&
    !name.includes("/") &&
    !name.includes("\\") &&
    !name.includes("\0") &&
    name === path.basename(name) &&
    name !== "." &&
    name !== ".."
  );
}

async function realpathOrNull(p) {
  try {
    return await fsp.realpath(p);
  } catch {
    return null;
  }
}

async function resolveUnder(root, ...segments) {
  if (root === null) return null;
  for (const segment of segments) {
    if (!isPlainName(segment) && !SLUG_RE.test(segment)) return null;
  }
  const resolved = await realpathOrNull(path.join(root, ...segments));
  if (resolved === null || !resolved.startsWith(root + path.sep)) return null;
  return resolved;
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

async function writeJsonAtomic(destDir, fileName, value) {
  const tmpPath = path.join(destDir, `.${fileName}.${randomUUID()}.tmp`);
  fs.writeFileSync(tmpPath, JSON.stringify(value, null, 2) + "\n", { mode: 0o600, flag: "wx" });
  fs.renameSync(tmpPath, path.join(destDir, fileName));
}

// Mirrors studio/server/write/sourceFingerprint.ts byte-for-byte.
async function computeSourceFingerprint(repoRoot, projectId) {
  const propsRoot = await realpathOrNull(path.join(repoRoot, ".cache", "render-props"));
  const mediaRoot = await realpathOrNull(path.join(repoRoot, "public", "runtime-selects"));
  const metadataRoot = await realpathOrNull(path.join(repoRoot, "input", "metadata"));
  const propsPath = await resolveUnder(propsRoot, `${projectId}.json`);
  if (propsPath === null) return null;
  let propsRaw;
  let propsStat;
  try {
    propsRaw = await fsp.readFile(propsPath);
    const st = await fsp.stat(propsPath);
    propsStat = { size: st.size, mtimeMs: st.mtimeMs };
  } catch {
    return null;
  }
  let parsed;
  try {
    parsed = JSON.parse(propsRaw.toString("utf8"));
  } catch {
    return null;
  }
  if (parsed === null || typeof parsed !== "object" || !Array.isArray(parsed.clips)) return null;
  const assets = [];
  for (const clip of parsed.clips) {
    const file = clip?.file;
    if (!isPlainName(file)) return null;
    const mediaPath = await resolveUnder(mediaRoot, projectId, file);
    if (mediaPath === null) {
      assets.push([file, "missing"]);
      continue;
    }
    try {
      const st = await fsp.stat(mediaPath);
      assets.push([file, st.size]);
    } catch {
      assets.push([file, "missing"]);
    }
  }
  let metadataHash = "absent";
  const metadataPath = await resolveUnder(metadataRoot, `${projectId}.json`);
  if (metadataPath !== null) {
    try {
      metadataHash = sha256(await fsp.readFile(metadataPath));
    } catch {
      metadataHash = "absent";
    }
  }
  return sha256(
    JSON.stringify({
      projectId,
      propsHash: sha256(propsRaw),
      propsSize: propsStat.size,
      propsMtimeMs: propsStat.mtimeMs,
      assets,
      metadataHash,
    }),
  );
}

// Mirrors studio/lib/draftDocument.ts deriveEngineProps.
function deriveEngineProps(draft, sourceProps, srcFor) {
  const bySourceFile = new Map(sourceProps.clips.map((c) => [c.file, c]));
  const clips = [];
  for (const clip of draft.clips) {
    if (!clip.enabled) continue;
    const base = bySourceFile.get(clip.fileName);
    if (base === undefined || base.durationInFrames !== clip.sourceDurationInFrames) return null;
    const durationInFrames = clip.sourceDurationInFrames - clip.trimBefore - clip.trimAfter;
    if (durationInFrames < 1) return null;
    const trimBefore = (base.trimBefore ?? 0) + clip.trimBefore;
    clips.push({
      file: clip.fileName,
      src: srcFor(clip),
      durationInFrames,
      trimBefore,
      trimAfter: trimBefore + durationInFrames,
    });
  }
  if (clips.length === 0) return null;
  const props = {
    backgroundColor: draft.backgroundColor,
    clips,
    title: draft.draftTitle,
    titleFrames: sourceProps.titleFrames,
    transitionFrames: draft.transitionFrames,
  };
  const total = clips.reduce((sum, c) => sum + c.durationInFrames, 0);
  const overlaps = Math.max(0, clips.length - 1) * props.transitionFrames;
  const durationInFrames = Math.max(total - overlaps, 1);
  if (durationInFrames > MAX_FRAMES) return null;
  return { props, durationInFrames };
}

function sanitizeMessage(message, secrets) {
  let out = String(message ?? "render failed");
  for (const secret of secrets) {
    if (typeof secret === "string" && secret.length > 0) out = out.split(secret).join("…");
  }
  return out.slice(0, 400);
}

async function main() {
  const renderId = process.argv[2];
  if (typeof renderId !== "string" || !UUID_RE.test(renderId)) {
    throw new Error("invalid renderId argument");
  }
  const repoRoot = process.env.MYVIDEO_REPO_ROOT;
  const dataRoot = process.env.MYVIDEO_STUDIO_DATA_ROOT;
  if (!repoRoot || !path.isAbsolute(repoRoot)) throw new Error("missing repo root");
  if (!dataRoot || !path.isAbsolute(dataRoot)) throw new Error("missing data root");
  const pkg = readJson(path.join(repoRoot, "package.json"));
  if (pkg.name !== "my-video") throw new Error("repo root sentinel failed");

  const renderDir = path.join(dataRoot, "renders", renderId);
  const jobPath = path.join(renderDir, "job.json");
  const job = readJson(jobPath);
  if (job.renderId !== renderId || job.status !== "queued") {
    throw new Error("job is not queued");
  }
  let currentJob = job;
  const updateJob = async (patch) => {
    currentJob = { ...currentJob, ...patch };
    await writeJsonAtomic(renderDir, "job.json", currentJob);
  };

  await updateJob({ status: "running", startedAt: new Date().toISOString() });
  const secrets = [dataRoot, repoRoot, process.env.HOME ?? ""];

  try {
    if (!UUID_RE.test(job.draftId) || !SLUG_RE.test(job.sourceProjectId)) {
      fail("job identity is invalid");
    }
    // 1. Reload and sanity-check the saved draft.
    const draft = readJson(path.join(dataRoot, "drafts", job.draftId, "draft.json"));
    if (draft.draftId !== job.draftId) fail("draft mismatch");
    if (draft.version !== job.draftVersion) fail("draft version changed after enqueue");
    if (draft.sourceProjectId !== job.sourceProjectId) fail("draft source mismatch");
    if (!SLUG_RE.test(draft.sourceProjectId)) fail("invalid source project");
    if (!COLOR_RE.test(draft.backgroundColor)) fail("invalid background color");
    if (!Number.isSafeInteger(draft.transitionFrames) || draft.transitionFrames < 0) {
      fail("invalid transition frames");
    }
    if (!Array.isArray(draft.clips) || draft.clips.length < 1 || draft.clips.length > 100) {
      fail("invalid draft clips");
    }
    for (const clip of draft.clips) {
      if (!isPlainName(clip.fileName)) fail("invalid clip file name");
      for (const key of ["sourceDurationInFrames", "trimBefore", "trimAfter"]) {
        if (!Number.isSafeInteger(clip[key]) || clip[key] < 0 || clip[key] > MAX_FRAMES) {
          fail("invalid clip trim values");
        }
      }
    }

    // 2. Refuse stale sources.
    const fingerprint = await computeSourceFingerprint(repoRoot, draft.sourceProjectId);
    if (fingerprint === null || fingerprint !== draft.sourceFingerprint) {
      fail("source project changed since the draft was created");
    }

    // 3. Rebuild engine props from the source cache; verify against the
    //    queue-written props.json (defense in depth).
    const sourceProps = readJson(
      path.join(repoRoot, ".cache", "render-props", `${draft.sourceProjectId}.json`),
    );
    const derivation = deriveEngineProps(
      draft,
      sourceProps,
      (clip) => `runtime-selects/${draft.sourceProjectId}/${clip.fileName}`,
    );
    if (derivation === null) fail("draft is not renderable");
    if (derivation.durationInFrames !== job.durationInFrames) {
      fail("derived duration does not match the queued job");
    }
    const queuedProps = readJson(path.join(renderDir, "props.json"));
    if (JSON.stringify(queuedProps) !== JSON.stringify(derivation.props)) {
      fail("queued props do not match the draft derivation");
    }

    // 4. Every referenced asset must be staged media inside the repo.
    const mediaRoot = await realpathOrNull(path.join(repoRoot, "public", "runtime-selects"));
    for (const clip of derivation.props.clips) {
      const staged = await resolveUnder(mediaRoot, draft.sourceProjectId, clip.file);
      if (staged === null) fail(`staged media missing for ${clip.file}`);
    }

    // 5. Never overwrite an existing output.
    const outputPath = path.join(renderDir, "output.mp4");
    if (fs.existsSync(outputPath)) fail("render output already exists");

    // 6. Bundle only the engine entry and render vertical-core as H.264.
    const [{ bundle }, { renderMedia, selectComposition }, { enableTailwind }] =
      await Promise.all([
        import("@remotion/bundler"),
        import("@remotion/renderer"),
        import("@remotion/tailwind-v4"),
      ]);
    console.log(`[worker] bundling engine for render ${renderId}`);
    const serveUrl = await bundle({
      entryPoint: path.join(repoRoot, "src", "index.ts"),
      webpackOverride: enableTailwind,
    });
    const composition = await selectComposition({
      serveUrl,
      id: "vertical-core",
      inputProps: derivation.props,
    });
    if (composition.durationInFrames !== derivation.durationInFrames) {
      fail("engine metadata disagrees with the validated draft duration");
    }
    console.log(
      `[worker] rendering ${composition.durationInFrames} frames at ${composition.width}x${composition.height}`,
    );
    await renderMedia({
      composition,
      serveUrl,
      codec: "h264",
      outputLocation: outputPath,
      inputProps: derivation.props,
      overwrite: false,
    });

    const st = fs.statSync(outputPath);
    if (!st.isFile() || st.size < 1) fail("render produced no output");
    await updateJob({
      status: "succeeded",
      finishedAt: new Date().toISOString(),
      exitCode: 0,
      error: null,
      outputBytes: st.size,
    });
    console.log(`[worker] render ${renderId} succeeded (${st.size} bytes)`);
  } catch (err) {
    const message = sanitizeMessage(err?.message, secrets);
    await updateJob({
      status: "failed",
      finishedAt: new Date().toISOString(),
      exitCode: 1,
      error: message,
      outputBytes: null,
    });
    console.error(`[worker] render ${renderId} failed: ${message}`);
    process.exitCode = 1;
  }
}

main().catch((err) => {
  console.error(`[worker] fatal: ${String(err?.message ?? err)}`);
  process.exitCode = 1;
});
