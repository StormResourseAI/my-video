// Temp-dir engine-repo fixture for server-boundary tests. CI has no real
// projects or media, so every repository/API test builds its own tree here.
import { mkdirSync, mkdtempSync, rmSync, symlinkSync, utimesSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

export interface FixtureProject {
  slug: string;
  /** Clip fileName → staged byte length (null = referenced but not staged). */
  clips: Record<string, number | null>;
  metadata?: Record<string, unknown> | null;
  /** Override the props-cache JSON entirely; undefined = derive from clips;
   *  null = no props cache at all. */
  rawProps?: unknown | null;
  transitionFrames?: number;
  durationInFrames?: number;
}

export interface FixtureRepo {
  root: string;
  mediaDir: (slug: string) => string;
  propsPath: (slug: string) => string;
  selectsDir: (slug: string) => string;
  touch: (filePath: string, epochSec: number) => void;
  cleanup: () => void;
}

export function makeFixtureRepo(projects: FixtureProject[]): FixtureRepo {
  const root = mkdtempSync(path.join(tmpdir(), "myvideo-fixture-"));
  writeFileSync(path.join(root, "package.json"), JSON.stringify({ name: "my-video" }));
  for (const dir of [
    "input/selects",
    "input/metadata",
    ".cache/render-props",
    "public/runtime-selects",
  ]) {
    mkdirSync(path.join(root, dir), { recursive: true });
  }

  for (const p of projects) {
    mkdirSync(path.join(root, "input", "selects", p.slug), { recursive: true });
    if (p.metadata != null) {
      writeFileSync(
        path.join(root, "input", "metadata", `${p.slug}.json`),
        JSON.stringify(p.metadata),
      );
    }
    const stagedDir = path.join(root, "public", "runtime-selects", p.slug);
    mkdirSync(stagedDir, { recursive: true });
    for (const [file, size] of Object.entries(p.clips)) {
      // Source file in selects (drives freshness comparisons)…
      writeFileSync(path.join(root, "input", "selects", p.slug, file), "src");
      // …and the staged copy actually served, unless deliberately missing.
      if (size !== null) {
        writeFileSync(path.join(stagedDir, file), Buffer.alloc(size, 7));
      }
    }
    if (p.rawProps !== null) {
      const props =
        p.rawProps ?? {
          backgroundColor: "#111111",
          clips: Object.keys(p.clips).map((file) => ({
            file,
            src: `runtime-selects/${p.slug}/${file}`,
            durationInFrames: p.durationInFrames ?? 90,
            trimBefore: 0,
            trimAfter: p.durationInFrames ?? 90,
          })),
          title: "Fixture",
          titleFrames: 45,
          transitionFrames: p.transitionFrames ?? 8,
        };
      writeFileSync(
        path.join(root, ".cache", "render-props", `${p.slug}.json`),
        JSON.stringify(props),
      );
    }
  }

  return {
    root,
    mediaDir: (slug) => path.join(root, "public", "runtime-selects", slug),
    propsPath: (slug) => path.join(root, ".cache", "render-props", `${slug}.json`),
    selectsDir: (slug) => path.join(root, "input", "selects", slug),
    touch: (filePath, epochSec) => utimesSync(filePath, epochSec, epochSec),
    cleanup: () => rmSync(root, { recursive: true, force: true }),
  };
}

export function addSymlink(target: string, linkPath: string): void {
  symlinkSync(target, linkPath);
}
