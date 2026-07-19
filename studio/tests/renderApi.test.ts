// @vitest-environment node
// Render queue + render API boundary tests with a FAKE runner. CI performs
// no real render: the fake writes job/output files the way the worker would.
import { createHash } from "node:crypto";
import {
  existsSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { POST as postDraft } from "@/app/api/drafts/route";
import { POST as postRender } from "@/app/api/renders/route";
import { GET as getRender } from "@/app/api/renders/[renderId]/route";
import { GET as getOutput, HEAD as headOutput } from "@/app/api/renders/[renderId]/output/route";
import { resetRootsForTesting } from "@/server/pathPolicy";
import { resetDataRootForTesting } from "@/server/write/dataRootPolicy";
import {
  resetRenderQueueForTesting,
  setRenderRunnerForTesting,
} from "@/server/render/renderQueue";
import { WRITE_INTENT_VALUE, type StudioDraftV1 } from "@/lib/draftDocument";
import type { RenderJobV1 } from "@/lib/renderDocument";
import { makeFixtureRepo, type FixtureRepo } from "./fixtureRepo";

let repo: FixtureRepo;
let dataRoot: string;

const params = <T,>(value: T) => Promise.resolve(value);

const writeReq = (url: string, body: string, headers: Record<string, string | null> = {}): Request => {
  const h = new Headers({
    host: "127.0.0.1:3000",
    origin: "http://127.0.0.1:3000",
    "content-type": "application/json",
    "x-myvideo-intent": WRITE_INTENT_VALUE,
    "content-length": String(Buffer.byteLength(body)),
  });
  for (const [k, v] of Object.entries(headers)) {
    if (v === null) h.delete(k);
    else h.set(k, v);
  }
  return {
    url: `http://127.0.0.1:3000${url}`,
    method: "POST",
    headers: h,
    text: async () => body,
  } as unknown as Request;
};

const readReq = (url: string, headers: Record<string, string> = {}) =>
  ({
    url: `http://127.0.0.1:3000${url}`,
    method: "GET",
    headers: new Headers({ host: "127.0.0.1:3000", ...headers }),
  }) as unknown as Request;

interface FakeRun {
  renderId: string;
  dataRoot: string;
  exit: (code: number | null) => void;
  killed: boolean;
}

let fakeRuns: FakeRun[];

/** Installs a fake runner whose behavior per launch is driven by `script`. */
function installFakeRunner(
  script: (run: FakeRun) => void | Promise<void> = () => undefined,
): void {
  fakeRuns = [];
  setRenderRunnerForTesting(async ({ dataRoot: dr, renderId }) => {
    const callbacks: Array<(code: number | null) => void> = [];
    const run: FakeRun = {
      renderId,
      dataRoot: dr,
      killed: false,
      exit: (code) => callbacks.forEach((cb) => cb(code)),
    };
    fakeRuns.push(run);
    setTimeout(() => void script(run), 0);
    return {
      onExit: (cb) => callbacks.push(cb),
      kill: () => {
        run.killed = true;
        run.exit(null);
      },
    };
  });
}

const jobPath = (renderId: string) => path.join(dataRoot, "renders", renderId, "job.json");
const readJob = (renderId: string) => JSON.parse(readFileSync(jobPath(renderId), "utf8")) as RenderJobV1;
const writeJob = (renderId: string, patch: Partial<RenderJobV1>) =>
  writeFileSync(jobPath(renderId), JSON.stringify({ ...readJob(renderId), ...patch }));

/** Worker-style success: terminal job status + output bytes, then exit 0. */
const succeedScript = (outputBytes = 64) => (run: FakeRun) => {
  const dir = path.join(run.dataRoot, "renders", run.renderId);
  writeFileSync(path.join(dir, "output.mp4"), Buffer.alloc(outputBytes, 3));
  writeJob(run.renderId, {
    status: "succeeded",
    finishedAt: new Date().toISOString(),
    exitCode: 0,
    outputBytes,
  });
  run.exit(0);
};

async function createSavedDraft(): Promise<StudioDraftV1> {
  const res = await postDraft(writeReq("/api/drafts", JSON.stringify({ sourceProjectId: "demo" })));
  expect(res.status).toBe(201);
  return (await res.json()) as StudioDraftV1;
}

async function startRenderFor(draft: StudioDraftV1): Promise<{ status: number; job: RenderJobV1 }> {
  const res = await postRender(
    writeReq(
      "/api/renders",
      JSON.stringify({ draftId: draft.draftId, expectedDraftVersion: draft.version }),
    ),
  );
  return { status: res.status, job: (await res.json()) as RenderJobV1 };
}

const flush = () => new Promise((resolve) => setTimeout(resolve, 5));

/** Poll until the persisted job reaches one of the given statuses. */
async function waitForStatus(renderId: string, statuses: string[]): Promise<string> {
  for (let i = 0; i < 100; i += 1) {
    const status = readJob(renderId).status;
    if (statuses.includes(status)) return status;
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  return readJob(renderId).status;
}

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
  ]);
  dataRoot = mkdtempSync(path.join(tmpdir(), "myvideo-data-"));
  process.env.MYVIDEO_REPO_ROOT = repo.root;
  process.env.MYVIDEO_STUDIO_DATA_ROOT = dataRoot;
  resetRootsForTesting();
  resetDataRootForTesting();
  resetRenderQueueForTesting();
  installFakeRunner();
});

