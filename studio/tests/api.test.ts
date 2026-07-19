// @vitest-environment node
// In-process route-handler tests over a temp fixture repo. No server, no
// network, no real media.
import { writeFileSync } from "node:fs";
import path from "node:path";
import { GET as getProjects } from "@/app/api/projects/route";
import { GET as getProject } from "@/app/api/projects/[projectId]/route";
import { GET as getAsset, HEAD as headAsset } from "@/app/api/assets/[assetId]/route";
import { resetRootsForTesting } from "@/server/pathPolicy";
import { encodeAssetId } from "@/server/projectRepository";
import { validateDocument } from "@/lib/projectDocument";
import { makeFixtureRepo, type FixtureRepo } from "./fixtureRepo";

let repo: FixtureRepo;

const req = (url: string, headers: Record<string, string> = {}) =>
  ({
    url: `http://127.0.0.1:3000${url}`,
    headers: new Headers({ host: "127.0.0.1:3000", ...headers }),
  }) as unknown as Request;

const params = <T,>(value: T) => Promise.resolve(value);

beforeEach(() => {
  repo = makeFixtureRepo([
    {
      slug: "demo",
      clips: { "01.mp4": 100, "02.mp4": 40 },
      metadata: { title: "Demo Fixture", client_slug: "acme" },
      durationInFrames: 90,
      transitionFrames: 8,
    },
    { slug: "no-props", clips: { "x.mp4": 10 }, rawProps: null },
    {
      // Watcher-shaped project: empty title in metadata AND props (the real
      // test-client-20260422 on-disk shape) must preview as ready.
      slug: "untitled",
      clips: { "01.mp4": 20 },
      metadata: { title: "", client_slug: "test-client", project_slug: "untitled" },
      rawProps: {
        backgroundColor: "#111111",
        clips: [
          { file: "01.mp4", src: "runtime-selects/untitled/01.mp4", durationInFrames: 120, trimBefore: 0, trimAfter: 120 },
        ],
        title: "",
        titleFrames: 45,
        transitionFrames: 8,
      },
    },
    { slug: "missing-media", clips: { "gone.mp4": null } },
    {
      slug: "bad-props",
      clips: { "01.mp4": 10 },
      rawProps: { backgroundColor: "url(javascript:alert(1))", clips: [], title: null, titleFrames: 1, transitionFrames: 1 },
    },
  ]);
  process.env.MYVIDEO_REPO_ROOT = repo.root;
  resetRootsForTesting();
});

afterEach(() => {
  repo.cleanup();
  delete process.env.MYVIDEO_REPO_ROOT;
  resetRootsForTesting();
});

describe("host policy", () => {
  it.each(["127.0.0.1:3000", "localhost:3000", "localhost", "[::1]:3000"])(
    "accepts local host %s",
    async (host) => {
      const res = await getProjects(req("/api/projects", { host }));
      expect(res.status).toBe(200);
    },
  );
  it.each(["evil.com", "127.0.0.1.evil.com", "localhost.evil.com:3000", ""])(
    "rejects non-local host %j before repository access",
    async (host) => {
      const res = await getProjects(req("/api/projects", { host }));
      expect(res.status).toBe(403);
      expect(((await res.json()) as { error: { code: string } }).error.code).toBe(
        "forbidden_host",
      );
    },
  );
});

describe("GET /api/projects", () => {
  it("lists sanitized summaries without local paths", async () => {
    const res = await getProjects(req("/api/projects"));
    expect(res.status).toBe(200);
    expect(res.headers.get("cache-control")).toBe("no-store");
    const text = await res.text();
    expect(text).not.toContain(repo.root);
    expect(text).not.toContain("/Users/");
    const body = JSON.parse(text) as {
      projects: { projectId: string; projectName: string; previewReady: boolean }[];
    };
    expect(body.projects.map((p) => p.projectId).sort()).toEqual([
      "bad-props",
      "demo",
      "missing-media",
      "no-props",
      "untitled",
    ]);
    expect(body.projects.find((p) => p.projectId === "demo")?.projectName).toBe("Demo Fixture");
    // previewReady means props cache valid AND all clips staged (plan §7).
    const ready = Object.fromEntries(body.projects.map((p) => [p.projectId, p.previewReady]));
    expect(ready).toEqual({
      demo: true,
      untitled: true,
      "bad-props": false,
      "missing-media": false,
      "no-props": false,
    });
  });

  it("returns an empty list when the engine has no projects", async () => {
    const empty = makeFixtureRepo([]);
    process.env.MYVIDEO_REPO_ROOT = empty.root;
    resetRootsForTesting();
    const res = await getProjects(req("/api/projects"));
    expect(((await res.json()) as { projects: unknown[] }).projects).toEqual([]);
    empty.cleanup();
  });
});

