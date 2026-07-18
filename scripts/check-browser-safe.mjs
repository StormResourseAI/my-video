#!/usr/bin/env node
// Static guard: the Studio imports src/VerticalCoreComposition.tsx into a
// browser bundle. Walk its relative-import graph and fail on anything that
// could drag Node-only or engine-global code into the browser.

import { readFileSync, existsSync } from "fs";
import path from "path";
import { fileURLToPath } from "url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const ENTRY = path.join(repoRoot, "src", "VerticalCoreComposition.tsx");

const FORBIDDEN_SPECIFIERS =
  /^(node:.*|fs|fs\/promises|path|child_process|os|net|http|https|http2|tls|dns|dgram|worker_threads|@remotion\/(renderer|bundler|cli)|server-only)$/;
const FORBIDDEN_SOURCE = /\bprocess\.env\b|\brequire\s*\(/;
const IMPORT_RE = /(?:from\s+|import\s+|import\s*\(\s*|require\s*\(\s*)["']([^"']+)["']/g;

const seen = new Set();
const errors = [];

const resolveRelative = (fromFile, spec) => {
  const base = path.resolve(path.dirname(fromFile), spec);
  for (const candidate of [base, `${base}.ts`, `${base}.tsx`, path.join(base, "index.ts"), path.join(base, "index.tsx")]) {
    if (existsSync(candidate) && !candidate.endsWith(path.sep)) return candidate;
  }
  return null;
};

const visit = (file) => {
  if (seen.has(file)) return;
  seen.add(file);
  const source = readFileSync(file, "utf8");
  const rel = path.relative(repoRoot, file);

  if (FORBIDDEN_SOURCE.test(source)) {
    errors.push(`${rel}: contains process.env or require()`);
  }
  for (const match of source.matchAll(IMPORT_RE)) {
    const spec = match[1];
    if (FORBIDDEN_SPECIFIERS.test(spec)) {
      errors.push(`${rel}: forbidden import "${spec}"`);
    } else if (spec.endsWith(".json")) {
      errors.push(`${rel}: JSON singleton import "${spec}"`);
    } else if (/(^|\/)Root$/.test(spec)) {
      errors.push(`${rel}: must not import Root ("${spec}")`);
    } else if (spec.startsWith(".")) {
      const resolved = resolveRelative(file, spec);
      if (resolved) visit(resolved);
      else if (!/\.(css|svg|png)$/.test(spec)) errors.push(`${rel}: unresolvable import "${spec}"`);
    }
  }
};

visit(ENTRY);

if (errors.length > 0) {
  console.error("[check-browser-safe] FAIL");
  for (const e of errors) console.error(`  - ${e}`);
  process.exit(1);
}
console.log(`[check-browser-safe] OK — ${seen.size} module(s) verified browser-safe from src/VerticalCoreComposition.tsx`);
