// @vitest-environment node
// Remediation regression suite: GET/HEAD read paths must be filesystem
// side-effect free. Unknown identifiers create nothing; a missing data root
// is never created by a read; existing objects read without modification;
// nested and output symlink escapes are rejected. Tree equality is proven
// path-for-path with mode, size, mtime, and content hash.
import { createHash } from "node:crypto";
import {
  existsSync,
  lstatSync,
  mkdirSync,
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
import { GET as getDraftRoute } from "@/app/api/drafts/[draftId]/route";
import { GET as getRender } from "@/app/api/renders/[renderId]/route";
import { GET as getOutput, HEAD as headOutput } from "@/app/api/renders/[renderId]/output/route";
import { resetRootsForTesting } from "@/server/pathPolicy";
import { resetDataRootForTesting } from "@/server/write/dataRootPolicy";
import { WRITE_INTENT_VALUE, type StudioDraftV1 } from "@/lib/draftDocument";
import { makeFixtureRepo, type FixtureRepo } from "./fixtureRepo";

let repo: FixtureRepo;
let dataRoot: string;

const UNKNOWN_UUID = "0f0e0d0c-0b0a-4f9e-8d7c-6b5a4f3e2d1c";

const params = <T,>(value: T) => Promise.resolve(value);

const readReq = (url: string) =>
  ({
    url: `http://127.0.0.1:3000${url}`,
    method: "GET",
    headers: new Headers({ host: "127.0.0.1:3000" }),
  }) as unknown as Request;

const writeReq = (url: string, body: string): Request =>
  ({
    url: `http://127.0.0.1:3000${url}`,
    method: "POST",
    headers: new Headers({
      host: "127.0.0.1:3000",
      origin: "http://127.0.0.1:3000",
      "content-type": "application/json",
      "x-myvideo-intent": WRITE_INTENT_VALUE,
      "content-length": String(Buffer.byteLength(body)),
    }),
    text: async () => body,
  }) as unknown as Request;

/** Full recursive snapshot: relpath → type/mode/size/mtime/content-hash,
 *  INCLUDING the root's own inode (mode + mtime) — the historical defect was
 *  a chmod of the root itself on read. */
function snapshotTree(root: string): string {
  if (!existsSync(root)) return "<absent>";
  const rootStat = lstatSync(root);
  const lines: string[] = [`root mode=${rootStat.mode & 0o777} mtime=${rootStat.mtimeMs}`];
  const walk = (dir: string) => {
    for (const entry of readdirSync(dir).sort()) {
      const full = path.join(dir, entry);
      const rel = path.relative(root, full);
      const st = lstatSync(full);
      if (st.isDirectory()) {
        lines.push(`dir ${rel} mode=${st.mode & 0o777} mtime=${st.mtimeMs}`);
        walk(full);
      } else if (st.isSymbolicLink()) {
        lines.push(`link ${rel}`);
      } else {
        const hash = createHash("sha256").update(readFileSync(full)).digest("hex");
        lines.push(
          `file ${rel} mode=${st.mode & 0o777} size=${st.size} mtime=${st.mtimeMs} sha=${hash}`,
        );
      }
    }
  };
  walk(root);
  return lines.join("\n");
}

async function createDemoDraft(): Promise<StudioDraftV1> {
  const res = await postDraft(writeReq("/api/drafts", JSON.stringify({ sourceProjectId: "demo" })));
  expect(res.status).toBe(201);
  return (await res.json()) as StudioDraftV1;
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

describe("unknown identifiers create nothing", () => {
  it("unknown draft GET returns 404 and leaves the data-root tree byte-identical", async () => {
    await createDemoDraft();
    resetDataRootForTesting(); // drop the cache so the read path re-resolves
    const before = snapshotTree(dataRoot);
    const res = await getDraftRoute(readReq(`/api/drafts/${UNKNOWN_UUID}`), {
      params: params({ draftId: UNKNOWN_UUID }),
    });
    expect(res.status).toBe(404);
    expect(snapshotTree(dataRoot)).toBe(before);
    expect(existsSync(path.join(dataRoot, "drafts", UNKNOWN_UUID))).toBe(false);
  });

  it("unknown render GET returns 404 with no new render directory", async () => {
    await createDemoDraft();
    const before = snapshotTree(dataRoot);
    const res = await getRender(readReq(`/api/renders/${UNKNOWN_UUID}`), {
      params: params({ renderId: UNKNOWN_UUID }),
    });
    expect(res.status).toBe(404);
    expect(snapshotTree(dataRoot)).toBe(before);
    expect(existsSync(path.join(dataRoot, "renders"))).toBe(false);
  });

  it("unknown render output GET and HEAD return 404 with zero filesystem changes", async () => {
    const before = snapshotTree(dataRoot);
    const get = await getOutput(readReq(`/api/renders/${UNKNOWN_UUID}/output`), {
      params: params({ renderId: UNKNOWN_UUID }),
    });
    const head = await headOutput(readReq(`/api/renders/${UNKNOWN_UUID}/output`), {
      params: params({ renderId: UNKNOWN_UUID }),
    });
    expect(get.status).toBe(404);
    expect(head.status).toBe(404);
    expect(snapshotTree(dataRoot)).toBe(before);
  });
});

describe("missing data root is never created by reads", () => {
  it("draft/render/output GET and HEAD fail closed without creating the root", async () => {
    const parent = mkdtempSync(path.join(tmpdir(), "myvideo-parent-"));
    const missingRoot = path.join(parent, "never-created");
    const parentBefore = statSync(parent);
    process.env.MYVIDEO_STUDIO_DATA_ROOT = missingRoot;
    resetDataRootForTesting();

    const draftRes = await getDraftRoute(readReq(`/api/drafts/${UNKNOWN_UUID}`), {
      params: params({ draftId: UNKNOWN_UUID }),
    });
    const renderRes = await getRender(readReq(`/api/renders/${UNKNOWN_UUID}`), {
      params: params({ renderId: UNKNOWN_UUID }),
    });
    const outputGet = await getOutput(readReq(`/api/renders/${UNKNOWN_UUID}/output`), {
      params: params({ renderId: UNKNOWN_UUID }),
    });
    const outputHead = await headOutput(readReq(`/api/renders/${UNKNOWN_UUID}/output`), {
      params: params({ renderId: UNKNOWN_UUID }),
    });
    for (const res of [draftRes, renderRes, outputGet, outputHead]) {
      expect(res.status).toBe(404);
    }
    expect(existsSync(missingRoot)).toBe(false);
    const parentAfter = statSync(parent);
    expect(parentAfter.mode).toBe(parentBefore.mode);
    expect(readdirSync(parent)).toEqual([]);
    rmSync(parent, { recursive: true, force: true });
  });

  it("a read-primed root cache does not skip write-mode permission hardening", async () => {
    // Pre-existing root with loose permissions; a READ resolves it first.
    const parent = mkdtempSync(path.join(tmpdir(), "myvideo-parent-"));
    const looseRoot = path.join(parent, "loose-root");
    mkdirSync(looseRoot, { mode: 0o755 });
    process.env.MYVIDEO_STUDIO_DATA_ROOT = looseRoot;
    resetDataRootForTesting();
    const read = await getDraftRoute(readReq(`/api/drafts/${UNKNOWN_UUID}`), {
      params: params({ draftId: UNKNOWN_UUID }),
    });
    expect(read.status).toBe(404);
    expect(statSync(looseRoot).mode & 0o777).toBe(0o755); // read did not chmod
    // The first explicit write must still enforce owner-only permissions.
    await createDemoDraft();
    expect(statSync(looseRoot).mode & 0o777).toBe(0o700);
    rmSync(parent, { recursive: true, force: true });
  });

  it("a write operation still creates the missing root (explicit-write behavior intact)", async () => {
    const parent = mkdtempSync(path.join(tmpdir(), "myvideo-parent-"));
    const missingRoot = path.join(parent, "created-on-write");
    process.env.MYVIDEO_STUDIO_DATA_ROOT = missingRoot;
    resetDataRootForTesting();
    const draft = await createDemoDraft();
    expect(existsSync(path.join(missingRoot, "drafts", draft.draftId, "draft.json"))).toBe(true);
    expect(statSync(missingRoot).mode & 0o777).toBe(0o700);
    rmSync(parent, { recursive: true, force: true });
  });
});

describe("existing objects read without modification", () => {
  it("draft GET succeeds and changes no mtime, mode, contents, or entries", async () => {
    const draft = await createDemoDraft();
    const before = snapshotTree(dataRoot);
    const res = await getDraftRoute(readReq(`/api/drafts/${draft.draftId}`), {
      params: params({ draftId: draft.draftId }),
    });
    expect(res.status).toBe(200);
    expect(((await res.json()) as StudioDraftV1).draftId).toBe(draft.draftId);
    expect(snapshotTree(dataRoot)).toBe(before);
  });
});

describe("symlink containment", () => {
  it("a draft directory symlinked outside the root is rejected and not read", async () => {
    await createDemoDraft(); // materializes drafts/
    const escape = mkdtempSync(path.join(tmpdir(), "myvideo-escape-"));
    // A syntactically valid draft dir with readable content, outside the root.
    const draftJson = path.join(escape, "draft.json");
    writeFileSync(draftJson, JSON.stringify({ lure: true }));
    symlinkSync(escape, path.join(dataRoot, "drafts", UNKNOWN_UUID));
    const escapeBefore = snapshotTree(escape);
    const res = await getDraftRoute(readReq(`/api/drafts/${UNKNOWN_UUID}`), {
      params: params({ draftId: UNKNOWN_UUID }),
    });
    expect(res.status).toBe(404);
    expect(snapshotTree(escape)).toBe(escapeBefore);
    rmSync(escape, { recursive: true, force: true });
  });

  it("an output.mp4 symlink escaping its render directory is rejected", async () => {
    const escape = mkdtempSync(path.join(tmpdir(), "myvideo-escape-"));
    const secret = path.join(escape, "secret.bin");
    writeFileSync(secret, Buffer.alloc(32, 9));
    const renderId = UNKNOWN_UUID;
    const dir = path.join(dataRoot, "renders", renderId);
    mkdirSync(dir, { recursive: true });
    writeFileSync(
      path.join(dir, "job.json"),
      JSON.stringify({
        schemaVersion: 1,
        renderId,
        draftId: "1a2b3c4d-5e6f-4a1b-9c8d-7e6f5a4b3c2d",
        draftVersion: 1,
        sourceProjectId: "demo",
        status: "succeeded",
        createdAt: "2026-07-19T00:00:00.000Z",
        startedAt: "2026-07-19T00:00:00.000Z",
        finishedAt: "2026-07-19T00:00:01.000Z",
        exitCode: 0,
        error: null,
        durationInFrames: 100,
        outputBytes: 32,
      }),
    );
    symlinkSync(secret, path.join(dir, "output.mp4"));
    const res = await getOutput(readReq(`/api/renders/${renderId}/output`), {
      params: params({ renderId }),
    });
    expect(res.status).toBe(404);
    const body = Buffer.from(await res.arrayBuffer());
    expect(body.includes(Buffer.alloc(4, 9))).toBe(false);
    rmSync(escape, { recursive: true, force: true });
  });
});