describe("GET /api/projects/[projectId]", () => {
  it("returns a valid ready document mapped to asset URLs", async () => {
    const res = await getProject(req("/api/projects/demo"), {
      params: params({ projectId: "demo" }),
    });
    expect(res.status).toBe(200);
    const text = await res.text();
    expect(text).not.toContain(repo.root);
    expect(text).not.toContain("runtime-selects/"); // engine-relative path never leaks
    const doc = validateDocument(JSON.parse(text));
    expect(doc).not.toBeNull();
    expect(doc?.status).toBe("ready");
    expect(doc?.readOnly).toBe(true);
    expect(doc?.composition?.durationInFrames).toBe(90 + 90 - 8);
    expect(doc?.props?.clips.every((c) => c.src.startsWith("api/assets/"))).toBe(true);
    expect(doc?.assets).toHaveLength(2);
  });

  it("previews a watcher-shaped project with empty titles as ready under its slug", async () => {
    const res = await getProject(req("/api/projects/untitled"), {
      params: params({ projectId: "untitled" }),
    });
    const doc = validateDocument(await res.json());
    expect(doc?.status).toBe("ready");
    expect(doc?.projectName).toBe("untitled"); // slug fallback for empty title
    expect(doc?.props?.title).toBeNull();
    expect(doc?.clientSlug).toBe("test-client");
  });

  it("reports stale freshness when sources are newer than the cache", async () => {
    repo.touch(repo.propsPath("demo"), 1_000_000);
    const res = await getProject(req("/api/projects/demo"), {
      params: params({ projectId: "demo" }),
    });
    const doc = validateDocument(await res.json());
    expect(doc?.freshness).toBe("stale");
    expect(doc?.warnings.join(" ")).toMatch(/changed after/);
  });

  it("handles props-missing, media-missing, and invalid props", async () => {
    for (const [slug, status] of [
      ["no-props", "props-missing"],
      ["missing-media", "media-missing"],
      ["bad-props", "invalid"],
    ] as const) {
      const res = await getProject(req(`/api/projects/${slug}`), {
        params: params({ projectId: slug }),
      });
      expect(res.status).toBe(200);
      const doc = validateDocument(await res.json());
      expect(doc?.status).toBe(status);
      expect(doc?.props).toBeNull();
    }
  });

  it("returns controlled errors for unknown and malformed ids", async () => {
    const unknown = await getProject(req("/api/projects/ghost"), {
      params: params({ projectId: "ghost" }),
    });
    expect(unknown.status).toBe(404);
    const invalid = await getProject(req("/api/projects/..%2F.."), {
      params: params({ projectId: "../.." }),
    });
    expect(invalid.status).toBe(400);
    for (const res of [unknown, invalid]) {
      const clone = await res.clone().text();
      expect(clone).not.toContain(repo.root);
      expect(clone).not.toContain("at "); // no stack traces
    }
  });
});

