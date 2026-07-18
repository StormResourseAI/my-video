import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import StudioShell from "@/components/StudioShell";
import { resetStore } from "./helpers";

beforeEach(resetStore);

describe("studio shell interactions", () => {
  it("selects a project and updates the preview header", async () => {
    const user = userEvent.setup();
    render(<StudioShell />);
    await user.click(screen.getByRole("button", { name: /Drone Property Reveal/ }));
    const preview = screen.getByRole("region", { name: "Preview monitor" });
    expect(within(preview).getByText("Drone Property Reveal")).toBeInTheDocument();
    expect(
      within(preview).queryByText("Airbnb Cinematic Edit"),
    ).not.toBeInTheDocument();
  });

  it("filters media by kind and by search", async () => {
    const user = userEvent.setup();
    render(<StudioShell />);
    const media = screen.getByRole("region", { name: "Media browser" });

    await user.click(within(media).getByRole("radio", { name: "Audio" }));
    expect(within(media).getByRole("option", { name: /vo_host_welcome/ })).toBeInTheDocument();
    expect(
      within(media).queryByRole("option", { name: /A001_master_bedroom/ }),
    ).not.toBeInTheDocument();

    await user.click(within(media).getByRole("radio", { name: "All" }));
    await user.type(within(media).getByRole("searchbox", { name: "Search media" }), "pool");
    expect(within(media).getByRole("option", { name: /A003_pool_sunset/ })).toBeInTheDocument();
    expect(
      within(media).queryByRole("option", { name: /A002_kitchen_pan/ }),
    ).not.toBeInTheDocument();
  });

  it("selecting a media asset updates the inspector", async () => {
    const user = userEvent.setup();
    render(<StudioShell />);
    await user.click(screen.getByRole("option", { name: "Select A001_master_bedroom.mp4" }));
    expect(screen.getByTestId("inspector-selection-name")).toHaveTextContent(
      "A001_master_bedroom.mp4",
    );
  });

  it("selecting a timeline clip updates the inspector", async () => {
    const user = userEvent.setup();
    render(<StudioShell />);
    await user.click(screen.getByRole("button", { name: "Select clip A003_pool_sunset" }));
    expect(screen.getByTestId("inspector-selection-name")).toHaveTextContent("A003_pool_sunset");
  });

  it("shows project settings when nothing is selected", () => {
    render(<StudioShell />);
    const inspector = screen.getByRole("complementary", { name: "Inspector" });
    for (const label of [
      "Creative Direction",
      "Pacing",
      "Music Energy",
      "Caption Style",
      "Brand Kit",
      "Target Platform",
      "Desired Length",
    ]) {
      expect(within(inspector).getAllByText(label).length).toBeGreaterThan(0);
    }
  });

  it("changes the preview aspect ratio", async () => {
    const user = userEvent.setup();
    render(<StudioShell />);
    expect(screen.getByTestId("preview-canvas")).toHaveAttribute("data-aspect", "16:9");
    await user.click(screen.getByRole("radio", { name: "9:16" }));
    expect(screen.getByTestId("preview-canvas")).toHaveAttribute("data-aspect", "9:16");
    await user.click(screen.getByRole("radio", { name: "4:5" }));
    expect(screen.getByTestId("preview-canvas")).toHaveAttribute("data-aspect", "4:5");
  });

  it("toggles play and pause", async () => {
    const user = userEvent.setup();
    render(<StudioShell />);
    await user.click(screen.getByRole("button", { name: "Play" }));
    expect(screen.getByRole("button", { name: "Pause" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    await user.click(screen.getByRole("button", { name: "Pause" }));
    expect(screen.getByRole("button", { name: "Play" })).toHaveAttribute(
      "aria-pressed",
      "false",
    );
  });

  it("toggles panel visibility", async () => {
    const user = userEvent.setup();
    render(<StudioShell />);
    await user.click(screen.getByRole("button", { name: "Inspector panel" }));
    expect(
      screen.queryByRole("complementary", { name: "Inspector" }),
    ).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Inspector panel" }));
    expect(screen.getByRole("complementary", { name: "Inspector" })).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Timeline panel" }));
    expect(screen.queryByRole("region", { name: "Timeline" })).not.toBeInTheDocument();
  });

  it("toggles timeline track controls", async () => {
    const user = userEvent.setup();
    render(<StudioShell />);
    const mute = screen.getByRole("button", { name: "Mute A1" });
    expect(mute).toHaveAttribute("aria-pressed", "false");
    await user.click(mute);
    expect(mute).toHaveAttribute("aria-pressed", "true");
  });
});
