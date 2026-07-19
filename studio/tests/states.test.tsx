import { render, screen, within } from "@testing-library/react";
import StudioShell from "@/components/StudioShell";
import { resetStore } from "./helpers";

beforeEach(resetStore);

describe("operator states", () => {
  it("shows project loading without fixture content", () => { vi.stubGlobal("fetch", vi.fn(() => new Promise(() => {}))); render(<StudioShell />); expect(screen.getByRole("status", { name: "Loading projects" })).toBeInTheDocument(); expect(screen.queryByText(/Airbnb Cinematic/)).not.toBeInTheDocument(); });
  it("shows project API failure with Retry", async () => { vi.stubGlobal("fetch", vi.fn(async () => Response.json({ error: { code: "internal", message: "Unavailable" } }, { status: 500 }))); render(<StudioShell />); const alert=await screen.findByRole("alert"); expect(alert).toHaveTextContent(/Projects unavailable/); expect(within(alert).getByRole("button", { name: "Retry" })).toBeInTheDocument(); });
  it("shows an honest no-project state", async () => { vi.stubGlobal("fetch", vi.fn(async () => Response.json({ schemaVersion: 1, projects: [] }))); render(<StudioShell />); expect(await screen.findByText(/No preview-ready projects/)).toBeInTheDocument(); expect(screen.getByText(/source files are safe/i)).toBeInTheDocument(); });
});
