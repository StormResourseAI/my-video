import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import PreviewMonitor from "@/components/PreviewMonitor";
import type { StudioDraftV1 } from "@/lib/draftDocument";
import type { ProjectDocumentV1 } from "@/lib/projectDocument";
import type { RenderJobV1, RenderStatus } from "@/lib/renderDocument";
import { useStudioStore } from "@/state/studioStore";
import { resetStore } from "./helpers";

vi.mock("@/components/RealPreview", () => ({
  default: () => <div data-testid="real-player" />,
}));

const DRAFT_ID = "11111111-1111-4111-8111-111111111111";
const RENDER_ID = "22222222-2222-4222-8222-222222222222";
const NOW = "2026-07-19T12:00:00.000Z";

const document: ProjectDocumentV1 = {
  schemaVersion: 1,
  projectId: "demo",
  projectName: "Demo",
  clientSlug: null,
  previewReady: true,
  cacheTimestamp: NOW,
  status: "ready",
  readOnly: true,
  source: "materialized-cache",
  freshness: "current",
  composition: { compositionId: "vertical-core", width: 1080, height: 1920, fps: 30, durationInFrames: 75, aspectRatio: "9:16" },
  props: { backgroundColor: "#111111", clips: [{ file: "clip.mp4", src: "api/assets/AQ", durationInFrames: 75, trimBefore: 0, trimAfter: 75 }], title: "Demo", titleFrames: 45, transitionFrames: 8 },
  assets: [{ assetId: "AQ", fileName: "clip.mp4", kind: "video", previewUrl: "/api/assets/AQ" }],
  captions: null,
  music: null,
  warnings: [],
};

const draft = (version: number, renderEligibility: StudioDraftV1["renderEligibility"] = "eligible"): StudioDraftV1 => ({
  schemaVersion: 1,
  draftId: DRAFT_ID,
  sourceProjectId: "demo",
  sourceProjectName: "Demo",
  sourceCompositionId: "vertical-core",
  sourceCacheTimestamp: NOW,
  sourceFingerprint: "a".repeat(64),
  createdAt: NOW,
  updatedAt: NOW,
  version,
  readOnlySource: true,
  draftTitle: "Demo draft",
  backgroundColor: "#111111",
  transitionFrames: 8,
  clips: [{ sourceAssetId: "AQ", fileName: "clip.mp4", sourceDurationInFrames: 75, trimBefore: 0, trimAfter: 0, enabled: true, order: 0 }],
  renderEligibility,
  warnings: [],
});

const job = (status: RenderStatus, draftVersion = 2): RenderJobV1 => ({
  schemaVersion: 1,
  renderId: RENDER_ID,
  draftId: DRAFT_ID,
  draftVersion,
  sourceProjectId: "demo",
  status,
  createdAt: NOW,
  startedAt: status === "queued" ? null : NOW,
  finishedAt: status === "succeeded" ? NOW : null,
  exitCode: status === "succeeded" ? 0 : null,
  error: null,
  durationInFrames: 75,
  outputBytes: status === "succeeded" ? 1024 : null,
});

function loadDraft(value: StudioDraftV1, renderJob: RenderJobV1 | null = null) {
  useStudioStore.setState({
    activeRealProjectId: "demo",
    realProjects: [document],
    realProjectsStatus: "loaded",
    document,
    documentStatus: "loaded",
    draft: value,
    draftWorking: {
      draftTitle: value.draftTitle,
      backgroundColor: value.backgroundColor,
      transitionFrames: value.transitionFrames,
      clips: value.clips.map((clip) => ({ ...clip })),
    },
    draftDirty: false,
    draftBusy: "idle",
    renderJob,
    renderBusy: false,
    renderError: null,
  });
}

beforeEach(() => {
  resetStore();
  vi.restoreAllMocks();
});

it("accepts the Render button path exactly once and promotes only the current draft output", async () => {
  const user = userEvent.setup();
  const confirm = vi.spyOn(window, "confirm").mockReturnValue(true);
  const requests: Array<{ url: string; method: string }> = [];
  vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    requests.push({ url: String(input), method: init?.method ?? "GET" });
    return Response.json(job("queued"), { status: 202 });
  }));
  loadDraft(draft(2));
  render(<PreviewMonitor />);

  await user.click(screen.getByRole("button", { name: "Render MP4" }));
  await waitFor(() => expect(screen.getByRole("status", { name: "Render status" })).toHaveTextContent(/queued/i));
  expect(confirm).toHaveBeenCalledTimes(1);
  expect(requests.filter((request) => request.url === "/api/renders" && request.method === "POST")).toHaveLength(1);

  act(() => useStudioStore.setState({ renderJob: job("running") }));
  expect(await screen.findByRole("status", { name: "Render status" })).toHaveTextContent(/running/i);

  act(() => useStudioStore.setState({ renderJob: job("succeeded") }));
  const download = await screen.findByRole("link", { name: /Download MP4/ });
  expect(download).toHaveAttribute("href", `/api/renders/${RENDER_ID}/output`);
  expect(screen.getByText(/MP4 ready for download/)).toBeInTheDocument();
  expect(screen.getByRole("status", { name: "Render status" })).toHaveTextContent(/draft v2/i);

  act(() => useStudioStore.getState().setDraftTitle("dirty"));
  expect(screen.getByRole("button", { name: "Render MP4" })).toBeDisabled();

  act(() => loadDraft(draft(2, "source-changed")));
  expect(screen.getByRole("button", { name: "Render MP4" })).toBeDisabled();

  act(() => loadDraft(draft(2), job("succeeded", 1)));
  expect(screen.queryByRole("link", { name: /Download MP4/ })).not.toBeInTheDocument();
  expect(screen.getByRole("status", { name: "Render status" })).toHaveTextContent(/Previous render[\s\S]*draft v1[\s\S]*Draft v2 requires a new render/);
  expect(screen.getByText(/Saved draft is ready to render locally/)).toBeInTheDocument();
});

it("clears a succeeded v2 render after saving the edited draft as v3", async () => {
  const user = userEvent.setup();
  vi.stubGlobal("fetch", vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
    expect(init?.method).toBe("PUT");
    return Response.json({ ...draft(3), draftTitle: "v3 edit" });
  }));
  loadDraft(draft(2), job("succeeded"));
  render(<PreviewMonitor />);

  act(() => useStudioStore.getState().setDraftTitle("v3 edit"));
  expect(screen.getByRole("button", { name: "Render MP4" })).toBeDisabled();
  await user.click(screen.getByRole("button", { name: "Save Draft" }));

  await waitFor(() => expect(screen.getByText("Saved v3")).toBeInTheDocument());
  expect(useStudioStore.getState().renderJob).toBeNull();
  expect(screen.queryByRole("link", { name: /Download MP4/ })).not.toBeInTheDocument();
  expect(screen.getByText(/Saved draft is ready to render locally/)).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Render MP4" })).toBeEnabled();
});
