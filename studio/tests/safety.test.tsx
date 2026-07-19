import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import StudioShell from "@/components/StudioShell";
import { resetStore } from "./helpers";

beforeEach(resetStore);

// ---------------------------------------------------------------------------
// Source-scan plumbing

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

// Client-zone runtime dirs (browser bundle). app/api is the server zone.
const CLIENT_FILES = () =>
  ["app", "components", "state", "lib", "fixtures"]
    .flatMap((d) => scanFiles(join(process.cwd(), d)))
    .filter((f) => !f.includes(`${join("app", "api")}`));

const SERVER_FILES = () => [
  ...scanFiles(join(process.cwd(), "server")),
  ...scanFiles(join(process.cwd(), "app", "api")),
];

// Phase 3 write/render zones: the ONLY server modules allowed write-capable
// fs APIs; renderRunner.ts is additionally the only child-process site.
// Their dedicated boundary tests live in phase3Boundaries.test.ts.
const WRITE_ZONE = [join("server", "write"), join("server", "render")];
const READ_ONLY_SERVER_FILES = () =>
  SERVER_FILES().filter((f) => !WRITE_ZONE.some((z) => f.includes(z)));

const NODE_IMPORT =
  /(?:from\s+|require\(|import\(|import\s+)["'](?:node:)?(fs|fs\/promises|path|child_process|net|http|https|http2|tls|dns|dgram|os|worker_threads)["']/;

describe("phase 2 static boundaries", () => {
  it("client runtime source imports no Node modules and never reaches the server zone", () => {
    const files = CLIENT_FILES();
    expect(offendersIn(files, NODE_IMPORT)).toEqual([]);
    expect(
      offendersIn(
        files,
        /(?:from\s+|import\s+|import\()["'](?:@\/server|\.\.\/server|\.\.\/\.\.\/server|@\/app\/api|\.\.\/app\/api)/,
      ),
    ).toEqual([]);
    expect(offendersIn(files, /\bprocess\.env\b/)).toEqual([]);
  });

  it("dev/start scripts stay loopback-bound and repo-anchored", () => {
    const pkg = JSON.parse(read(join(process.cwd(), "package.json"))) as {
      scripts: Record<string, string>;
    };
    for (const script of ["dev", "start"]) {
      expect(pkg.scripts[script]).toContain("-H 127.0.0.1");
      expect(pkg.scripts[script]).toContain("MYVIDEO_REPO_ROOT");
    }
  });

  it("every server-zone module under server/ declares import \"server-only\"", () => {
    const bare = scanFiles(join(process.cwd(), "server"));
    const missing = bare.filter((f) => !read(f).includes(`import "server-only"`));
    expect(missing).toEqual([]);
  });

  it("no write-capable filesystem method exists outside the Phase 3 write zone", () => {
    const WRITE_FS =
      /\b(?:fs|fsp|promises)\s*\.\s*(writeFile|appendFile|createWriteStream|mkdir|mkdtemp|rmdir|rm|rename|unlink|chmod|chown|truncate|cp|copyFile|link|symlink|watch|open|write|writev)\b/;
    // Also catch named write imports from node:fs (incl. fs/promises).
    const NAMED_WRITE_IMPORT =
      /import\s*\{[^}]*\b(writeFile|writeFileSync|appendFile|appendFileSync|createWriteStream|mkdir|mkdirSync|rm|rmSync|rmdir|rename|renameSync|unlink|unlinkSync|copyFile|copyFileSync|chmod|chown|truncate|symlink|symlinkSync|link|linkSync|mkdtemp|mkdtempSync|watch|open|openSync|write|writeSync|writev)\b[^}]*\}\s*from\s*["'](?:node:)?fs/;
    // fs.open / open() with a write/append mode flag.
    const OPEN_WRITE_MODE = /\bopen(?:Sync)?\s*\([^)]*["'][wa]/;
    expect(offendersIn(READ_ONLY_SERVER_FILES(), WRITE_FS)).toEqual([]);
    expect(offendersIn(READ_ONLY_SERVER_FILES(), NAMED_WRITE_IMPORT)).toEqual([]);
    expect(offendersIn(READ_ONLY_SERVER_FILES(), OPEN_WRITE_MODE)).toEqual([]);
  });

  it("no child-process, renderer, bundler, or CLI capability exists outside the render runner", () => {
    const ALL = [...CLIENT_FILES(), ...SERVER_FILES()].filter(
      (f) => !f.endsWith(join("server", "render", "renderRunner.ts")),
    );
    const FORBIDDEN =
      /child_process|@remotion\/(renderer|bundler|cli)|\brenderMedia\b|\bspawn(Sync)?\s*\(|\bexecFile(Sync)?\s*\(|\bfork\s*\(/;
    expect(offendersIn(ALL, FORBIDDEN)).toEqual([]);
  });

  it("fetch appears only in the designated API client module", () => {
    const files = CLIENT_FILES().filter((f) => !f.endsWith(join("lib", "projectClient.ts")));
    const EGRESS = /\bfetch\s*\(|new\s+(WebSocket|XMLHttpRequest|EventSource)\b/;
    expect(offendersIn(files, EGRESS)).toEqual([]);
    // Server zone must not originate network egress either.
    expect(offendersIn(SERVER_FILES(), EGRESS)).toEqual([]);
  });

  it("route handlers export only their documented methods and stay dynamic", () => {
    // Phase 3 write routes are individually allowlisted; everything else
    // remains GET/HEAD. DELETE exists nowhere.
    const WRITE_ROUTE_METHODS: Record<string, string[]> = {
      [join("app", "api", "drafts", "route.ts")]: ["POST"],
      [join("app", "api", "drafts", "[draftId]", "route.ts")]: ["GET", "PUT"],
      [join("app", "api", "renders", "route.ts")]: ["POST"],
      [join("app", "api", "renders", "[renderId]", "route.ts")]: ["GET"],
      [join("app", "api", "renders", "[renderId]", "output", "route.ts")]: ["GET", "HEAD"],
    };
    const routes = scanFiles(join(process.cwd(), "app", "api")).filter((f) =>
      f.endsWith("route.ts"),
    );
    expect(routes.length).toBeGreaterThanOrEqual(3);
    for (const route of routes) {
      const source = read(route);
      const methods = [...source.matchAll(/export\s+(?:async\s+)?function\s+(\w+)/g)].map(
        (m) => m[1],
      );
      const allowKey = Object.keys(WRITE_ROUTE_METHODS).find((k) => route.endsWith(k));
      const allowed = allowKey !== undefined ? WRITE_ROUTE_METHODS[allowKey] : ["GET", "HEAD"];
      expect(methods.length).toBeGreaterThan(0);
      expect(
        methods.every((m) => allowed.includes(m)),
        `${route} exports ${methods.join(",")}; allowed: ${allowed.join(",")}`,
      ).toBe(true);
      expect(methods).not.toContain("DELETE");
      expect(source).toContain(`export const dynamic = "force-dynamic"`);
    }
  });

  it("the imported engine composition graph stays browser-safe", () => {
    // Walks the composition's relative-import graph (same contract as the
    // root check:browser-safe script) so CI enforces it from the studio suite
    // — new imports are followed, not just a hardcoded file list.
    const entry = join(process.cwd(), "..", "src", "VerticalCoreComposition.tsx");
    const IMPORT_SPEC = /(?:from\s+|import\s+|import\s*\(\s*)["']([^"']+)["']/g;
    const resolveRelative = (fromFile: string, spec: string): string | null => {
      const base = join(fromFile, "..", spec);
      for (const candidate of [base, `${base}.ts`, `${base}.tsx`, join(base, "index.ts"), join(base, "index.tsx")]) {
        try {
          if (statSync(candidate).isFile()) return candidate;
        } catch {
          // try next candidate
        }
      }
      return null;
    };
    const seen = new Set<string>();
    const visit = (file: string) => {
      if (seen.has(file)) return;
      seen.add(file);
      const source = read(file);
      expect(NODE_IMPORT.test(source), `${file} imports Node modules`).toBe(false);
      expect(/\bprocess\.env\b/.test(source), `${file} reads env`).toBe(false);
      for (const m of source.matchAll(IMPORT_SPEC)) {
        const spec = m[1];
        expect(spec.endsWith(".json"), `${file} imports JSON singleton ${spec}`).toBe(false);
        expect(/(^|\/)Root$/.test(spec), `${file} imports Root`).toBe(false);
        expect(/@remotion\/(renderer|bundler|cli)/.test(spec), `${file} imports ${spec}`).toBe(
          false,
        );
        if (spec.startsWith(".")) {
          const resolved = resolveRelative(file, spec);
          expect(resolved, `${file}: unresolvable relative import ${spec}`).not.toBeNull();
          visit(resolved!);
        }
      }
    };
    visit(entry);
    expect(seen.size).toBeGreaterThanOrEqual(2);
  });

  it("no client file renders arbitrary HTML or serializes absolute paths", () => {
    expect(offendersIn(CLIENT_FILES(), /dangerouslySetInnerHTML/)).toEqual([]);
    expect(offendersIn([...CLIENT_FILES(), ...SERVER_FILES()], /["']\/Users\//)).toEqual([]);
  });
});

describe("phase 2 dynamic egress policy", () => {
  it("shell interactions call only same-origin GET /api routes; sockets stay banned", async () => {
    const calls: { url: string; method: string }[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        calls.push({ url: String(input), method: init?.method ?? "GET" });
        return Response.json({ schemaVersion: 1, projects: [] });
      }),
    );
    for (const api of ["WebSocket", "XMLHttpRequest", "EventSource"]) {
      vi.stubGlobal(
        api,
        class {
          constructor() {
            throw new Error(`${api} egress attempted in Phase 2 shell`);
          }
        },
      );
    }

    const user = userEvent.setup();
    render(<StudioShell />);

    await screen.findByText(/No materialized projects found/);
    await user.click(screen.getByRole("button", { name: /Drone Property Reveal/ }));
    await user.click(screen.getByRole("radio", { name: "Video" }));
    await user.click(screen.getByRole("option", { name: "Select D001_ridge_flyover.mp4" }));
    await user.click(screen.getByRole("radio", { name: "9:16" }));
    await user.click(screen.getByRole("button", { name: "Play" }));
    await user.click(screen.getByRole("button", { name: "Pause" }));
    await user.click(screen.getByRole("button", { name: "Media panel" }));

    expect(calls.length).toBeGreaterThan(0);
    for (const call of calls) {
      expect(call.method).toBe("GET");
      expect(call.url).toMatch(/^\/api\/(projects|assets)(\/|$|\?)/);
    }
  });
});