afterEach(() => {
  setRenderRunnerForTesting(null);
  resetRenderQueueForTesting();
  repo.cleanup();
  rmSync(dataRoot, { recursive: true, force: true });
  delete process.env.MYVIDEO_REPO_ROOT;
  delete process.env.MYVIDEO_STUDIO_DATA_ROOT;
  resetRootsForTesting();
  resetDataRootForTesting();
});

describe("render queue", () => {
  it("queues a render for a saved, current draft (202) and derives server-side props", async () => {
    installFakeRunner(succeedScript());
    const before = sourceTreeHash();
    const draft = await createSavedDraft();
    const { status, job } = await startRenderFor(draft);
    expect(status).toBe(202);
    expect(job.status).toBe("queued");
    expect(job.draftId).toBe(draft.draftId);
    expect(job.draftVersion).toBe(1);
    expect(job.durationInFrames).toBe(90 + 90 - 8);
    // Server-generated layout, including the queued props snapshot.
    const dir = path.join(dataRoot, "renders", job.renderId);
    expect(existsSync(path.join(dir, "props.json"))).toBe(true);
    const props = JSON.parse(readFileSync(path.join(dir, "props.json"), "utf8")) as {
      clips: Array<{ src: string }>;
    };
    expect(props.clips.map((c) => c.src)).toEqual([
      "runtime-selects/demo/01.mp4",
      "runtime-selects/demo/02.mp4",
    ]);
    expect(await waitForStatus(job.renderId, ["succeeded"])).toBe("succeeded");
    expect(sourceTreeHash()).toBe(before);
  });

  it("allows only one active render (409 render_busy)", async () => {
    installFakeRunner(); // never exits
    const draft = await createSavedDraft();
    const first = await startRenderFor(draft);
    expect(first.status).toBe(202);
    const second = await postRender(
      writeReq(
        "/api/renders",
        JSON.stringify({ draftId: draft.draftId, expectedDraftVersion: draft.version }),
      ),
    );
    expect(second.status).toBe(409);
    expect(((await second.json()) as { error: { code: string } }).error.code).toBe("render_busy");
    fakeRuns[0].exit(0); // release for cleanup
  });

  it("rejects an unsaved/stale draft version (409)", async () => {
    const draft = await createSavedDraft();
    const res = await postRender(
      writeReq("/api/renders", JSON.stringify({ draftId: draft.draftId, expectedDraftVersion: 7 })),
    );
    expect(res.status).toBe(409);
    expect(((await res.json()) as { error: { code: string } }).error.code).toBe(
      "draft_version_conflict",
    );
  });

  it("rejects a stale source (409 source_changed) — no bypass exists", async () => {
    const draft = await createSavedDraft();
    writeFileSync(repo.propsPath("demo"), readFileSync(repo.propsPath("demo"), "utf8") + "\n");
    const res = await postRender(
      writeReq(
        "/api/renders",
        JSON.stringify({ draftId: draft.draftId, expectedDraftVersion: draft.version }),
      ),
    );
    expect(res.status).toBe(409);
    expect(((await res.json()) as { error: { code: string } }).error.code).toBe("source_changed");
  });

  it("finalizes a failed worker exit as failed with the exit code", async () => {
    installFakeRunner((run) => {
      writeJob(run.renderId, { status: "running", startedAt: new Date().toISOString() });
      run.exit(1);
    });
    const draft = await createSavedDraft();
    const { job } = await startRenderFor(draft);
    expect(await waitForStatus(job.renderId, ["failed"])).toBe("failed");
    const final = readJob(job.renderId);
    expect(final.exitCode).toBe(1);
    expect(final.error).not.toContain(dataRoot);
  });

  it("kills and records timed-out after the render timeout", async () => {
    installFakeRunner(); // never exits on its own
    const draft = await createSavedDraft();
    vi.useFakeTimers();
    let job: RenderJobV1;
    try {
      const started = await startRenderFor(draft);
      expect(started.status).toBe(202);
      job = started.job;
      await vi.advanceTimersByTimeAsync(30 * 60_000 + 10);
    } finally {
      vi.useRealTimers();
    }
    expect(fakeRuns[0].killed).toBe(true);
    expect(await waitForStatus(job.renderId, ["timed-out"])).toBe("timed-out");
  });

  it("returns 404 for an unknown render and 400 for a malformed render id", async () => {
    const unknown = await getRender(readReq("/api/renders/6f2f0f6a-1234-4abc-9def-0123456789ab"), {
      params: params({ renderId: "6f2f0f6a-1234-4abc-9def-0123456789ab" }),
    });
    expect(unknown.status).toBe(404);
    const malformed = await getRender(readReq("/api/renders/..%2Fjob"), {
      params: params({ renderId: "../job" }),
    });
    expect(malformed.status).toBe(400);
  });
});

