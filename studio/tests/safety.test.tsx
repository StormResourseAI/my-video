import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import StudioShell from "@/components/StudioShell";
import { resetStore } from "./helpers";

beforeEach(resetStore);

describe("phase 1 safety guarantees", () => {
  it("never calls fetch during shell interactions", async () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);
    const user = userEvent.setup();
    render(<StudioShell />);

    await user.click(screen.getByRole("button", { name: /Drone Property Reveal/ }));
    await user.click(screen.getByRole("radio", { name: "Video" }));
    await user.click(screen.getByRole("option", { name: "Select D001_ridge_flyover.mp4" }));
    await user.click(screen.getByRole("radio", { name: "9:16" }));
    await user.click(screen.getByRole("button", { name: "Play" }));
    await user.click(screen.getByRole("button", { name: "Pause" }));
    await user.click(screen.getByRole("button", { name: "Media panel" }));

    expect(fetchSpy).not.toHaveBeenCalled();
    vi.unstubAllGlobals();
  });

  it("studio runtime source imports no filesystem, child-process, or network modules", () => {
    const RUNTIME_DIRS = ["app", "components", "state", "lib", "fixtures"];
    const FORBIDDEN =
      /(?:from\s+|require\(|import\()\s*["'](?:node:)?(fs|fs\/promises|child_process|net|http|https|dgram|worker_threads)["']/;

    const offenders: string[] = [];
    const scan = (dir: string) => {
      for (const entry of readdirSync(dir)) {
        const full = join(dir, entry);
        if (statSync(full).isDirectory()) {
          scan(full);
        } else if (/\.(ts|tsx|js|mjs|cjs)$/.test(entry)) {
          if (FORBIDDEN.test(readFileSync(full, "utf8"))) offenders.push(full);
        }
      }
    };
    for (const dir of RUNTIME_DIRS) scan(join(process.cwd(), dir));

    expect(offenders).toEqual([]);
  });
});
