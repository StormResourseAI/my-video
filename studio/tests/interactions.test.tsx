import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import StudioShell from "@/components/StudioShell";
import { resetStore } from "./helpers";

beforeEach(() => {
  resetStore();
  vi.stubGlobal("fetch", vi.fn(async () => Response.json({ schemaVersion: 1, projects: [] })));
});

describe("truthful studio shell interactions", () => {
  it("shows an honest real-project loading state", () => { render(<StudioShell />); expect(screen.getByText(/No demo content/)).toBeInTheDocument(); });
  it("does not render the mock application rail", () => { render(<StudioShell />); expect(screen.queryByRole("navigation", { name: /Application rail/ })).not.toBeInTheDocument(); });
  it("does not advertise future destinations", () => { render(<StudioShell />); for (const name of ["AI Editor", "Transcripts", "Templates", "Brand Kits", "Notifications", "Exports"]) expect(screen.queryByText(name)).not.toBeInTheDocument(); });
  it("labels source media as read only", () => { render(<StudioShell />); expect(screen.getByRole("region", { name: "Media browser" })).toHaveTextContent(/Source media/i); });
  it("explains source safety in the empty inspector", () => { render(<StudioShell />); expect(screen.getByRole("complementary", { name: "Inspector" })).toHaveTextContent(/Create Draft|real project/i); });
  it("uses explicit panel visibility labels", () => { render(<StudioShell />); expect(screen.getByRole("button", { name: "Hide Projects panel" })).toBeInTheDocument(); });
  it("toggles panel visibility with accurate labels", async () => { const user=userEvent.setup(); render(<StudioShell />); await user.click(screen.getByRole("button", { name: "Hide Inspector panel" })); expect(screen.queryByRole("complementary", { name: "Inspector" })).not.toBeInTheDocument(); expect(screen.getByRole("button", { name: "Show Inspector panel" })).toBeInTheDocument(); });
  it("provides a usable narrow-screen escape", () => { render(<StudioShell />); expect(screen.getByRole("button", { name: "Continue anyway" })).toBeInTheDocument(); });
  it("renders no mock-preview label", () => { render(<StudioShell />); expect(screen.queryByText(/mock preview/i)).not.toBeInTheDocument(); });
});
