// @vitest-environment node
// Draft persistence + write-route boundary tests over a temp fixture repo
// and a temp writable data root. No server, no network, no real media.
import { createHash } from "node:crypto";
import {
  existsSync,
  lstatSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  statSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { POST as postDraft } from "@/app/api/drafts/route";
import { GET as getDraftRoute, PUT as putDraft } from "@/app/api/drafts/[draftId]/route";
import { resetRootsForTesting } from "@/server/pathPolicy";
import { resetDataRootForTesting } from "@/server/write/dataRootPolicy";
import { WRITE_INTENT_VALUE, type StudioDraftV1 } from "@/lib/draftDocument";
import { makeFixtureRepo, type FixtureRepo } from "./fixtureRepo";

let repo: FixtureRepo;
let dataRoot: string;

const params = <T,>(value: T) => Promise.resolve(value);

interface WriteReqOptions {
  method?: string;
  host?: string;
  origin?: string | null;
  referer?: string | null;
  contentType?: string | null;
  intent?: string | null;
  body?: string;
}

const writeReq = (url: string, opts: WriteReqOptions = {}): Request => {
  const {
    method = "POST",
    host = "127.0.0.1:3000",
    origin = "http://127.0.0.1:3000",
    referer = null,
    contentType = "application/json",
    intent = WRITE_INTENT_VALUE,
    body = "",
  } = opts;
  const headers = new Headers({ host, "content-length": String(Buffer.byteLength(body)) });
  if (origin !== null) headers.set("origin", origin);
  if (referer !== null) headers.set("referer", referer);
  if (contentType !== null) headers.set("content-type", contentType);
  if (intent !== null) headers.set("x-myvideo-intent", intent);
  return {
    url: `http://${host}${url}`,
    method,
    headers,
    text: async () => body,
  } as unknown as Request;
};

const readReq = (url: string, host = "127.0.0.1:3000") =>
  ({
    url: `http://${host}${url}`,
    method: "GET",
    headers: new Headers({ host }),
  }) as unknown as Request;

const createBody = JSON.stringify({ sourceProjectId: "demo" });

async function createDemoDraft(): Promise<StudioDraftV1> {
  const res = await postDraft(writeReq("/api/drafts", { body: createBody }));
  expect(res.status).toBe(201);
  return (await res.json()) as StudioDraftV1;
}

const editsFor = (draft: StudioDraftV1, over: Record<string, unknown> = {}) => ({
  expectedVersion: draft.version,
  draftTitle: draft.draftTitle,
  backgroundColor: draft.backgroundColor,
  transitionFrames: draft.transitionFrames,
  clips: draft.clips.map((c) => ({
    sourceAssetId: c.sourceAssetId,
    trimBefore: c.trimBefore,
    trimAfter: c.trimAfter,
    enabled: c.enabled,
  })),
  ...over,
});

/** Content hash of every file under the fixture repo's protected roots. */
function sourceTreeHash(): string {
  const hash = createHash("sha256");
  const walk = (dir: string) => {
    for (const entry of readdirSync(dir).sort()) {
      const full = path.join(dir, entry);
      const st = lstatSync(full);
      if (st.isDirectory()) walk(full);
      else if (st.isFile()) hash.update(entry).update(readFileSync(full));
    }
  };
  for (const zone of ["input", ".cache", "public"]) {
    const full = path.join(repo.root, zone);
    if (existsSync(full)) walk(full);
  }
  return hash.digest("hex");
}

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
  ]);
  dataRoot = mkdtempSync(path.join(tmpdir(), "myvideo-data-"));
  process.env.MYVIDEO_REPO_ROOT = repo.root;
  process.env.MYVIDEO_STUDIO_DATA_ROOT = dataRoot;
  resetRootsForTesting();
  resetDataRootForTesting();
});

afterEach(() => {
  repo.cleanup();
  rmSync(dataRoot, { recursive: true, force: true });
  delete process.env.MYVIDEO_REPO_ROOT;
  delete process.env.MYVIDEO_STUDIO_DATA_ROOT;
  resetRootsForTesting();
  resetDataRootForTesting();
});

