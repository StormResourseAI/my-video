import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import StudioShell from "@/components/StudioShell";
import type { ProjectDocumentV1, ProjectSummaryV1 } from "@/lib/projectDocument";
import { resetStore } from "./helpers";

// The real Player needs actual media decoding — out of scope for jsdom.
// The adapter → Player wiring is covered by unit tests and browser QA.
vi.mock("@/components/RealPreview", () => ({
  default: ({ config }: { config: { durationInFrames: number } }) => (
    <div data-testid="real-player">player:{config.durationInFrames}f</div>
  ),
}));

beforeEach(resetStore);

const summary: ProjectSummaryV1 = {
  schemaVersion: 1,
  projectId: "demo",
  projectName: "Demo Vertical Batch",
  clientSlug: null,
  previewReady: true,
  cacheTimestamp: "2026-07-01T12:00:00.000Z",
};

const readyDoc: ProjectDocumentV1 = {
  ...summary,
  status: "ready",
  readOnly: true,
  source: "materialized-cache",
  freshness: "stale",
  composition: {
    compositionId: "vertical-core",
    width: 1080,
    height: 1920,
    fps: 30,
    durationInFrames: 299,
    aspectRatio: "9:16",
  },
  props: {
    backgroundColor: "#111111",
    clips: [
      { file: "01_open.mp4", src: "api/assets/AQ", durationInFrames: 75, trimBefore: 0, trimAfter: 75 },
      { file: "02_offer.mp4", src: "api/assets/Ag", durationInFrames: 120, trimBefore: 0, trimAfter: 120 },
      { file: "03_close.mp4", src: "api/assets/Aw", durationInFrames: 120, trimBefore: 0, trimAfter: 120 },
    ],
    title: "Demo Vertical Batch",
    titleFrames: 45,
    transitionFrames: 8,
  },
  assets: [
    { assetId: "AQ", fileName: "01_open.mp4", kind: "video", previewUrl: "/api/assets/AQ" },
    { assetId: "Ag", fileName: "02_offer.mp4", kind: "video", previewUrl: "/api/assets/Ag" },
    { assetId: "Aw", fileName: "03_close.mp4", kind: "video", previewUrl: "/api/assets/Aw" },
  ],
  captions: null,
  music: null,
  warnings: ["Read-only preview derived from materialized cached props."],
};

function stubApi(overrides: Partial<Record<string, unknown>> = {}) {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url === "/api/projects") {
        return Response.json(
          overrides["/api/projects"] ?? { schemaVersion: 1, projects: [summary] },
        );
      }
      if (url === "/api/projects/demo") {
        if (overrides["/api/projects/demo"] instanceof Response) {
          return overrides["/api/projects/demo"] as Response;
        }
        return Response.json(overrides["/api/projects/demo"] ?? readyDoc);
      }
      return Response.json({ error: { code: "not_found", message: "Unknown." } }, { status: 404 });
    }),
  );
}

