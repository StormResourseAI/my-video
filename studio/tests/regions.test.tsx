import { render, screen } from "@testing-library/react";
import StudioShell from "@/components/StudioShell";
import { resetStore } from "./helpers";

beforeEach(() => { resetStore(); vi.stubGlobal("fetch", vi.fn(async () => Response.json({ schemaVersion: 1, projects: [] }))); });

describe("operator workspace regions", () => {
  it("renders the four truthful workflow regions", () => { render(<StudioShell />); expect(screen.getByRole("complementary", { name: "Project navigation" })).toBeInTheDocument(); expect(screen.getByRole("region", { name: "Preview monitor" })).toBeInTheDocument(); expect(screen.getByRole("complementary", { name: "Inspector" })).toBeInTheDocument(); expect(screen.getByRole("region", { name: "Timeline" })).toBeInTheDocument(); });
  it("has no application rail destinations", () => { render(<StudioShell />); expect(screen.queryByRole("navigation", { name: "Application rail" })).not.toBeInTheDocument(); });
  it("has four real panel toggles and no future feature controls", () => { render(<StudioShell />); expect(screen.getAllByRole("button", { name: /^Hide .* panel$/ })).toHaveLength(4); expect(screen.queryByText("AI Editor")).not.toBeInTheDocument(); });
});