describe("draft creation", () => {
  it("creates version 1 with server-derived defaults from the source cache", async () => {
    const before = sourceTreeHash();
    const draft = await createDemoDraft();
    expect(draft.version).toBe(1);
    expect(draft.sourceProjectId).toBe("demo");
    expect(draft.sourceProjectName).toBe("Demo Fixture");
    expect(draft.readOnlySource).toBe(true);
    expect(draft.draftTitle).toBe("Fixture");
    expect(draft.backgroundColor).toBe("#111111");
    expect(draft.transitionFrames).toBe(8);
    expect(draft.renderEligibility).toBe("eligible");
    expect(draft.clips).toHaveLength(2);
    expect(draft.clips[0]).toMatchObject({
      fileName: "01.mp4",
      sourceDurationInFrames: 90,
      trimBefore: 0,
      trimAfter: 0,
      enabled: true,
      order: 0,
    });
    // Persisted layout: draft.json + immutable history/1.json.
    const dir = path.join(dataRoot, "drafts", draft.draftId);
    expect(existsSync(path.join(dir, "draft.json"))).toBe(true);
    expect(existsSync(path.join(dir, "history", "1.json"))).toBe(true);
    // Source roots untouched.
    expect(sourceTreeHash()).toBe(before);
  });

  it("refuses a source project without materialized props", async () => {
    const res = await postDraft(
      writeReq("/api/drafts", { body: JSON.stringify({ sourceProjectId: "no-props" }) }),
    );
    expect(res.status).toBe(409);
  });

  it("rejects an invalid source project id", async () => {
    const res = await postDraft(
      writeReq("/api/drafts", { body: JSON.stringify({ sourceProjectId: "../evil" }) }),
    );
    expect(res.status).toBe(400);
  });
});

