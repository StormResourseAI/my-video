// @vitest-environment node
// Phase 3 static security boundaries: write-capable fs pinned to the write
// zone, child_process pinned to the render runner, a shell-free worker, and
// exact-pinned Remotion packages. Complements safety.test.tsx.
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

const scanFiles = (dir: string, out: string[] = []): string[] => {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) scanFiles(full, out);
    else if (/\.(ts|tsx|js|mjs|cjs)$/.test(entry)) out.push(full);
  }
  return out;
};
const read = (f: string) => readFileSync(f, "utf8");
const offendersIn = (files: string[], pattern: RegExp): string[] =>
  files.filter((f) => pattern.test(read(f)));

const STUDIO = process.cwd();
const REPO = join(STUDIO, "..");
const WORKER = join(REPO, "scripts", "studio-render-worker.mjs");

const WRITE_FS =
  /\b(?:fs|fsp|promises)\s*\.\s*(writeFile|appendFile|createWriteStream|mkdir|mkdtemp|rmdir|rm|rename|unlink|chmod|chown|truncate|cp|copyFile|link|symlink|watch|open|write|writev)\b/;
const NAMED_WRITE_IMPORT =
  /import\s*\{[^}]*\b(writeFile|writeFileSync|appendFile|appendFileSync|createWriteStream|mkdir|mkdirSync|rm|rmSync|rmdir|rename|renameSync|unlink|unlinkSync|copyFile|copyFileSync|chmod|chown|truncate|symlink|symlinkSync|link|linkSync|mkdtemp|mkdtempSync|watch|open|openSync|write|writeSync|writev)\b[^}]*\}\s*from\s*["'](?:node:)?fs/;

describe("phase 3 write-zone boundaries", () => {
  it("write-capable fs calls exist only in the write zone and render runner", () => {
    const serverFiles = [
      ...scanFiles(join(STUDIO, "server")),
      ...scanFiles(join(STUDIO, "app", "api")),
    ];
    const allowed = new Set(
      [
        join("server", "write", "dataRootPolicy.ts"),
        join("server", "write", "atomicJson.ts"),
        join("server", "write", "draftRepository.ts"),
        join("server", "write", "renderRepository.ts"),
        join("server", "render", "renderRunner.ts"),
      ].map((p) => join(STUDIO, p)),
    );
    const offenders = [
      ...offendersIn(serverFiles, WRITE_FS),
      ...offendersIn(serverFiles, NAMED_WRITE_IMPORT),
    ];
    const outside = offenders.filter((f) => !allowed.has(f));
    expect(outside).toEqual([]);
  });

  it("the read-only repository and path policy gained no write capability", () => {
    for (const file of ["pathPolicy.ts", "projectRepository.ts", "assetStream.ts", "http.ts"]) {
      const source = read(join(STUDIO, "server", file));
      expect(WRITE_FS.test(source), `${file} has write fs`).toBe(false);
      expect(NAMED_WRITE_IMPORT.test(source), `${file} imports write fs`).toBe(false);
    }
  });

  it("child_process exists only in renderRunner, which spawns shell-free with fixed inputs", () => {
    const all = [
      ...scanFiles(join(STUDIO, "server")),
      ...scanFiles(join(STUDIO, "app")),
      ...scanFiles(join(STUDIO, "lib")),
      ...scanFiles(join(STUDIO, "state")),
      ...scanFiles(join(STUDIO, "components")),
    ];
    const runner = join(STUDIO, "server", "render", "renderRunner.ts");
    const offenders = offendersIn(all, /child_process/).filter((f) => f !== runner);
    expect(offenders).toEqual([]);

    const source = read(runner);
    expect(source).toContain("shell: false");
    expect(source).toContain("process.execPath");
    expect(source).toContain('"studio-render-worker.mjs"');
    // No shell-string execution anywhere in studio runtime. (RegExp .exec()
    // calls are method calls on an object and don't match.)
    expect(
      offendersIn(all, /(?<![.\w])(exec|execSync|execFile|execFileSync|spawnSync)\s*\(/),
    ).toEqual([]);
    // No secret inheritance: the env is an explicit allowlist, not a spread.
    expect(source).not.toContain("...process.env");
  });

  it("no client or shared module reaches the write/render server zone", () => {
    const clientFiles = ["app", "components", "state", "lib", "fixtures"]
      .flatMap((d) => scanFiles(join(STUDIO, d)))
      .filter((f) => !f.includes(join("app", "api")));
    expect(
      offendersIn(clientFiles, /(?:from\s+|import\s+|import\()["'][^"']*server\/(write|render)/),
    ).toEqual([]);
  });

  it("no DELETE handler, no render-cancel route, and no log route exist", () => {
    const routes = scanFiles(join(STUDIO, "app", "api")).filter((f) => f.endsWith("route.ts"));
    expect(offendersIn(routes, /export\s+(?:async\s+)?function\s+DELETE\b/)).toEqual([]);
    expect(routes.some((r) => /render\.log|\/log\//.test(r))).toBe(false);
    expect(routes.some((r) => r.includes("cancel"))).toBe(false);
  });

  it("dev/start scripts pin the quoted writable data root; build does not require it", () => {
    const pkg = JSON.parse(read(join(STUDIO, "package.json"))) as {
      scripts: Record<string, string>;
    };
    for (const script of ["dev", "start"]) {
      expect(pkg.scripts[script]).toContain('MYVIDEO_STUDIO_DATA_ROOT="');
      expect(pkg.scripts[script]).toContain("Application Support/myvideo-studio");
    }
    expect(pkg.scripts.build).not.toContain("MYVIDEO_STUDIO_DATA_ROOT");
  });
});

describe("phase 3 render worker boundaries", () => {
  const source = read(WORKER);

  it("exists at the fixed path the runner spawns", () => {
    expect(existsSync(WORKER)).toBe(true);
  });

  it("takes only a validated renderId argument and no client-controlled paths", () => {
    expect(source).toContain("process.argv[2]");
    expect(source).toMatch(/UUID_RE\.test\(renderId\)/);
    // Roots come only from the allowlisted environment.
    expect(source).toContain("MYVIDEO_REPO_ROOT");
    expect(source).toContain("MYVIDEO_STUDIO_DATA_ROOT");
  });

  it("never shells out, never fetches, and never overwrites outputs", () => {
    expect(/child_process|execSync|spawn\s*\(/.test(source)).toBe(false);
    expect(/\bfetch\s*\(|require\(["']https?/.test(source)).toBe(false);
    expect(source).toContain("overwrite: false");
    expect(source).toMatch(/existsSync\(outputPath\)/);
  });

  it("refuses stale sources and verifies the queued props", () => {
    expect(source).toContain("computeSourceFingerprint");
    expect(source).toContain("source project changed");
    expect(source).toContain("queued props do not match");
  });

  it("renders only vertical-core as H.264", () => {
    expect(source).toContain('id: "vertical-core"');
    expect(source).toContain('codec: "h264"');
    expect(/@remotion\/(bundler|renderer)/.test(source)).toBe(true);
  });
});

describe("phase 3 dependency pins", () => {
  it("all Remotion packages remain exactly 4.0.445 in both package manifests", () => {
    for (const manifest of [join(REPO, "package.json"), join(STUDIO, "package.json")]) {
      const pkg = JSON.parse(read(manifest)) as {
        dependencies?: Record<string, string>;
        devDependencies?: Record<string, string>;
      };
      for (const [name, version] of Object.entries({
        ...pkg.dependencies,
        ...pkg.devDependencies,
      })) {
        if (name === "remotion" || name.startsWith("@remotion/")) {
          expect(version, `${manifest}: ${name}`).toBe("4.0.445");
        }
      }
    }
  });

  it("the root manifest declares the renderer/bundler used by the worker", () => {
    const pkg = JSON.parse(read(join(REPO, "package.json"))) as {
      dependencies: Record<string, string>;
    };
    expect(pkg.dependencies["@remotion/renderer"]).toBe("4.0.445");
    expect(pkg.dependencies["@remotion/bundler"]).toBe("4.0.445");
  });
});