describe("render output", () => {
  async function succeededRender(): Promise<RenderJobV1> {
    installFakeRunner(succeedScript(64));
    const draft = await createSavedDraft();
    const { job } = await startRenderFor(draft);
    await flush();
    return readJob(job.renderId);
  }

  it("is unavailable (409) before the render succeeds", async () => {
    installFakeRunner(); // stays queued
    const draft = await createSavedDraft();
    const { job } = await startRenderFor(draft);
    const res = await getOutput(readReq(`/api/renders/${job.renderId}/output`), {
      params: params({ renderId: job.renderId }),
    });
    expect(res.status).toBe(409);
    fakeRuns[0].exit(0);
  });

  it("serves the MP4 with GET, HEAD, nosniff, and a safe attachment filename", async () => {
    const job = await succeededRender();
    const res = await getOutput(readReq(`/api/renders/${job.renderId}/output`), {
      params: params({ renderId: job.renderId }),
    });
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("video/mp4");
    expect(res.headers.get("content-length")).toBe("64");
    expect(res.headers.get("x-content-type-options")).toBe("nosniff");
    expect(res.headers.get("cross-origin-resource-policy")).toBe("same-origin");
    expect(res.headers.get("content-disposition")).toBe('attachment; filename="Fixture.mp4"');
    expect((await res.arrayBuffer()).byteLength).toBe(64);

    const head = await headOutput(readReq(`/api/renders/${job.renderId}/output`), {
      params: params({ renderId: job.renderId }),
    });
    expect(head.status).toBe(200);
    expect(head.body).toBeNull();
  });

  it("supports byte ranges and rejects unsatisfiable ones", async () => {
    const job = await succeededRender();
    const partial = await getOutput(
      readReq(`/api/renders/${job.renderId}/output`, { range: "bytes=10-19" }),
      { params: params({ renderId: job.renderId }) },
    );
    expect(partial.status).toBe(206);
    expect(partial.headers.get("content-range")).toBe("bytes 10-19/64");
    expect((await partial.arrayBuffer()).byteLength).toBe(10);

    const bad = await getOutput(
      readReq(`/api/renders/${job.renderId}/output`, { range: "bytes=999-" }),
      { params: params({ renderId: job.renderId }) },
    );
    expect(bad.status).toBe(416);
  });

  it("sanitizes hostile draft titles in Content-Disposition", async () => {
    installFakeRunner(succeedScript(8));
    const draft = await createSavedDraft();
    const put = await import("@/app/api/drafts/[draftId]/route");
    const evil = await put.PUT(
      writeReq(
        `/api/drafts/${draft.draftId}`,
        JSON.stringify({
          expectedVersion: 1,
          draftTitle: 'evil"; rm -rf /; .mp4	'.replace("	", " "),
          backgroundColor: draft.backgroundColor,
          transitionFrames: draft.transitionFrames,
          clips: draft.clips.map((c) => ({
            sourceAssetId: c.sourceAssetId,
            trimBefore: 0,
            trimAfter: 0,
            enabled: true,
          })),
        }),
      ),
      { params: params({ draftId: draft.draftId }) },
    );
    expect(evil.status).toBe(200);
    const saved = (await evil.json()) as StudioDraftV1;
    const { job } = await startRenderFor(saved);
    await flush();
    const res = await getOutput(readReq(`/api/renders/${job.renderId}/output`), {
      params: params({ renderId: job.renderId }),
    });
    const disposition = res.headers.get("content-disposition")!;
    expect(disposition).toMatch(/^attachment; filename="[A-Za-z0-9._-]+\.mp4"$/);
    expect(disposition).not.toContain('rm -rf');
  });

  it("cannot serve logs or any file other than the render's own output", async () => {
    const job = await succeededRender();
    const dir = path.join(dataRoot, "renders", job.renderId);
    mkdirSync(dir, { recursive: true });
    writeFileSync(path.join(dir, "render.log"), "secret log line");
    // The only output route is /output — probing other render ids fails, and
    // the response body is exactly the MP4 bytes, never the log.
    const res = await getOutput(readReq(`/api/renders/${job.renderId}/output`), {
      params: params({ renderId: job.renderId }),
    });
    const body = Buffer.from(await res.arrayBuffer());
    expect(body.includes(Buffer.from("secret log line"))).toBe(false);
    const foreign = await getOutput(readReq(`/api/renders/render.log/output`), {
      params: params({ renderId: "render.log" }),
    });
    expect(foreign.status).toBe(400);
  });
});