describe("draft save", () => {
  it("applies approved edits, increments the version, and keeps history immutable", async () => {
    const draft = await createDemoDraft();
    const before = sourceTreeHash();
    const historyV1 = readFileSync(
      path.join(dataRoot, "drafts", draft.draftId, "history", "1.json"),
      "utf8",
    );
    const res = await putDraft(
      writeReq(`/api/drafts/${draft.draftId}`, {
        method: "PUT",
        body: JSON.stringify(
          editsFor(draft, {
            draftTitle: "Retitled",
            backgroundColor: "#0a0a0a",
            transitionFrames: 4,
            clips: [
              { sourceAssetId: draft.clips[1].sourceAssetId, trimBefore: 5, trimAfter: 3, enabled: true },
              { sourceAssetId: draft.clips[0].sourceAssetId, trimBefore: 0, trimAfter: 0, enabled: false },
            ],
          }),
        ),
      }),
      { params: params({ draftId: draft.draftId }) },
    );
    expect(res.status).toBe(200);
    const saved = (await res.json()) as StudioDraftV1;
    expect(saved.version).toBe(2);
    expect(saved.draftTitle).toBe("Retitled");
    expect(saved.clips[0]).toMatchObject({ fileName: "02.mp4", trimBefore: 5, trimAfter: 3, order: 0 });
    expect(saved.clips[1]).toMatchObject({ fileName: "01.mp4", enabled: false, order: 1 });
    // Identity and source binding are not client-writable.
    expect(saved.draftId).toBe(draft.draftId);
    expect(saved.sourceFingerprint).toBe(draft.sourceFingerprint);
    // History: v1 byte-identical, v2 added.
    const dir = path.join(dataRoot, "drafts", draft.draftId);
    expect(readFileSync(path.join(dir, "history", "1.json"), "utf8")).toBe(historyV1);
    expect(existsSync(path.join(dir, "history", "2.json"))).toBe(true);
    expect(sourceTreeHash()).toBe(before);
    // Reload returns the saved state.
    const reload = await getDraftRoute(readReq(`/api/drafts/${draft.draftId}`), {
      params: params({ draftId: draft.draftId }),
    });
    expect(((await reload.json()) as StudioDraftV1).version).toBe(2);
  });

  it("returns 409 version_conflict on a stale expectedVersion", async () => {
    const draft = await createDemoDraft();
    const stale = writeReq(`/api/drafts/${draft.draftId}`, {
      method: "PUT",
      body: JSON.stringify(editsFor(draft)),
    });
    const first = await putDraft(
      writeReq(`/api/drafts/${draft.draftId}`, { method: "PUT", body: JSON.stringify(editsFor(draft)) }),
      { params: params({ draftId: draft.draftId }) },
    );
    expect(first.status).toBe(200);
    const second = await putDraft(stale, { params: params({ draftId: draft.draftId }) });
    expect(second.status).toBe(409);
    expect(((await second.json()) as { error: { code: string } }).error.code).toBe("version_conflict");
  });

  it.each([
    ["malformed body", "{not json"],
    ["non-object body", JSON.stringify("hello")],
  ])("rejects %s", async (_label, body) => {
    const draft = await createDemoDraft();
    const res = await putDraft(
      writeReq(`/api/drafts/${draft.draftId}`, { method: "PUT", body }),
      { params: params({ draftId: draft.draftId }) },
    );
    expect(res.status).toBe(400);
  });

  it("rejects an oversized body with 413", async () => {
    const draft = await createDemoDraft();
    const res = await putDraft(
      writeReq(`/api/drafts/${draft.draftId}`, {
        method: "PUT",
        body: `{"pad":"${"x".repeat(300_000)}"}`,
      }),
      { params: params({ draftId: draft.draftId }) },
    );
    expect(res.status).toBe(413);
  });

  it("strips unknown fields instead of persisting them", async () => {
    const draft = await createDemoDraft();
    const res = await putDraft(
      writeReq(`/api/drafts/${draft.draftId}`, {
        method: "PUT",
        body: JSON.stringify({ ...editsFor(draft), outputPath: "/tmp/evil", exec: "rm -rf" }),
      }),
      { params: params({ draftId: draft.draftId }) },
    );
    expect(res.status).toBe(200);
    const saved = (await res.json()) as Record<string, unknown>;
    expect(saved).not.toHaveProperty("outputPath");
    expect(saved).not.toHaveProperty("exec");
  });

  it.each([
    ["invalid color", { backgroundColor: "red; }" }],
    ["invalid transition", { transitionFrames: -2 }],
    ["invalid trims", { clips: "REPLACE_TRIMS" }],
    ["foreign asset", { clips: "REPLACE_FOREIGN" }],
  ])("rejects %s with 400", async (_label, over) => {
    const draft = await createDemoDraft();
    const body = editsFor(draft) as Record<string, unknown>;
    const overClips = (over as { clips?: string }).clips;
    if (overClips === "REPLACE_TRIMS") {
      body.clips = [
        { sourceAssetId: draft.clips[0].sourceAssetId, trimBefore: 60, trimAfter: 40, enabled: true },
        { sourceAssetId: draft.clips[1].sourceAssetId, trimBefore: 0, trimAfter: 0, enabled: true },
      ];
    } else if (overClips === "REPLACE_FOREIGN") {
      body.clips = [
        { sourceAssetId: "aW50cnVkZXIvZXZpbC5tcDQ", trimBefore: 0, trimAfter: 0, enabled: true },
        { sourceAssetId: draft.clips[1].sourceAssetId, trimBefore: 0, trimAfter: 0, enabled: true },
      ];
    } else {
      Object.assign(body, over);
    }
    const res = await putDraft(
      writeReq(`/api/drafts/${draft.draftId}`, { method: "PUT", body: JSON.stringify(body) }),
      { params: params({ draftId: draft.draftId }) },
    );
    expect(res.status).toBe(400);
  });

  it("saving with zero enabled clips persists but marks not renderable", async () => {
    const draft = await createDemoDraft();
    const res = await putDraft(
      writeReq(`/api/drafts/${draft.draftId}`, {
        method: "PUT",
        body: JSON.stringify(
          editsFor(draft, {
            clips: draft.clips.map((c) => ({
              sourceAssetId: c.sourceAssetId,
              trimBefore: 0,
              trimAfter: 0,
              enabled: false,
            })),
          }),
        ),
      }),
      { params: params({ draftId: draft.draftId }) },
    );
    expect(res.status).toBe(200);
    expect(((await res.json()) as StudioDraftV1).renderEligibility).toBe("no-enabled-clips");
  });

  it("marks Source Changed when the props cache changes after creation", async () => {
    const draft = await createDemoDraft();
    writeFileSync(
      repo.propsPath("demo"),
      JSON.stringify({
        backgroundColor: "#222222",
        clips: [
          { file: "01.mp4", src: "runtime-selects/demo/01.mp4", durationInFrames: 50, trimBefore: 0, trimAfter: 50 },
        ],
        title: "Changed",
        titleFrames: 45,
        transitionFrames: 8,
      }),
    );
    const res = await putDraft(
      writeReq(`/api/drafts/${draft.draftId}`, { method: "PUT", body: JSON.stringify(editsFor(draft)) }),
      { params: params({ draftId: draft.draftId }) },
    );
    expect(res.status).toBe(200);
    const saved = (await res.json()) as StudioDraftV1;
    expect(saved.renderEligibility).toBe("source-changed");
    expect(saved.warnings.join(" ")).toMatch(/Source project changed/);
    // The persisted binding still points at the creation-time source.
    expect(saved.sourceFingerprint).toBe(draft.sourceFingerprint);
  });

  it("returns 404 for an unknown draft and 400 for a traversal id", async () => {
    const unknown = await getDraftRoute(
      readReq("/api/drafts/6f2f0f6a-1234-4abc-9def-0123456789ab"),
      { params: params({ draftId: "6f2f0f6a-1234-4abc-9def-0123456789ab" }) },
    );
    expect(unknown.status).toBe(404);
    const traversal = await getDraftRoute(readReq("/api/drafts/..%2Fescape"), {
      params: params({ draftId: "../escape" }),
    });
    expect(traversal.status).toBe(400);
  });

  it("never leaks absolute paths in any draft response", async () => {
    const draft = await createDemoDraft();
    const res = await getDraftRoute(readReq(`/api/drafts/${draft.draftId}`), {
      params: params({ draftId: draft.draftId }),
    });
    const text = JSON.stringify(await res.json());
    expect(text).not.toContain(repo.root);
    expect(text).not.toContain(dataRoot);
    expect(text).not.toContain("/Users/");
  });
});