describe("real project discovery and preview", () => {
  it("lists real projects, loads the document, and shows the read-only player", async () => {
    stubApi();
    const user = userEvent.setup();
    render(<StudioShell />);

    const nav = screen.getByRole("complementary", { name: "Project navigation" });
    await user.click(await within(nav).findByRole("button", { name: /Demo Vertical Batch/ }));

    // Real metadata + player + read-only labeling.
    const preview = screen.getByRole("region", { name: "Preview monitor" });
    expect(await within(preview).findByTestId("real-player")).toHaveTextContent("player:299f");
    expect(within(preview).getByText(/1080×1920 · 30 fps · 299f/)).toBeInTheDocument();
    expect(within(preview).getAllByText(/Read-only/i).length).toBeGreaterThan(0);
    expect(within(preview).getByText(/Cached props/i)).toBeInTheDocument();
    expect(within(preview).getByText(/^Stale$/i)).toBeInTheDocument();

    // Real transport (seek + scale) present.
    expect(within(preview).getByRole("slider", { name: "Seek" })).toBeInTheDocument();
    expect(within(preview).getByRole("radio", { name: "50%" })).toBeInTheDocument();

    // Media browser shows the real read-only assets.
    const media = screen.getByRole("region", { name: "Media browser" });
    expect(within(media).getByRole("option", { name: /01_open\.mp4/ })).toBeInTheDocument();

    // Inspector shows real project metadata.
    const inspector = screen.getByRole("complementary", { name: "Inspector" });
    expect(within(inspector).getByText("299 frames")).toBeInTheDocument();

    // Timeline shows the read-only derived sequence.
    const timeline = screen.getByRole("region", { name: "Timeline" });
    expect(within(timeline).getByText("02_offer.mp4")).toBeInTheDocument();
  });

  it("shows a controlled error instead of silently substituting mock data", async () => {
    stubApi({
      "/api/projects/demo": Response.json(
        { error: { code: "props_unreadable", message: "Project document failed validation." } },
        { status: 500 },
      ),
    });
    const user = userEvent.setup();
    render(<StudioShell />);

    const nav = screen.getByRole("complementary", { name: "Project navigation" });
    await user.click(await within(nav).findByRole("button", { name: /Demo Vertical Batch/ }));

    const preview = screen.getByRole("region", { name: "Preview monitor" });
    expect(await within(preview).findByRole("alert")).toHaveTextContent(
      /Project could not be loaded/,
    );
    expect(within(preview).queryByText(/Mock preview/)).not.toBeInTheDocument();
  });

  it("shows the media-missing state with the project warnings", async () => {
    stubApi({
      "/api/projects/demo": {
        ...readyDoc,
        status: "media-missing",
        composition: null,
        props: null,
        previewReady: false,
        warnings: ["Staged media missing: 02_offer.mp4"],
      },
    });
    const user = userEvent.setup();
    render(<StudioShell />);

    const nav = screen.getByRole("complementary", { name: "Project navigation" });
    await user.click(await within(nav).findByRole("button", { name: /Demo Vertical Batch/ }));

    const preview = screen.getByRole("region", { name: "Preview monitor" });
    expect(await within(preview).findByRole("alert")).toHaveTextContent(
      /Staged media missing: 02_offer\.mp4/,
    );
  });

  it("rejects a document that fails client-side validation", async () => {
    stubApi({
      "/api/projects/demo": {
        ...readyDoc,
        props: { ...readyDoc.props!, backgroundColor: "url(javascript:alert(1))" },
      },
    });
    const user = userEvent.setup();
    render(<StudioShell />);

    const nav = screen.getByRole("complementary", { name: "Project navigation" });
    await user.click(await within(nav).findByRole("button", { name: /Demo Vertical Batch/ }));

    const preview = screen.getByRole("region", { name: "Preview monitor" });
    expect(await within(preview).findByRole("alert")).toHaveTextContent(
      /Project could not be loaded/,
    );
  });

  it("keeps the clearly-labeled mock shell reachable and separate", async () => {
    stubApi();
    const user = userEvent.setup();
    render(<StudioShell />);

    const nav = screen.getByRole("complementary", { name: "Project navigation" });
    await within(nav).findByRole("button", { name: /Demo Vertical Batch/ });
    await user.click(within(nav).getByRole("button", { name: /Airbnb Cinematic Edit/ }));

    const preview = screen.getByRole("region", { name: "Preview monitor" });
    expect(within(preview).getAllByText(/Mock preview/).length).toBeGreaterThan(0);
    expect(within(preview).queryByTestId("real-player")).not.toBeInTheDocument();
  });

  it("surfaces a project-list failure with retry", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        Response.json({ error: { code: "internal", message: "Internal error." } }, { status: 500 }),
      ),
    );
    render(<StudioShell />);
    const nav = screen.getByRole("complementary", { name: "Project navigation" });
    expect(await within(nav).findByRole("alert")).toHaveTextContent(/Projects unavailable/);
    expect(within(nav).getByRole("button", { name: "Retry" })).toBeInTheDocument();
  });
});
