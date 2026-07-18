import { render, screen } from "@testing-library/react";
import StudioShell from "@/components/StudioShell";
import { resetStore } from "./helpers";

beforeEach(resetStore);

describe("studio shell regions", () => {
  it("renders all six workspace regions", () => {
    render(<StudioShell />);
    expect(screen.getByRole("navigation", { name: "Application rail" })).toBeInTheDocument();
    expect(screen.getByRole("complementary", { name: "Project navigation" })).toBeInTheDocument();
    expect(screen.getByRole("region", { name: "Media browser" })).toBeInTheDocument();
    expect(screen.getByRole("region", { name: "Preview monitor" })).toBeInTheDocument();
    expect(screen.getByRole("complementary", { name: "Inspector" })).toBeInTheDocument();
    expect(screen.getByRole("region", { name: "Timeline" })).toBeInTheDocument();
  });

  it("renders all application rail destinations", () => {
    render(<StudioShell />);
    for (const item of [
      "Studio",
      "Projects",
      "Media Library",
      "Transcripts",
      "AI Editor",
      "Templates",
      "Brand Kits",
      "Exports",
      "Notifications",
      "Settings",
    ]) {
      expect(screen.getByRole("button", { name: item })).toBeInTheDocument();
    }
  });

  it("renders all six timeline tracks", () => {
    render(<StudioShell />);
    const timeline = screen.getByRole("region", { name: "Timeline" });
    for (const label of ["V3", "V2", "V1", "A2", "A1", "CC"]) {
      expect(timeline).toHaveTextContent(label);
    }
  });
});