describe("data-root policy", () => {
  it("fails closed (503) when the data root is unset, relative, inside the repo, or a symlink", async () => {
    for (const bad of [undefined, "relative/path", path.join(repo.root, ".cache", "drafts")]) {
      if (bad === undefined) delete process.env.MYVIDEO_STUDIO_DATA_ROOT;
      else process.env.MYVIDEO_STUDIO_DATA_ROOT = bad;
      resetDataRootForTesting();
      const res = await postDraft(writeReq("/api/drafts", { body: createBody }));
      expect(res.status).toBe(503);
      expect(((await res.json()) as { error: { code: string } }).error.code).toBe(
        "data_root_unavailable",
      );
    }
    // Symlink root.
    const real = mkdtempSync(path.join(tmpdir(), "myvideo-real-"));
    const link = path.join(tmpdir(), `myvideo-link-${Date.now()}`);
    symlinkSync(real, link);
    process.env.MYVIDEO_STUDIO_DATA_ROOT = link;
    resetDataRootForTesting();
    const res = await postDraft(writeReq("/api/drafts", { body: createBody }));
    expect(res.status).toBe(503);
    rmSync(link, { force: true });
    rmSync(real, { recursive: true, force: true });
  });

  it("creates owner-only directories under a valid data root", async () => {
    const draft = await createDemoDraft();
    const dir = path.join(dataRoot, "drafts", draft.draftId);
    expect(statSync(dir).mode & 0o777).toBe(0o700);
    expect(statSync(path.join(dir, "draft.json")).mode & 0o777).toBe(0o600);
  });
});

describe("write-request security (CSRF)", () => {
  it("accepts a valid local JSON request from 127.0.0.1 and localhost", async () => {
    for (const host of ["127.0.0.1:3000", "localhost:3000"]) {
      const res = await postDraft(
        writeReq("/api/drafts", { host, origin: `http://${host}`, body: createBody }),
      );
      expect(res.status).toBe(201);
    }
  });

  it("accepts a local Referer when Origin is absent", async () => {
    const res = await postDraft(
      writeReq("/api/drafts", {
        origin: null,
        referer: "http://127.0.0.1:3000/studio",
        body: createBody,
      }),
    );
    expect(res.status).toBe(201);
  });

  it.each([
    ["missing intent header", { intent: null }, 403],
    ["wrong intent value", { intent: "studio-write-v0" }, 403],
    ["external Origin", { origin: "https://evil.example" }, 403],
    ["malformed Origin", { origin: "not a url" }, 403],
    ["origin suffix attack", { origin: "http://127.0.0.1.evil.example" }, 403],
    ["missing Origin and Referer", { origin: null }, 403],
    ["external Referer only", { origin: null, referer: "https://evil.example/x" }, 403],
    ["text/plain", { contentType: "text/plain" }, 415],
    ["form-urlencoded", { contentType: "application/x-www-form-urlencoded" }, 415],
    ["missing Content-Type", { contentType: null }, 415],
    ["external Host", { host: "evil.example" }, 403],
  ])("rejects %s", async (_label, over, status) => {
    const res = await postDraft(writeReq("/api/drafts", { ...over, body: createBody }));
    expect(res.status).toBe(status);
  });

  it("never emits CORS allow headers", async () => {
    const res = await postDraft(
      writeReq("/api/drafts", { origin: "https://evil.example", body: createBody }),
    );
    expect(res.headers.get("access-control-allow-origin")).toBeNull();
    const ok = await postDraft(writeReq("/api/drafts", { body: createBody }));
    expect(ok.headers.get("access-control-allow-origin")).toBeNull();
  });
});