describe("asset route", () => {
  const demoAsset = () => encodeAssetId("demo", "01.mp4");

  it("serves a full GET with media headers", async () => {
    const res = await getAsset(req(`/api/assets/${demoAsset()}`), {
      params: params({ assetId: demoAsset() }),
    });
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("video/mp4");
    expect(res.headers.get("content-length")).toBe("100");
    expect(res.headers.get("accept-ranges")).toBe("bytes");
    expect(res.headers.get("x-content-type-options")).toBe("nosniff");
    expect(res.headers.get("cross-origin-resource-policy")).toBe("same-origin");
    expect(res.headers.get("access-control-allow-origin")).toBeNull();
    expect((await res.arrayBuffer()).byteLength).toBe(100);
  });

  it("serves HEAD without a body", async () => {
    const res = await headAsset(req(`/api/assets/${demoAsset()}`), {
      params: params({ assetId: demoAsset() }),
    });
    expect(res.status).toBe(200);
    expect(res.headers.get("content-length")).toBe("100");
    expect(res.body).toBeNull();
  });

  it("serves initial, open-ended, and suffix ranges with 206", async () => {
    const cases = [
      { range: "bytes=0-9", contentRange: "bytes 0-9/100", length: 10 },
      { range: "bytes=90-", contentRange: "bytes 90-99/100", length: 10 },
      { range: "bytes=-5", contentRange: "bytes 95-99/100", length: 5 },
    ];
    for (const c of cases) {
      const res = await getAsset(req(`/api/assets/${demoAsset()}`, { range: c.range }), {
        params: params({ assetId: demoAsset() }),
      });
      expect(res.status).toBe(206);
      expect(res.headers.get("content-range")).toBe(c.contentRange);
      expect(res.headers.get("content-length")).toBe(String(c.length));
      expect((await res.arrayBuffer()).byteLength).toBe(c.length);
    }
  });

  it("degrades malformed/multi ranges to 200 and rejects unsatisfiable with 416", async () => {
    const full = await getAsset(req(`/api/assets/${demoAsset()}`, { range: "bytes=0-1,5-9" }), {
      params: params({ assetId: demoAsset() }),
    });
    expect(full.status).toBe(200);
    const unsat = await getAsset(req(`/api/assets/${demoAsset()}`, { range: "bytes=500-" }), {
      params: params({ assetId: demoAsset() }),
    });
    expect(unsat.status).toBe(416);
    expect(unsat.headers.get("content-range")).toBe("bytes */100");
  });

  it("404s unknown, noncanonical, cross-project, and unstaged assets", async () => {
    const ids = [
      "zzzz",
      `${demoAsset()}==`,
      encodeAssetId("demo", "secret.mp4"),
      encodeAssetId("missing-media", "gone.mp4"),
      Buffer.from("demo/../01.mp4").toString("base64url"),
    ];
    for (const id of ids) {
      const res = await getAsset(req(`/api/assets/${id}`), { params: params({ assetId: id }) });
      expect(res.status).toBe(404);
      expect(await res.clone().text()).not.toContain(repo.root);
    }
  });

  it("rejects non-local hosts before touching the filesystem", async () => {
    const res = await getAsset(
      req(`/api/assets/${demoAsset()}`, { host: "evil.com" }),
      { params: params({ assetId: demoAsset() }) },
    );
    expect(res.status).toBe(403);
  });

  it("never exposes content-disposition or path headers", async () => {
    const res = await getAsset(req(`/api/assets/${demoAsset()}`), {
      params: params({ assetId: demoAsset() }),
    });
    expect(res.headers.get("content-disposition")).toBeNull();
    for (const [, value] of res.headers.entries()) {
      expect(value).not.toContain(repo.root);
    }
  });
});

describe("regression: engine duration formula", () => {
  it("matches src/Root.tsx calcVerticalCoreMetadata on a multi-clip fixture", async () => {
    // 2 clips × 90f − 1 overlap × 8f = 172 (formula from src/Root.tsx:65-75).
    const res = await getProject(req("/api/projects/demo"), {
      params: params({ projectId: "demo" }),
    });
    const doc = validateDocument(await res.json());
    expect(doc?.composition?.durationInFrames).toBe(172);
  });

  it("serves bytes for every asset the ready document references", async () => {
    const res = await getProject(req("/api/projects/demo"), {
      params: params({ projectId: "demo" }),
    });
    const doc = validateDocument(await res.json());
    for (const asset of doc?.assets ?? []) {
      const head = await headAsset(req(asset.previewUrl), {
        params: params({ assetId: asset.assetId }),
      });
      expect(head.status).toBe(200);
    }
  });
});

describe("repository sentinel", () => {
  it("fails closed when MYVIDEO_REPO_ROOT is not the engine repo", async () => {
    const stray = makeFixtureRepo([]);
    writeFileSync(path.join(stray.root, "package.json"), JSON.stringify({ name: "not-it" }));
    process.env.MYVIDEO_REPO_ROOT = stray.root;
    resetRootsForTesting();
    const res = await getProjects(req("/api/projects"));
    expect(res.status).toBe(500);
    const body = (await res.json()) as { error: { message: string } };
    expect(body.error.message).not.toContain(stray.root);
    stray.cleanup();
  });
});
